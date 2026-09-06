use crate::database::{
    models::{CreateDownloadInput, DownloadTask, UpdateDownloadInput},
    repositories::{downloads, history},
    Database,
};
use tauri::State;

#[cfg(target_os = "windows")]
fn shell_open(path: &std::path::Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;

    let operation = "open\0".encode_utf16().collect::<Vec<_>>();
    let target = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    // ShellExecuteW delega à associação registrada no Windows, sem iniciar cmd.exe.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };
    let code = result as usize;
    if code <= 32 {
        return Err(format!(
            "O Windows não conseguiu abrir o arquivo (código {code})."
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn create_download(
    database: State<'_, Database>,
    input: CreateDownloadInput,
) -> Result<DownloadTask, String> {
    let connection = database.connect()?;
    downloads::create(&connection, input)
        .map_err(|error| format!("Falha ao criar download: {error}"))
}

#[tauri::command]
pub fn list_history(
    database: State<'_, Database>,
) -> Result<Vec<crate::database::models::HistoryItem>, String> {
    history::list(&database.connect()?)
        .map_err(|error| format!("Falha ao listar histórico: {error}"))
}

#[tauri::command]
pub fn remove_history_item(database: State<'_, Database>, id: String) -> Result<bool, String> {
    history::remove(&database.connect()?, &id)
        .map_err(|error| format!("Falha ao remover item: {error}"))
}

#[tauri::command]
pub fn clear_history(
    database: State<'_, Database>,
    status: Option<String>,
) -> Result<usize, String> {
    history::clear(&database.connect()?, status.as_deref())
        .map_err(|error| format!("Falha ao limpar histórico: {error}"))
}

#[tauri::command]
pub fn reveal_in_folder(path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Caminho do arquivo indisponível.".into());
    }
    #[cfg(target_os = "windows")]
    {
        let normalized = path.replace('/', "\\");
        let p = std::path::Path::new(&normalized);
        if p.is_file() {
            let canonical = crate::download::paths::canonical_existing_file(p)?;
            std::process::Command::new("explorer.exe")
                .arg("/select,")
                .arg(&canonical)
                .spawn()
                .map_err(|error| format!("Não foi possível abrir a pasta: {error}"))?;
        } else if p.is_dir() {
            let canonical = crate::download::paths::canonical_existing_directory(p)?;
            std::process::Command::new("explorer.exe")
                .arg(&canonical)
                .spawn()
                .map_err(|error| format!("Não foi possível abrir a pasta: {error}"))?;
        } else if let Some(parent) = p.parent().filter(|parent| parent.exists()) {
            let canonical = crate::download::paths::canonical_existing_directory(parent)?;
            std::process::Command::new("explorer.exe")
                .arg(canonical)
                .spawn()
                .map_err(|error| format!("Não foi possível abrir a pasta: {error}"))?;
        } else {
            return Err("Pasta de destino indisponível.".into());
        }
    }
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(
            std::path::Path::new(&path)
                .parent()
                .unwrap_or(std::path::Path::new(&path)),
        )
        .spawn()
        .map_err(|error| format!("Não foi possível abrir a pasta: {error}"))?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|error| format!("Não foi possível abrir a pasta: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let target = crate::download::paths::canonical_existing_file(std::path::Path::new(&path))?;

    #[cfg(target_os = "windows")]
    {
        if target
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("xpi"))
            && std::process::Command::new("firefox")
                .arg(&target)
                .spawn()
                .is_ok()
        {
            return Ok(());
        }
        shell_open(&target)?;
    }
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&target)
        .spawn()
        .map_err(|error| format!("Não foi possível abrir o arquivo: {error}"))?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&target)
        .spawn()
        .map_err(|error| format!("Não foi possível abrir o arquivo: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn list_downloads(database: State<'_, Database>) -> Result<Vec<DownloadTask>, String> {
    let connection = database.connect()?;
    downloads::list(&connection).map_err(|error| format!("Falha ao listar downloads: {error}"))
}

#[tauri::command]
pub fn update_download(
    database: State<'_, Database>,
    input: UpdateDownloadInput,
) -> Result<DownloadTask, String> {
    let connection = database.connect()?;
    downloads::update(&connection, input)
        .map_err(|error| format!("Falha ao atualizar download: {error}"))
}

#[tauri::command]
pub fn remove_download(
    database: State<'_, Database>,
    browser_bridge: State<'_, crate::browser_bridge::BrowserBridge>,
    id: String,
) -> Result<bool, String> {
    let connection = database.connect()?;
    let removed = downloads::remove(&connection, &id)
        .map_err(|error| format!("Falha ao remover download: {error}"))?;
    if removed {
        browser_bridge.remove_headers(&id);
    }
    Ok(removed)
}
