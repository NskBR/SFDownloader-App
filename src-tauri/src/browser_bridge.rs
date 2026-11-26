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
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub const BRIDGE_PORT: u16 = 17_831;
const MAX_CONTEXTS: usize = 256;
const EXTENSION_VERSION_TTL_SECONDS: u64 = 90;
const MAX_EXTENSION_ORIGINS: usize = 64;
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

#[derive(Clone, Serialize, Deserialize)]
struct ExtensionVersionReport {
    version: Option<String>,
    seen_at: u64,
    last_seen: u64,
    browser_name: String,
    legacy: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInstance {
    id: String,
    browser_name: String,
    version: Option<String>,
    connected: bool,
    disabled: bool,
    outdated: bool,
    legacy: bool,
}

#[derive(Clone)]
pub struct BrowserBridge {
    token: String,
    contexts: Arc<Mutex<HashMap<String, HeaderContext>>>,
    last_seen: Arc<AtomicU64>,
    extension_versions: Arc<Mutex<HashMap<String, ExtensionVersionReport>>>,
    theme_accent: Arc<Mutex<Option<String>>>,
    theme_bg: Arc<Mutex<Option<String>>>,
    language: Arc<Mutex<Option<String>>>,
    listening: Arc<AtomicBool>,
    startup_error: Arc<Mutex<Option<String>>>,
    disabled_instances: Arc<Mutex<HashMap<String,ExtensionVersionReport>>>,
    disabled_path: Option<std::path::PathBuf>,
}

impl Default for BrowserBridge {
    fn default() -> Self {
        Self {
            token: Uuid::new_v4().to_string(),
            contexts: Arc::new(Mutex::new(HashMap::new())),
            last_seen: Arc::new(AtomicU64::new(0)),
            extension_versions: Arc::new(Mutex::new(HashMap::new())),
            theme_accent: Arc::new(Mutex::new(None)),
            theme_bg: Arc::new(Mutex::new(None)),
            language: Arc::new(Mutex::new(None)),
            listening: Arc::new(AtomicBool::new(false)),
            startup_error: Arc::new(Mutex::new(None)),
            disabled_instances: Arc::new(Mutex::new(HashMap::new())),
            disabled_path: None,
        }
    }
}

impl BrowserBridge {

