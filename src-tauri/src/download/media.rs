//! YouTube downloads are isolated from the HTTP and torrent workers.
use super::{
    completion, paths,
    runtime::{DownloadRuntime, TaskControl},
};
use crate::database::{
    models::{DownloadStatus, DownloadTask},
    repositories::downloads,
    Database,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::{LazyLock, Mutex};
use std::{
    collections::{BTreeSet, HashMap},
    path::{Path, PathBuf},
    process::Stdio,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::{Child, Command},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPreview {
    pub url: String,
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub duration: f64,
    pub thumbnail: Option<String>,
    pub resolutions: Vec<u32>,
    pub frame_rates: HashMap<u32, f64>,
    pub view_count: Option<u64>,
    pub channel_verified: bool,
    pub file_stem: String,
    pub music: bool,
    pub playlist: Option<PlaylistPreview>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub video_id: String,
    pub title: String,
    pub index: usize,
    #[serde(default)]
    pub duration: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistPreview {
    pub entries: Vec<PlaylistEntry>,
    pub unavailable_count: usize,
    pub mix: bool,
    pub snapshot_limit: Option<usize>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistContext {
    pub id: String,
    pub title: String,
    pub index: usize,
    pub count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaOptions {
    pub format: String,
    pub quality: u32,
    pub video_id: String,
    #[serde(default)]
    pub playlist: Option<PlaylistContext>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaDetails {
    pub task: DownloadTask,
    pub options: MediaOptions,
    pub phase: String,
    pub error: Option<String>,
}

fn valid_youtube_id(id: &str) -> bool {
    id.len() == 11
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

pub fn is_playlist_source(url: &str) -> bool {
    reqwest::Url::parse(url)
        .is_ok_and(|u| u.path() == "/playlist" || u.query_pairs().any(|(k, _)| k == "list"))
}

pub fn is_mix_id(id: &str) -> bool {
    id.starts_with("RD") || id.starts_with("UL")
}

/// Canonicalize exact hosts and IDs; an explicit list parameter selects a playlist.
pub fn youtube_source(input: &str) -> Result<(String, String, bool), String> {
    let url = reqwest::Url::parse(input.trim()).map_err(|_| "Link do YouTube inválido.")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("Link do YouTube inválido.".into());
    }
    let host = url.host_str().unwrap_or_default();
    if !matches!(
        host,
        "youtube.com"
            | "www.youtube.com"
            | "m.youtube.com"
            | "music.youtube.com"
            | "youtu.be"
            | "www.youtube-nocookie.com"
            | "youtube-nocookie.com"
    ) {
        return Err("Este link não é do YouTube.".into());
    }
    let parts: Vec<_> = url
        .path_segments()
        .into_iter()
        .flatten()
        .filter(|p| !p.is_empty())
        .collect();
    if url.path() == "/playlist"
        || (url.query_pairs().any(|(k, _)| k == "list")
            && (url.path() == "/watch"
                || (host == "youtu.be" && parts.len() == 1 && valid_youtube_id(parts[0]))))
    {
        let id = url
            .query_pairs()
            .find(|(k, _)| k == "list")
            .map(|(_, v)| v.into_owned())
            .ok_or("Identificação da playlist ausente.")?;
        if (!(10..=150).contains(&id.len()) && id != "RDMM")
            || !id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        {
            return Err("Identificação da playlist inválida.".into());
        }
        if is_mix_id(&id) {
            let seed = url
                .query_pairs()
                .find(|(k, _)| k == "v")
                .map(|(_, v)| v.into_owned())
                .or_else(|| (host == "youtu.be" && parts.len() == 1).then(|| parts[0].to_owned()));
            if let Some(seed) = seed {
                if !valid_youtube_id(&seed) {
                    return Err("Identificação do vídeo inicial do Mix inválida.".into());
                }
                return Ok((
                    format!("https://www.youtube.com/watch?v={seed}&list={id}"),
                    id,
                    true,
                ));
            }
        }
        return Ok((
            format!("https://www.youtube.com/playlist?list={id}"),
            id,
            true,
        ));
    }
    let id = if host == "youtu.be" && parts.len() == 1 {
        Some(parts[0].to_owned())
    } else if url.path() == "/watch" {
        url.query_pairs()
            .find(|(k, _)| k == "v")
            .map(|(_, v)| v.into_owned())
    } else if parts.len() == 2 && matches!(parts[0], "shorts" | "embed" | "live") {
        Some(parts[1].to_owned())
    } else {
        None
    }
    .ok_or("Use um link de vídeo ou playlist do YouTube. Canais não são aceitos.")?;
    if !valid_youtube_id(&id) {
        return Err("Identificação do vídeo inválida.".into());
    }
    Ok((
        format!("https://www.youtube.com/watch?v={id}"),
        id,
        host == "music.youtube.com",
    ))
}

#[derive(Clone)]
pub struct Tools {
    pub dir: PathBuf,
}
static VERIFIED: LazyLock<Mutex<BTreeSet<PathBuf>>> = LazyLock::new(|| Mutex::new(BTreeSet::new()));
impl Tools {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let bundled = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("media-tools");
        #[cfg(debug_assertions)]
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/media-tools");
        #[cfg(not(debug_assertions))]
        let dir = bundled.clone();
        let _ = bundled;
        let mut verified = VERIFIED
            .lock()
            .map_err(|_| "Falha ao verificar as ferramentas de mídia.")?;
        if !verified.contains(&dir) {
            // Expected hashes are compiled into the app, not trusted from an editable resource.
            let manifest: Value =
                serde_json::from_str(include_str!("../../../scripts/media-tools.lock.json"))
                    .map_err(|_| "Manifesto de mídia inválido.")?;
            for tool in manifest["tools"]
                .as_array()
                .ok_or("Manifesto de mídia inválido.")?
            {
                let files = tool["files"]
                    .as_object()
                    .ok_or("Manifesto de mídia inválido.")?;
                for (name, expected) in files {
                    let data = std::fs::read(dir.join(name)).map_err(|_| {
                        "As ferramentas de mídia estão incompletas. Reinstale o aplicativo."
                    })?;
                    if format!("{:x}", Sha256::digest(data))
                        != expected.as_str().unwrap_or_default()
                    {
                        return Err(
                            "Uma ferramenta de mídia foi alterada. Reinstale o aplicativo.".into(),
                        );
                    }
                }
            }
            verified.insert(dir.clone());
        }
        Ok(Self { dir })
    }
    pub fn command(&self, name: &str) -> Command {
        let mut c = Command::new(self.dir.join(format!("{name}.exe")));
        c.kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        c.creation_flags(0x08000000); // CREATE_NO_WINDOW
        c
    }
    pub fn downloader(&self) -> Command {
        let mut c = self.command("yt-dlp");
        c.args([
            "--ignore-config",
            "--no-plugin-dirs",
            "--no-update",
            "--no-cache-dir",
            "--no-playlist",
            "--no-warnings",
            "--sleep-requests",
            "1",
            "--socket-timeout",
            "20",
            "--retries",
            "2",
            "--extractor-retries",
            "2",
            "--js-runtimes",
        ])
        .arg(format!("deno:{}", self.dir.join("deno.exe").display()))
        .arg("--ffmpeg-location")
        .arg(&self.dir);
        c
    }
}

// A Windows job owns every helper (FFmpeg/Deno included). Closing it kills the
// entire tree, including when a future is dropped during app shutdown.
pub struct ProcessTree {
    #[cfg(windows)]
    handle: isize,
}
impl ProcessTree {
    pub fn new(child: &Child) -> Result<Self, String> {
        #[cfg(windows)]
        unsafe {
            use windows_sys::Win32::{
                Foundation::CloseHandle,
                System::{JobObjects::*, Threading::*},
            };
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err("Não foi possível proteger o processo de mídia.".into());
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            );
            let process = OpenProcess(
                PROCESS_SET_QUOTA | PROCESS_TERMINATE,
                0,
                child.id().unwrap_or(0),
            );
            let assigned =
                !process.is_null() && ok != 0 && AssignProcessToJobObject(job, process) != 0;
            if !process.is_null() {
                CloseHandle(process);
            }
            if !assigned {
                CloseHandle(job);
                return Err("Não foi possível isolar o processo de mídia.".into());
            }
            Ok(Self {
                handle: job as isize,
            })
        }
        #[cfg(not(windows))]
        {
            let _ = child;
            Ok(Self {})
        }
    }
    pub fn stop(&self) {
        #[cfg(windows)]
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.handle as _, 1);
        }
    }
}
impl Drop for ProcessTree {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.handle as _);
        }
    }
}

