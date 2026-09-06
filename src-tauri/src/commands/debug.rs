use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex, OnceLock},
    time::SystemTime,
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugLogEntry {
    pub id: String,
    pub timestamp: String,
    pub level: String,    // "error", "warn", "info"
    pub category: String, // "download", "inspector", "torrent", "bridge", "extraction", "database", "system"
    pub message: String,
    pub details: Option<String>,
    pub target_url: Option<String>,
    pub download_id: Option<String>,
    pub correlation_id: String,
    pub failure_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    pub generated_at: String,
    pub app_version: String,
    pub operating_system: String,
    pub architecture: String,
    pub engine: crate::download::runtime::RuntimeDiagnostics,
    pub logs: Vec<DebugLogEntry>,
}

static LOG_BUFFER: OnceLock<Arc<Mutex<VecDeque<DebugLogEntry>>>> = OnceLock::new();
static CREATING_DEBUG_WINDOW: OnceLock<Mutex<bool>> = OnceLock::new();
const MAX_LOG_ENTRIES: usize = 500;
const MAX_LOG_FIELD_LENGTH: usize = 2_048;

fn get_log_buffer() -> &'static Arc<Mutex<VecDeque<DebugLogEntry>>> {
    LOG_BUFFER.get_or_init(|| Arc::new(Mutex::new(VecDeque::with_capacity(MAX_LOG_ENTRIES))))
}

fn truncate(value: String) -> String {
    if value.chars().count() <= MAX_LOG_FIELD_LENGTH {
        value
    } else {
        format!(
            "{}… [conteúdo truncado]",
            value.chars().take(MAX_LOG_FIELD_LENGTH).collect::<String>()
        )
    }
}

fn is_sensitive(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    [
        "authorization",
        "cookie",
        "set-cookie",
        "password",
        "secret",
        "token",
        "apikey",
        "api-key",
        "x-api-key",
    ]
    .iter()
    .any(|marker| value.contains(marker))
}

fn redact_url(value: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(value).ok()?;
    let host = parsed.host_str()?;
    Some(format!("{}://{host}/…", parsed.scheme()))
}

