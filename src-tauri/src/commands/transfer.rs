use crate::{
    browser_bridge::BrowserBridge,
    commands::{browser_extension, windows},
    database::{
        models::{CreateDownloadInput, DownloadStatus, DownloadTask},
        repositories::downloads,
        Database,
    },
    download::{
        engine,
        runtime::{DownloadRuntime, TaskControl},
    },
};
use serde::Deserialize;
use tauri::{AppHandle, State};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDownloadInput {
    pub url: String,
    pub root_folder: String,
    pub auto_organize: bool,
    pub selected_category: Option<String>,
    #[serde(default = "default_connections")]
    pub max_connections: usize,
    #[serde(default = "default_parallel_downloads")]
    pub max_parallel_downloads: usize,
    #[serde(default)]
    pub speed_limit_download: u64,
    #[serde(default = "default_priority")]
    pub priority: i64,
    pub browser_request_id: Option<String>,
    #[serde(default = "default_resume_support")]
    pub resume_support: bool,
    #[serde(default)]
    pub auto_extract: bool,
    #[serde(default)]
    pub delete_archive_after_extract: bool,
    pub archive_password: Option<String>,
    #[serde(default)]
    pub force: bool,
}

fn default_resume_support() -> bool {
    true
}

fn default_connections() -> usize {
    8
}
fn default_parallel_downloads() -> usize {
    3
}
fn default_priority() -> i64 {
    1
}

fn reject_duplicate(database: &Database, candidate: &CreateDownloadInput) -> Result<(), String> {
    let connection = database.connect()?;
    let duplicate = downloads::list(&connection)
        .map_err(|error| format!("Falha ao verificar downloads existentes: {error}"))?
        .into_iter()
        .find(|task| {
            let same_url = task.original_url == candidate.original_url
                || task.current_url == candidate.original_url;
            let same_file = task.file_name.eq_ignore_ascii_case(&candidate.file_name)
                && task.file_size.is_some()
                && task.file_size == candidate.file_size;
            (same_url || same_file)
                && !matches!(
                    task.status,
                    DownloadStatus::Failed | DownloadStatus::Cancelled
                )
        });
    if let Some(task) = duplicate {
        let state = if task.status == DownloadStatus::Completed {
            "já foi baixado"
        } else {
            "já está em andamento ou pausado"
        };
        return Err(format!("{}: este arquivo {state}.", task.file_name));
    }
    Ok(())
}