async fn capture(
    mut command: Command,
    timeout: Duration,
) -> Result<(bool, Vec<u8>, String), String> {
    let mut child = command
        .spawn()
        .map_err(|_| "Não foi possível iniciar as ferramentas de mídia.")?;
    let tree = ProcessTree::new(&child)?;
    let mut out = child
        .stdout
        .take()
        .ok_or("Saída de mídia indisponível.")?
        .take(16 * 1024 * 1024);
    let mut err = child
        .stderr
        .take()
        .ok_or("Diagnóstico de mídia indisponível.")?
        .take(64 * 1024);
    let reads = async {
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let (a, b, status) = tokio::join!(
            out.read_to_end(&mut stdout),
            err.read_to_end(&mut stderr),
            child.wait()
        );
        a.map_err(|e| e.to_string())?;
        b.map_err(|e| e.to_string())?;
        Ok::<_, String>((
            status.map_err(|e| e.to_string())?.success(),
            stdout,
            String::from_utf8_lossy(&stderr).into_owned(),
        ))
    };
    let result = tokio::time::timeout(timeout, reads).await;
    tree.stop();
    result.map_err(|_| "A consulta demorou demais. Tente novamente.".to_string())?
}

pub fn friendly_error(raw: &str) -> String {
    let s = raw.to_lowercase();
    if super::media_query::is_rate_limit(raw) {
        "O YouTube limitou temporariamente as consultas. Aguarde antes de tentar novamente.".into()
    } else if s.contains("private")
        || s.contains("sign in")
        || s.contains("age-restricted")
        || s.contains("login")
        || s.contains("cookies")
    {
        "Este vídeo exige autenticação ou está privado. Esta versão aceita vídeos públicos.".into()
    } else if s.contains("not available") || s.contains("unavailable") || s.contains("removed") {
        "O vídeo está indisponível ou foi removido.".into()
    } else if s.contains("no space") || s.contains("disk full") || s.contains("errno 28") {
        "Não há espaço suficiente na pasta de destino.".into()
    } else if s.contains("requested format") {
        "Esta qualidade não está mais disponível. Abra novamente o link para escolher outra.".into()
    } else if s.contains("403") || s.contains("429") || s.contains("bot") {
        "O YouTube bloqueou temporariamente a consulta. Tente mais tarde ou atualize o aplicativo."
            .into()
    } else {
        "Não foi possível baixar esta mídia. Confira a conexão e tente novamente.".into()
    }
}

pub fn parse_preview(
    raw: Value,
    url: String,
    id: String,
    music: bool,
) -> Result<MediaPreview, String> {
    if raw["id"].as_str() != Some(&id) || raw["_type"].as_str() == Some("playlist") {
        return Err("A origem não retornou o vídeo solicitado.".into());
    }
    if raw["is_live"].as_bool() == Some(true)
        || matches!(
            raw["live_status"].as_str(),
            Some("is_live" | "is_upcoming" | "post_live")
        )
    {
        return Err(
            "Transmissões ao vivo ainda não são aceitas. Aguarde a publicação do vídeo.".into(),
        );
    }
    let formats = raw["formats"]
        .as_array()
        .ok_or("Não há formatos disponíveis para este vídeo.")?;
    let mut resolutions = BTreeSet::new();
    let mut frame_rates = HashMap::<u32, f64>::new();
    let has_audio = formats
        .iter()
        .any(|f| f["acodec"].as_str().is_some_and(|c| c != "none"));
    if !has_audio {
        return Err("O vídeo não possui uma faixa de áudio disponível.".into());
    }
    for f in formats {
        if f["has_drm"].as_bool() == Some(true) {
            continue;
        }
        if f["vcodec"].as_str().is_some_and(|c| {
            ["avc", "h264", "vp9", "vp09", "av01"]
                .iter()
                .any(|p| c.starts_with(p))
        }) {
            if let Some(h) = f["height"].as_u64().filter(|h| *h > 0 && *h <= 16384) {
                resolutions.insert(h as u32);
                if let Some(fps) = f["fps"]
                    .as_f64()
                    .filter(|fps| fps.is_finite() && *fps > 0.0 && *fps <= 240.0)
                {
                    frame_rates
                        .entry(h as u32)
                        .and_modify(|existing| *existing = existing.max(fps))
                        .or_insert(fps);
                }
            }
        }
    }
    Ok(MediaPreview {
        url,
        video_id: id,
        title: raw["title"]
            .as_str()
            .unwrap_or("Vídeo do YouTube")
            .chars()
            .take(300)
            .collect(),
        channel: raw["channel"]
            .as_str()
            .or(raw["uploader"].as_str())
            .unwrap_or("YouTube")
            .chars()
            .take(150)
            .collect(),
        duration: raw["duration"].as_f64().unwrap_or(0.0).max(0.0),
        thumbnail: None,
        resolutions: resolutions.into_iter().rev().collect(),
        frame_rates,
        view_count: raw["view_count"].as_u64(),
        channel_verified: raw["channel_is_verified"].as_bool().unwrap_or(false),
        file_stem: media_file_stem(raw["title"].as_str().unwrap_or("Vídeo do YouTube")),
        music,
        playlist: None,
    })
}

