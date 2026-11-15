use std::{
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

use crate::download::paths::safe_file_name;

#[derive(Debug, Serialize, Clone)]
pub struct UpdateCheckResult {
    pub available: bool,
    pub check_succeeded: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_name: Option<String>,
    pub release_notes: Option<String>,
    pub installer_url: Option<String>,
    pub installer_name: Option<String>,
    pub installer_size: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct UpdateDownloadProgress {
    pub status: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub bytes_per_second: u64,
    pub installer_name: Option<String>,
    pub message: Option<String>,
}

impl UpdateDownloadProgress {
    fn idle() -> Self {
        Self {
            status: "idle".into(),
            downloaded_bytes: 0,
            total_bytes: None,
            bytes_per_second: 0,
            installer_name: None,
            message: None,
        }
    }
}

struct UpdateRuntime {
    progress: UpdateDownloadProgress,
    ready_installer: Option<PathBuf>,
    cancellation: Option<CancellationToken>,
    approved_installer: Option<(String, String, u64)>,
    approved_digest: Option<String>,
    ready_digest: Option<String>,
    theme: Vec<String>,
}

impl Default for UpdateRuntime {
    fn default() -> Self {
        Self {
            progress: UpdateDownloadProgress::idle(),
            ready_installer: None,
            cancellation: None,
            approved_installer: None,
            approved_digest: None,
            ready_digest: None,
            theme: vec!["#10141A".into(), "#F4F6FA".into(), "#06B6D4".into()],
        }
    }
}

static UPDATE_RUNTIME: OnceLock<Mutex<UpdateRuntime>> = OnceLock::new();

fn runtime() -> &'static Mutex<UpdateRuntime> {
    UPDATE_RUNTIME.get_or_init(|| Mutex::new(UpdateRuntime::default()))
}

pub fn is_preparing_install() -> bool {
    runtime().lock().map(|state| matches!(state.progress.status.as_str(), "preparing" | "installing")).unwrap_or(false)
}

fn set_progress(app: &AppHandle, progress: UpdateDownloadProgress) {
    if let Ok(mut state) = runtime().lock() {
        state.progress = progress.clone();
    }
    let _ = app.emit("update-download-progress", progress);
}

const UPDATE_BASE: &str =
    "https://sfdownloader-updates.nskbr.workers.dev/sfdownloader/desktop";
const INSTALLER_NAME: &str = "SFDownloader-Windows-x64-setup.exe";
const MAX_MANIFEST_BYTES: usize = 64 * 1024;

#[derive(Deserialize)]
struct FilebaseManifest {
    app: String,
    platform: String,
    version: String,
    file: String,
    url: String,
    size: u64,
    sha256: String,
    notes: Option<String>,
}

fn version_parts(version: &str) -> Option<[u64; 3]> {
    let mut parts = version.split('.');
    let mut parsed = [0; 3];
    for value in &mut parsed {
        let part = parts.next()?;
        let number: u64 = part.parse().ok()?;
        if number.to_string() != part {
            return None;
        }
        *value = number;
    }
    parts.next().is_none().then_some(parsed)
}

fn installer_url(version: &str) -> String {
    format!("{UPDATE_BASE}/releases/{version}/{INSTALLER_NAME}")
}

impl FilebaseManifest {
    fn is_valid(&self) -> bool {
        self.app == "SFDownloader"
            && self.platform == "windows-x64"
            && version_parts(&self.version).is_some()
            && self.file == INSTALLER_NAME
            && self.url == installer_url(&self.version)
            && self.size > 0
            && self.sha256.len() == 64
            && self.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    }
}

async fn fetch_manifest() -> Result<FilebaseManifest, String> {
    let client = reqwest::Client::builder()
        .user_agent("SFDownloader-updater")
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())?;
    let mut response = client
        .get(format!("{UPDATE_BASE}/latest.json"))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status() != reqwest::StatusCode::OK {
        return Err(format!("HTTP {}", response.status()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if chunk.len() > MAX_MANIFEST_BYTES - bytes.len() {
            return Err("Manifesto excede o tamanho permitido.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let manifest: FilebaseManifest =
        serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    if !manifest.is_valid() {
        return Err("Manifesto de atualização inválido.".into());
    }
    Ok(manifest)
}

fn installer_cache_path(
    app: &AppHandle,
    installer_name: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Não foi possível acessar a pasta de dados do aplicativo: {e}"))?
        .join("updates");
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("Não foi possível preparar a pasta da atualização: {e}"))?;
    let safe_name = safe_file_name(installer_name);
    if !safe_name.to_ascii_lowercase().ends_with(".exe") {
        return Err("O arquivo de atualização não é um instalador .exe válido.".into());
    }
    let destination = root.join(safe_name);
    let temporary = destination.with_extension("exe.part");
    Ok((destination, temporary))
}

#[tauri::command]
pub async fn check_for_updates(
    app: AppHandle,
    repo_override: Option<String>,
) -> Result<UpdateCheckResult, String> {
    if repo_override.as_deref().is_some_and(|value| !value.is_empty() && value != "NskBR/SFDownloader-App") {
        return Err("Use o canal oficial para atualizações.".into());
    }
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let mut result = UpdateCheckResult {
        available: false,
        check_succeeded: false,
        latest_version: current_version.clone(),
        current_version,
        release_url: format!("{UPDATE_BASE}/latest.json"),
        release_name: None,
        release_notes: None,
        installer_url: None,
        installer_name: None,
        installer_size: None,
    };
    let manifest = match fetch_manifest().await {
        Ok(manifest) => manifest,
        Err(error) => {
            crate::commands::debug::log_warn(
                "updater",
                "Não foi possível verificar o manifesto de atualizações.",
                Some(error),
                None,
                None,
                Some(&app),
            );
            return Ok(result);
        }
    };
    result.available = version_parts(&manifest.version) > version_parts(&result.current_version);
    result.check_succeeded = true;
    result.latest_version = manifest.version;
    result.release_name = Some(format!("SFDownloader {}", result.latest_version));
    result.release_notes = manifest.notes;
    {
        let mut state = runtime().lock().map_err(|_| "O estado do atualizador está indisponível.")?;
        state.approved_installer = result.available.then(|| {
            (manifest.url.clone(), manifest.file.clone(), manifest.size)
        });
        state.approved_digest = result.available.then(|| manifest.sha256.to_ascii_lowercase());
    }
    if result.available {
        result.installer_url = Some(manifest.url);
        result.installer_name = Some(manifest.file);
        result.installer_size = Some(manifest.size);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn update_download_status() -> UpdateDownloadProgress {
    runtime()
        .lock()
        .map(|state| state.progress.clone())
        .unwrap_or_else(|_| UpdateDownloadProgress::idle())
}

#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    installer_url: String,
    installer_name: String,
    theme: Option<Vec<String>>,
) -> Result<(), String> {
    let installer_name = safe_file_name(&installer_name);
    if !installer_name.to_ascii_lowercase().ends_with(".exe") {
        return Err("A atualização selecionada não é um instalador .exe válido.".into());
    }
    let cancellation = CancellationToken::new();
    let (expected_size, expected_digest) = {
        let mut state = runtime()
            .lock()
            .map_err(|_| "O estado do atualizador está indisponível.".to_string())?;
        if matches!(state.progress.status.as_str(), "downloading" | "preparing" | "installing") {
            return Err("Já existe uma atualização sendo baixada.".into());
        }
        let expected_size = match state.approved_installer.as_ref() {
            Some((url, name, size)) if url == &installer_url && name == &installer_name => *size,
            _ => return Err("O instalador não corresponde ao manifesto verificado.".into()),
        };
        let expected_digest = state.approved_digest.clone().ok_or("SHA-256 indisponível.")?;
        state.ready_installer = None;
        state.ready_digest = None;
        if let Some(theme) = theme.filter(|colors| colors.len() == 3 && colors.iter().all(|c| c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|v| v.is_ascii_hexdigit()))) { state.theme = theme; }
        state.progress.status = "downloading".into();
        state.cancellation = Some(cancellation.clone());
        (expected_size, expected_digest)
    };
    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        set_progress(
            &app_for_task,
            UpdateDownloadProgress {
                status: "downloading".into(),
                downloaded_bytes: 0,
                total_bytes: None,
                bytes_per_second: 0,
                installer_name: Some(installer_name.clone()),
                message: Some("Baixando instalador…".into()),
            },
        );
        let result = async {
            let client = reqwest::Client::builder().user_agent("SFDownloader-updater").redirect(reqwest::redirect::Policy::none()).build().map_err(|e| format!("Erro ao criar cliente HTTP: {e}"))?;
            let response = client.get(&installer_url).send().await.map_err(|e| format!("Não foi possível baixar a atualização: {e}"))?.error_for_status().map_err(|e| format!("O servidor recusou o download da atualização: {e}"))?;
            if response.status() != reqwest::StatusCode::OK
                || response.content_length().is_some_and(|length| length != expected_size)
            {
                return Err("A resposta não corresponde ao tamanho do instalador.".into());
            }
            let total_bytes = Some(expected_size);
            let (destination, temporary) = installer_cache_path(&app_for_task, &installer_name)?;
            let _ = tokio::fs::remove_file(&temporary).await;
            let mut output = tokio::fs::File::create(&temporary).await.map_err(|e| format!("Não foi possível criar o instalador temporário: {e}"))?;
            let mut stream = response.bytes_stream();
            let started = Instant::now();
            let mut last_emit = Instant::now() - Duration::from_secs(1);
            let mut downloaded_bytes = 0_u64;
            let mut hash = Sha256::new();
            loop {
                let next = tokio::select! { _ = cancellation.cancelled() => { let _ = tokio::fs::remove_file(&temporary).await; return Err("Download da atualização cancelado.".to_string()); }, value = stream.next() => value };
                let Some(chunk) = next else { break };
                let chunk = chunk.map_err(|e| format!("Falha durante o download da atualização: {e}"))?;
                if chunk.len() as u64 > expected_size - downloaded_bytes {
                    return Err("O instalador excede o tamanho do manifesto.".into());
                }
                hash.update(&chunk);
                output.write_all(&chunk).await.map_err(|e| format!("Falha ao salvar a atualização: {e}"))?;
                downloaded_bytes += chunk.len() as u64;
                if last_emit.elapsed() >= Duration::from_millis(150) {
                    set_progress(&app_for_task, UpdateDownloadProgress { status: "downloading".into(), downloaded_bytes, total_bytes, bytes_per_second: (downloaded_bytes as f64 / started.elapsed().as_secs_f64()) as u64, installer_name: Some(installer_name.clone()), message: Some("Baixando instalador…".into()) });
                    last_emit = Instant::now();
                }
            }
            output.flush().await.map_err(|e| format!("Falha ao finalizar o instalador: {e}"))?;
            drop(output);
            if downloaded_bytes != expected_size || format!("{:x}", hash.finalize()) != expected_digest {
                let _ = tokio::fs::remove_file(&temporary).await;
                return Err("O tamanho ou o SHA-256 do instalador não corresponde ao manifesto.".into());
            }
            tokio::fs::rename(&temporary, &destination).await.map_err(|e| format!("Não foi possível finalizar o instalador: {e}"))?;
            Ok::<(PathBuf, u64, Option<u64>), String>((destination, downloaded_bytes, total_bytes))
        }.await;
        match result {
            Ok((path, downloaded_bytes, total_bytes)) => {
                if let Ok(mut state) = runtime().lock() {
                    state.ready_installer = Some(path);
                    state.ready_digest = Some(expected_digest);
                    state.cancellation = None;
                }
                set_progress(
                    &app_for_task,
                    UpdateDownloadProgress {
                        status: "preparing".into(),
                        downloaded_bytes,
                        total_bytes,
                        bytes_per_second: 0,
                        installer_name: Some(installer_name),
                        message: Some(
                            "Verificando e preparando atualização…".into(),
                        ),
                    },
                );
                if let Err(error) = install_downloaded_update(app_for_task.clone()).await {
                    let mut progress = update_download_status();
                    progress.status = "failed".into();
                    progress.message = Some(error);
                    set_progress(&app_for_task, progress);
                }
            }
            Err(error) => {
                if let Ok(mut state) = runtime().lock() {
                    state.cancellation = None;
                }
                crate::commands::debug::log_warn(
                    "updater",
                    "Não foi possível baixar a atualização.",
                    Some(error.clone()),
                    None,
                    None,
                    Some(&app_for_task),
                );
                set_progress(
                    &app_for_task,
                    UpdateDownloadProgress {
                        status: "failed".into(),
                        downloaded_bytes: 0,
                        total_bytes: None,
                        bytes_per_second: 0,
                        installer_name: Some(installer_name),
                        message: Some(error),
                    },
                );
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_update_download(app: AppHandle) -> Result<(), String> {
    let mut state = runtime()
        .lock()
        .map_err(|_| "O estado do atualizador está indisponível.".to_string())?;
    let Some(cancellation) = state.cancellation.take() else {
        return Ok(());
    };
    cancellation.cancel();
    state.progress = UpdateDownloadProgress {
        status: "cancelling".into(),
        downloaded_bytes: state.progress.downloaded_bytes,
        total_bytes: state.progress.total_bytes,
        bytes_per_second: 0,
        installer_name: state.progress.installer_name.clone(),
        message: Some("Cancelando download da atualização…".into()),
    };
    let progress = state.progress.clone();
    drop(state);
    let _ = app.emit("update-download-progress", progress);
    Ok(())
}

#[tauri::command]
pub async fn install_downloaded_update(app: AppHandle) -> Result<(), String> {
    let installer = runtime()
        .lock()
        .map_err(|_| "O estado do atualizador está indisponível.".to_string())?
        .ready_installer
        .clone()
        .ok_or_else(|| "Nenhum instalador de atualização está pronto.".to_string())?;
    if !installer.is_file()
        || !installer
            .to_string_lossy()
            .to_ascii_lowercase()
            .ends_with(".exe")
    {
        return Err("O instalador baixado não está disponível.".into());
    }
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    if cfg!(debug_assertions) { return Err("Instalação disponível apenas no aplicativo instalado; o modo de desenvolvimento não será substituído.".into()); }
    let folder = installer.parent().ok_or("Pasta de atualização inválida")?.join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let script = folder.join("install.ps1");
    let logo = folder.join("logo.svg");
    let icon = folder.join("sfdownloader.ico");
    let ready = folder.join("ready");
    let go = folder.join("go");
    let error_file = folder.join("error");
    let config = folder.join("config.json");
    let (digest, theme) = { let state = runtime().lock().map_err(|e| e.to_string())?; (state.ready_digest.clone().ok_or("SHA-256 indisponível")?, state.theme.clone()) };
    // Windows PowerShell 5.1 requires a BOM to decode UTF-8 script literals.
    std::fs::write(&script, format!("\u{feff}{}", include_str!("update-helper.ps1"))).map_err(|e| e.to_string())?;
    std::fs::write(&logo, include_str!("../../../src/assets/sf-logo.svg")).map_err(|e| e.to_string())?;
    std::fs::write(&icon, include_bytes!("../../icons/icon.ico")).map_err(|e| e.to_string())?;
    let payload = serde_json::json!({"icon": icon, "installer": installer, "executable": executable, "destination": executable.parent(), "parent": std::process::id(), "sha256": digest, "logo": logo, "ready": ready, "go": go, "error": error_file, "background": theme[0], "foreground": theme[1], "accent": theme[2]});
    std::fs::write(&config, serde_json::to_vec(&payload).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let mut command = std::process::Command::new("powershell.exe");
    command.args(["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File"]).arg(script).arg("-ConfigPath").arg(config);
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    let mut helper = command.spawn().map_err(|e| format!("Não foi possível abrir a janela de atualização: {e}"))?;
    let deadline = Instant::now() + Duration::from_secs(30);
    while !ready.exists() {
        if error_file.exists() { return Err(std::fs::read_to_string(&error_file).unwrap_or_else(|_| "Falha ao verificar atualização".into())); }
        if Instant::now() > deadline || helper.try_wait().map_err(|e| e.to_string())?.is_some() { let _ = helper.kill(); return Err("A janela de atualização não ficou pronta. O aplicativo permanece aberto.".into()); }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let database = app.state::<crate::database::Database>();
    let tasks = { let connection = database.connect().map_err(|e| e.to_string())?; crate::database::repositories::downloads::list(&connection).map_err(|e| e.to_string())? };
    use crate::database::models::DownloadStatus;
    if tasks.iter().any(|task| matches!(task.status, DownloadStatus::Assembling | DownloadStatus::Extracting)) { let _ = helper.kill(); return Err("Aguarde a montagem ou extração dos arquivos e tente atualizar novamente.".into()); }
    for task in tasks.iter().filter(|task| matches!(task.status, DownloadStatus::Downloading | DownloadStatus::CheckingFiles | DownloadStatus::Pending)) {
        crate::commands::task_control::pause_download(app.clone(), app.state(), app.state(), task.id.clone()).await?;
    }
    let download_runtime = app.state::<crate::download::runtime::DownloadRuntime>();
    let deadline = Instant::now() + Duration::from_secs(30);
    while download_runtime.diagnostics().active_tasks != 0 {
        if Instant::now() > deadline { let _ = helper.kill(); return Err("Os downloads ainda estão sendo salvos. Tente atualizar novamente.".into()); }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    std::fs::write(go, "install").map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_cross_version_or_external_installer_urls() {
        let mut manifest = FilebaseManifest {
            app: "SFDownloader".into(),
            platform: "windows-x64".into(),
            version: "1.2.3".into(),
            file: INSTALLER_NAME.into(),
            url: installer_url("1.2.3"),
            size: 100,
            sha256: "a".repeat(64),
            notes: None,
        };
        assert!(manifest.is_valid());
        manifest.url = installer_url("1.2.4");
        assert!(!manifest.is_valid());
        manifest.url = format!("https://example.test/{INSTALLER_NAME}");
        assert!(!manifest.is_valid());
        manifest.version = "01.2.3".into();
        assert!(version_parts(&manifest.version).is_none());
    }
}