fn sanitize_text(value: String) -> String {
    let sanitized = value
        .lines()
        .map(|line| {
            if is_sensitive(line) {
                "[dados sensíveis removidos]".to_string()
            } else {
                line.split_whitespace()
                    .map(|word| redact_url(word).unwrap_or_else(|| word.to_string()))
                    .collect::<Vec<_>>()
                    .join(" ")
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    truncate(sanitized)
}

fn failure_kind(level: &str, message: &str, details: Option<&str>) -> Option<String> {
    if level != "error" && level != "warn" {
        return None;
    }
    let content = format!("{message} {}", details.unwrap_or_default()).to_ascii_lowercase();
    let definitive = [
        "url informada é inválida",
        "esquema não suportado",
        "não há permissão",
        "sem permissão",
        "espaço em disco insuficiente",
        "etag mudou",
        "bloqueado",
        "caminho inseguro",
        "senha incorreta",
        "http 404",
    ]
    .iter()
    .any(|marker| content.contains(marker));
    Some(if definitive {
        "definitive".to_string()
    } else {
        "recoverable".to_string()
    })
}

fn get_creating_flag() -> &'static Mutex<bool> {
    CREATING_DEBUG_WINDOW.get_or_init(|| Mutex::new(false))
}

fn current_timestamp() -> String {
    let now = SystemTime::now();
    let duration = now
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = duration.as_secs();
    let millis = duration.subsec_millis();

    let secs_in_day = total_secs % 86400;
    let hours = secs_in_day / 3600;
    let minutes = (secs_in_day % 3600) / 60;
    let seconds = secs_in_day % 60;

    format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, seconds, millis)
}

pub fn add_log(
    level: &str,
    category: &str,
    message: &str,
    details: Option<String>,
    target_url: Option<String>,
    download_id: Option<String>,
    app: Option<&AppHandle>,
) {
    let timestamp = current_timestamp();
    let id = uuid::Uuid::new_v4().to_string();
    let correlation_id = download_id.clone().unwrap_or_else(|| id.clone());
    let sanitized_message = sanitize_text(message.to_string());
    let sanitized_details = details.map(sanitize_text);
    let entry = DebugLogEntry {
        id,
        timestamp,
        level: match level {
            "debug" | "info" | "warn" | "error" => level.to_string(),
            _ => "warn".to_string(),
        },
        category: truncate(category.to_lowercase()),
        failure_kind: failure_kind(level, &sanitized_message, sanitized_details.as_deref()),
        message: sanitized_message,
        details: sanitized_details,
        target_url: target_url.and_then(|value| redact_url(&value)),
        download_id,
        correlation_id,
    };

    if let Ok(mut buffer) = get_log_buffer().lock() {
        if buffer.len() >= MAX_LOG_ENTRIES {
            buffer.pop_front();
        }
        buffer.push_back(entry.clone());
    }

    if let Some(app) = app {
        let _ = app.emit("debug-log-entry", entry);
    }
}

#[allow(dead_code)]
pub fn log_debug(
    category: &str,
    message: &str,
    details: Option<String>,
    download_id: Option<String>,
    app: Option<&AppHandle>,
) {
    add_log("debug", category, message, details, None, download_id, app);
}

pub fn log_error(
    category: &str,
    message: &str,
    details: Option<String>,
    target_url: Option<String>,
    download_id: Option<String>,
    app: Option<&AppHandle>,
) {
    add_log(
        "error",
        category,
        message,
        details,
        target_url,
        download_id,
        app,
    );
}

#[cfg(test)]
mod tests {
    use super::{failure_kind, redact_url, sanitize_text};

    #[test]
    fn log_sanitization_removes_secrets_and_query_strings() {
        assert_eq!(
            redact_url("https://example.com/file.zip?token=secret"),
            Some("https://example.com/…".into())
        );
        assert_eq!(
            sanitize_text("Authorization: Bearer secret".into()),
            "[dados sensíveis removidos]"
        );
    }

    #[test]
    fn failure_kind_separates_user_action_from_transient_failures() {
        assert_eq!(
            failure_kind("error", "Sem permissão para gravar", None),
            Some("definitive".into())
        );
        assert_eq!(
            failure_kind("error", "Falha ao conectar ao servidor", None),
            Some("recoverable".into())
        );
    }
}

#[allow(dead_code)]
pub fn log_warn(
    category: &str,
    message: &str,
    details: Option<String>,
    target_url: Option<String>,
    download_id: Option<String>,
    app: Option<&AppHandle>,
) {
    add_log(
        "warn",
        category,
        message,
        details,
        target_url,
        download_id,
        app,
    );
}

#[allow(dead_code)]
pub fn log_info(
    category: &str,
    message: &str,
    details: Option<String>,
    target_url: Option<String>,
    download_id: Option<String>,
    app: Option<&AppHandle>,
) {
    add_log(
        "info",
        category,
        message,
        details,
        target_url,
        download_id,
        app,
    );
}

#[tauri::command]
pub fn get_debug_logs() -> Vec<DebugLogEntry> {
    get_log_buffer()
        .lock()
        .map(|buffer| buffer.iter().cloned().collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn clear_debug_logs() -> Result<(), String> {
    if let Ok(mut buffer) = get_log_buffer().lock() {
        buffer.clear();
    }
    Ok(())
}

#[tauri::command]
pub fn get_diagnostic_report(
    runtime: State<'_, crate::download::runtime::DownloadRuntime>,
) -> DiagnosticReport {
    DiagnosticReport {
        generated_at: current_timestamp(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        operating_system: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        engine: runtime.diagnostics(),
        logs: get_debug_logs(),
    }
}

#[tauri::command]
pub async fn open_debug_window(app: AppHandle) -> Result<(), String> {
    let label = "debug-logs";
    if let Some(window) = app.get_webview_window(label) {
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    {
        let mut creating = get_creating_flag()
            .lock()
            .map_err(|error| error.to_string())?;
        if *creating {
            return Ok(());
        }
        *creating = true;
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
        .title("Menu Debug — SFDownloader")
        .inner_size(840.0, 580.0)
        .min_inner_size(680.0, 440.0)
        .resizable(true)
        .decorations(false)
        .visible(false)
        .transparent(true)
        .center()
        .build();

    {
        if let Ok(mut creating) = get_creating_flag().lock() {
            *creating = false;
        }
    }

    build_result.map_err(|error| format!("Falha ao abrir janela de debug: {error}"))?;
    Ok(())
}