const MAX_PLAYLIST_ENTRIES: usize = 1000;
const MAX_MIX_ENTRIES: usize = 50;

pub fn playlist_folder_name(title: &str) -> String {
    let name: String = media_file_stem(title)
        .chars()
        .scan(0usize, |units, c| {
            *units += c.len_utf16();
            (*units <= 100).then_some(c)
        })
        .collect();
    let name = name.trim_end_matches([' ', '.']);
    let base = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            base.strip_prefix(prefix).is_some_and(|n| {
                matches!(
                    n,
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
        });
    if reserved {
        format!("_{name}")
    } else {
        name.to_owned()
    }
}

pub fn parse_playlist(raw: Value, url: String, id: String) -> Result<MediaPreview, String> {
    if raw["_type"].as_str() != Some("playlist") || raw["id"].as_str() != Some(&id) {
        return Err("A origem não retornou a playlist solicitada.".into());
    }
    let source = raw["entries"]
        .as_array()
        .ok_or("Não foi possível consultar as faixas da playlist.")?;
    let mix = is_mix_id(&id);
    if !mix
        && (source.len() > MAX_PLAYLIST_ENTRIES
            || raw["playlist_count"]
                .as_u64()
                .is_some_and(|n| n > MAX_PLAYLIST_ENTRIES as u64))
    {
        return Err(
            "Esta versão aceita playlists com até 1.000 faixas. Divida esta playlist para baixar."
                .into(),
        );
    }
    let mut seen = BTreeSet::new();
    let mut entries = Vec::new();
    let mut unavailable_count = 0;
    let mut duration = 0.0;
    for (position, entry) in source
        .iter()
        .take(if mix {
            MAX_MIX_ENTRIES
        } else {
            MAX_PLAYLIST_ENTRIES
        })
        .enumerate()
    {
        let entry_id = entry["id"].as_str().unwrap_or_default();
        let title = entry["title"].as_str().unwrap_or("Vídeo do YouTube");
        if !valid_youtube_id(entry_id)
            || entry["availability"]
                .as_str()
                .is_some_and(|a| !matches!(a, "public" | "unlisted"))
            || matches!(title, "[Private video]" | "[Deleted video]")
            || entry["is_live"].as_bool() == Some(true)
            || matches!(
                entry["live_status"].as_str(),
                Some("is_live" | "is_upcoming" | "post_live")
            )
        {
            unavailable_count += 1;
            continue;
        }
        if !seen.insert(entry_id.to_owned()) {
            continue;
        }
        let entry_duration = entry["duration"]
            .as_f64()
            .filter(|d| d.is_finite() && *d > 0.0);
        duration += entry_duration.unwrap_or(0.0);
        entries.push(PlaylistEntry {
            video_id: entry_id.to_owned(),
            title: title.chars().take(300).collect(),
            index: position + 1,
            duration: entry_duration,
        });
    }
    if entries.is_empty() {
        return Err("Esta playlist está vazia ou não possui faixas públicas disponíveis.".into());
    }
    let title: String = raw["title"]
        .as_str()
        .unwrap_or("Playlist do YouTube")
        .chars()
        .take(300)
        .collect();
    Ok(MediaPreview {
        file_stem: playlist_folder_name(&title),
        title,
        url,
        video_id: id,
        channel: raw["channel"]
            .as_str()
            .or(raw["uploader"].as_str())
            .unwrap_or("YouTube")
            .chars()
            .take(150)
            .collect(),
        duration,
        thumbnail: None,
        resolutions: vec![2160, 1440, 1080, 720, 480, 360],
        frame_rates: HashMap::new(),
        view_count: None,
        channel_verified: false,
        music: true,
        playlist: Some(PlaylistPreview {
            entries,
            unavailable_count,
            mix,
            snapshot_limit: mix.then_some(MAX_MIX_ENTRIES),
        }),
    })
}

pub async fn inspect(app: &AppHandle, source: &str) -> Result<MediaPreview, String> {
    inspect_with_wait(app, source, |_| {})
        .await
        .map_err(|e| e.message)
}

pub async fn inspect_with_wait(
    app: &AppHandle,
    source: &str,
    notify: impl Fn(super::media_query::QueryWait),
) -> Result<MediaPreview, super::media_query::QueryError> {
    let (url, _, _) = youtube_source(source)?;
    super::media_query::COORDINATOR
        .lookup(&url, notify, || inspect_uncached(app, &url))
        .await
}

async fn inspect_uncached(
    app: &AppHandle,
    source: &str,
) -> Result<MediaPreview, super::media_query::QueryError> {
    let (url, id, music) = youtube_source(source)?;
    let tools = Tools::load(app)?;
    let mut command = tools.downloader();
    let playlist = is_playlist_source(&url);
    if playlist {
        command
            .args([
                "--yes-playlist",
                "--flat-playlist",
                "--ignore-errors",
                "--playlist-end",
            ])
            .arg(if is_mix_id(&id) { "50" } else { "1001" });
    }
    command
        .args(["--dump-single-json", "--skip-download", "--"])
        .arg(&url);
    let (ok, output, error) = capture(
        command,
        Duration::from_secs(if playlist { 150 } else { 75 }),
    )
    .await?;
    if !ok || super::media_query::is_rate_limit(&error) {
        return Err(super::media_query::QueryError::from_diagnostic(
            &error,
            friendly_error(&error),
        ));
    }
    let raw: Value =
        serde_json::from_slice(&output).map_err(|_| "O YouTube retornou uma resposta inválida.")?;
    let thumbnail_url = raw["thumbnail"].as_str().map(str::to_owned);
    let mut preview = if playlist {
        parse_playlist(raw, url, id)?
    } else {
        parse_preview(raw, url, id, music)?
    };
    if let Some(url) = thumbnail_url {
        preview.thumbnail = thumbnail(&url).await;
    }
    Ok(preview)
}

async fn thumbnail(source: &str) -> Option<String> {
    use base64::Engine;
    let url = reqwest::Url::parse(source).ok()?;
    if url.scheme() != "https"
        || !matches!(
            url.host_str(),
            Some("i.ytimg.com" | "img.youtube.com" | "i9.ytimg.com")
        )
    {
        return None;
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(8))
        .build()
        .ok()?;
    let response = client.get(url).send().await.ok()?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|n| n > 2 * 1024 * 1024)
    {
        return None;
    }
    let mime = response
        .headers()
        .get("content-type")?
        .to_str()
        .ok()?
        .split(';')
        .next()?
        .to_owned();
    if !matches!(mime.as_str(), "image/jpeg" | "image/png" | "image/webp") {
        return None;
    }
    let mut stream = response.bytes_stream();
    let mut data = Vec::new();
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.ok()?;
        if data.len() + chunk.len() > 2 * 1024 * 1024 {
            return None;
        }
        data.extend_from_slice(&chunk);
    }
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(data)
    ))
}

