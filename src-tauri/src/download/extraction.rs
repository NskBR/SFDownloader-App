use std::{
    collections::HashMap,
    fs, io,
    io::Read,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
    thread,
    time::Duration,
};
use tokio::sync::Semaphore;

static REQUESTS: LazyLock<Mutex<HashMap<String, Option<String>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static RESULTS: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static EXTRACTED_BYTES: LazyLock<Mutex<HashMap<String, u64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static EXTRACTION_PERMIT: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(1));

#[cfg(windows)]
struct BackgroundResourceGuard;

#[cfg(windows)]
impl BackgroundResourceGuard {
    fn enter() -> Self {
        use windows_sys::Win32::System::Threading::{
            GetCurrentThread, SetThreadPriority, THREAD_MODE_BACKGROUND_BEGIN,
        };
        unsafe {
            let _ = SetThreadPriority(GetCurrentThread(), THREAD_MODE_BACKGROUND_BEGIN);
        }
        Self
    }
}

#[cfg(windows)]
impl Drop for BackgroundResourceGuard {
    fn drop(&mut self) {
        use windows_sys::Win32::System::Threading::{
            GetCurrentThread, SetThreadPriority, THREAD_MODE_BACKGROUND_END,
        };
        unsafe {
            let _ = SetThreadPriority(GetCurrentThread(), THREAD_MODE_BACKGROUND_END);
        }
    }
}

#[cfg(not(windows))]
struct BackgroundResourceGuard;

#[cfg(not(windows))]
impl BackgroundResourceGuard {
    fn enter() -> Self {
        Self
    }
}

pub fn register(id: String, password: Option<String>) {
    if let Ok(mut requests) = REQUESTS.lock() {
        requests.insert(id, password.filter(|value| !value.is_empty()));
    }
}

pub fn take(id: &str) -> Option<Option<String>> {
    REQUESTS.lock().ok()?.remove(id)
}

pub fn save_result(id: &str, result: String) {
    if let Ok(mut results) = RESULTS.lock() {
        results.insert(id.to_owned(), result);
    }
}

#[tauri::command]
pub fn extraction_status(id: String) -> Option<String> {
    RESULTS.lock().ok()?.get(&id).cloned()
}

pub async fn extract_archive(path: String, password: Option<String>) -> Result<PathBuf, String> {
    let _permit = EXTRACTION_PERMIT
        .acquire()
        .await
        .map_err(|_| "A fila de extração foi encerrada.".to_string())?;
    let archive_key = path.clone();
    let canonical_archive = crate::download::paths::canonical_existing_file(Path::new(&path))?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _background_resources = BackgroundResourceGuard::enter();
        let archive_path = canonical_archive.as_path();
        match archive_path
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("zip") => extract_zip_blocking(archive_path, password.as_deref()),
            Some("7z") => extract_7z_blocking(archive_path, password.as_deref()),
            Some("rar") => extract_rar_blocking(archive_path, password.as_deref()),
            Some("tar" | "tgz") => extract_tar_blocking(archive_path, false),
            Some("gz") => {
                let tar_gz = archive_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|name| name.to_ascii_lowercase().ends_with(".tar.gz"));
                if tar_gz {
                    extract_tar_blocking(archive_path, true)
                } else {
                    extract_gzip_blocking(archive_path)
                }
            }
            _ => Err("Formato de extração não suportado.".to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?;
    if let Ok(output) = &result {
        let size = extracted_size(output.clone()).await;
        if let Ok(mut values) = EXTRACTED_BYTES.lock() {
            values.insert(archive_key, size);
        }
    }
    result
}

pub fn take_extracted_size(archive_path: &str) -> u64 {
    EXTRACTED_BYTES
        .lock()
        .ok()
        .and_then(|mut values| values.remove(archive_path))
        .unwrap_or(0)
}

pub async fn extracted_size(path: PathBuf) -> u64 {
    tauri::async_runtime::spawn_blocking(move || {
        let mut total = 0_u64;
        let mut pending = vec![path];
        while let Some(current) = pending.pop() {
            let Ok(metadata) = fs::metadata(&current) else {
                continue;
            };
            if metadata.is_file() {
                total = total.saturating_add(metadata.len());
                continue;
            }
            if let Ok(entries) = fs::read_dir(current) {
                pending.extend(entries.filter_map(Result::ok).map(|entry| entry.path()));
            }
        }
        total
    })
    .await
    .unwrap_or(0)
}

