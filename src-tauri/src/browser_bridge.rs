use axum::{
    body::Bytes,
    extract::State,
    http::StatusCode,
    http::{HeaderMap as AxumHeaderMap, HeaderValue as AxumHeaderValue},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, COOKIE, REFERER};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

pub const BRIDGE_PORT: u16 = 17_831;
const MAX_CONTEXTS: usize = 256;
const CONTEXT_TTL_SECONDS: u64 = 300;
const MAX_REQUEST_BODY_BYTES: usize = 256 * 1024;
const MAX_REQUEST_HEADER_NAMES: usize = 100;
const MAX_VALUES_PER_HEADER: usize = 20;
const MAX_HEADER_VALUE_BYTES: usize = 8 * 1024;
const MAX_COOKIE_BYTES: usize = 16 * 1024;

#[derive(Clone)]
struct HeaderContext {
    headers: HeaderMap,
    created_at: u64,
}

#[derive(Clone)]
pub struct BrowserBridge {
    token: String,
    contexts: Arc<Mutex<HashMap<String, HeaderContext>>>,
    last_seen: Arc<AtomicU64>,
    theme_accent: Arc<Mutex<Option<String>>>,
    theme_bg: Arc<Mutex<Option<String>>>,
    language: Arc<Mutex<Option<String>>>,
    listening: Arc<AtomicBool>,
    startup_error: Arc<Mutex<Option<String>>>,
}

impl Default for BrowserBridge {
    fn default() -> Self {
        Self {
            token: Uuid::new_v4().to_string(),
            contexts: Arc::new(Mutex::new(HashMap::new())),
            last_seen: Arc::new(AtomicU64::new(0)),
            theme_accent: Arc::new(Mutex::new(None)),
            theme_bg: Arc::new(Mutex::new(None)),
            language: Arc::new(Mutex::new(None)),
            listening: Arc::new(AtomicBool::new(false)),
            startup_error: Arc::new(Mutex::new(None)),
        }
    }
}

impl BrowserBridge {
    fn now_seconds() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0)
    }

    pub fn set_theme(&self, accent: String, bg: String, language: Option<String>) {
        if let Ok(mut a) = self.theme_accent.lock() {
            *a = Some(accent);
        }
        if let Ok(mut b) = self.theme_bg.lock() {
            *b = Some(bg);
        }
        if let Some(lang) = language {
            if let Ok(mut l) = self.language.lock() {
                *l = Some(lang);
            }
        }
    }

    pub fn mark_seen(&self) {
        self.last_seen.store(Self::now_seconds(), Ordering::SeqCst);
    }

    pub fn mark_disconnected(&self) {
        self.last_seen.store(0, Ordering::SeqCst);
    }

    fn cleanup_expired_contexts(&self) {
        if let Ok(mut contexts) = self.contexts.lock() {
            contexts.retain(|_, context| {
                Self::now_seconds().saturating_sub(context.created_at) <= CONTEXT_TTL_SECONDS
            });
        }
    }

    pub fn is_connected(&self) -> bool {
        Self::now_seconds().saturating_sub(self.last_seen.load(Ordering::SeqCst)) <= 90
            && self.last_seen.load(Ordering::SeqCst) > 0
    }

    pub fn get_headers(&self, id: Option<&str>) -> HeaderMap {
        let Some(id) = id else {
            return HeaderMap::new();
        };
        let Ok(mut contexts) = self.contexts.lock() else {
            return HeaderMap::new();
        };
        let expired = contexts
            .get(id)
            .map(|context| {
                Self::now_seconds().saturating_sub(context.created_at) > CONTEXT_TTL_SECONDS
            })
            .unwrap_or(false);
        if expired {
            contexts.remove(id);
            return HeaderMap::new();
        }
        contexts
            .get(id)
            .map(|context| context.headers.clone())
            .unwrap_or_default()
    }

    pub fn take_headers(&self, id: Option<&str>) -> HeaderMap {
        let Some(id) = id else {
            return HeaderMap::new();
        };
        let Ok(mut contexts) = self.contexts.lock() else {
            return HeaderMap::new();
        };
        let context = contexts.remove(id);
        context
            .filter(|context| {
                Self::now_seconds().saturating_sub(context.created_at) <= CONTEXT_TTL_SECONDS
            })
            .map(|context| context.headers)
            .unwrap_or_default()
    }

    pub fn persist_headers(&self, download_id: &str, headers: &HeaderMap) -> Result<(), String> {
        if headers.is_empty() {
            return Ok(());
        }
        let values: Vec<(String, String)> = headers
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| (name.to_string(), value.to_string()))
            })
            .collect();
        let encoded = serde_json::to_string(&values).map_err(|error| error.to_string())?;
        keyring::Entry::new("SF Downloader", download_id)
            .map_err(|error| error.to_string())?
            .set_password(&encoded)
            .map_err(|error| {
                format!("Não foi possível proteger as credenciais do download: {error}")
            })
    }

    pub fn load_headers(&self, download_id: &str) -> HeaderMap {
        let Ok(entry) = keyring::Entry::new("SF Downloader", download_id) else {
            return HeaderMap::new();
        };
        let Ok(encoded) = entry.get_password() else {
            return HeaderMap::new();
        };
        let Ok(values) = serde_json::from_str::<Vec<(String, String)>>(&encoded) else {
            return HeaderMap::new();
        };
        let mut headers = HeaderMap::new();
        for (name, value) in values {
            if let (Ok(name), Ok(value)) =
                (HeaderName::try_from(name), HeaderValue::try_from(value))
            {
                headers.append(name, value);
            }
        }
        headers
    }

    pub fn remove_headers(&self, download_id: &str) {
        if let Ok(entry) = keyring::Entry::new("SF Downloader", download_id) {
            let _ = entry.delete_credential();
        }
    }
}