pub fn validate_options(preview: &MediaPreview, options: &MediaOptions) -> Result<(), String> {
    if options.video_id != preview.video_id {
        return Err("O vídeo selecionado mudou.".into());
    }
    match options.format.as_str() {
        "mp3" if [128, 192, 256, 320].contains(&options.quality) => Ok(()),
        "mp4" if preview.resolutions.contains(&options.quality) => Ok(()),
        _ => Err("Formato ou qualidade indisponível.".into()),
    }
}

fn resolve_track_options(
    preview: &MediaPreview,
    options: &MediaOptions,
) -> Result<MediaOptions, String> {
    let mut resolved = options.clone();
    // Playlist video quality is a ceiling. Pick a native resolution for each track.
    if options.playlist.is_some() && options.format == "mp4" {
        resolved.quality = preview
            .resolutions
            .iter()
            .copied()
            .find(|q| *q <= options.quality)
            .ok_or("Esta faixa não possui vídeo na qualidade selecionada ou abaixo dela.")?;
    }
    validate_options(preview, &resolved)?;
    Ok(resolved)
}

pub fn destination_folder(
    root: &Path,
    auto_organize: bool,
    format: &str,
    playlist: Option<&str>,
) -> Result<PathBuf, String> {
    let mut folder = root.to_path_buf();
    if auto_organize {
        folder = folder.join(if format == "mp3" {
            "Músicas"
        } else {
            "Vídeos"
        });
    }
    paths::validate_destructive_path(root, &folder)?;
    std::fs::create_dir_all(&folder)
        .map_err(|_| "Não foi possível preparar a pasta da categoria.")?;
    folder = paths::canonical_existing_directory(&folder)?;
    if let Some(title) = playlist {
        let target = folder.join(playlist_folder_name(title));
        paths::validate_destructive_path(&folder, &target)?;
        std::fs::create_dir_all(&target)
            .map_err(|_| "Não foi possível preparar a pasta da playlist.")?;
        folder = paths::canonical_existing_directory(&target)?;
    }
    Ok(folder)
}

fn media_file_stem(title: &str) -> String {
    let mut units = 0;
    paths::safe_file_name(title)
        .chars()
        .take_while(|c| {
            units += c.len_utf16();
            units <= 140
        })
        .collect()
}

pub fn available_media_path(folder: &Path, title: &str, format: &str, taken: &[String]) -> PathBuf {
    let title = media_file_stem(title);
    for n in 0..10000 {
        let suffix = if n == 0 {
            String::new()
        } else {
            format!(" ({n})")
        };
        let path = folder.join(format!("{title}{suffix}-sfd.{format}"));
        if !path.exists() && !taken.iter().any(|p| Path::new(p) == path) {
            return path;
        }
    }
    folder.join(format!("{title}-{}-sfd.{format}", uuid::Uuid::new_v4()))
}

pub fn details(database: &Database, id: &str) -> Result<MediaDetails, String> {
    let c = database.connect()?;
    let task = downloads::find(&c, id)
        .map_err(|e| e.to_string())?
        .ok_or("Download não encontrado.")?;
    if task.download_type != "media" {
        return Err("Este download não é de mídia.".into());
    }
    let (raw, phase, error): (String, String, Option<String>) = c
        .query_row(
            "SELECT options,phase,last_error FROM media_downloads WHERE download_id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    Ok(MediaDetails {
        task,
        options: serde_json::from_str(&raw).map_err(|_| "Preferências de mídia inválidas.")?,
        phase,
        error,
    })
}

fn emit(
    app: &AppHandle,
    db: &Database,
    task: &DownloadTask,
    status: DownloadStatus,
    downloaded: i64,
    total: Option<i64>,
    speed: f64,
    phase: &str,
    error: Option<&str>,
) {
    completion::update_state(
        db,
        &task.id,
        status.clone(),
        downloaded,
        speed,
        task.speed_average,
    );
    if let Ok(c) = db.connect() {
        let _ = c.execute(
            "UPDATE media_downloads SET phase=?2,last_error=?3 WHERE download_id=?1",
            rusqlite::params![task.id, phase, error],
        );
        if let Some(total) = total {
            let _ = c.execute(
                "UPDATE download_tasks SET file_size=?2 WHERE id=?1",
                rusqlite::params![task.id, total],
            );
        }
    }
    let _ = app.emit("download-progress", json!({"id":task.id,"downloaded":downloaded,"total":total,"speed":speed,"status":status,"error":error}));
    let _ = app.emit(
        "media-progress",
        json!({"id":task.id,"phase":phase,"error":error}),
    );
}

pub fn spawn(
    app: AppHandle,
    database: Database,
    runtime: DownloadRuntime,
    task: DownloadTask,
) -> Result<(), String> {
    let control = TaskControl::new();
    runtime.register(task.id.clone(), control.clone())?;
    emit(
        &app,
        &database,
        &task,
        DownloadStatus::Pending,
        task.total_downloaded,
        task.file_size,
        0.0,
        "queued",
        None,
    );
    tauri::async_runtime::spawn(async move {
        control.set_speed_limit(task.speed_limit_download).await;
        let id = task.id.clone();
        let queue = runtime
            .acquire(
                id.clone(),
                task.max_parallel_downloads as usize,
                task.priority,
                task.queue_order,
                &control,
            )
            .await;
        if let Ok(_permit) = queue {
            if let Err(error) = run(&app, &database, &task, &control).await {
                if !control.cancellation.is_cancelled() {
                    let downloaded = details(&database, &id)
                        .map(|d| d.task.total_downloaded)
                        .unwrap_or(task.total_downloaded);
                    emit(
                        &app,
                        &database,
                        &task,
                        DownloadStatus::Failed,
                        downloaded,
                        None,
                        0.0,
                        "failed",
                        Some(&error),
                    );
                }
            }
        } else if !control.cancellation.is_cancelled() {
            emit(
                &app,
                &database,
                &task,
                DownloadStatus::Failed,
                task.total_downloaded,
                None,
                0.0,
                "failed",
                Some("Não foi possível entrar na fila. Tente retomar o download."),
            );
        }
        if control.cancellation.is_cancelled()
            && !details(&database, &id)
                .map(|d| d.task.status == DownloadStatus::Completed)
                .unwrap_or(false)
        {
            let status = if control.was_paused() {
                DownloadStatus::Paused
            } else {
                DownloadStatus::Cancelled
            };
            let downloaded = details(&database, &id)
                .map(|d| d.task.total_downloaded)
                .unwrap_or(task.total_downloaded);
            emit(
                &app,
                &database,
                &task,
                status,
                downloaded,
                None,
                0.0,
                if control.was_paused() {
                    "paused"
                } else {
                    "cancelled"
                },
                None,
            );
        }
        runtime.remove(&id);
    });
    Ok(())
}