fn safe_archive_path(path: &Path) -> bool {
    use std::path::Component;
    path.components()
        .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn validate_archive_size(entries: usize, expanded: u64, compressed: u64) -> Result<(), String> {
    const MAX_ENTRIES: usize = 10_000;
    const MAX_EXPANDED_SIZE: u64 = 50 * 1024 * 1024 * 1024;
    if entries > MAX_ENTRIES {
        return Err("O arquivo contém itens demais e foi bloqueado por segurança.".into());
    }
    if expanded > MAX_EXPANDED_SIZE || (compressed > 0 && expanded / compressed > 200) {
        return Err("O arquivo parece suspeito e foi bloqueado por segurança.".into());
    }
    Ok(())
}

fn cleanup_extraction_dir(path: PathBuf) {
    for attempt in 0..8 {
        if !path.exists() || fs::remove_dir_all(&path).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(120 * (attempt + 1)));
    }
}

fn extraction_work_dir(destination: &Path) -> PathBuf {
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("extraido");
    parent.join(format!(".sf-extracting-{name}-{}", uuid::Uuid::new_v4()))
}

fn prepare_extraction_destination(archive_path: &Path) -> Result<(PathBuf, PathBuf), String> {
    let destination = extraction_destination(archive_path)?;
    let temporary = extraction_work_dir(&destination);
    fs::create_dir_all(&temporary).map_err(|error| error.to_string())?;
    Ok((destination, temporary))
}

fn finish_extraction(destination: PathBuf, temporary: PathBuf) -> Result<PathBuf, String> {
    fs::rename(&temporary, &destination).map_err(|error| {
        cleanup_extraction_dir(temporary);
        format!("Falha ao finalizar a pasta extraída: {error}")
    })?;
    Ok(destination)
}

fn fail_extraction(temporary: PathBuf, message: String) -> Result<PathBuf, String> {
    cleanup_extraction_dir(temporary);
    Err(message)
}

fn extract_tar_blocking(archive_path: &Path, gzip: bool) -> Result<PathBuf, String> {
    let inspect = fs::File::open(archive_path).map_err(|error| error.to_string())?;
    let reader: Box<dyn io::Read> = if gzip {
        Box::new(flate2::read::GzDecoder::new(inspect))
    } else {
        Box::new(inspect)
    };
    let mut archive = tar::Archive::new(reader);
    let mut count = 0_usize;
    let mut expanded = 0_u64;
    for entry in archive.entries().map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path().map_err(|error| error.to_string())?;
        if !safe_archive_path(&path) {
            return Err("O TAR contém um caminho inseguro.".into());
        }
        if !entry.header().entry_type().is_file() && !entry.header().entry_type().is_dir() {
            return Err("O TAR contém links ou um tipo de entrada não suportado.".into());
        }
        count += 1;
        expanded = expanded.saturating_add(entry.size());
    }
    let compressed = fs::metadata(archive_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    validate_archive_size(count, expanded, compressed)?;
    let (destination, temporary) = prepare_extraction_destination(archive_path)?;
    let result = {
        let source = fs::File::open(archive_path).map_err(|error| error.to_string())?;
        let reader: Box<dyn io::Read> = if gzip {
            Box::new(flate2::read::GzDecoder::new(source))
        } else {
            Box::new(source)
        };
        let mut archive = tar::Archive::new(reader);
        archive
            .unpack(&temporary)
            .map_err(|error| format!("Falha ao extrair TAR: {error}"))
    };
    if let Err(error) = result {
        return fail_extraction(temporary, error);
    }
    finish_extraction(destination, temporary)
}

fn extract_gzip_blocking(archive_path: &Path) -> Result<PathBuf, String> {
    extract_gzip_blocking_with_copy(archive_path, |reader, writer| io::copy(reader, writer))
}

