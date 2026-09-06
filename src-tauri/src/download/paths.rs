use std::path::{Path, PathBuf};

fn is_reparse_or_symlink(path: &Path) -> bool {
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return false;
    };
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}

pub fn canonical_existing_file(path: &Path) -> Result<PathBuf, String> {
    if is_reparse_or_symlink(path) {
        return Err("O caminho aponta para um link ou reparse point e foi bloqueado.".into());
    }
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("Não foi possível validar o caminho: {error}"))?;
    if !canonical.is_file() {
        return Err("O caminho não aponta para um arquivo válido.".into());
    }
    Ok(canonical)
}

pub fn canonical_existing_directory(path: &Path) -> Result<PathBuf, String> {
    if is_reparse_or_symlink(path) {
        return Err("O diretório aponta para um link ou reparse point e foi bloqueado.".into());
    }
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("Não foi possível validar o diretório: {error}"))?;
    if !canonical.is_dir() {
        return Err("O caminho não aponta para um diretório válido.".into());
    }
    Ok(canonical)
}

pub fn validate_destructive_path(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let root = canonical_existing_directory(root)?;
    if target.exists() {
        if is_reparse_or_symlink(target) {
            return Err(
                "A operação foi bloqueada porque o alvo é um link ou reparse point.".into(),
            );
        }
        let canonical = std::fs::canonicalize(target)
            .map_err(|error| format!("Não foi possível validar o alvo: {error}"))?;
        if !canonical.starts_with(&root) {
            return Err(
                "A operação foi bloqueada porque o alvo está fora da pasta do download.".into(),
            );
        }
        return Ok(canonical);
    }

    let mut ancestor = target;
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "O alvo não possui uma pasta válida.".to_string())?;
    }
    let canonical_ancestor = std::fs::canonicalize(ancestor)
        .map_err(|error| format!("Não foi possível validar a pasta do alvo: {error}"))?;
    if !canonical_ancestor.starts_with(&root) {
        return Err(
            "A operação foi bloqueada porque o alvo está fora da pasta do download.".into(),
        );
    }
    Ok(target.to_path_buf())
}

pub fn valid_category_name(name: &str) -> bool {
    name != "."
        && name != ".."
        && !name.chars().any(|character| {
            matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) || character.is_control()
        })
}

pub fn safe_file_name(value: impl AsRef<str>) -> String {
    let cleaned: String = value
        .as_ref()
        .chars()
        .map(|character| {
            if "<>:\"/\\|?*".contains(character) || character.is_control() {
                '_'
            } else {
                character
            }
        })
        .collect();
    let cleaned = cleaned.trim_matches([' ', '.']);
    if cleaned.is_empty() {
        "download.bin".into()
    } else {
        cleaned.chars().take(180).collect()
    }
}
pub fn category_for_extension(extension: Option<&str>) -> &'static str {
    let clean_ext = extension.unwrap_or("").trim().to_lowercase();
    match clean_ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "ico" | "svg" | "tiff" | "heic" => {
            "Imagens"
        }
        "mp4" | "mkv" | "mov" | "avi" | "webm" | "flv" | "wmv" | "m4v" | "3gp" | "ts" => "Vídeos",
        "mp3" | "wav" | "flac" | "ogg" | "m4a" | "aac" | "wma" | "opus" | "alac" => "Áudios",
        "pdf" | "docx" | "xlsx" | "pptx" | "txt" | "doc" | "xls" | "ppt" | "csv" | "rtf"
        | "odt" | "epub" => "Documentos",
        "zip" | "rar" | "7z" | "tar" | "gz" | "tgz" | "bz2" | "xz" | "cab" | "img" | "dmg"
        | "z01" | "z02" | "r00" | "r01" | "001" => "Compactados",
        "safetensors" | "ckpt" | "gguf" | "pt" | "pth" | "onnx" | "tflite" | "h5" | "pb"
        | "keras" | "model" | "mlmodel" | "safetensor" | "sft" | "ggml" | "ot" | "tensor"
        | "weights" | "lora" => "Modelos de IA",
        "exe" | "msi" | "apk" | "bat" | "cmd" | "ps1" | "appimage" | "deb" | "rpm" | "run"
        | "bin" | "jar" | "vbs" | "wsf" | "com" | "gadget" | "sh" | "command" | "app" => {
            "Aplicativos"
        }
        "torrent" => "Torrents",
        _ => "Outros",
    }
}
pub fn available_path(folder: &Path, file_name: &str, taken_paths: &[String]) -> PathBuf {
    let original = folder.join(file_name);
    let is_taken = |path: &Path| {
        // Check if the file exists on disk
        if path.exists() {
            return true;
        }
        // Check if it's registered as an active download in the DB
        if taken_paths.iter().any(|p| Path::new(p) == path) {
            return true;
        }
        // Check if there's an active .part in .sf-temp (but NOT in cancelados/)
        if let (Some(parent), Some(name)) = (path.parent(), path.file_name()) {
            let active_part = parent
                .join(".sf-temp")
                .join(format!("{}.part", name.to_string_lossy()));
            if active_part.exists() {
                return true;
            }
        }
        false
    };
    if !is_taken(&original) {
        return original;
    }
    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("download");
    let extension = path.extension().and_then(|value| value.to_str());
    for index in 1..10_000 {
        let candidate = match extension {
            Some(ext) => folder.join(format!("{stem} ({index}).{ext}")),
            None => folder.join(format!("{stem} ({index})")),
        };
        if !is_taken(&candidate) {
            return candidate;
        }
    }
    folder.join(format!("{}-{}", uuid::Uuid::new_v4(), file_name))
}

#[cfg(test)]
mod security_tests {
    use super::validate_destructive_path;

    #[test]
    fn destructive_targets_must_stay_inside_the_download_root() {
        let root = std::env::temp_dir().join(format!("sf-path-root-{}", uuid::Uuid::new_v4()));
        let outside =
            std::env::temp_dir().join(format!("sf-path-outside-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".sf-temp")).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let inside = root.join(".sf-temp").join("file.part");
        let outside_file = outside.join("private.txt");
        std::fs::write(&inside, b"partial").unwrap();
        std::fs::write(&outside_file, b"keep").unwrap();

        assert!(validate_destructive_path(&root, &inside).is_ok());
        assert!(validate_destructive_path(&root, &outside_file).is_err());

        std::fs::remove_dir_all(root).unwrap();
        std::fs::remove_dir_all(outside).unwrap();
    }
}