fn transfer_command(
    tools: &Tools,
    url: &str,
    work: &Path,
    options: &MediaOptions,
    rate: i64,
) -> Command {
    let mut command = tools.downloader();
    command
        .args([
            "--newline",
            "--progress",
            "--no-simulate",
            "--progress-delta",
            "0.3",
            "--continue",
            "--no-overwrites",
            "--embed-metadata",
            "--output",
        ])
        .arg(work.join("media.%(ext)s"))
        .args([
            "--progress-template",
            "download:SF_PROGRESS:{\"format\":%(info.format_id)j,\"progress\":%(progress)j}",
            "--progress-template",
            "postprocess:SF_PP:%(progress.postprocessor)s:%(progress.status)s",
        ]);
    if options.format == "mp3" {
        command
            .args([
                "-f",
                "ba/b",
                "--extract-audio",
                "--audio-format",
                "mp3",
                "--audio-quality",
            ])
            .arg(format!("{}K", options.quality))
            .args(["--embed-thumbnail", "--convert-thumbnails", "jpg"]);
    } else {
        command.arg("-f").arg(format!("bv[height={}][vcodec~=\"^(avc|h264|vp0?9|av01)\"]+ba[acodec~=\"^(mp4a|aac|opus)\"]/b[height={}][ext=mp4]", options.quality, options.quality))
                .args(["--merge-output-format", "mp4", "--remux-video", "mp4"]);
    }
    if rate > 0 {
        command.arg("--limit-rate").arg(rate.to_string());
    }
    command.arg("--").arg(url);
    command
}

async fn run(
    app: &AppHandle,
    db: &Database,
    task: &DownloadTask,
    control: &TaskControl,
) -> Result<(), String> {
    let started = Instant::now();
    let mut saved = details(db, &task.id)?;
    let tools = Tools::load(app)?;
    emit(
        app,
        db,
        task,
        DownloadStatus::CheckingFiles,
        task.total_downloaded,
        task.file_size,
        0.0,
        "checking",
        None,
    );
    let preview = tokio::select! {
        p = inspect(app, &task.original_url) => p?,
        _ = control.cancellation.cancelled() => return Ok(()),
    };
    saved.options = resolve_track_options(&preview, &saved.options)?;
    let work =
        paths::validate_destructive_path(Path::new(&task.save_path), Path::new(&task.temp_path))?;
    std::fs::create_dir_all(&work)
        .map_err(|_| "Não foi possível preparar os arquivos temporários.")?;
    let work = paths::canonical_existing_directory(&work)?;
    emit(
        app,
        db,
        task,
        DownloadStatus::Downloading,
        task.total_downloaded,
        None,
        0.0,
        "download",
        None,
    );
    let mut downloaded = task.total_downloaded;
    loop {
        let rate = control.speed_limit();
        let mut command = transfer_command(&tools, &preview.url, &work, &saved.options, rate);
        let mut child = command
            .spawn()
            .map_err(|_| "Não foi possível iniciar o download de mídia.")?;
        let tree = ProcessTree::new(&child)?;
        let mut lines = BufReader::new(
            child
                .stdout
                .take()
                .ok_or("Saída de progresso indisponível.")?,
        )
        .lines();
        let stderr = child.stderr.take().ok_or("Diagnóstico indisponível.")?;
        let stderr_reader = tokio::spawn(async move {
            let mut data = Vec::new();
            let _ = stderr.take(64 * 1024).read_to_end(&mut data).await;
            String::from_utf8_lossy(&data).into_owned()
        });
        let mut parts: HashMap<String, (i64, Option<i64>)> = HashMap::new();
        let mut processing = false;
        let mut restart = false;
        let mut tick = tokio::time::interval(Duration::from_millis(300));
        loop {
            tokio::select! {
                _ = control.cancellation.cancelled() => {
                    tree.stop(); let _ = child.kill().await; let _ = child.wait().await;
                    let _ = stderr_reader.await; return Ok(());
                }
                _ = tick.tick() => {
                    if !processing && control.speed_limit() != rate { restart = true; tree.stop(); let _ = child.kill().await; break; }
                }
                line = lines.next_line() => {
                    let Some(line) = line.map_err(|_| "Falha ao ler o progresso da mídia.")? else { break; };
                    if line.len() > 128 * 1024 { return Err("Resposta de progresso inválida.".into()); }
                    if ["SF_PP:Merger:", "SF_PP:ExtractAudio:", "SF_PP:VideoRemuxer:", "SF_PP:Metadata:", "SF_PP:EmbedThumbnail:", "SF_PP:MoveFiles:"].iter().any(|prefix| line.starts_with(prefix)) {
                        if !control.begin_finalization() { tree.stop(); let _ = child.kill().await; let _ = stderr_reader.await; return Ok(()); }
                        processing = true;
                        emit(app, db, task, DownloadStatus::Assembling, downloaded, None, 0.0, if saved.options.format == "mp3" { "converting" } else { "merging" }, None);
                    } else if let Some(raw) = line.strip_prefix("SF_PROGRESS:").filter(|_| !processing) {
                        if let Ok(p) = serde_json::from_str::<Value>(raw) {
                            let progress = &p["progress"];
                            let bytes = progress["downloaded_bytes"].as_i64().unwrap_or(0).max(0);
                            let total = progress["total_bytes"].as_i64().or(progress["total_bytes_estimate"].as_i64()).filter(|n| *n > 0);
                            parts.insert(p["format"].as_str().unwrap_or("media").to_owned(), (bytes, total));
                            downloaded = parts.values().map(|(b, _)| *b).sum();
                            let total = if parts.values().all(|(_, t)| t.is_some()) { Some(parts.values().filter_map(|(_,t)| *t).sum()) } else { None };
                            emit(app, db, task, DownloadStatus::Downloading, downloaded, total, progress["speed"].as_f64().unwrap_or(0.0).max(0.0), "download", None);
                        }
                    }
                }
            }
        }
        let status = tokio::select! {
            status = child.wait() => status.map_err(|_| "O processo de mídia não terminou corretamente.")?,
            _ = control.cancellation.cancelled() => { tree.stop(); let _ = child.kill().await; let _ = stderr_reader.await; return Ok(()); }
        };
        let error = stderr_reader.await.unwrap_or_default();
        drop(tree);
        if restart {
            continue;
        }
        if !status.success() {
            if super::media_query::is_rate_limit(&error) {
                super::media_query::COORDINATOR.rate_limited();
            }
            return Err(friendly_error(&error));
        }
        break;
    }
    if control.cancellation.is_cancelled() {
        return Ok(());
    }
    if !control.begin_finalization() {
        return Ok(());
    }
    emit(
        app,
        db,
        task,
        DownloadStatus::Assembling,
        downloaded,
        None,
        0.0,
        "verifying",
        None,
    );
    let output = work.join(format!("media.{}", saved.options.format));
    let source = paths::canonical_existing_file(&output)
        .map_err(|_| "A conversão não gerou o arquivo final esperado.")?;
    validate_output(&tools, &source, &saved.options.format, Some(control)).await?;
    if control.cancellation.is_cancelled() {
        return Ok(());
    }
    let final_path =
        paths::validate_destructive_path(Path::new(&task.save_path), Path::new(&task.final_path))?;
    let size = std::fs::metadata(&source)
        .map_err(|e| e.to_string())?
        .len()
        .min(i64::MAX as u64) as i64;
    // Work is on the destination volume. Publish atomically without replacing an existing file.
    publish_file(&source, &final_path).map_err(|_| {
        "Não foi possível salvar o arquivo final. Confira o espaço e se o nome já existe."
    })?;
    let mut finished = task.clone();
    finished.file_size = Some(size);
    finished.total_downloaded = size;
    let average = downloaded as f64 / started.elapsed().as_secs_f64().max(1.0);
    finished.speed_average = average;
    completion::record_usage(
        db,
        &finished,
        downloaded,
        downloaded,
        downloaded.saturating_add(size),
        average,
        "completed",
    );
    completion::record_metrics(
        db,
        downloaded,
        downloaded.saturating_add(size),
        0,
        "completed",
        started.elapsed().as_millis() as i64,
    );
    completion::record_history(db, &finished, "completed", started.elapsed(), average);
    emit(
        app,
        db,
        &finished,
        DownloadStatus::Completed,
        size,
        Some(size),
        0.0,
        "completed",
        None,
    );
    let _ = cleanup_work(task);
    Ok(())
}