fn extract_gzip_blocking_with_copy<F>(archive_path: &Path, copy: F) -> Result<PathBuf, String>
where
    F: FnOnce(&mut dyn io::Read, &mut dyn io::Write) -> io::Result<u64>,
{
    fn format_write_error(error: io::Error) -> String {
        if error.kind() == io::ErrorKind::StorageFull {
            "Espaço em disco insuficiente durante a extração.".into()
        } else {
            error.to_string()
        }
    }

    let compressed = fs::metadata(archive_path)
        .map(|metadata| metadata.len())
        .map_err(|error| error.to_string())?;
    let (destination, temporary) = prepare_extraction_destination(archive_path)?;
    let output_name = archive_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("extraido");
    let output_path = temporary.join(output_name);
    let result = {
        let source = fs::File::open(archive_path).map_err(|error| error.to_string())?;
        let decoder = flate2::read::GzDecoder::new(source);
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output_path)
            .map_err(|error| error.to_string())?;
        copy(&mut decoder.take(50 * 1024 * 1024 * 1024 + 1), &mut output)
    };
    let expanded = match result {
        Ok(expanded) => expanded,
        Err(error) => return fail_extraction(temporary, format_write_error(error)),
    };
    if validate_archive_size(1, expanded, compressed).is_err() {
        return fail_extraction(
            temporary,
            "O GZ parece suspeito e foi bloqueado por segurança.".into(),
        );
    }
    finish_extraction(destination, temporary)
}

fn extract_rar_blocking(archive_path: &Path, password: Option<&str>) -> Result<PathBuf, String> {
    let listing = match password {
        Some(password) => unrar_ng::Archive::with_password(archive_path, password),
        None => unrar_ng::Archive::new(archive_path),
    }
    .open_for_listing()
    .map_err(|error| format!("RAR inválido ou senha incorreta: {error}"))?;
    let compressed = fs::metadata(archive_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let mut count = 0_usize;
    let mut expanded = 0_u64;
    for header in listing {
        let header = header.map_err(|error| format!("Falha ao inspecionar RAR: {error}"))?;
        if !safe_archive_path(&header.filename) {
            return Err("O RAR contém um caminho inseguro.".into());
        }
        count += 1;
        expanded = expanded.saturating_add(header.unpacked_size);
    }
    validate_archive_size(count, expanded, compressed)?;
    let (destination, temporary) = prepare_extraction_destination(archive_path)?;
    let archive = match password {
        Some(password) => unrar_ng::Archive::with_password(archive_path, password),
        None => unrar_ng::Archive::new(archive_path),
    }
    .open_for_processing()
    .map_err(|error| format!("Falha ao abrir RAR: {error}"))?;
    let result = archive
        .extract_all(&temporary)
        .map(|_| ())
        .map_err(|error| format!("Falha ao extrair RAR; verifique a senha: {error}"));
    if let Err(error) = result {
        return fail_extraction(temporary, error);
    }
    finish_extraction(destination, temporary)
}

fn extract_7z_blocking(archive_path: &Path, password: Option<&str>) -> Result<PathBuf, String> {
    use std::path::Component;

    let archive = match password {
        Some(password) => sevenz_rust2::Archive::open_with_password(
            archive_path,
            &sevenz_rust2::Password::from(password),
        ),
        None => sevenz_rust2::Archive::open(archive_path),
    }
    .map_err(|_| "Arquivo 7z inválido ou senha incorreta/ausente.".to_string())?;
    if archive.files.len() > 10_000 {
        return Err("O 7z contém arquivos demais e foi bloqueado por segurança.".to_string());
    }
    let expanded_size = archive
        .files
        .iter()
        .fold(0_u64, |total, entry| total.saturating_add(entry.size()));
    let compressed_size = archive
        .pack_sizes()
        .iter()
        .fold(0_u64, |total, size| total.saturating_add(*size));
    const MAX_EXPANDED_SIZE: u64 = 50 * 1024 * 1024 * 1024;
    if expanded_size > MAX_EXPANDED_SIZE
        || (compressed_size > 0 && expanded_size / compressed_size > 200)
    {
        return Err("O 7z parece suspeito e foi bloqueado por segurança.".to_string());
    }
    if archive.files.iter().any(|entry| {
        Path::new(entry.name())
            .components()
            .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    }) {
        return Err("O 7z contém um caminho inseguro.".to_string());
    }
    let (destination, temporary) = prepare_extraction_destination(archive_path)?;
    let result = match password {
        Some(password) => sevenz_rust2::decompress_file_with_password(
            archive_path,
            &temporary,
            sevenz_rust2::Password::from(password),
        ),
        None => sevenz_rust2::decompress_file(archive_path, &temporary),
    };
    if let Err(error) = result {
        return fail_extraction(
            temporary,
            format!("Falha ao extrair 7z; verifique a senha: {error}"),
        );
    }
    finish_extraction(destination, temporary)
}

fn extraction_destination(archive_path: &Path) -> Result<PathBuf, String> {
    let name = archive_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("extraido");
    let lower = name.to_ascii_lowercase();
    let stem = [".tar.gz", ".tgz", ".zip", ".7z", ".rar", ".tar", ".gz"]
        .iter()
        .find_map(|suffix| {
            lower
                .strip_suffix(suffix)
                .map(|_| &name[..name.len() - suffix.len()])
        })
        .filter(|value| !value.is_empty())
        .unwrap_or("extraido");
    let destination = archive_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(stem);
    if destination.exists() {
        return Err(format!(
            "A pasta '{}' já existe; nada foi sobrescrito.",
            destination.display()
        ));
    }
    Ok(destination)
}

fn extract_zip_blocking(archive_path: &Path, password: Option<&str>) -> Result<PathBuf, String> {
    let file = fs::File::open(archive_path).map_err(|error| error.to_string())?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("ZIP inválido: {error}"))?;
    if archive.len() > 10_000 {
        return Err("O ZIP contém arquivos demais e foi bloqueado por segurança.".to_string());
    }

    let mut expanded_size = 0_u64;
    let mut compressed_size = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index_raw(index)
            .map_err(|error| format!("Falha ao inspecionar ZIP: {error}"))?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("O ZIP contém um link simbólico e foi bloqueado.".into());
        }
        expanded_size = expanded_size.saturating_add(entry.size());
        compressed_size = compressed_size.saturating_add(entry.compressed_size());
    }
    const MAX_EXPANDED_SIZE: u64 = 50 * 1024 * 1024 * 1024;
    if expanded_size > MAX_EXPANDED_SIZE
        || (compressed_size > 0 && expanded_size / compressed_size > 200)
    {
        return Err("O ZIP parece suspeito e foi bloqueado por segurança.".to_string());
    }
    let (destination, temporary) = prepare_extraction_destination(archive_path)?;
    let result = (|| -> Result<(), String> {
        for index in 0..archive.len() {
            let mut entry = match password {
                Some(password) => archive
                    .by_index_decrypt(index, password.as_bytes())
                    .map_err(|_| "Senha incorreta ou ausente.".to_string())?,
                None => archive
                    .by_index(index)
                    .map_err(|error| format!("Falha ao ler ZIP: {error}"))?,
            };
            let relative = entry
                .enclosed_name()
                .ok_or_else(|| "O ZIP contém um caminho inseguro.".to_string())?;
            let output = temporary.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&output).map_err(|error| error.to_string())?;
                continue;
            }
            if output.exists() {
                return Err(format!(
                    "O arquivo '{}' já existe; nada foi sobrescrito.",
                    output.display()
                ));
            }
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            let mut target = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&output)
                .map_err(|error| error.to_string())?;
            io::copy(&mut entry, &mut target).map_err(|error| error.to_string())?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        return fail_extraction(temporary, error);
    }
    finish_extraction(destination, temporary)
}