#[tauri::command]
pub async fn queue_download(
    database: State<'_, Database>,
    browser_bridge: State<'_, BrowserBridge>,
    input: StartDownloadInput,
) -> Result<DownloadTask, String> {
    let headers = browser_bridge.take_headers(input.browser_request_id.as_deref());
    let taken_paths = {
        let connection = database.connect()?;
        downloads::list(&connection)
            .map(|list| list.into_iter().map(|t| t.final_path).collect::<Vec<_>>())
            .unwrap_or_default()
    };
    let mut prepared = engine::prepare_with_headers(
        taken_paths,
        &input.url,
        &input.root_folder,
        input.auto_organize,
        input.selected_category.as_deref(),
        headers.clone(),
        input.max_connections,
        input.max_parallel_downloads,
        input.speed_limit_download,
        input.resume_support,
        input.delete_archive_after_extract,
    )
    .await?;
    prepared.input.priority = input.priority.clamp(0, 3);
    if !input.force {
        reject_duplicate(&database, &prepared.input)?;
    }
    let connection = database.connect()?;
    let task = downloads::create(&connection, prepared.input)
        .map_err(|error| format!("Falha ao persistir o download: {error}"))?;
    browser_bridge.persist_headers(&task.id, &headers)?;
    if input.auto_extract
        && matches!(
            task.extension.as_deref(),
            Some("zip" | "7z" | "rar" | "tar" | "gz" | "tgz")
        )
    {
        crate::download::extraction::register(task.id.clone(), input.archive_password.clone());
    }
    match downloads::update(
        &connection,
        crate::database::models::UpdateDownloadInput {
            id: task.id.clone(),
            status: crate::database::models::DownloadStatus::Paused,
            total_downloaded: 0,
            speed_current: 0.0,
            speed_average: 0.0,
            seeds: None,
            peers: None,
            upload_speed: None,
            total_uploaded: None,
        },
    )
    .map_err(|error| format!("Falha ao agendar o download: {error}"))
    {
        Ok(task) => Ok(task),
        Err(error) => {
            browser_bridge.remove_headers(&task.id);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    database: State<'_, Database>,
    runtime: State<'_, DownloadRuntime>,
    browser_bridge: State<'_, BrowserBridge>,
    input: StartDownloadInput,
) -> Result<DownloadTask, String> {
    let headers = browser_bridge.take_headers(input.browser_request_id.as_deref());
    let taken_paths = {
        let connection = database.connect()?;
        downloads::list(&connection)
            .map(|list| {
                list.into_iter()
                    .filter(|t| {
                        // Exclude cancelled and failed downloads from taken paths
                        !matches!(
                            t.status,
                            crate::database::models::DownloadStatus::Cancelled
                                | crate::database::models::DownloadStatus::Failed
                        )
                    })
                    .map(|t| t.final_path)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };
    let mut prepared = engine::prepare_with_headers(
        taken_paths,
        &input.url,
        &input.root_folder,
        input.auto_organize,
        input.selected_category.as_deref(),
        headers.clone(),
        input.max_connections,
        input.max_parallel_downloads,
        input.speed_limit_download,
        input.resume_support,
        input.delete_archive_after_extract,
    )
    .await?;
    prepared.input.priority = input.priority.clamp(0, 3);
    if !input.force {
        reject_duplicate(&database, &prepared.input)?;
    }
    let connection = database.connect()?;
    let task = downloads::create(&connection, prepared.input)
        .map_err(|error| format!("Falha ao persistir o download: {error}"))?;
    browser_bridge.persist_headers(&task.id, &headers)?;
    if input.auto_extract
        && matches!(
            task.extension.as_deref(),
            Some("zip" | "7z" | "rar" | "tar" | "gz" | "tgz")
        )
    {
        crate::download::extraction::register(task.id.clone(), input.archive_password.clone());
    }
    let _ = windows::open_progress_window(app.clone(), task.id.clone()).await;
    let control = TaskControl::new();
    control.set_speed_limit(task.speed_limit_download).await;
    if let Err(error) = runtime.register(task.id.clone(), control.clone()) {
        browser_bridge.remove_headers(&task.id);
        return Err(error);
    }
    let database = database.inner().clone();
    let runtime = runtime.inner().clone();
    let browser_bridge = browser_bridge.inner().clone();
    let spawned_task = task.clone();
    let segmented = task.supports_range
        && task.file_size.is_some_and(|size| size >= 2 * 1024 * 1024)
        && input.max_connections > 1;
    let max_connections = input.max_connections;
    tauri::async_runtime::spawn(async move {
        let id = spawned_task.id.clone();
        let Ok(_queue_permit) = runtime
            .acquire(
                id.clone(),
                spawned_task.max_parallel_downloads as usize,
                spawned_task.priority,
                spawned_task.queue_order,
                &control,
            )
            .await
        else {
            if let Ok(connection) = database.connect() {
                let status = if control.was_paused() {
                    crate::database::models::DownloadStatus::Paused
                } else {
                    crate::database::models::DownloadStatus::Cancelled
                };
                let _ = downloads::update(
                    &connection,
                    crate::database::models::UpdateDownloadInput {
                        id: id.clone(),
                        status,
                        total_downloaded: 0,
                        speed_current: 0.0,
                        speed_average: 0.0,
                        seeds: None,
                        peers: None,
                        upload_speed: None,
                        total_uploaded: None,
                    },
                );
            }
            runtime.remove(&id);
            return;
        };
        if spawned_task.download_type == "torrent" {
            crate::download::torrent::run_torrent(app, database.clone(), spawned_task, control)
                .await;
        } else if segmented {
            drop(prepared.response);
            engine::run_segmented(
                app,
                database.clone(),
                spawned_task,
                max_connections,
                control,
                headers,
            )
            .await;
        } else if let Some(resp) = prepared.response {
            engine::run(app, database.clone(), spawned_task, resp, control, 0).await;
        }
        runtime.remove(&id);
        if let Ok(connection) = database.connect() {
            if let Ok(Some(current)) = downloads::find(&connection, &id) {
                if matches!(
                    current.status,
                    crate::database::models::DownloadStatus::Completed
                        | crate::database::models::DownloadStatus::Failed
                        | crate::database::models::DownloadStatus::Cancelled
                ) {
                    browser_bridge.remove_headers(&id);
                }
            }
        }
    });
    Ok(task)
}

#[tauri::command]
pub async fn update_speed_limit(
    app: AppHandle,
    database: State<'_, Database>,
    runtime: State<'_, DownloadRuntime>,
    id: String,
    speed_limit: i64,
) -> Result<(), String> {
    let speed_limit = speed_limit.max(0);
    let connection = database.connect()?;
    let previous = downloads::find(&connection, &id)
        .map_err(|error| format!("Erro ao localizar download: {error}"))?
        .ok_or_else(|| "Download não encontrado.".to_string())?;
    downloads::update_speed_limit(&connection, &id, speed_limit)
        .map_err(|error| format!("Erro ao salvar limite: {error}"))?;

    let active = if let Some(control) = runtime.control(&id)? {
        control.set_speed_limit(speed_limit).await;
        true
    } else {
        false
    };
    crate::commands::debug::log_info(
        "throttle",
        "Limite de velocidade personalizado atualizado",
        Some(format!(
            "anterior={} B/s; atual={} B/s; tarefa_ativa={active}",
            previous.speed_limit_download, speed_limit
        )),
        None,
        Some(id),
        Some(&app),
    );
    Ok(())
}

#[tauri::command]
pub async fn update_download_priority(
    database: State<'_, Database>,
    runtime: State<'_, DownloadRuntime>,
    id: String,
    priority: i64,
) -> Result<DownloadTask, String> {
    let priority = priority.clamp(0, 3);
    let connection = database.connect()?;
    downloads::update_priority(&connection, &id, priority)
        .map_err(|error| format!("Erro ao salvar prioridade: {error}"))?;
    runtime.update_priority(&id, priority)?;
    downloads::find(&connection, &id)
        .map_err(|error| format!("Erro ao localizar download: {error}"))?
        .ok_or_else(|| "Download não encontrado.".into())
}

#[tauri::command]
pub async fn move_download_queue_item(
    database: State<'_, Database>,
    runtime: State<'_, DownloadRuntime>,
    id: String,
    direction: String,
) -> Result<Vec<DownloadTask>, String> {
    let move_up = match direction.as_str() {
        "up" => true,
        "down" => false,
        _ => return Err("Direção de fila inválida.".into()),
    };
    let connection = database.connect()?;
    let tasks = downloads::move_queue_order(&connection, &id, move_up)
        .map_err(|error| format!("Erro ao reordenar a fila: {error}"))?;
    for task in &tasks {
        runtime.update_queue_order(&task.id, task.queue_order)?;
    }
    Ok(tasks)
}

#[tauri::command]
pub async fn prioritize_download(
    database: State<'_, Database>,
    runtime: State<'_, DownloadRuntime>,
    id: String,
) -> Result<DownloadTask, String> {
    let connection = database.connect()?;
    let task = downloads::promote_queue_item(&connection, &id)
        .map_err(|error| format!("Erro ao priorizar o download: {error}"))?;
    runtime.update_priority(&task.id, task.priority)?;
    runtime.update_queue_order(&task.id, task.queue_order)?;
    Ok(task)
}

#[tauri::command]
pub fn start_drag_folder(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    browser_extension::start_drag_folder(&window, &path)
}
#[tauri::command]
pub async fn parse_torrent_info(
    app: tauri::AppHandle,
    token: Option<String>,
    source: String,
) -> Result<crate::download::torrent::TorrentMetadataResponse, String> {
    let manager = crate::download::torrent::get_torrent_manager();
    manager
        .parse_torrent_with_app(Some(app), token.as_deref(), &source)
        .await
}

#[tauri::command]
pub async fn confirm_torrent(
    app: tauri::AppHandle,
    database: tauri::State<'_, crate::database::Database>,
    runtime: tauri::State<'_, crate::download::runtime::DownloadRuntime>,
    info_hash: String,
    save_path: String,
    selected_file_indexes: Vec<usize>,
    start_immediately: bool,
) -> Result<crate::database::models::DownloadTask, String> {
    let manager = crate::download::torrent::get_torrent_manager();
    manager
        .confirm_torrent(
            &app,
            &database,
            &runtime,
            &info_hash,
            &save_path,
            &selected_file_indexes,
            start_immediately,
        )
        .await
}

#[tauri::command]
pub async fn cancel_torrent(
    app: tauri::AppHandle,
    database: tauri::State<'_, crate::database::Database>,
    info_hash: String,
    delete_files: Option<bool>,
) -> Result<(), String> {
    let manager = crate::download::torrent::get_torrent_manager();
    manager
        .cancel_torrent(&app, &database, &info_hash, delete_files.unwrap_or(false))
        .await
}
