use crate::{
    database::{
        models::{CreateDownloadInput, DownloadStatus, DownloadTask},
        repositories::downloads,
        Database,
    },
    download::{
        media::{self, MediaDetails, MediaOptions, MediaPreview, PlaylistContext},
        media_query::QueryError,
        paths,
        runtime::DownloadRuntime,
    },
};
use serde::Deserialize;
use std::{
    collections::{BTreeSet, HashMap},
    path::Path,
    sync::{LazyLock, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

static SOURCES: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static PREVIEWS: LazyLock<Mutex<HashMap<String, MediaPreview>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static START_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static WINDOW_LOCK: Mutex<()> = Mutex::new(());
static INSPECTIONS: LazyLock<Mutex<HashMap<String, tokio_util::sync::CancellationToken>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn authorize(window: &WebviewWindow, id: Option<&str>) -> Result<(), String> {
    if window.label() == "main"
        || window.label().starts_with("media-confirm-")
        || id.is_some_and(|id| window.label() == format!("media-progress-{id}"))
    {
        Ok(())
    } else {
        Err("Esta janela não possui acesso ao fluxo de mídia.".into())
    }
}
pub fn open_window(
    app: &AppHandle,
    label: &str,
    title: &str,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let _guard = WINDOW_LOCK
        .lock()
        .map_err(|_| "Falha ao abrir a janela de mídia.")?;
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        return window.set_focus().map_err(|e| e.to_string());
    }
    let (width, height) = if let Some(monitor) = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
    {
        (
            width.min((monitor.size().width as f64 / monitor.scale_factor() - 32.0).max(320.0)),
            height.min((monitor.size().height as f64 / monitor.scale_factor() - 80.0).max(240.0)),
        )
    } else {
        (width, height)
    };
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
    let window = WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(width, height)
        .resizable(label.starts_with("media-confirm-playlist-"))
        .decorations(false)
        .shadow(false)
        .transparent(true)
        .visible(false)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    if label.starts_with("media-confirm-") {
        let label = label.to_owned();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Ok(mut sources) = SOURCES.lock() {
                    sources.remove(&label);
                }
                if let Ok(mut previews) = PREVIEWS.lock() {
                    previews.remove(&label);
                }
                if let Ok(mut inspections) = INSPECTIONS.lock() {
                    if let Some(token) = inspections.remove(&label) {
                        token.cancel();
                    }
                }
            }
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn open_media_confirmation(
    app: AppHandle,
    window: WebviewWindow,
    url: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Abra o link pela janela principal.".into());
    }
    let (canonical, id, _) = media::youtube_source(&url)?;
    let playlist = media::is_playlist_source(&canonical);
    let label = if playlist {
        format!("media-confirm-playlist-{id}")
    } else {
        format!("media-confirm-{id}")
    };
    let mut sources = SOURCES
        .lock()
        .map_err(|_| "Falha ao abrir a confirmação de mídia.")?;
    if !app.get_webview_window(&label).is_some() {
        sources.insert(label.clone(), url);
    }
    drop(sources);
    // Window creation must run outside the synchronous WebView2 IPC callback on Windows.
    open_window(
        &app,
        &label,
        if playlist && media::is_mix_id(&id) {
            "Baixar Mix"
        } else if playlist {
            "Baixar playlist"
        } else {
            "Baixar vídeo ou música"
        },
        if playlist { 1020.0 } else { 620.0 },
        if playlist { 590.0 } else { 480.0 },
    )
}

#[tauri::command]
pub async fn inspect_media(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<MediaPreview, QueryError> {
    let source = SOURCES
        .lock()
        .map_err(|_| "Falha ao consultar a mídia.")?
        .get(window.label())
        .cloned()
        .ok_or("Link de mídia indisponível. Abra-o novamente na busca.")?;
    let token = tokio_util::sync::CancellationToken::new();
    if let Some(previous) = INSPECTIONS
        .lock()
        .map_err(|_| "Falha ao consultar a mídia.")?
        .insert(window.label().into(), token.clone())
    {
        previous.cancel();
    }
    let preview = tokio::select! { preview = media::inspect_with_wait(&app, &source, |wait| { let _ = app.emit_to(window.label(), "media-query-wait", wait); }) => preview?, _ = token.cancelled() => return Err("Consulta encerrada.".into()) };
    if app.get_webview_window(window.label()).is_none() {
        return Err("A janela de mídia foi fechada.".into());
    }
    let mut previews = PREVIEWS
        .lock()
        .map_err(|_| "Falha ao salvar a consulta de mídia.")?;
    // Keep only live confirmations; metadata never persists signed CDN URLs.
    previews.retain(|label, _| app.get_webview_window(label).is_some());
    previews.insert(window.label().into(), preview.clone());
    Ok(preview)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartMediaInput {
    pub format: String,
    pub quality: u32,
    pub root_folder: String,
    pub auto_organize: bool,
    pub max_parallel_downloads: usize,
    pub speed_limit_download: i64,
    pub priority: i64,
    #[serde(default)]
    pub selected_video_ids: Option<Vec<String>>,
}

#[tauri::command]
pub async fn start_media_download(
    app: AppHandle,
    window: WebviewWindow,
    database: State<'_, Database>,
    runtime: State<'_, DownloadRuntime>,
    input: StartMediaInput,
) -> Result<DownloadTask, String> {
    let _guard = START_LOCK.lock().await;
    let preview = PREVIEWS
        .lock()
        .map_err(|_| "Consulta de mídia indisponível.")?
        .get(window.label())
        .cloned()
        .ok_or("Consulte o vídeo novamente antes de baixar.")?;
    let options = MediaOptions {
        format: input.format.clone(),
        quality: input.quality,
        video_id: preview.video_id.clone(),
        playlist: None,
    };
    media::validate_options(&preview, &options)?;
    if input.root_folder.trim().is_empty() || !Path::new(&input.root_folder).is_absolute() {
        return Err("Escolha uma pasta de destino válida.".into());
    }
    std::fs::create_dir_all(&input.root_folder)
        .map_err(|_| "Não foi possível abrir a pasta de destino.")?;
    let root = paths::canonical_existing_directory(Path::new(&input.root_folder))?;
    let folder = media::destination_folder(
        &root,
        input.auto_organize,
        &options.format,
        preview.playlist.as_ref().map(|_| preview.title.as_str()),
    )?;
    let created = create_tasks(&database, &preview, &options, &folder, &input)?;
    let task = created
        .first()
        .cloned()
        .ok_or("Todas as faixas desta playlist já estão em andamento ou pausadas nesta pasta.")?;
    for queued in created {
        let _ = app.emit("download-created", &queued);
        if let Err(error) = media::spawn(
            app.clone(),
            database.inner().clone(),
            runtime.inner().clone(),
            queued.clone(),
        ) {
            // The batch is already persisted. Make a queue failure visible and resumable.
            if let Ok(c) = database.connect() {
                let _ = c.execute(
                    "UPDATE download_tasks SET status='failed' WHERE id=?1",
                    [&queued.id],
                );
                let _ = c.execute(
                    "UPDATE media_downloads SET phase='failed',last_error=?2 WHERE download_id=?1",
                    rusqlite::params![queued.id, error],
                );
            }
        }
    }
    let _ = open_window(
        &app,
        &format!("media-progress-{}", task.id),
        "Download de mídia",
        440.0,
        312.0,
    );
    PREVIEWS
        .lock()
        .map_err(|_| "Falha ao encerrar a consulta.")?
        .remove(window.label());
    SOURCES
        .lock()
        .map_err(|_| "Falha ao encerrar a consulta.")?
        .remove(window.label());
    Ok(task)
}

// One transaction reserves the complete playlist before any worker starts.
fn create_tasks(
    database: &Database,
    preview: &MediaPreview,
    options: &MediaOptions,
    folder: &Path,
    input: &StartMediaInput,
) -> Result<Vec<DownloadTask>, String> {
    let mut c = database.connect()?;
    let tasks = downloads::list(&c).map_err(|e| e.to_string())?;
    let mut active = BTreeSet::new();
    for task in &tasks {
        if task.download_type == "media"
            && !matches!(
                task.status,
                DownloadStatus::Completed | DownloadStatus::Failed | DownloadStatus::Cancelled
            )
        {
            if let Ok(saved) = media::details(&database, &task.id) {
                active.insert((
                    task.original_url.clone(),
                    saved.options.format,
                    saved.options.quality,
                    task.save_path.clone(),
                ));
            }
        }
    }
    let entries = if let Some(playlist) = &preview.playlist {
        let selected = input
            .selected_video_ids
            .as_ref()
            .ok_or("Selecione as faixas da playlist antes de baixar.")?;
        if selected.is_empty() {
            return Err("Selecione pelo menos uma faixa da playlist.".into());
        }
        let ids: BTreeSet<_> = selected.iter().collect();
        if ids.len() != selected.len()
            || ids
                .iter()
                .any(|id| !playlist.entries.iter().any(|e| &e.video_id == *id))
        {
            return Err("A seleção contém faixas que não pertencem à playlist consultada.".into());
        }
        playlist
            .entries
            .iter()
            .filter(|e| ids.contains(&e.video_id))
            .cloned()
            .collect()
    } else {
        vec![media::PlaylistEntry {
            video_id: preview.video_id.clone(),
            title: preview.title.clone(),
            index: 1,
            duration: Some(preview.duration),
        }]
    };
    let selected_count = entries.len();
    let mut taken = tasks
        .iter()
        .map(|t| t.final_path.clone())
        .collect::<Vec<_>>();
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let mut created = Vec::new();
    for (position, entry) in entries.into_iter().enumerate() {
        let url = format!("https://www.youtube.com/watch?v={}", entry.video_id);
        if active.iter().any(|(u, f, q, dest)| {
            u == &url
                && f == &options.format
                && *q == options.quality
                && (preview.playlist.is_none() || Path::new(dest) == folder)
        }) {
            if preview.playlist.is_none() {
                return Err("Este vídeo nesta qualidade já está em andamento ou pausado.".into());
            }
            continue;
        }
        let mut options = options.clone();
        options.video_id = entry.video_id;
        options.playlist = preview.playlist.as_ref().map(|_| PlaylistContext {
            id: preview.video_id.clone(),
            title: preview.title.clone(),
            index: position + 1,
            count: selected_count,
        });
        let final_path = media::available_media_path(folder, &entry.title, &options.format, &taken);
        taken.push(final_path.to_string_lossy().into_owned());
        let temp_path = folder
            .join(".sf-temp")
            .join(format!("media-{}", uuid::Uuid::new_v4()));
        paths::validate_destructive_path(&folder, &temp_path)?;
        let task = downloads::create(
            &tx,
            CreateDownloadInput {
                file_name: final_path
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                file_size: None,
                original_url: url,
                save_path: folder.to_string_lossy().into_owned(),
                temp_path: temp_path.to_string_lossy().into_owned(),
                final_path: final_path.to_string_lossy().into_owned(),
                mime_type: Some(
                    if options.format == "mp3" {
                        "audio/mpeg"
                    } else {
                        "video/mp4"
                    }
                    .into(),
                ),
                extension: Some(options.format.clone()),
                supports_range: false,
                max_connections: 1,
                max_parallel_downloads: input.max_parallel_downloads.clamp(1, 50) as i64,
                speed_limit_download: input.speed_limit_download.max(0),
                speed_limit_inherited: true,
                etag: None,
                last_modified: None,
                delete_archive_after_extract: false,
                download_type: "media".into(),
                info_hash: None,
                priority: input.priority.clamp(0, 3),
            },
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO media_downloads(download_id,options,phase) VALUES(?1,?2,'queued')",
            rusqlite::params![
                task.id,
                serde_json::to_string(&options).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
        created.push(task);
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(created)
}

#[tauri::command]
pub fn media_download_details(
    window: WebviewWindow,
    database: State<'_, Database>,
    id: String,
) -> Result<MediaDetails, String> {
    authorize(&window, Some(&id))?;
    media::details(&database, &id)
}

#[tauri::command]
pub async fn open_media_progress(
    app: AppHandle,
    window: WebviewWindow,
    database: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    authorize(&window, Some(&id))?;
    media::details(&database, &id)?;
    open_window(
        &app,
        &format!("media-progress-{id}"),
        "Download de mídia",
        440.0,
        312.0,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playlist_batch_persists_queue_context_and_reserves_duplicates_atomically() {
        let root = std::env::temp_dir().join(format!("sf-playlist-queue-{}", uuid::Uuid::new_v4()));
        let database = Database::initialize(&root.join("db")).unwrap();
        let preview = media::parse_playlist(serde_json::json!({"_type":"playlist","id":"PL0123456789","title":"My playlist","entries":[
            {"id":"BaW_jenozKc","title":"Same title"}, {"id":"jNQXAC9IVRw","title":"Same title"}
        ]}), "https://www.youtube.com/playlist?list=PL0123456789".into(), "PL0123456789".into()).unwrap();
        let options = MediaOptions {
            format: "mp3".into(),
            quality: 192,
            video_id: preview.video_id.clone(),
            playlist: None,
        };
        let input = StartMediaInput {
            format: "mp3".into(),
            quality: 192,
            root_folder: root.to_string_lossy().into_owned(),
            auto_organize: true,
            max_parallel_downloads: 2,
            speed_limit_download: 1024,
            priority: 3,
            selected_video_ids: Some(vec!["BaW_jenozKc".into(), "jNQXAC9IVRw".into()]),
        };
        std::fs::create_dir_all(root.join("downloads")).unwrap();
        let folder = media::destination_folder(
            &paths::canonical_existing_directory(&root.join("downloads")).unwrap(),
            true,
            "mp3",
            Some(&preview.title),
        )
        .unwrap();
        let mut invalid = StartMediaInput {
            selected_video_ids: Some(vec![]),
            ..StartMediaInput {
                format: input.format.clone(),
                quality: input.quality,
                root_folder: input.root_folder.clone(),
                auto_organize: input.auto_organize,
                max_parallel_downloads: input.max_parallel_downloads,
                speed_limit_download: input.speed_limit_download,
                priority: input.priority,
                selected_video_ids: None,
            }
        };
        assert!(create_tasks(&database, &preview, &options, &folder, &invalid).is_err());
        invalid.selected_video_ids = Some(vec!["abcdefghijk".into()]);
        assert!(create_tasks(&database, &preview, &options, &folder, &invalid).is_err());
        invalid.selected_video_ids = Some(vec!["BaW_jenozKc".into(), "BaW_jenozKc".into()]);
        assert!(create_tasks(&database, &preview, &options, &folder, &invalid).is_err());
        assert!(downloads::list(&database.connect().unwrap())
            .unwrap()
            .is_empty());
        invalid.selected_video_ids = Some(vec!["jNQXAC9IVRw".into()]);
        let selected = create_tasks(&database, &preview, &options, &folder, &invalid).unwrap();
        assert_eq!(selected.len(), 1);
        assert!(selected[0].original_url.ends_with("jNQXAC9IVRw"));
        let c = database.connect().unwrap();
        c.execute("DELETE FROM download_tasks WHERE id=?1", [&selected[0].id])
            .unwrap();
        drop(c);
        let tasks = create_tasks(&database, &preview, &options, &folder, &input).unwrap();
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].file_name, "Same title-sfd.mp3");
        assert_eq!(tasks[1].file_name, "Same title (1)-sfd.mp3");
        assert_ne!(tasks[0].temp_path, tasks[1].temp_path);
        assert!(tasks[0].queue_order < tasks[1].queue_order);
        for task in &tasks {
            assert_eq!(task.priority, 3);
            assert_eq!(task.max_parallel_downloads, 2);
            assert_eq!(task.speed_limit_download, 1024);
            assert_eq!(Path::new(&task.save_path), folder);
            assert!(task
                .original_url
                .starts_with("https://www.youtube.com/watch?v="));
        }
        assert!(create_tasks(&database, &preview, &options, &folder, &input)
            .unwrap()
            .is_empty());
        let c = database.connect().unwrap();
        c.execute(
            "UPDATE download_tasks SET status='paused' WHERE id=?1",
            [&tasks[0].id],
        )
        .unwrap();
        drop(c);
        drop(database);
        let reopened = Database::initialize(&root.join("db")).unwrap();
        let saved = media::details(&reopened, &tasks[0].id).unwrap();
        assert_eq!(saved.options.video_id, "BaW_jenozKc");
        assert_eq!(saved.options.playlist.unwrap().title, "My playlist");
        assert_eq!(saved.task.status, DownloadStatus::Paused);
        let c = reopened.connect().unwrap();
        c.execute(
            "UPDATE download_tasks SET status='cancelled' WHERE id=?1",
            [&tasks[0].id],
        )
        .unwrap();
        drop(c);
        let retry = create_tasks(&reopened, &preview, &options, &folder, &input).unwrap();
        assert_eq!(retry.len(), 1);
        assert_eq!(retry[0].file_name, "Same title (2)-sfd.mp3");
        assert_eq!(
            media::details(&reopened, &tasks[1].id)
                .unwrap()
                .options
                .playlist
                .unwrap()
                .index,
            2
        );
        drop(reopened);
        std::fs::remove_dir_all(root).unwrap();
    }
}