#[cfg(test)]
mod tests {
    use super::{
        extract_7z_blocking, extract_gzip_blocking, extract_gzip_blocking_with_copy,
        extract_tar_blocking, extract_zip_blocking, extraction_destination,
    };
    use std::{fs, io::Write};

    use zip::unstable::write::FileOptionsExt;
    #[test]
    fn extracts_a_real_7z_archive() {
        let root = std::env::temp_dir().join(format!("sf-7z-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("conteudo.txt");
        let archive = root.join("pacote.7z");
        fs::write(&source, b"SF Downloader 7z").unwrap();
        sevenz_rust2::compress_to_path(&source, &archive).unwrap();

        let destination = extract_7z_blocking(&archive, None).unwrap();
        assert_eq!(
            fs::read(destination.join("conteudo.txt")).unwrap(),
            b"SF Downloader 7z"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn extracts_tar_and_gzip_archives() {
        let root = std::env::temp_dir().join(format!("sf-tar-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("conteudo.txt");
        fs::write(&source, b"SF Downloader TAR").unwrap();

        let tar_path = root.join("pacote.tar");
        let mut builder = tar::Builder::new(fs::File::create(&tar_path).unwrap());
        builder
            .append_path_with_name(&source, "conteudo.txt")
            .unwrap();
        builder.finish().unwrap();
        let tar_destination = extract_tar_blocking(&tar_path, false).unwrap();
        assert_eq!(
            fs::read(tar_destination.join("conteudo.txt")).unwrap(),
            b"SF Downloader TAR"
        );

        let gzip_path = root.join("dados.gz");
        let mut encoder = flate2::write::GzEncoder::new(
            fs::File::create(&gzip_path).unwrap(),
            flate2::Compression::default(),
        );
        encoder.write_all(b"SF Downloader GZ").unwrap();
        encoder.finish().unwrap();
        let gzip_destination = extract_gzip_blocking(&gzip_path).unwrap();
        assert_eq!(
            fs::read(gzip_destination.join("dados")).unwrap(),
            b"SF Downloader GZ"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn failed_gzip_extraction_cleans_temporary_folder() {
        let root = std::env::temp_dir().join(format!("sf-gzip-fail-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("quebrado.gz");
        fs::write(&archive, b"not a gzip archive").unwrap();

        let destination = extraction_destination(&archive).unwrap();
        let error = extract_gzip_blocking(&archive).unwrap_err();

        assert!(!error.is_empty());
        assert!(!destination.exists());
        let leftovers = fs::read_dir(&root)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".sf-extracting-")
            })
            .count();
        assert_eq!(leftovers, 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn disk_full_during_gzip_extraction_is_reported_and_cleaned_up() {
        let root = std::env::temp_dir().join(format!("sf-gzip-disk-full-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("dados.gz");
        let mut encoder = flate2::write::GzEncoder::new(
            fs::File::create(&archive).unwrap(),
            flate2::Compression::default(),
        );
        encoder
            .write_all(b"conteudo suficiente para iniciar a extracao")
            .unwrap();
        encoder.finish().unwrap();

        let destination = extraction_destination(&archive).unwrap();
        let error = extract_gzip_blocking_with_copy(&archive, |_, _| {
            Err(std::io::Error::from(std::io::ErrorKind::StorageFull))
        })
        .unwrap_err();

        assert_eq!(error, "Espaço em disco insuficiente durante a extração.");
        assert!(!destination.exists());
        assert_eq!(
            fs::read_dir(&root)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".sf-extracting-"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn zip_with_traversal_path_is_rejected_without_leaving_files() {
        let root = std::env::temp_dir().join(format!("sf-zip-slip-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("malicioso.zip");
        let mut writer = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
        writer
            .start_file("../fora.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"nao deve ser extraido").unwrap();
        writer.finish().unwrap();

        let destination = extraction_destination(&archive).unwrap();
        let error = extract_zip_blocking(&archive, None).unwrap_err();

        assert_eq!(error, "O ZIP contém um caminho inseguro.");
        assert!(!destination.exists());
        assert!(!root.parent().unwrap().join("fora.txt").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn tar_symlink_is_rejected_without_leaving_files() {
        let root = std::env::temp_dir().join(format!("sf-tar-link-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("malicioso.tar");
        let mut builder = tar::Builder::new(fs::File::create(&archive).unwrap());
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_size(0);
        header.set_mode(0o777);
        header.set_link_name("../fora.txt").unwrap();
        header.set_cksum();
        builder
            .append_data(&mut header, "atalho.txt", std::io::empty())
            .unwrap();
        builder.finish().unwrap();

        let destination = extraction_destination(&archive).unwrap();
        let error = extract_tar_blocking(&archive, false).unwrap_err();
        assert_eq!(
            error,
            "O TAR contém links ou um tipo de entrada não suportado."
        );
        assert!(!destination.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn zip_symlink_is_rejected_without_leaving_files() {
        let root = std::env::temp_dir().join(format!("sf-zip-link-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("malicioso.zip");
        let mut writer = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
        writer
            .add_symlink(
                "atalho.txt",
                "../fora.txt",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
        writer.finish().unwrap();

        let destination = extraction_destination(&archive).unwrap();
        let error = extract_zip_blocking(&archive, None).unwrap_err();
        assert_eq!(error, "O ZIP contém um link simbólico e foi bloqueado.");
        assert!(!destination.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn encrypted_zip_with_incorrect_password_is_rejected_and_cleaned_up() {
        let root = std::env::temp_dir().join(format!("sf-zip-password-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("protegido.zip");
        let options =
            zip::write::SimpleFileOptions::default().with_deprecated_encryption(b"senha-correta");
        let mut writer = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
        writer.start_file("segredo.txt", options).unwrap();
        writer.write_all(b"conteudo protegido").unwrap();
        writer.finish().unwrap();

        let destination = extraction_destination(&archive).unwrap();
        let error = extract_zip_blocking(&archive, Some("senha-incorreta")).unwrap_err();

        assert_eq!(error, "Senha incorreta ou ausente.");
        assert!(!destination.exists());
        assert_eq!(
            fs::read_dir(&root)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".sf-extracting-"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(root);
    }
}