#[derive(Clone)]
struct BridgeState {
    app: AppHandle,
    bridge: BrowserBridge,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResponse {
    enabled: bool,
    token: String,
    file_exts: Vec<&'static str>,
    blocked_hosts: Vec<&'static str>,
    theme_accent: Option<String>,
    theme_bg: Option<String>,
    language: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserRequest {
    token: String,
    url: String,
    filename: Option<String>,
    file_size: Option<u64>,
    mime_type: Option<String>,
    referrer: Option<String>,
    cookie: Option<String>,
    #[serde(default)]
    request_headers: HashMap<String, Vec<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserDownloadEvent {
    request_id: String,
    url: String,
    file_name: Option<String>,
    file_size: Option<u64>,
    mime_type: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBridgeDiagnostics {
    listening: bool,
    connected: bool,
    port: u16,
    error: Option<String>,
}

pub fn start(app: AppHandle, bridge: BrowserBridge) {
    tauri::async_runtime::spawn(async move {
        let cleanup_bridge = bridge.clone();
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
            loop {
                interval.tick().await;
                cleanup_bridge.cleanup_expired_contexts();
            }
        });
        let status_bridge = bridge.clone();
        let state = BridgeState { app, bridge };
        let router = Router::new()
            .route("/sync", get(sync).options(handle_options))
            .route("/download", post(download).options(handle_options))
            .route("/disconnect", post(disconnect).options(handle_options))
            .route(
                "/extension.xpi",
                get(get_extension_xpi).options(handle_options),
            )
            .with_state(state);
        let address = format!("127.0.0.1:{BRIDGE_PORT}");
        match tokio::net::TcpListener::bind(&address).await {
            Ok(listener) => {
                status_bridge.listening.store(true, Ordering::SeqCst);
                if let Ok(mut error) = status_bridge.startup_error.lock() {
                    *error = None;
                }
                if let Err(error) = axum::serve(listener, router).await {
                    status_bridge.listening.store(false, Ordering::SeqCst);
                    if let Ok(mut stored) = status_bridge.startup_error.lock() {
                        *stored = Some(format!("A ponte local foi encerrada: {error}"));
                    }
                    crate::commands::debug::log_warn(
                        "bridge",
                        "A ponte local do navegador foi encerrada.",
                        Some(error.to_string()),
                        None,
                        None,
                        None,
                    );
                }
            }
            Err(error) => {
                status_bridge.listening.store(false, Ordering::SeqCst);
                if let Ok(mut stored) = status_bridge.startup_error.lock() {
                    *stored = Some(format!(
                        "A porta {BRIDGE_PORT} está ocupada ou indisponível. Feche outra instância do aplicativo e tente novamente. Detalhes: {error}"
                    ));
                }
                crate::commands::debug::log_error(
                    "bridge",
                    "Não foi possível iniciar a ponte local do navegador.",
                    Some(error.to_string()),
                    None,
                    None,
                    None,
                );
            }
        }
    });
}

fn is_extension_origin(value: &str) -> bool {
    value.starts_with("chrome-extension://") || value.starts_with("moz-extension://")
}

// Extensões atuais enviam `Origin: chrome-extension://…` ou
// `moz-extension://…`. Algumas versões antigas, porém, fazem o fetch da
// service worker sem Origin. A ponte escuta exclusivamente em 127.0.0.1, por
// isso aceitamos a ausência do header para preservar compatibilidade, mas
// continuamos rejeitando qualquer origem web explícita.
fn has_trusted_bridge_origin(headers: &AxumHeaderMap) -> bool {
    match headers.get("origin").and_then(|value| value.to_str().ok()) {
        Some(origin) => is_extension_origin(origin),
        None => true,
    }
}

fn is_authorized_download(token: &str, expected_token: &str, url: &str) -> bool {
    token == expected_token
        && (url.starts_with("magnet:")
            || matches!(
                reqwest::Url::parse(url)
                    .ok()
                    .map(|parsed| parsed.scheme().to_string())
                    .as_deref(),
                Some("http" | "https")
            ))
}

fn cors_headers(request_headers: &AxumHeaderMap) -> AxumHeaderMap {
    let mut headers = AxumHeaderMap::new();
    match request_headers.get("origin") {
        Some(origin) if origin.to_str().ok().is_some_and(is_extension_origin) => {
            headers.insert("access-control-allow-origin", origin.clone());
            headers.insert("vary", AxumHeaderValue::from_static("Origin"));
        }
        None => {
            headers.insert(
                "access-control-allow-origin",
                AxumHeaderValue::from_static("*"),
            );
        }
        _ => {}
    }
    headers.insert(
        "access-control-allow-methods",
        AxumHeaderValue::from_static("GET, POST, OPTIONS"),
    );
    headers.insert(
        "access-control-allow-headers",
        AxumHeaderValue::from_static("content-type"),
    );
    headers.insert(
        "access-control-allow-private-network",
        AxumHeaderValue::from_static("true"),
    );
    headers
}

async fn handle_options(request_headers: AxumHeaderMap) -> Response {
    let headers = cors_headers(&request_headers);
    if !has_trusted_bridge_origin(&request_headers) {
        return (headers, StatusCode::FORBIDDEN).into_response();
    }
    (headers, StatusCode::NO_CONTENT).into_response()
}

async fn disconnect(State(state): State<BridgeState>, request_headers: AxumHeaderMap) -> Response {
    let headers = cors_headers(&request_headers);
    if !has_trusted_bridge_origin(&request_headers) {
        return (headers, StatusCode::FORBIDDEN).into_response();
    }
    state.bridge.mark_disconnected();
    let _ = state.app.emit("browser-extension-status", false);
    (headers, Json(serde_json::json!({ "ok": true }))).into_response()
}

async fn sync(State(state): State<BridgeState>, request_headers: AxumHeaderMap) -> Response {
    let headers = cors_headers(&request_headers);
    if !has_trusted_bridge_origin(&request_headers) {
        return (headers, StatusCode::FORBIDDEN).into_response();
    }
    state.bridge.mark_seen();
    let _ = state.app.emit("browser-extension-status", true);
    let theme_accent = state
        .bridge
        .theme_accent
        .lock()
        .ok()
        .and_then(|guard| guard.clone());
    let theme_bg = state
        .bridge
        .theme_bg
        .lock()
        .ok()
        .and_then(|guard| guard.clone());
    let language = state
        .bridge
        .language
        .lock()
        .ok()
        .and_then(|guard| guard.clone());
    (
        headers,
        Json(SyncResponse {
            enabled: true,
            token: state.bridge.token.clone(),
            file_exts: vec![
                // Imagens
                ".JPG",
                ".JPEG",
                ".PNG",
                ".WEBP",
                ".GIF",
                ".BMP",
                ".TIFF",
                ".HEIC",
                // Vídeos
                ".MP4",
                ".MKV",
                ".MOV",
                ".AVI",
                ".WEBM",
                ".FLV",
                ".WMV",
                ".M4V",
                ".3GP",
                ".TS",
                // Áudios
                ".MP3",
                ".WAV",
                ".FLAC",
                ".OGG",
                ".M4A",
                ".AAC",
                ".WMA",
                ".OPUS",
                ".ALAC",
                // Documentos
                ".PDF",
                ".DOC",
                ".DOCX",
                ".XLS",
                ".XLSX",
                ".PPTX",
                ".TXT",
                ".PPT",
                ".CSV",
                ".RTF",
                ".ODT",
                ".EPUB",
                // Compactados
                ".ZIP",
                ".RAR",
                ".7Z",
                ".TAR",
                ".GZ",
                ".TGZ",
                ".BZ2",
                ".XZ",
                ".CAB",
                ".IMG",
                ".DMG",
                ".Z01",
                ".Z02",
                ".R00",
                ".R01",
                ".001",
                // Modelos de IA
                ".SAFETENSORS",
                ".SAFETENSOR",
                ".CKPT",
                ".GGUF",
                ".PT",
                ".PTH",
                ".ONNX",
                ".TFLITE",
                ".H5",
                ".PB",
                ".KERAS",
                ".MODEL",
                ".MLMODEL",
                ".SFT",
                ".GGML",
                ".OT",
                ".TENSOR",
                ".WEIGHTS",
                ".LORA",
                // Aplicativos e Pacotes
                ".EXE",
                ".MSI",
                ".APK",
                ".BAT",
                ".CMD",
                ".PS1",
                ".APPIMAGE",
                ".DEB",
                ".RPM",
                ".RUN",
                ".BIN",
                ".JAR",
                ".VBS",
                ".WSF",
                ".COM",
                ".SH",
                ".COMMAND",
                ".APP",
                // Jogos
                ".ISO",
                ".ROM",
                ".PKG",
                ".NSP",
                ".XCI",
                // Torrents
                ".TORRENT",
            ],
            blocked_hosts: vec![],
            theme_accent,
            theme_bg,
            language,
        }),
    )
        .into_response()
}

#[tauri::command]
pub fn browser_extension_status(bridge: tauri::State<'_, BrowserBridge>) -> bool {
    bridge.is_connected()
}

#[tauri::command]
pub fn browser_extension_diagnostics(
    bridge: tauri::State<'_, BrowserBridge>,
) -> BrowserBridgeDiagnostics {
    BrowserBridgeDiagnostics {
        listening: bridge.listening.load(Ordering::SeqCst),
        connected: bridge.is_connected(),
        port: BRIDGE_PORT,
        error: bridge
            .startup_error
            .lock()
            .ok()
            .and_then(|error| error.clone()),
    }
}

#[tauri::command]
pub fn update_extension_theme(
    bridge: tauri::State<'_, BrowserBridge>,
    accent: String,
    bg: String,
    language: Option<String>,
) {
    bridge.set_theme(accent, bg, language);
}

async fn download(
    State(state): State<BridgeState>,
    request_headers: AxumHeaderMap,
    body: Bytes,
) -> Response {
    let cors_headers = cors_headers(&request_headers);
    if !has_trusted_bridge_origin(&request_headers) {
        return (cors_headers, StatusCode::FORBIDDEN).into_response();
    }
    if body.len() > MAX_REQUEST_BODY_BYTES {
        return (cors_headers, StatusCode::PAYLOAD_TOO_LARGE).into_response();
    }

    let Ok(request) = serde_json::from_slice::<BrowserRequest>(&body) else {
        return (cors_headers, StatusCode::BAD_REQUEST).into_response();
    };
    if request.request_headers.len() > MAX_REQUEST_HEADER_NAMES
        || request
            .cookie
            .as_ref()
            .is_some_and(|cookie| cookie.len() > MAX_COOKIE_BYTES)
        || request.request_headers.values().any(|values| {
            values.len() > MAX_VALUES_PER_HEADER
                || values
                    .iter()
                    .any(|value| value.len() > MAX_HEADER_VALUE_BYTES)
        })
    {
        return (cors_headers, StatusCode::PAYLOAD_TOO_LARGE).into_response();
    }
    if !is_authorized_download(&request.token, &state.bridge.token, &request.url) {
        return (cors_headers, StatusCode::FORBIDDEN).into_response();
    }
    let mut headers = HeaderMap::new();
    for (name, values) in request.request_headers {
        let Ok(name) = HeaderName::try_from(name) else {
            continue;
        };
        if matches!(
            name.as_str(),
            "host" | "content-length" | "connection" | "range" | "accept-encoding"
        ) {
            continue;
        }
        for value in values {
            if let Ok(value) = HeaderValue::try_from(value) {
                headers.append(name.clone(), value);
            }
        }
    }
    if let Some(cookie) = request.cookie.and_then(|v| HeaderValue::try_from(v).ok()) {
        headers.insert(COOKIE, cookie);
    }
    if let Some(referer) = request.referrer.and_then(|v| HeaderValue::try_from(v).ok()) {
        headers.insert(REFERER, referer);
    }
    let request_id = Uuid::new_v4().to_string();
    if let Ok(mut contexts) = state.bridge.contexts.lock() {
        contexts.retain(|_, context| {
            BrowserBridge::now_seconds().saturating_sub(context.created_at) <= CONTEXT_TTL_SECONDS
        });
        if contexts.len() >= MAX_CONTEXTS {
            return (cors_headers, StatusCode::TOO_MANY_REQUESTS).into_response();
        }
        contexts.insert(
            request_id.clone(),
            HeaderContext {
                headers,
                created_at: BrowserBridge::now_seconds(),
            },
        );
    } else {
        return (cors_headers, StatusCode::INTERNAL_SERVER_ERROR).into_response();
    }
    let event = BrowserDownloadEvent {
        request_id,
        url: request.url,
        file_name: request.filename,
        file_size: request.file_size,
        mime_type: request.mime_type,
    };
    if state.app.emit("browser-download-request", event).is_err() {
        return (cors_headers, StatusCode::INTERNAL_SERVER_ERROR).into_response();
    }
    (cors_headers, StatusCode::ACCEPTED).into_response()
}

async fn get_extension_xpi(
    State(state): State<BridgeState>,
    request_headers: AxumHeaderMap,
) -> impl IntoResponse {
    let mut headers = cors_headers(&request_headers);
    headers.insert(
        "content-type",
        AxumHeaderValue::from_static("application/x-xpinstall"),
    );
    headers.insert(
        "content-disposition",
        AxumHeaderValue::from_static("attachment; filename=\"sf_downloader_integration.xpi\""),
    );

    // XPI embutido no binário (sempre disponível na build de release). Para
    // atualizar, basta substituir browser-extension/release/firefox-extension.xpi
    // antes de compilar o app. Em desenvolvimento, o disco tem prioridade.
    let embedded = include_bytes!("../../browser-extension/release/firefox-extension.xpi");

    let data = match state.app.path().app_data_dir() {
        Ok(app_data) => {
            let local = app_data
                .join("extension")
                .join("firefox")
                .join("integration.xpi");
            if let Ok(bytes) = std::fs::read(&local) {
                bytes
            } else {
                let release_dir = app_data
                    .join("..")
                    .join("..")
                    .join("browser-extension")
                    .join("release");
                crate::commands::browser_extension::find_latest_xpi(&release_dir)
                    .and_then(|path| std::fs::read(path).ok())
                    .unwrap_or_else(|| embedded.to_vec())
            }
        }
        Err(_) => embedded.to_vec(),
    };

    (headers, data)
}

#[cfg(test)]
mod tests {
    use super::{
        cors_headers, has_trusted_bridge_origin, is_authorized_download, is_extension_origin,
        BrowserBridge, HeaderContext, CONTEXT_TTL_SECONDS,
    };
    use axum::http::{HeaderMap, HeaderValue};

    #[test]
    fn accepts_only_browser_extension_origins() {
        assert!(is_extension_origin("chrome-extension://extension-id"));
        assert!(is_extension_origin("moz-extension://extension-id"));
        assert!(!is_extension_origin("https://example.com"));
        assert!(!is_extension_origin("null"));
    }

    #[test]
    fn cors_echoes_only_a_valid_extension_origin() {
        let mut valid = HeaderMap::new();
        valid.insert(
            "origin",
            HeaderValue::from_static("chrome-extension://extension-id"),
        );
        assert!(has_trusted_bridge_origin(&valid));
        assert_eq!(
            cors_headers(&valid)
                .get("access-control-allow-origin")
                .and_then(|value| value.to_str().ok()),
            Some("chrome-extension://extension-id")
        );

        let mut invalid = HeaderMap::new();
        invalid.insert("origin", HeaderValue::from_static("https://example.com"));
        assert!(!has_trusted_bridge_origin(&invalid));
        assert!(cors_headers(&invalid)
            .get("access-control-allow-origin")
            .is_none());

        let legacy = HeaderMap::new();
        assert!(has_trusted_bridge_origin(&legacy));
        assert_eq!(
            cors_headers(&legacy)
                .get("access-control-allow-origin")
                .and_then(|value| value.to_str().ok()),
            Some("*")
        );
    }

    #[test]
    fn token_and_url_must_both_be_valid() {
        assert!(is_authorized_download(
            "secret",
            "secret",
            "https://files.example/archive.zip"
        ));
        assert!(is_authorized_download(
            "secret",
            "secret",
            "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"
        ));
        assert!(!is_authorized_download(
            "stale",
            "secret",
            "https://files.example/archive.zip"
        ));
        assert!(!is_authorized_download(
            "secret",
            "secret",
            "file:///C:/private.txt"
        ));
    }

    #[test]
    fn bridge_token_and_connection_lifecycle_are_per_process() {
        let first = BrowserBridge::default();
        let second = BrowserBridge::default();
        assert_ne!(first.token, second.token);
        assert!(!first.is_connected());
        first.mark_seen();
        assert!(first.is_connected());
        first.mark_disconnected();
        assert!(!first.is_connected());
    }

    #[test]
    fn periodic_cleanup_removes_expired_request_contexts() {
        let bridge = BrowserBridge::default();
        bridge.contexts.lock().unwrap().insert(
            "expired".into(),
            HeaderContext {
                headers: reqwest::header::HeaderMap::new(),
                created_at: BrowserBridge::now_seconds().saturating_sub(CONTEXT_TTL_SECONDS + 1),
            },
        );
        bridge.contexts.lock().unwrap().insert(
            "active".into(),
            HeaderContext {
                headers: reqwest::header::HeaderMap::new(),
                created_at: BrowserBridge::now_seconds(),
            },
        );
        bridge.cleanup_expired_contexts();
        let contexts = bridge.contexts.lock().unwrap();
        assert!(!contexts.contains_key("expired"));
        assert!(contexts.contains_key("active"));
    }
}