fn publish_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let destination: Vec<u16> = destination
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        // Flags=0 deliberately excludes REPLACE_EXISTING and COPY_ALLOWED; works on FAT as well as NTFS.
        if unsafe {
            windows_sys::Win32::Storage::FileSystem::MoveFileExW(
                source.as_ptr(),
                destination.as_ptr(),
                0,
            )
        } == 0
        {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        std::fs::hard_link(source, destination)?;
        std::fs::remove_file(source)
    }
}

pub async fn validate_output(
    tools: &Tools,
    file: &Path,
    format: &str,
    control: Option<&TaskControl>,
) -> Result<(), String> {
    let mut command = tools.command("ffprobe");
    command
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,height:stream_disposition=attached_pic",
            "-of",
            "json",
        ])
        .arg(file);
    let result = if let Some(control) = control {
        tokio::select! { p = capture(command, Duration::from_secs(45)) => p?, _ = control.cancellation.cancelled() => return Ok(()) }
    } else {
        capture(command, Duration::from_secs(45)).await?
    };
    let raw: Value = serde_json::from_slice(&result.1)
        .map_err(|_| "O arquivo final não passou na validação.")?;
    let streams = raw["streams"]
        .as_array()
        .ok_or("O arquivo final não contém mídia válida.")?;
    let audio = streams.iter().any(|s| {
        s["codec_type"].as_str() == Some("audio")
            && (format != "mp3" || s["codec_name"].as_str() == Some("mp3"))
    });
    let video = streams.iter().any(|s| {
        s["codec_type"].as_str() == Some("video")
            && s["disposition"]["attached_pic"].as_i64() != Some(1)
    });
    let cover = streams
        .iter()
        .any(|s| s["disposition"]["attached_pic"].as_i64() == Some(1));
    let duration = raw["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    if !result.0
        || !audio
        || (format == "mp4" && !video)
        || (format == "mp3" && !cover)
        || !duration.is_finite()
        || duration <= 0.0
    {
        return Err("O arquivo final não passou na validação de áudio, vídeo e capa.".into());
    }
    Ok(())
}

pub fn cleanup_work(task: &DownloadTask) -> Result<(), String> {
    fn remove(root: &Path, target: &Path) -> Result<(), String> {
        let target = paths::validate_destructive_path(root, target)?;
        if target.is_dir() {
            for entry in std::fs::read_dir(&target).map_err(|e| e.to_string())? {
                remove(root, &entry.map_err(|e| e.to_string())?.path())?;
            }
            std::fs::remove_dir(target).map_err(|e| e.to_string())
        } else {
            std::fs::remove_file(target).map_err(|e| e.to_string())
        }
    }
    if Path::new(&task.temp_path).exists() {
        remove(Path::new(&task.save_path), Path::new(&task.temp_path))?;
    }
    Ok(())
}

