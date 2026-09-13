use crate::database::{repositories::downloads, Database};
use std::{
    collections::{HashMap, HashSet},
    sync::{LazyLock, Mutex},
    time::Instant,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

static CREATING_WINDOWS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

// Janelas de progresso são compactas por definição. A largura é controlada
// somente aqui; o frontend preserva essa largura e altera apenas a altura
// para detalhes, cancelamento e estados que precisam de mais espaço vertical.
const LIVE_DOWNLOAD_WINDOW_WIDTH: f64 = 440.0;
const HTTP_DOWNLOAD_WINDOW_HEIGHT: f64 = 220.0;
const TORRENT_DOWNLOAD_WINDOW_HEIGHT: f64 = 232.0;

// Dedupe por URL para impedir janelas de confirmação duplicadas da MESMA URL
// disparadas em sequência por caminhos diferentes (paste, Enter, deep link,
// extensão). URLs diferentes continuam abrindo janelas independentes.
static RECENT_CONFIRMATIONS: LazyLock<Mutex<HashMap<String, Instant>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn confirmation_recently_opened(url: &str) -> bool {
    if url.is_empty() {
        return false;
    }
    let mut map = match RECENT_CONFIRMATIONS.lock() {
        Ok(map) => map,
        Err(_) => return false,
    };
    let now = Instant::now();
    map.retain(|_, time| now.duration_since(*time).as_secs() < 10);
    if let Some(last) = map.get(url) {
        if now.duration_since(*last).as_millis() < 2500 {
            return true;
        }
    }
    map.insert(url.to_string(), now);
    false
}

#[tauri::command]
pub fn show_ready_window(window: tauri::WebviewWindow) -> Result<(), String> {
    let _ = window.unminimize();
    let _ = window.set_skip_taskbar(false);
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn open_download_confirmation(
    app: AppHandle,
    token: String,
    url: String,
) -> Result<(), String> {
    let is_torrent = url.starts_with("magnet:") || url.to_lowercase().ends_with(".torrent");
    let label = if is_torrent {
        format!("download-torrent-confirm-{}", token)
    } else {
        format!("download-confirm-{}", token)
    };
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    // Bloqueia janela duplicada da mesma URL (dispara em sequência por caminhos
    // diferentes). URLs diferentes seguem abrindo normalmente.
    if confirmation_recently_opened(&url) {
        return Ok(());
    }

    {
        let mut creating = CREATING_WINDOWS.lock().map_err(|error| error.to_string())?;
        if creating.contains(&label) {
            return Ok(());
        }
        creating.insert(label.clone());
    }

    #[cfg(debug_assertions)]
    let confirmation_url = app
        .config()
        .build
        .dev_url
        .clone()
        .map(WebviewUrl::External)
        .unwrap_or_else(|| WebviewUrl::App("index.html".into()));
    #[cfg(not(debug_assertions))]
    let confirmation_url = WebviewUrl::App("index.html".into());

    let builder = WebviewWindowBuilder::new(&app, &label, confirmation_url)
        .title(if is_torrent {
            "Adicionar Torrent"
        } else {
            "Confirmar download"
        })
        .decorations(false)
        .shadow(false)
        .visible(false)
        .transparent(true)
        .center();

    let build_result = if is_torrent {
        builder.inner_size(800.0, 510.0).resizable(false).build()
    } else {
        builder.inner_size(520.0, 266.0).resizable(false).build()
    };

    {
        if let Ok(mut creating) = CREATING_WINDOWS.lock() {
            creating.remove(&label);
        }
    }

    build_result.map_err(|error| format!("Falha ao abrir confirmação: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn open_progress_window(app: AppHandle, id: String) -> Result<(), String> {
    let is_torrent = app
        .state::<Database>()
        .connect()
        .ok()
        .and_then(|c| downloads::find(&c, &id).ok().flatten())
        .map(|t| {
            t.download_type == "torrent"
                || t.original_url.starts_with("magnet:")
                || t.file_name.to_lowercase().ends_with(".torrent")
        })
        .unwrap_or(false);

    let label = if is_torrent {
        format!("download-torrent-live-{}", id)
    } else {
        format!("download-{}", id)
    };
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    {
        let mut creating = CREATING_WINDOWS.lock().map_err(|error| error.to_string())?;
        if creating.contains(&label) {
            return Ok(());
        }
        creating.insert(label.clone());
    }

    #[cfg(debug_assertions)]
    let url = app
        .config()
        .build
        .dev_url
        .clone()
        .map(WebviewUrl::External)
        .unwrap_or_else(|| WebviewUrl::App("index.html".into()));
    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App("index.html".into());

    let builder = WebviewWindowBuilder::new(&app, &label, url)
        .title(if is_torrent {
            "SF Downloader - Torrent"
        } else {
            "SF Downloader - Download"
        })
        .decorations(false)
        .shadow(false)
        .visible(false)
        .transparent(true)
        .center();

    let build_result = if is_torrent {
        builder
            .inner_size(LIVE_DOWNLOAD_WINDOW_WIDTH, TORRENT_DOWNLOAD_WINDOW_HEIGHT)
            .resizable(false)
            .build()
    } else {
        builder
            .inner_size(LIVE_DOWNLOAD_WINDOW_WIDTH, HTTP_DOWNLOAD_WINDOW_HEIGHT)
            .resizable(false)
            .build()
    };

    {
        if let Ok(mut creating) = CREATING_WINDOWS.lock() {
            creating.remove(&label);
        }
    }

    let window = build_result.map_err(|error| format!("Falha ao abrir progresso: {error}"))?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub async fn open_torrent_progress_window(
    app: AppHandle,
    info_hash: String,
    task_id: String,
) -> Result<(), String> {
    // Mantém o nome do parâmetro estável para o comando IPC, sem registrá-lo.
    let _ = &info_hash;
    let label = format!("download-torrent-live-{}", task_id);
    crate::commands::debug::log_debug(
        "window",
        "Solicitada abertura da janela de progresso do torrent.",
        None,
        Some(task_id.clone()),
        Some(&app),
    );

    if let Some(window) = app.get_webview_window(&label) {
        crate::commands::debug::log_debug(
            "window",
            "A janela de progresso do torrent existente foi focada.",
            None,
            Some(task_id),
            Some(&app),
        );
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    {
        let mut creating = CREATING_WINDOWS.lock().map_err(|error| error.to_string())?;
        if creating.contains(&label) {
            return Ok(());
        }
        creating.insert(label.clone());
    }

    #[cfg(debug_assertions)]
    let window_url = app
        .config()
        .build
        .dev_url
        .clone()
        .map(WebviewUrl::External)
        .unwrap_or_else(|| WebviewUrl::App("index.html".into()));
    #[cfg(not(debug_assertions))]
    let window_url = WebviewUrl::App("index.html".into());

    let build_result = WebviewWindowBuilder::new(&app, &label, window_url)
        .title("SF Downloader - Torrent")
        .inner_size(LIVE_DOWNLOAD_WINDOW_WIDTH, TORRENT_DOWNLOAD_WINDOW_HEIGHT)
        .resizable(false)
        .decorations(false)
        .shadow(false)
        .visible(false)
        .transparent(true)
        .center()
        .build();

    {
        if let Ok(mut creating) = CREATING_WINDOWS.lock() {
            creating.remove(&label);
        }
    }

    let window = build_result
        .map_err(|error| format!("Falha ao abrir janela de progresso torrent: {error}"))?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub async fn open_torrent_file_selection_window(
    app: AppHandle,
    task_id: String,
) -> Result<(), String> {
    let label = format!("torrent-file-selection-{}", task_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.unminimize().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    {
        let mut creating = CREATING_WINDOWS.lock().map_err(|error| error.to_string())?;
        if creating.contains(&label) {
            return Ok(());
        }
        creating.insert(label.clone());
    }

    #[cfg(debug_assertions)]
    let window_url = app
        .config()
        .build
        .dev_url
        .clone()
        .map(WebviewUrl::External)
        .unwrap_or_else(|| WebviewUrl::App("index.html".into()));
    #[cfg(not(debug_assertions))]
    let window_url = WebviewUrl::App("index.html".into());

    let build_result = WebviewWindowBuilder::new(&app, &label, window_url)
        .title("Editar arquivos do torrent")
        .inner_size(640.0, 500.0)
        .resizable(false)
        .decorations(false)
        .shadow(false)
        .visible(false)
        .transparent(true)
        .center()
        .build();

    if let Ok(mut creating) = CREATING_WINDOWS.lock() {
        creating.remove(&label);
    }

    build_result
        .map_err(|error| format!("Falha ao abrir editor de arquivos do torrent: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn open_complete_window(app: AppHandle, id: String) -> Result<(), String> {
    let label = format!("download-{}", id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    {
        let mut creating = CREATING_WINDOWS.lock().map_err(|error| error.to_string())?;
        if creating.contains(&label) {
            return Ok(());
        }
        creating.insert(label.clone());
    }

    #[cfg(debug_assertions)]
    let url = app
        .config()
        .build
        .dev_url
        .clone()
        .map(WebviewUrl::External)
        .unwrap_or_else(|| WebviewUrl::App("index.html".into()));
    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App("index.html".into());

    let build_result = WebviewWindowBuilder::new(&app, &label, url)
        .title("SF Downloader - Download")
        .inner_size(LIVE_DOWNLOAD_WINDOW_WIDTH, HTTP_DOWNLOAD_WINDOW_HEIGHT)
        .resizable(false)
        .decorations(false)
        .shadow(false)
        .visible(false)
        .transparent(true)
        .center()
        .build();

    {
        if let Ok(mut creating) = CREATING_WINDOWS.lock() {
            creating.remove(&label);
        }
    }

    let window = build_result.map_err(|error| format!("Falha ao abrir conclusão: {error}"))?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub async fn open_browser_integration_window(app: AppHandle) -> Result<(), String> {
    let label = "browser-integration";
    if let Some(window) = app.get_webview_window(label) {
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    {
        let mut creating = CREATING_WINDOWS.lock().map_err(|error| error.to_string())?;
        if creating.contains(label) {
            return Ok(());
        }
        creating.insert(label.to_string());
    }

    #[cfg(debug_assertions)]
    let url = app
        .config()
        .build
        .dev_url
        .clone()
        .map(WebviewUrl::External)
        .unwrap_or_else(|| WebviewUrl::App("index.html".into()));
    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App("index.html".into());

    let build_result = WebviewWindowBuilder::new(&app, label, url)
        .title("Integração do Navegador")
        .inner_size(700.0, 510.0)
        .min_inner_size(700.0, 510.0)
        .resizable(false)
        .decorations(false)
        .visible(false)
        .transparent(true)
        .center()
        .build();

    {
        if let Ok(mut creating) = CREATING_WINDOWS.lock() {
            creating.remove(label);
        }
    }

    build_result.map_err(|error| format!("Falha ao abrir integração: {error}"))?;
    Ok(())
}