    pub fn with_disabled_instances(path:std::path::PathBuf)->Result<Self,String>{
        let mut bridge=Self::default();
        let disabled:HashMap<String,ExtensionVersionReport>=match std::fs::read(&path){
            Ok(data)=>serde_json::from_slice(&data).map_err(|e|e.to_string())?,
            Err(e) if e.kind()==std::io::ErrorKind::NotFound=>HashMap::new(),
            Err(e)=>return Err(e.to_string()),
        };
        *bridge.extension_versions.lock().map_err(|e|e.to_string())?=disabled.clone();
        *bridge.disabled_instances.lock().map_err(|e|e.to_string())?=disabled;
        bridge.disabled_path=Some(path);Ok(bridge)
    }
    fn instance_disabled(&self,headers:&AxumHeaderMap)->bool{
        let (id,_,_)=Self::extension_peer_identity(headers);
        self.disabled_instances.lock().map(|items|items.contains_key(&id)).unwrap_or(true)
    }
    fn set_instance_enabled(&self,id:&str,enabled:bool)->Result<(),String>{
        let report=self.extension_versions.lock().map_err(|e|e.to_string())?.get(id).cloned().ok_or("Instância não encontrada.")?;
        let mut disabled=self.disabled_instances.lock().map_err(|e|e.to_string())?;
        let mut next=disabled.clone();
        if enabled{next.remove(id);}else{next.insert(id.to_owned(),report);}
        if let Some(path)=&self.disabled_path{std::fs::write(path,serde_json::to_vec(&next).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;}
        *disabled=next;drop(disabled);
        let reports=self.extension_versions.lock().map_err(|e|e.to_string())?;
        let disabled=self.disabled_instances.lock().map_err(|e|e.to_string())?;
        let now=Self::now_seconds();
        self.last_seen.store(reports.iter().filter(|(id,r)|!disabled.contains_key(*id)&&now.saturating_sub(r.last_seen)<=90).map(|(_,r)|r.last_seen).max().unwrap_or(0),Ordering::SeqCst);
        Ok(())
    }
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

    #[cfg(test)]
    pub fn mark_disconnected(&self) {
        self.last_seen.store(0, Ordering::SeqCst);
        if let Ok(mut reports) = self.extension_versions.lock() { reports.clear(); }
    }

    fn extension_peer_identity(headers: &AxumHeaderMap) -> (String, String, bool) {
        let origin=headers.get("origin").and_then(|v|v.to_str().ok()).unwrap_or("legacy");
        let instance=headers.get("x-sf-instance-id").and_then(|v|v.to_str().ok()).and_then(|v|Uuid::parse_str(v).ok());
        let user_agent=headers.get("user-agent").and_then(|v|v.to_str().ok()).unwrap_or("");
        let reported=headers.get("x-sf-browser-name").and_then(|v|v.to_str().ok());
        let brands=headers.get("sec-ch-ua").and_then(|v|v.to_str().ok()).unwrap_or("");
        let browser=match reported {
            _ if brands.contains("Brave")=>"Brave",
            _ if user_agent.contains("OPR/")||brands.contains("Opera")=>"Opera",
            _ if user_agent.contains("Edg/")||brands.contains("Microsoft Edge")=>"Microsoft Edge",
            Some(name @ ("Firefox"|"Brave"|"Google Chrome"|"Microsoft Edge"|"Opera"|"Vivaldi"|"Chromium"))=>name,
            _ if user_agent.contains("Firefox/")||origin.starts_with("moz-extension://")=>"Firefox",
            _ if user_agent.contains("Edg/")=>"Microsoft Edge",
            _ if user_agent.contains("OPR/")=>"Opera",
            _=>"Chromium",
        };
        let legacy=instance.is_none();
        let id=instance.map(|id|format!("{}:{}",origin,id)).unwrap_or_else(||format!("legacy:{}:{}",origin,browser));
        (id,browser.to_owned(),legacy)
    }

    fn record_extension_version(&self, headers: &AxumHeaderMap) {
        let version=headers.get("x-sf-extension-version").and_then(|v|v.to_str().ok())
            .filter(|value|extension_version_parts(value).is_some());
        let (id,browser_name,legacy)=Self::extension_peer_identity(headers);
        let now=Self::now_seconds();
        if let Ok(mut reports)=self.extension_versions.lock() {
            reports.retain(|id,report|now.saturating_sub(report.last_seen)<=300 || self.disabled_instances.lock().map(|items|items.contains_key(id)).unwrap_or(false));
            if reports.len()>=MAX_EXTENSION_ORIGINS&&!reports.contains_key(&id){return;}
            let report=reports.entry(id).or_insert_with(||ExtensionVersionReport {version:None,seen_at:0,last_seen:now,browser_name:browser_name.clone(),legacy});
            report.last_seen=now;report.browser_name=browser_name;
            if let Some(version)=version {report.version=Some(version.to_owned());report.seen_at=now;}
        }
    }

    fn disconnect_extension(&self, headers: &AxumHeaderMap) {
        if self.instance_disabled(headers){return;}
        let (id,_,_)=Self::extension_peer_identity(headers);
        if let Ok(mut reports)=self.extension_versions.lock() {
            reports.remove(&id);
            let now=Self::now_seconds();
            let last=reports.values().filter(|r|now.saturating_sub(r.last_seen)<=EXTENSION_VERSION_TTL_SECONDS).map(|r|r.last_seen).max().unwrap_or(0);
            self.last_seen.store(last,Ordering::SeqCst);
        }
    }

    fn extension_instances(&self, available:Option<&str>)->Vec<BrowserInstance> {
        let now=Self::now_seconds();
        let Ok(mut reports)=self.extension_versions.lock() else{return Vec::new();};
        let replacements:Vec<_>=reports.iter().filter(|(_,r)|!r.legacy&&now.saturating_sub(r.last_seen)<=EXTENSION_VERSION_TTL_SECONDS)
            .filter_map(|(id,r)|id.rsplit_once(':').map(|(origin,_)|(origin.to_owned(),r.last_seen))).collect();
        reports.retain(|id,report| {
            if self.disabled_instances.lock().map(|items|items.contains_key(id)).unwrap_or(false){return true;}
            if now.saturating_sub(report.last_seen)>300{return false;}
            if report.legacy&&now.saturating_sub(report.last_seen)>15 {
                return !replacements.iter().any(|(origin,seen)|id.starts_with(&format!("legacy:{}:",origin))&&*seen>report.last_seen);
            }
            true
        });
        let mut instances:Vec<_>=reports.iter().map(|(id,r)|{
            let version=if now.saturating_sub(r.seen_at)<=EXTENSION_VERSION_TTL_SECONDS {r.version.clone()}else{None};
            let disabled=self.disabled_instances.lock().map(|items|items.contains_key(id)).unwrap_or(true);
            let connected=!disabled&&now.saturating_sub(r.last_seen)<=EXTENSION_VERSION_TTL_SECONDS;
            let outdated=connected&&version.as_deref().and_then(extension_version_parts).zip(available.and_then(extension_version_parts)).is_some_and(|(v,a)|v<a);
            BrowserInstance{id:id.clone(),browser_name:r.browser_name.clone(),version,connected,disabled,outdated,legacy:r.legacy}
        }).collect();
        instances.sort_by(|a,b|a.browser_name.cmp(&b.browser_name).then(a.id.cmp(&b.id)));
        instances
    }

    fn reported_extension_version(&self) -> Option<String> {
        self.extension_instances(None).into_iter().filter(|p|p.connected)
            .filter_map(|p|p.version).min_by_key(|v|extension_version_parts(v))
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
    instances: Vec<BrowserInstance>,
    installed_version: Option<String>,
    available_version: Option<String>,
    outdated: bool,
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
                "/extension/update",
                post(update_extension).options(handle_options),
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
        AxumHeaderValue::from_static("content-type, x-sf-extension-version, x-sf-instance-id, x-sf-browser-name"),
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExtensionUpdateRequest {
    token: String,
    browser: String,
    installed_version: String,
}

fn extension_version_parts(value: &str) -> Option<[u32; 4]> {
    let parts: Vec<_> = value.split('.').collect();
    if !(1..=4).contains(&parts.len()) {
        return None;
    }
    let mut result = [0; 4];
    for (index, part) in parts.into_iter().enumerate() {
        if part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        result[index] = part.parse().ok()?;
    }
    Some(result)
}

#[cfg(test)]
mod extension_update_tests {
    use super::*;
    #[test]
    fn compares_numeric_versions_without_downgrading_or_accepting_invalid_input() {
        assert!(
            extension_version_parts("0.3.10").unwrap() > extension_version_parts("0.3.9").unwrap()
        );
        assert_eq!(
            extension_version_parts("0.3.8"),
            extension_version_parts("0.3.8.0")
        );
        for value in ["", "0..3", "0.3.-1", "0.3.beta", "1.2.3.4.5", "4294967296"] {
            assert!(extension_version_parts(value).is_none());
        }
        let request = serde_json::json!({"token":"secret","browser":"../../other","installedVersion":"0.3.7","path":"C:/anything"});
        assert!(serde_json::from_value::<ExtensionUpdateRequest>(request).is_err());
        assert!(crate::commands::browser_extension::bundled_version("../../other").is_err());
    }
}

async fn update_extension(
    State(state): State<BridgeState>,
    request_headers: AxumHeaderMap,
    body: Bytes,
) -> Response {
    let headers = cors_headers(&request_headers);
    if !has_trusted_bridge_origin(&request_headers) {
        return (headers, StatusCode::FORBIDDEN).into_response();
    }
    if state.bridge.instance_disabled(&request_headers){return (headers,StatusCode::FORBIDDEN).into_response();}
    if body.len() > 1024 {
        return (headers, StatusCode::PAYLOAD_TOO_LARGE).into_response();
    }
    let Ok(request) = serde_json::from_slice::<ExtensionUpdateRequest>(&body) else {
        return (headers, StatusCode::BAD_REQUEST).into_response();
    };
    if request.token != state.bridge.token {
        return (headers, StatusCode::FORBIDDEN).into_response();
    }
    let Some(installed) = extension_version_parts(&request.installed_version) else {
        return (headers, StatusCode::BAD_REQUEST).into_response();
    };
    let result: Result<serde_json::Value,String> = async {
        let version=crate::commands::browser_extension::bundled_version(&request.browser)?;
        let bundled=extension_version_parts(&version).ok_or("Versão da extensão inválida.")?;
        if installed >= bundled {
            return Ok(serde_json::json!({"ok":true,"mode":if installed == bundled {"current"} else {"app-older"},"version":version}));
        }
        if request.browser == "firefox" {
            // Firefox controls installation of signed XPIs; never replace its profile files.
            let path=crate::commands::browser_extension::get_firefox_xpi_path(state.app.clone())?;
            crate::commands::downloads::open_file(path)?;
            return Ok(serde_json::json!({"ok":true,"mode":"manual","version":version}));
        }
        let path=crate::commands::browser_extension::get_extension_dir(state.app.clone(),request.browser)?;
        Ok(serde_json::json!({"ok":true,"mode":"reload","version":version,"path":path}))
    }.await;
    match result {
        Ok(result) => (headers, Json(result)).into_response(),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            headers,
            Json(serde_json::json!({"ok":false,"error":error})),
        )
            .into_response(),
    }
}

async fn disconnect(State(state): State<BridgeState>, request_headers: AxumHeaderMap) -> Response {
    let headers = cors_headers(&request_headers);
    if !has_trusted_bridge_origin(&request_headers) {
        return (headers, StatusCode::FORBIDDEN).into_response();
    }
    state.bridge.disconnect_extension(&request_headers);
    let _ = state.app.emit("browser-extension-status", state.bridge.is_connected());
    (headers, Json(serde_json::json!({ "ok": true }))).into_response()
}

async fn sync(State(state): State<BridgeState>, request_headers: AxumHeaderMap) -> Response {
    let headers = cors_headers(&request_headers);
    if !has_trusted_bridge_origin(&request_headers) {
        return (headers, StatusCode::FORBIDDEN).into_response();
    }
    state.bridge.record_extension_version(&request_headers);
    if state.bridge.instance_disabled(&request_headers){return (headers,StatusCode::FORBIDDEN).into_response();}
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
    include_version: Option<bool>,
) -> BrowserBridgeDiagnostics {
    let connected=bridge.is_connected();
    let check_version=include_version.unwrap_or(true);
    let installed=if check_version && connected {bridge.reported_extension_version()} else {None};
    let available=if check_version {crate::commands::browser_extension::bundled_version("chromium").ok()} else {None};
    let outdated=connected && installed.as_deref().and_then(extension_version_parts).zip(available.as_deref().and_then(extension_version_parts)).map(|(installed,available)|installed<available).unwrap_or(false);
    BrowserBridgeDiagnostics {
        instances: bridge.extension_instances(if check_version {available.as_deref()} else {None}),
        installed_version: installed,
        available_version: available,
        outdated,
        listening: bridge.listening.load(Ordering::SeqCst),
        connected,
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
    if state.bridge.instance_disabled(&request_headers) || !is_authorized_download(&request.token, &state.bridge.token, &request.url) {
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

#[cfg(test)]
mod extension_version_tracking_tests {
    use super::*;
    fn headers(origin:&str,version:Option<&str>)->AxumHeaderMap {
        let mut headers=AxumHeaderMap::new();
        headers.insert("origin",AxumHeaderValue::from_str(origin).unwrap());
        if let Some(version)=version {headers.insert("x-sf-extension-version",AxumHeaderValue::from_str(version).unwrap());}
        headers
    }
    #[test]
    fn unversioned_and_invalid_syncs_do_not_erase_verified_version() {
        let bridge=BrowserBridge::default();
        bridge.record_extension_version(&headers("chrome-extension://one",Some("0.4.0")));
        for _ in 0..10 {
            bridge.record_extension_version(&headers("chrome-extension://one",None));
            bridge.record_extension_version(&headers("moz-extension://legacy",None));
            bridge.record_extension_version(&headers("chrome-extension://one",Some("invalid")));
            assert_eq!(bridge.reported_extension_version().as_deref(),Some("0.4.0"));
        }
        bridge.record_extension_version(&headers("chrome-extension://one",Some("0.4.1")));
        assert_eq!(bridge.reported_extension_version().as_deref(),Some("0.4.1"));
    }
    #[test]
    fn multiple_browsers_report_oldest_active_version_independent_of_sync_order() {
        let bridge=BrowserBridge::default();
        let current=headers("chrome-extension://one",Some("0.4.0"));
        let old=headers("moz-extension://two",Some("0.3.9"));
        for _ in 0..3 {
            bridge.record_extension_version(&old);bridge.record_extension_version(&current);
            assert_eq!(bridge.reported_extension_version().as_deref(),Some("0.3.9"));
        }
        bridge.record_extension_version(&headers("moz-extension://two",Some("0.4.0")));
        assert_eq!(bridge.reported_extension_version().as_deref(),Some("0.4.0"));
    }
    #[test]
    fn stale_versions_expire_even_when_an_unversioned_client_keeps_syncing() {
        let bridge=BrowserBridge::default();
        assert_eq!(bridge.reported_extension_version(),None);
        bridge.record_extension_version(&headers("chrome-extension://one",Some("0.4.0")));
        for report in bridge.extension_versions.lock().unwrap().values_mut(){report.seen_at=BrowserBridge::now_seconds()-EXTENSION_VERSION_TTL_SECONDS-1;}
        bridge.record_extension_version(&headers("chrome-extension://one",None));bridge.mark_seen();
        assert!(bridge.is_connected());assert_eq!(bridge.reported_extension_version(),None);
        bridge.record_extension_version(&headers("chrome-extension://one",Some("0.4.0")));
        bridge.mark_disconnected();assert_eq!(bridge.reported_extension_version(),None);
    }
}

#[cfg(test)]
mod browser_instances_tests {
 use super::*;
 fn peer(id:&str,name:&str,version:Option<&str>)->AxumHeaderMap {
  let mut h=AxumHeaderMap::new();h.insert("origin",AxumHeaderValue::from_static("chrome-extension://same"));
  h.insert("x-sf-instance-id",AxumHeaderValue::from_str(id).unwrap());h.insert("x-sf-browser-name",AxumHeaderValue::from_str(name).unwrap());
  if let Some(v)=version{h.insert("x-sf-extension-version",AxumHeaderValue::from_str(v).unwrap());}h
 }
 #[test]
 fn same_extension_origin_keeps_profiles_separate_and_disconnects_only_one() {
  let bridge=BrowserBridge::default();let a=peer("11111111-1111-4111-8111-111111111111","Brave",Some("0.4.1"));let b=peer("22222222-2222-4222-8222-222222222222","Google Chrome",Some("0.4.0"));
  bridge.record_extension_version(&a);bridge.record_extension_version(&b);bridge.mark_seen();
  let all=bridge.extension_instances(Some("0.4.1"));assert_eq!(all.len(),2);assert!(all.iter().find(|p|p.browser_name=="Google Chrome").unwrap().outdated);assert!(!all.iter().find(|p|p.browser_name=="Brave").unwrap().outdated);
  bridge.disconnect_extension(&b);assert!(bridge.is_connected());assert_eq!(bridge.extension_instances(Some("0.4.1")).len(),1);
 }
 #[test]
 fn legacy_firefox_never_borrows_the_version_of_brave() {
  let bridge=BrowserBridge::default();bridge.record_extension_version(&peer("11111111-1111-4111-8111-111111111111","Brave",Some("0.4.1")));
  let mut old=AxumHeaderMap::new();old.insert("origin",AxumHeaderValue::from_static("moz-extension://old"));bridge.record_extension_version(&old);
  let all=bridge.extension_instances(Some("0.4.1"));let firefox=all.iter().find(|p|p.browser_name=="Firefox").unwrap();assert!(firefox.legacy);assert_eq!(firefox.version,None);assert!(!firefox.outdated);
 }
}

#[cfg(test)]
mod instance_migration_tests {
 use super::*;
 #[test]
 fn cleans_inactive_legacy_record_but_preserves_a_legacy_client_still_syncing() {
  let bridge=BrowserBridge::default();let mut old=AxumHeaderMap::new();old.insert("origin",AxumHeaderValue::from_static("chrome-extension://same"));
  bridge.record_extension_version(&old);
  for r in bridge.extension_versions.lock().unwrap().values_mut(){r.last_seen=BrowserBridge::now_seconds()-20;}
  let mut new=old.clone();new.insert("x-sf-instance-id",AxumHeaderValue::from_static("11111111-1111-4111-8111-111111111111"));new.insert("x-sf-extension-version",AxumHeaderValue::from_static("0.4.1"));
  bridge.record_extension_version(&new);assert_eq!(bridge.extension_instances(None).len(),1);
  bridge.record_extension_version(&old);assert_eq!(bridge.extension_instances(None).len(),2);
 }
 #[test]
 fn request_brand_corrects_generic_report_without_changing_instance_identity() {
  let mut h=AxumHeaderMap::new();h.insert("origin",AxumHeaderValue::from_static("chrome-extension://same"));h.insert("x-sf-instance-id",AxumHeaderValue::from_static("11111111-1111-4111-8111-111111111111"));h.insert("x-sf-browser-name",AxumHeaderValue::from_static("Google Chrome"));h.insert("sec-ch-ua",AxumHeaderValue::from_static("Brave"));
  let (id,name,_)=BrowserBridge::extension_peer_identity(&h);assert_eq!(name,"Brave");h.insert("sec-ch-ua",AxumHeaderValue::from_static("Opera"));let (other,name,_)=BrowserBridge::extension_peer_identity(&h);assert_eq!(id,other);assert_eq!(name,"Opera");
 }
}

#[tauri::command]
pub fn set_browser_instance_enabled(app:AppHandle,bridge:tauri::State<'_,BrowserBridge>,id:String,enabled:bool)->Result<(),String>{
    bridge.set_instance_enabled(&id,enabled)?;
    let _=app.emit("browser-extension-status",bridge.is_connected());Ok(())
}

#[cfg(test)]
mod disabled_instances_tests {
 use super::*;
 fn headers(id:&str)->AxumHeaderMap{
  let mut h=AxumHeaderMap::new();h.insert("origin",AxumHeaderValue::from_static("chrome-extension://test"));h.insert("x-sf-instance-id",AxumHeaderValue::from_str(id).unwrap());h.insert("x-sf-browser-name",AxumHeaderValue::from_static("Brave"));h
 }
 #[test]
 fn disabling_one_instance_survives_sync_disconnect_and_restart(){
  let path=std::env::temp_dir().join(format!("sf-disabled-{}.json",Uuid::new_v4()));
  let bridge=BrowserBridge::with_disabled_instances(path.clone()).unwrap();
  let a=headers("11111111-1111-4111-8111-111111111111");let b=headers("22222222-2222-4222-8222-222222222222");
  bridge.record_extension_version(&a);bridge.record_extension_version(&b);bridge.mark_seen();
  let(id,_,_)=BrowserBridge::extension_peer_identity(&a);bridge.set_instance_enabled(&id,false).unwrap();
  assert!(bridge.instance_disabled(&a));assert!(!bridge.instance_disabled(&b));
  bridge.record_extension_version(&a);bridge.disconnect_extension(&a);
  let instances=bridge.extension_instances(None);assert_eq!(instances.len(),2);assert!(!instances.iter().find(|v|v.id==id).unwrap().connected);
  let restored=BrowserBridge::with_disabled_instances(path.clone()).unwrap();assert!(restored.instance_disabled(&a));assert_eq!(restored.extension_instances(None).len(),1);
  restored.set_instance_enabled(&id,true).unwrap();assert!(!restored.instance_disabled(&a));
  assert!(!BrowserBridge::with_disabled_instances(path.clone()).unwrap().instance_disabled(&a));std::fs::remove_file(path).unwrap();
 }
}