pub async fn stop(
    app: &AppHandle,
    db: &Database,
    runtime: &DownloadRuntime,
    id: &str,
    pause: bool,
    delete: bool,
) -> Result<bool, String> {
    let saved = details(db, id)?;
    if saved.task.status == DownloadStatus::Completed {
        return Ok(false);
    }
    if pause && saved.task.status == DownloadStatus::Assembling {
        return Err("Aguarde a finalização da mídia para pausar.".into());
    }
    if pause {
        runtime.pause(id)?;
    } else {
        runtime.cancel(id, delete)?;
    }
    for _ in 0..100 {
        if !runtime.has(id) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    if runtime.has(id) {
        return Err("A mídia ainda está encerrando. Tente novamente em instantes.".into());
    }
    if details(db, id)?.task.status == DownloadStatus::Completed {
        return Ok(false);
    }
    if delete {
        cleanup_work(&saved.task)?;
    }
    let status = if pause {
        DownloadStatus::Paused
    } else {
        DownloadStatus::Cancelled
    };
    let downloaded = details(db, id)?.task.total_downloaded;
    emit(
        app,
        db,
        &saved.task,
        status,
        if delete { 0 } else { downloaded },
        None,
        0.0,
        if pause { "paused" } else { "cancelled" },
        None,
    );
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "downloads a public YouTube video; requires network access"]
    async fn real_transfer_preserves_partials_resumes_and_reports_valid_progress() {
        let tools = Tools {
            dir: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/media-tools"),
        };
        let root = std::env::temp_dir().join(format!("sf-media-resume-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let options = MediaOptions {
            format: "mp3".into(),
            quality: 192,
            video_id: "jNQXAC9IVRw".into(),
            playlist: None,
        };
        let url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
        let mut child = transfer_command(&tools, url, &root, &options, 8192)
            .spawn()
            .unwrap();
        let tree = ProcessTree::new(&child).unwrap();
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        let error_pipe = child.stderr.take().unwrap();
        let errors = tokio::spawn(async move {
            let mut bytes = Vec::new();
            let _ = error_pipe.take(64 * 1024).read_to_end(&mut bytes).await;
            bytes
        });
        tokio::time::timeout(Duration::from_secs(75), async {
            while let Some(line) = lines.next_line().await.unwrap() {
                if let Some(raw) = line.strip_prefix("SF_PROGRESS:") {
                    let value: Value = serde_json::from_str(raw)
                        .expect("progress must be valid JSON, including absent estimates");
                    if value["progress"]["downloaded_bytes"].as_i64().unwrap_or(0) >= 32768 {
                        return;
                    }
                }
            }
            let diagnostic = errors.await.unwrap();
            panic!(
                "transfer ended before producing progress: {}",
                String::from_utf8_lossy(&diagnostic)
            );
        })
        .await
        .expect("transfer did not produce progress");
        tree.stop();
        let _ = child.kill().await;
        let _ = child.wait().await;
        drop(tree);
        assert!(std::fs::read_dir(&root)
            .unwrap()
            .flatten()
            .any(
                |entry| entry.path().extension().is_some_and(|ext| ext == "part")
                    && entry.metadata().unwrap().len() > 0
            ));
        let resumed = capture(
            transfer_command(&tools, url, &root, &options, 0),
            Duration::from_secs(120),
        )
        .await
        .unwrap();
        assert!(resumed.0, "{}", resumed.2);
        let output = String::from_utf8_lossy(&resumed.1);
        assert!(
            output.contains("Resuming download at byte"),
            "partial must be reused"
        );
        let progress = output
            .lines()
            .filter_map(|line| line.strip_prefix("SF_PROGRESS:"))
            .map(|raw| serde_json::from_str::<Value>(raw).unwrap())
            .collect::<Vec<_>>();
        assert!(progress
            .iter()
            .any(|p| p["progress"]["downloaded_bytes"].as_i64().unwrap_or(0) > 0));
        assert!(
            output.contains("SF_PP:ExtractAudio:"),
            "conversion phase must be reported separately"
        );
        validate_output(&tools, &root.join("media.mp3"), "mp3", None)
            .await
            .unwrap();
        let options = MediaOptions {
            format: "mp4".into(),
            quality: 240,
            video_id: options.video_id,
            playlist: None,
        };
        let video = capture(
            transfer_command(&tools, url, &root, &options, 0),
            Duration::from_secs(120),
        )
        .await
        .unwrap();
        assert!(video.0, "{}", video.2);
        validate_output(&tools, &root.join("media.mp4"), "mp4", None)
            .await
            .unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn final_file_publication_never_overwrites_an_existing_file() {
        let root = std::env::temp_dir().join(format!("sf-media-publish-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("media.mp3");
        let destination = root.join("Title-sfd.mp3");
        std::fs::write(&source, b"new audio").unwrap();
        std::fs::write(&destination, b"existing audio").unwrap();
        assert!(publish_file(&source, &destination).is_err());
        assert_eq!(std::fs::read(&destination).unwrap(), b"existing audio");
        assert!(source.exists());
        std::fs::remove_file(&destination).unwrap();
        publish_file(&source, &destination).unwrap();
        assert!(!source.exists());
        assert_eq!(std::fs::read(&destination).unwrap(), b"new audio");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn bundled_ffmpeg_validates_all_audio_bitrates_with_cover_and_rejects_corruption() {
        let tools = Tools {
            dir: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/media-tools"),
        };
        let root =
            std::env::temp_dir().join(format!("sf-media-validation-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        for bitrate in [128, 192, 256, 320] {
            let file = root.join(format!("audio-{bitrate}-sfd.mp3"));
            let mut command = tools.command("ffmpeg");
            command
                .args([
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=440:duration=1",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=blue:s=64x64:d=1",
                    "-map",
                    "0:a",
                    "-map",
                    "1:v",
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                ])
                .arg(format!("{bitrate}k"))
                .args([
                    "-c:v",
                    "mjpeg",
                    "-frames:v",
                    "1",
                    "-disposition:v",
                    "attached_pic",
                    "-id3v2_version",
                    "3",
                    "-metadata",
                    "title=SFDownloader test",
                ])
                .arg(&file);
            assert!(capture(command, Duration::from_secs(20)).await.unwrap().0);
            validate_output(&tools, &file, "mp3", None).await.unwrap();
        }
        let corrupt = root.join("broken.mp3");
        std::fs::write(&corrupt, b"not an audio file").unwrap();
        assert!(validate_output(&tools, &corrupt, "mp3", None)
            .await
            .is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn playlist_links_include_watch_and_short_urls_with_a_list() {
        assert_eq!(youtube_source("https://www.youtube.com/watch?v=9Vt4XguN2-A&list=PLQGx8UJi4WEwUFhQtbhJo3LXOP4CswNQS").unwrap().0,
            "https://www.youtube.com/playlist?list=PLQGx8UJi4WEwUFhQtbhJo3LXOP4CswNQS");
        let id = "PL0123456789_example";
        for url in [
            format!("https://www.youtube.com/playlist?list={id}&index=4"),
            format!("https://music.youtube.com/playlist?list={id}"),
            format!("https://youtube.com/watch?list={id}"),
            format!("https://youtube.com/watch?v=BaW_jenozKc&list={id}"),
            format!("https://youtu.be/BaW_jenozKc?list={id}"),
        ] {
            let source = youtube_source(&url).unwrap();
            assert_eq!(
                source.0,
                format!("https://www.youtube.com/playlist?list={id}")
            );
            assert!(is_playlist_source(&source.0));
        }
        for url in [
            "https://youtube.com/playlist?list=../outside",
            "https://youtube.com.evil.test/playlist?list=PL0123456789",
            "https://youtube.com/playlist?list=",
            "https://youtube.com/channel/test",
        ] {
            assert!(youtube_source(url).is_err());
        }
        assert!(!is_playlist_source(
            &youtube_source("https://youtube.com/watch?v=BaW_jenozKc&t=3")
                .unwrap()
                .0
        ));
    }

    #[test]
    fn mix_preserves_seed_and_materializes_a_bounded_snapshot() {
        let mix_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=RDjNQXAC9IVRw";
        assert_eq!(youtube_source(mix_url).unwrap().0, mix_url);
        assert!(is_playlist_source(mix_url));
        assert_eq!(
            youtube_source("https://youtu.be/jNQXAC9IVRw?list=RDMM")
                .unwrap()
                .0,
            "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=RDMM"
        );
        assert!(youtube_source("https://youtube.com/watch?v=bad&list=RDjNQXAC9IVRw").is_err());
        let entries: Vec<_> = (0..75)
            .map(|n| json!({"id":format!("{n:011}"),"title":format!("Track {n}")}))
            .collect();
        let preview = parse_playlist(json!({"_type":"playlist","id":"RDjNQXAC9IVRw","playlist_count":100000,"title":"Mix - Test","entries":entries}),mix_url.into(),"RDjNQXAC9IVRw".into()).unwrap();
        let playlist = preview.playlist.unwrap();
        assert!(playlist.mix);
        assert_eq!(playlist.entries.len(), 50);
        assert_eq!(playlist.snapshot_limit, Some(50));
    }

    #[test]
    fn playlist_filters_unavailable_entries_deduplicates_and_never_trusts_entry_urls() {
        let p = parse_playlist(
            json!({"_type":"playlist","id":"PL0123456789","title":"../CON: lista?","entries":[
                {"id":"BaW_jenozKc","title":"One","url":"https://evil.test/payload"},
                {"id":"BaW_jenozKc","title":"Duplicate"},
                {"id":"jNQXAC9IVRw","title":"Two","duration":42},
                {"id":"abcdefghijk","availability":"private"},
                {"id":"01234567890","title":"[Deleted video]"},
                {"id":"z0123456789","is_live":true}, null
            ]}),
            "https://youtube.com/playlist?list=PL0123456789".into(),
            "PL0123456789".into(),
        )
        .unwrap();
        let playlist = p.playlist.as_ref().unwrap();
        assert_eq!(playlist.entries.len(), 2);
        assert_eq!(playlist.unavailable_count, 4);
        assert_eq!(playlist.entries[1].index, 3);
        assert!(p.music);
        assert!(!p.file_stem.contains('/'));
        assert_eq!(p.duration, 42.0);
        assert_eq!(p.playlist.as_ref().unwrap().entries[0].duration, None);
        assert_eq!(p.playlist.as_ref().unwrap().entries[1].duration, Some(42.0));
        assert!(parse_playlist(
            json!({"_type":"playlist","id":"other","entries":[]}),
            "url".into(),
            "PL0123456789".into()
        )
        .is_err());
        assert!(parse_playlist(
            json!({"_type":"playlist","id":"PL0123456789","playlist_count":1001,"entries":[]}),
            "url".into(),
            "PL0123456789".into()
        )
        .unwrap_err()
        .contains("1.000"));
        assert!(parse_playlist(
            json!({"_type":"playlist","id":"PL0123456789","entries":[]}),
            "url".into(),
            "PL0123456789".into()
        )
        .is_err());
    }

    #[test]
    fn playlist_video_quality_falls_back_to_native_resolution_and_old_options_still_load() {
        let p = parse_preview(
            json!({"id":"BaW_jenozKc","formats":[{"height":720,"vcodec":"avc1","acodec":"mp4a"}]}),
            "url".into(),
            "BaW_jenozKc".into(),
            false,
        )
        .unwrap();
        let mut options: MediaOptions =
            serde_json::from_value(json!({"videoId":"BaW_jenozKc","format":"mp4","quality":1080}))
                .unwrap();
        assert!(options.playlist.is_none());
        assert!(resolve_track_options(&p, &options).is_err());
        options.playlist = Some(PlaylistContext {
            id: "PL0123456789".into(),
            title: "Playlist".into(),
            index: 1,
            count: 2,
        });
        assert_eq!(resolve_track_options(&p, &options).unwrap().quality, 720);
        options.quality = 360;
        assert!(resolve_track_options(&p, &options).is_err());
    }

    #[test]
    fn playlist_folders_stay_inside_destination_and_support_disabled_organization() {
        assert_eq!(playlist_folder_name("CON"), "_CON");
        assert_eq!(playlist_folder_name("LPT1.txt"), "_LPT1.txt");
        assert!(!playlist_folder_name("../../Music").contains('/'));
        let root =
            std::env::temp_dir().join(format!("sf-playlist-folder-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let root = paths::canonical_existing_directory(&root).unwrap();
        let organized = destination_folder(&root, true, "mp3", Some("My / Playlist")).unwrap();
        assert_eq!(organized, root.join("Músicas").join("My _ Playlist"));
        let direct = destination_folder(&root, false, "mp3", Some("CON")).unwrap();
        assert_eq!(direct, root.join("_CON"));
        std::fs::write(root.join("Existing file"), b"keep").unwrap();
        assert!(destination_folder(&root, false, "mp3", Some("Existing file")).is_err());
        assert_eq!(std::fs::read(root.join("Existing file")).unwrap(), b"keep");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn canonicalizes_single_video_and_rejects_spoofed_hosts() {
        let id = "BaW_jenozKc";
        for url in [
            format!("https://youtu.be/{id}?t=30"),
            format!("https://www.youtube.com/watch?v={id}&t=123"),
            format!("https://music.youtube.com/watch?v={id}"),
            format!("https://youtube.com/shorts/{id}"),
        ] {
            assert_eq!(youtube_source(&url).unwrap().1, id);
        }
        for url in [
            "https://youtube.com.evil.test/watch?v=BaW_jenozKc",
            "https://youtube.com@evil.test/watch?v=BaW_jenozKc",
            "https://youtube.com/playlist?list=123",
            "https://youtu.be/../../bad",
            "https://youtube.com:8443/watch?v=BaW_jenozKc",
        ] {
            assert!(youtube_source(url).is_err());
        }
    }
    #[test]
    fn preview_only_exposes_actual_supported_resolutions() {
        let p = parse_preview(json!({"id":"BaW_jenozKc","formats":[{"height":2160,"vcodec":"av01.0","acodec":"none"},{"height":720,"vcodec":"avc1","acodec":"mp4a"},{"height":720,"vcodec":"avc1","acodec":"none"},{"height":9999,"vcodec":"unknown","acodec":"none"}]}), "url".into(), "BaW_jenozKc".into(), false).unwrap();
        assert_eq!(p.resolutions, vec![2160, 720]);
        assert!(validate_options(
            &p,
            &MediaOptions {
                format: "mp4".into(),
                quality: 1080,
                video_id: p.video_id.clone(),
                playlist: None,
            }
        )
        .is_err());
        assert!(parse_preview(
            json!({"id":"BaW_jenozKc","is_live":true}),
            "url".into(),
            "BaW_jenozKc".into(),
            false
        )
        .is_err());
    }
    #[test]
    fn preview_presents_only_reported_metadata_and_supported_frame_rates() {
        let p = parse_preview(json!({"id":"BaW_jenozKc","title":"Video: demo?","view_count":4800000,"channel_is_verified":true,"formats":[
            {"height":1080,"fps":30,"vcodec":"avc1","acodec":"mp4a"},
            {"height":1080,"fps":60,"vcodec":"vp9","acodec":"none"},
            {"height":2160,"fps":120,"vcodec":"av01","has_drm":true},
            {"height":720,"fps":999,"vcodec":"avc1","acodec":"none"}
        ]}), "url".into(), "BaW_jenozKc".into(), false).unwrap();
        assert_eq!(p.frame_rates.get(&1080), Some(&60.0));
        assert!(!p.frame_rates.contains_key(&2160));
        assert!(!p.frame_rates.contains_key(&720));
        assert_eq!(p.view_count, Some(4800000));
        assert!(p.channel_verified);
        assert_eq!(p.file_stem, media_file_stem("Video: demo?"));
    }
    #[test]
    fn duplicate_suffix_remains_immediately_before_extension() {
        let folder = std::env::temp_dir();
        let taken = vec![folder.join("Test-sfd.mp3").to_string_lossy().into_owned()];
        assert_eq!(
            available_media_path(&folder, "Test", "mp3", &taken)
                .file_name()
                .unwrap(),
            "Test (1)-sfd.mp3"
        );
    }
}
