use std::{
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

use crate::download::paths::safe_file_name;

#[derive(Debug, Serialize, Clone)]
pub struct UpdateCheckResult {
    pub available: bool,
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
    approved_installer: Option<(String, String)>,
    approved_digest: Option<String>,
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

fn extract_version_str(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut best = String::new();
    let mut current = String::new();
    let mut dots = 0;
    for &c in &chars {
        if c.is_ascii_digit() {
            current.push(c);
        } else if c == '.' && !current.is_empty() && !current.ends_with('.') {
            current.push('.');
            dots += 1;
        } else {
            if dots >= 1 && current.len() > best.len() {
                best = current.trim_matches('.').to_string();
            }
            current.clear();
            dots = 0;
        }
    }
    if dots >= 1 && current.len() > best.len() {
        best = current.trim_matches('.').to_string();
    }
    if best.is_empty() {
        s.trim_start_matches('v').to_string()
    } else {
        best
    }
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    if latest.is_empty() {
        return false;
    }
    let parse_ver = |v: &str| -> Vec<u64> {
        v.split('.')
            .map(|p| p.parse::<u64>().unwrap_or(0))
            .collect()
    };
    parse_ver(latest) > parse_ver(current)
}

fn fallback_result(repo: &str, current_version: String) -> UpdateCheckResult {
    UpdateCheckResult {
        available: false,
        current_version: current_version.clone(),
        latest_version: current_version,
        release_url: format!("https://github.com/{repo}/releases"),
        release_name: None,
        release_notes: None,
        installer_url: None,
        installer_name: None,
        installer_size: None,
    }
}

fn is_official_release_asset_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.path().starts_with("/NskBR/SFDownloader-App/releases/download/")
        && url.path().to_ascii_lowercase().ends_with(".exe")
}

fn select_windows_installer(json: &serde_json::Value) -> Option<(String, String, u64)> {
    json["assets"].as_array()?.iter().find_map(|asset| {
        let name = asset["name"].as_str()?.to_string();
        let url = asset["browser_download_url"].as_str()?.to_string();
        let normalized = name.to_ascii_lowercase();
        if normalized.ends_with(".exe")
            && (normalized.contains("setup") || normalized.contains("installer"))
            && is_official_release_asset_url(&url)
        {
            Some((url, name, asset["size"].as_u64().unwrap_or(0)))
        } else {
            None
        }
    })
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
    let repo = "NskBR/SFDownloader-App".to_string();
    if repo_override.as_deref().is_some_and(|value| !value.is_empty() && value != repo) {
        return Err("Use o repositório oficial para atualizações.".into());
    }
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let client = reqwest::Client::builder()
        .user_agent("SFDownloader-updater")
        .build()
        .map_err(|e| format!("Erro ao criar cliente HTTP: {e}"))?;
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            crate::commands::debug::log_warn(
                "updater",
                "A verificação de atualizações não conseguiu acessar o servidor.",
                Some(e.to_string()),
                None,
                None,
                Some(&app),
            );
            return Ok(fallback_result(&repo, current_version));
        }
    };
    if !resp.status().is_success() {
        crate::commands::debug::log_warn(
            "updater",
            "O servidor de atualizações respondeu com um status não esperado.",
            Some(format!("HTTP {}", resp.status())),
            None,
            None,
            Some(&app),
        );
        return Ok(fallback_result(&repo, current_version));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Falha ao ler resposta do GitHub: {e}"))?;
    let raw_tag = json["tag_name"].as_str().unwrap_or("");
    let raw_name = json["name"].as_str().unwrap_or("");
    // Releases de teste às vezes recebem uma tag descritiva (por exemplo,
    // "TESTE"). Nesse caso, o nome do instalador ainda é uma fonte oficial
    // e inequívoca para a versão publicada.
    let installer = select_windows_installer(&json);
    let mut tag_name = extract_version_str(raw_tag);
    if tag_name.is_empty() || !tag_name.contains('.') {
        tag_name = extract_version_str(raw_name);
    }
    if tag_name.is_empty() || !tag_name.contains('.') {
        if let Some((_, installer_name, _)) = installer.as_ref() {
            tag_name = extract_version_str(installer_name);
        }
    }
    let release_url = json["html_url"]
        .as_str()
        .unwrap_or(&format!("https://github.com/{repo}/releases"))
        .to_string();
    let release_name = json["name"].as_str().map(String::from);
    let release_notes = json["body"].as_str().map(String::from);
    let available = is_version_newer(&tag_name, &current_version);
    let installer = if available { installer } else { None };
    if let Ok(mut state) = runtime().lock() {
        state.approved_digest = installer.as_ref().and_then(|(_, name, _)| {
            json["assets"].as_array()?.iter().find(|asset| asset["name"].as_str() == Some(name))?["digest"]
                .as_str()?.strip_prefix("sha256:").filter(|hash| hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit())).map(str::to_owned)
        });
        state.approved_installer = installer
            .as_ref()
            .map(|(url, name, _)| (url.clone(), name.clone()));
    }
    if available {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
    Ok(UpdateCheckResult {
        available,
        current_version,
        latest_version: if tag_name.is_empty() {
            env!("CARGO_PKG_VERSION").to_string()
        } else {
            tag_name
        },
        release_url,
        release_name,
        release_notes,
        installer_url: installer.as_ref().map(|(url, _, _)| url.clone()),
        installer_name: installer.as_ref().map(|(_, name, _)| name.clone()),
        installer_size: installer.map(|(_, _, size)| size),
    })
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
    if !is_official_release_asset_url(&installer_url) {
        return Err("A atualização precisa ser baixada de um release oficial do GitHub.".into());
    }
    let installer_name = safe_file_name(&installer_name);
    if !installer_name.to_ascii_lowercase().ends_with(".exe") {
        return Err("A atualização selecionada não é um instalador .exe válido.".into());
    }
    let cancellation = CancellationToken::new();
    {
        let mut state = runtime()
            .lock()
            .map_err(|_| "O estado do atualizador está indisponível.".to_string())?;
        if matches!(state.progress.status.as_str(), "downloading" | "preparing" | "installing") {
            return Err("Já existe uma atualização sendo baixada.".into());
        }
        if state.approved_installer.as_ref()
            != Some(&(installer_url.clone(), installer_name.clone()))
        {
            return Err(
                "A atualização não corresponde ao instalador oferecido pelo release verificado."
                    .into(),
            );
        }
        state.ready_installer = None;
        if state.approved_digest.is_none() { return Err("O release não fornece SHA-256 para verificar o instalador.".into()); }
        if let Some(theme) = theme.filter(|colors| colors.len() == 3 && colors.iter().all(|c| c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|v| v.is_ascii_hexdigit()))) { state.theme = theme; }
        state.progress.status = "downloading".into();
        state.cancellation = Some(cancellation.clone());
    }
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
                message: Some("Baixando instalador do GitHub…".into()),
            },
        );
        let result = async {
            let client = reqwest::Client::builder().user_agent("SFDownloader-updater").redirect(reqwest::redirect::Policy::limited(5)).build().map_err(|e| format!("Erro ao criar cliente HTTP: {e}"))?;
            let response = client.get(&installer_url).send().await.map_err(|e| format!("Não foi possível baixar a atualização: {e}"))?.error_for_status().map_err(|e| format!("O GitHub recusou o download da atualização: {e}"))?;
            let total_bytes = response.content_length();
            let (destination, temporary) = installer_cache_path(&app_for_task, &installer_name)?;
            let _ = tokio::fs::remove_file(&temporary).await;
            let mut output = tokio::fs::File::create(&temporary).await.map_err(|e| format!("Não foi possível criar o instalador temporário: {e}"))?;
            let mut stream = response.bytes_stream();
            let started = Instant::now();
            let mut last_emit = Instant::now() - Duration::from_secs(1);
            let mut downloaded_bytes = 0_u64;
            loop {
                let next = tokio::select! { _ = cancellation.cancelled() => { let _ = tokio::fs::remove_file(&temporary).await; return Err("Download da atualização cancelado.".to_string()); }, value = stream.next() => value };
                let Some(chunk) = next else { break };
                let chunk = chunk.map_err(|e| format!("Falha durante o download da atualização: {e}"))?;
                output.write_all(&chunk).await.map_err(|e| format!("Falha ao salvar a atualização: {e}"))?;
                downloaded_bytes += chunk.len() as u64;
                if last_emit.elapsed() >= Duration::from_millis(150) {
                    set_progress(&app_for_task, UpdateDownloadProgress { status: "downloading".into(), downloaded_bytes, total_bytes, bytes_per_second: (downloaded_bytes as f64 / started.elapsed().as_secs_f64()) as u64, installer_name: Some(installer_name.clone()), message: Some("Baixando instalador do GitHub…".into()) });
                    last_emit = Instant::now();
                }
            }
            output.flush().await.map_err(|e| format!("Falha ao finalizar o instalador: {e}"))?;
            if let Some(expected) = total_bytes { if downloaded_bytes != expected { return Err("O instalador foi baixado de forma incompleta.".into()); } }
            tokio::fs::rename(&temporary, &destination).await.map_err(|e| format!("Não foi possível finalizar o instalador: {e}"))?;
            Ok::<(PathBuf, u64, Option<u64>), String>((destination, downloaded_bytes, total_bytes))
        }.await;
        match result {
            Ok((path, downloaded_bytes, total_bytes)) => {
                if let Ok(mut state) = runtime().lock() {
                    state.ready_installer = Some(path);
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
    let ready = folder.join("ready");
    let go = folder.join("go");
    let error_file = folder.join("error");
    let config = folder.join("config.json");
    let (digest, theme) = { let state = runtime().lock().map_err(|e| e.to_string())?; (state.approved_digest.clone().ok_or("SHA-256 indisponível")?, state.theme.clone()) };
    // Windows PowerShell 5.1 requires a BOM to decode UTF-8 script literals.
    std::fs::write(&script, format!("\u{feff}{}", include_str!("update-helper.ps1"))).map_err(|e| e.to_string())?;
    std::fs::write(&logo, include_str!("../../../src/assets/sf-logo.svg")).map_err(|e| e.to_string())?;
    let payload = serde_json::json!({"installer": installer, "executable": executable, "destination": executable.parent(), "parent": std::process::id(), "sha256": digest, "logo": logo, "ready": ready, "go": go, "error": error_file, "background": theme[0], "foreground": theme[1], "accent": theme[2]});
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
    use super::{is_official_release_asset_url, select_windows_installer};
    #[test]
    fn only_accepts_a_github_release_exe() {
        assert!(!is_official_release_asset_url("https://github.com/other/project/releases/download/v1/setup.exe"));
        assert!(is_official_release_asset_url("https://github.com/NskBR/SFDownloader-App/releases/download/v1.0.0/SFDownloader-setup.exe"));
        assert!(!is_official_release_asset_url(
            "https://example.test/installer.exe"
        ));
        assert!(!is_official_release_asset_url(
            "https://github.com/NskBR/SFDownloader-App/releases/download/v1.0.0/readme.txt"
        ));
    }
    #[test]
    fn selects_the_windows_setup_asset() {
        let release = serde_json::json!({"assets": [{"name": "checksums.txt", "browser_download_url": "https://github.com/NskBR/SFDownloader-App/releases/download/v1.0.0/checksums.txt", "size": 10}, {"name": "SFDownloader-setup.exe", "browser_download_url": "https://github.com/NskBR/SFDownloader-App/releases/download/v1.0.0/SFDownloader-setup.exe", "size": 20}]});
        assert_eq!(select_windows_installer(&release), Some(("https://github.com/NskBR/SFDownloader-App/releases/download/v1.0.0/SFDownloader-setup.exe".into(), "SFDownloader-setup.exe".into(), 20)));
    }

    #[test]
    fn extracts_a_version_from_a_test_release_installer_name() {
        let release = serde_json::json!({"assets": [{"name": "SFDownloader_1.0.1_x64-setup.exe", "browser_download_url": "https://github.com/NskBR/SFDownloader-App/releases/download/TESTE/SFDownloader_1.0.1_x64-setup.exe", "size": 20}]});
        let installer = select_windows_installer(&release).expect("valid setup asset");
        assert_eq!(super::extract_version_str(&installer.1), "1.0.1");
    }
}
