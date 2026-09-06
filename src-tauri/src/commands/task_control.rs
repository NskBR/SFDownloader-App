use crate::{
    browser_bridge::BrowserBridge,
    commands::windows,
    database::{
        models::DownloadTask,
        repositories::{downloads, statistics},
        Database,
    },
    download::{
        engine,
        error::DownloadError,
        http_metadata,
        runtime::{DownloadRuntime, TaskControl},
    },
};
use reqwest::{header, Url};
use std::path::Path;
use tauri::{AppHandle, State};
use tokio::io::AsyncReadExt;
#[tauri::command]
pub async fn cancel_download(
    app: AppHandle,
    runtime: State<'_, DownloadRuntime>,
    database: State<'_, Database>,
    browser_bridge: State<'_, BrowserBridge>,
    id: String,
    delete_files: bool,
) -> Result<bool, String> {
    let connection = database.connect()?;
    let task_opt = downloads::find(&connection, &id).map_err(|e| e.to_string())?;

    let is_torrent = task_opt.as_ref().is_some_and(|task| {
        task.download_type == "torrent" || task.original_url.starts_with("magnet:")
    });
    if let Some(ref task) = task_opt {
        if is_torrent {
            let info_hash = task.info_hash.clone().unwrap_or_else(|| id.clone());
            let manager = crate::download::torrent::get_torrent_manager();
            let _ = manager
                .cancel_torrent(&app, database.inner(), &info_hash, delete_files)
                .await;
        }
    }

    if runtime.has(&id) {
        let _ = runtime.cancel(&id, delete_files);
    }

    let Some(task) = task_opt else {
        return Ok(false);
    };

    if task.status == crate::database::models::DownloadStatus::Completed {
        return Ok(false);
    }

    let observed_downloaded = task.total_downloaded.max(0);
    let mut updated_temp_path = task.temp_path.clone();
    if delete_files && !is_torrent {
        let root = Path::new(&task.save_path);
        let temp =
            crate::download::paths::validate_destructive_path(root, Path::new(&task.temp_path))?;
        let final_path =
            crate::download::paths::validate_destructive_path(root, Path::new(&task.final_path))?;
        if temp.exists() {
            std::fs::remove_file(&temp)
                .map_err(|error| format!("Falha ao remover arquivo parcial: {error}"))?;
        }
        if final_path.exists() {
            std::fs::remove_file(&final_path)
                .map_err(|error| format!("Falha ao remover arquivo final: {error}"))?;
        }
        if let Ok(plan) = crate::database::repositories::chunks::list(&connection, &task.id) {
            for chunk in plan {
                let chunk_path = format!("{}.chunk-{}", task.temp_path, chunk.index);
                let chunk_path = crate::download::paths::validate_destructive_path(
                    root,
                    Path::new(&chunk_path),
                )?;
                if chunk_path.exists() {
                    std::fs::remove_file(chunk_path)
                        .map_err(|error| format!("Falha ao remover parte do download: {error}"))?;
                }
            }
        }
    } else if !is_torrent {
        // Move .part to .sf-temp/cancelados/ so it doesn't pollute active namespace
        let root = Path::new(&task.save_path);
        let temp_path = std::path::Path::new(&task.temp_path);
        if temp_path.exists() {
            if let Some(temp_parent) = temp_path.parent() {
                let temp_parent =
                    crate::download::paths::validate_destructive_path(root, temp_parent)?;
                let cancelados_dir = temp_parent.join("cancelados");
                let _ = std::fs::create_dir_all(&cancelados_dir);
                let cancelados_dir =
                    crate::download::paths::canonical_existing_directory(&cancelados_dir)?;
                if let Some(file_name) = temp_path.file_name() {
                    let source =
                        crate::download::paths::validate_destructive_path(root, temp_path)?;
                    let dest = crate::download::paths::validate_destructive_path(
                        root,
                        &cancelados_dir.join(file_name),
                    )?;
                    if std::fs::rename(&source, &dest).is_ok() {
                        updated_temp_path = dest.to_string_lossy().into_owned();
                    }
                }
            }
        }
        // Also move chunk files
        if let Ok(plan) = crate::database::repositories::chunks::list(&connection, &task.id) {
            let temp_path = std::path::Path::new(&task.temp_path);
            if let Some(temp_parent) = temp_path.parent() {
                let temp_parent =
                    crate::download::paths::validate_destructive_path(root, temp_parent)?;
                let cancelados_path = temp_parent.join("cancelados");
                std::fs::create_dir_all(&cancelados_path)
                    .map_err(|error| format!("Falha ao preparar pasta de cancelados: {error}"))?;
                let cancelados_dir =
                    crate::download::paths::canonical_existing_directory(&cancelados_path)?;
                for chunk in plan {
                    let chunk_name = format!(
                        "{}.chunk-{}",
                        temp_path.file_name().unwrap_or_default().to_string_lossy(),
                        chunk.index
                    );
                    let src = temp_parent.join(&chunk_name);
                    if src.exists() {
                        let source = crate::download::paths::validate_destructive_path(root, &src)?;
                        let destination = crate::download::paths::validate_destructive_path(
                            root,
                            &cancelados_dir.join(&chunk_name),
                        )?;
                        let _ = std::fs::rename(source, destination);
                    }
                }
            }
        }
    }

    downloads::update(
        &connection,
        crate::database::models::UpdateDownloadInput {
            id: id.clone(),
            status: crate::database::models::DownloadStatus::Cancelled,
            total_downloaded: if delete_files {
                0
            } else {
                task.total_downloaded
            },
            speed_current: 0.0,
            speed_average: task.speed_average,
            seeds: None,
            peers: None,
            upload_speed: None,
            total_uploaded: None,
        },
    )
    .map_err(|error| format!("Falha ao cancelar o download: {error}"))?;

    // Update temp_path in DB if we moved the .part to cancelados/
    if !delete_files && updated_temp_path != task.temp_path {
        let _ = downloads::update_temp_path(&connection, &id, &updated_temp_path);
    }

    if observed_downloaded > 0 {
        let mut connection = database.connect()?;
        let _ = statistics::record_snapshot(
            &mut connection,
            &task.id,
            &task.file_name,
            observed_downloaded,
            0,
            observed_downloaded,
            task.speed_average,
            "cancelled",
        );
    }

    browser_bridge.remove_headers(&id);

    use tauri::Emitter;
    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "id": id,
            "downloaded": 0,
            "total": null,
            "speed": 0.0,
            "status": "cancelled",
            "error": null
        }),
    );
    let _ = app.emit("download-updated", id);

    Ok(true)
}

#[tauri::command]
pub async fn pause_download(
    app: AppHandle,
    database: State<'_, Database>,
    runtime: State<'_, DownloadRuntime>,
    id: String,
) -> Result<bool, String> {
    if let Ok(conn) = database.connect() {
        if let Ok(Some(task)) = downloads::find(&conn, &id) {
            if task.download_type == "torrent" || task.original_url.starts_with("magnet:") {
                let info_hash = task.info_hash.clone().unwrap_or_default();
                if info_hash.is_empty() {
                    return Err("Torrent sem info_hash registrado.".into());
                }

                // Pausar via librqbit session diretamente no handle (async — sem block_on)
                let manager = crate::download::torrent::get_torrent_manager();
                {
                    let guard = manager.entries().read().await;
                    if let Some(entry) = guard.get(&info_hash) {
                        let session_guard = manager.session().read().await;
                        if let Some(ref session) = *session_guard {
                            let _ = session.pause(&entry.handle).await;
                        }
                    }
                }

                let latest_task = downloads::find(&conn, &id)
                    .ok()
                    .flatten()
                    .unwrap_or(task.clone());
                let paused_downloaded = latest_task.total_downloaded;

                let _ = downloads::update_progress(
                    &conn,
                    &crate::database::models::UpdateDownloadInput {
                        id: id.clone(),
                        status: crate::database::models::DownloadStatus::Paused,
                        total_downloaded: paused_downloaded,
                        speed_current: 0.0,
                        speed_average: latest_task.speed_average,
                        seeds: None,
                        peers: None,
                        upload_speed: None,
                        total_uploaded: None,
                    },
                );
                use tauri::Emitter;
                let _ = app.emit(
                    "download-progress",
                    serde_json::json!({
                        "id": latest_task.id,
                        "downloaded": paused_downloaded,
                        "total": latest_task.file_size,
                        "speed": 0.0,
                        "status": "paused",
                        "error": null
                    }),
                );
                let _ = runtime.pause(&id);
                return Ok(true);
            } else {
                let latest_task = downloads::find(&conn, &id)
                    .ok()
                    .flatten()
                    .unwrap_or(task.clone());
                let paused_downloaded = latest_task.total_downloaded;

                let _ = downloads::update_progress(
                    &conn,
                    &crate::database::models::UpdateDownloadInput {
                        id: id.clone(),
                        status: crate::database::models::DownloadStatus::Paused,
                        total_downloaded: paused_downloaded,
                        speed_current: 0.0,
                        speed_average: latest_task.speed_average,
                        seeds: None,
                        peers: None,
                        upload_speed: None,
                        total_uploaded: None,
                    },
                );
                use tauri::Emitter;
                let _ = app.emit(
                    "download-progress",
                    serde_json::json!({
                        "id": latest_task.id,
                        "downloaded": paused_downloaded,
                        "total": latest_task.file_size,
                        "speed": 0.0,
                        "status": "paused",
                        "error": null
                    }),
                );
                let _ = runtime.pause(&id);
                return Ok(true);
            }
        }
    }
    let _ = runtime.pause(&id);
    Ok(true)
}

#[tauri::command]
pub async fn resume_download(
    app: AppHandle,
    database: State<'_, Database>,
    runtime: State<'_, DownloadRuntime>,
    browser_bridge: State<'_, BrowserBridge>,
    id: String,
) -> Result<DownloadTask, String> {
    resume_owned(
        app,
        database.inner().clone(),
        runtime.inner().clone(),
        browser_bridge.inner().clone(),
        id,
    )
    .await
}

#[tauri::command]
pub async fn replace_download_url(
    database: State<'_, Database>,
    id: String,
    new_url: String,
) -> Result<DownloadTask, String> {
    if new_url.starts_with("magnet:") {
        return Err("Magnet links não podem ser utilizados como URL HTTP.".into());
    }

    let task = downloads::find(&database.connect()?, &id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Download não encontrado.".to_string())?;
    let parsed = Url::parse(&new_url).map_err(|_| DownloadError::InvalidUrl.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(DownloadError::UnsupportedUrlScheme.to_string());
    }
    let response = reqwest::Client::builder()
        .user_agent("SF Downloader/0.1")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| error.to_string())?
        .get(parsed)
        .header(header::RANGE, "bytes=0-4095")
        .header(header::ACCEPT_ENCODING, "identity")
        .send()
        .await
        .map_err(|error| format!("Falha ao validar a nova URL: {error}"))?;
    if response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(format!(
            "A nova URL não suporta retomada por Range (HTTP {}).",
            response.status()
        ));
    }
    let headers = response.headers().clone();
    let total = headers
        .get(header::CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(http_metadata::content_range_total)
        .ok_or_else(|| "A nova URL não informou o tamanho total.".to_string())?;
    if let Some(expected) = task.file_size {
        if expected as u64 != total {
            return Err(format!(
                "Arquivo incompatível: tamanho esperado {expected}, recebido {total}."
            ));
        }
    }
    if let (Some(expected), Some(received)) = (
        &task.etag,
        headers
            .get(header::ETAG)
            .and_then(|value| value.to_str().ok()),
    ) {
        if expected != received {}
    }
    if let (Some(expected), Some(received)) = (
        &task.last_modified,
        headers
            .get(header::LAST_MODIFIED)
            .and_then(|value| value.to_str().ok()),
    ) {
        if expected != received {}
    }
    let remote = response.bytes().await.map_err(|error| error.to_string())?;
    let chunk_zero = format!("{}.chunk-0", task.temp_path);
    let local_path = if Path::new(&chunk_zero).exists() {
        chunk_zero
    } else {
        task.temp_path.clone()
    };
    if let Ok(mut file) = tokio::fs::File::open(local_path).await {
        let mut local = vec![0_u8; remote.len()];
        let read = file
            .read(&mut local)
            .await
            .map_err(|error| error.to_string())?;
        if read > 0 && local[..read] != remote[..read] {
            return Err("Arquivo incompatível: a amostra inicial de bytes é diferente.".into());
        }
    }
    let connection = database.connect()?;
    downloads::replace_url(&connection, &id, &new_url).map_err(|error| error.to_string())?;
    downloads::find(&connection, &id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Download não encontrado após atualizar a URL.".into())
}

pub async fn resume_owned(
    app: AppHandle,
    database: Database,
    runtime: DownloadRuntime,
    browser_bridge: BrowserBridge,
    id: String,
) -> Result<DownloadTask, String> {
    let task = {
        let connection = database.connect()?;
        downloads::find(&connection, &id)
            .map_err(|error| format!("Falha ao localizar o download: {error}"))?
            .ok_or_else(|| "Download não encontrado.".to_string())?
    };
    if task.status == crate::database::models::DownloadStatus::Completed {
        return Err("Este download já foi concluído.".into());
    }

    if task.download_type == "torrent" || task.original_url.starts_with("magnet:") {
        let info_hash = task.info_hash.clone().unwrap_or_default();
        let manager = crate::download::torrent::get_torrent_manager();

        // Se o handle não existe no TorrentManager (ex: após restart do app),
        // re-adicionar o torrent à sessão via magnet link
        let needs_readd = {
            let guard = manager.entries().read().await;
            !guard.contains_key(&info_hash)
        };

        if needs_readd {
            manager
                .restore_task_handle(&task, true)
                .await
                .map_err(|error| format!("Falha ao restaurar o torrent após reiniciar: {error}"))?;
        }

        // A restauração sempre ocorre pausada para que nenhum tráfego comece antes
        // de o controle da tarefa e os limites estarem registrados.
        let guard = manager.entries().read().await;
        if let Some(entry) = guard.get(&info_hash) {
            let session_guard = manager.session().read().await;
            if let Some(ref session) = *session_guard {
                session
                    .unpause(&entry.handle)
                    .await
                    .map_err(|error| format!("Falha ao retomar o torrent: {error}"))?;
            }
        }
        drop(guard);

        if runtime.has(&task.id) {
            for _ in 0..50 {
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                if !runtime.has(&task.id) {
                    break;
                }
            }
        }

        let control = TaskControl::new();
        control.set_speed_limit(task.speed_limit_download).await;
        runtime.register(task.id.clone(), control.clone())?;

        let connection = database.connect()?;
        let _ = downloads::update_progress(
            &connection,
            &crate::database::models::UpdateDownloadInput {
                id: task.id.clone(),
                status: crate::database::models::DownloadStatus::CheckingFiles,
                total_downloaded: task.total_downloaded,
                speed_current: 0.0,
                speed_average: task.speed_average,
                seeds: None,
                peers: None,
                upload_speed: None,
                total_uploaded: None,
            },
        );

        let database_clone = database.clone();
        let spawned_task = task.clone();
        let app_handle = app.clone();
        let runtime_clone = runtime.clone();
        let task_id = task.id.clone();

        tauri::async_runtime::spawn(async move {
            crate::download::torrent::run_torrent(
                app_handle,
                database_clone,
                spawned_task,
                control,
            )
            .await;
            runtime_clone.remove(&task_id);
        });

        let _ =
            windows::open_torrent_progress_window(app.clone(), info_hash, task.id.clone()).await;
        return Ok(task);
    }
    if runtime.has(&task.id) {
        for _ in 0..50 {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            if !runtime.has(&task.id) {
                break;
            }
        }
        if runtime.has(&task.id) {
            runtime.remove(&task.id);
        }
    }
    let _ = windows::open_progress_window(app.clone(), task.id.clone()).await;

    // If the temp file is in cancelados/, move it back to the active .sf-temp/
    let task = {
        let root = Path::new(&task.save_path);
        let temp_path = std::path::Path::new(&task.temp_path);
        if let Some(parent) = temp_path.parent() {
            if parent.file_name().and_then(|n| n.to_str()) == Some("cancelados") {
                if let Some(sf_temp) = parent.parent() {
                    let parent = crate::download::paths::validate_destructive_path(root, parent)?;
                    let sf_temp = crate::download::paths::canonical_existing_directory(sf_temp)?;
                    let active_path = crate::download::paths::validate_destructive_path(
                        root,
                        &sf_temp.join(temp_path.file_name().unwrap_or_default()),
                    )?;
                    if temp_path.exists() {
                        let source =
                            crate::download::paths::validate_destructive_path(root, temp_path)?;
                        if let Ok(()) = std::fs::rename(source, &active_path) {
                            let connection = database.connect()?;
                            let new_temp = active_path.to_string_lossy().into_owned();
                            let _ = downloads::update_temp_path(&connection, &task.id, &new_temp);
                            // Also move chunk files back
                            if let Ok(plan) =
                                crate::database::repositories::chunks::list(&connection, &task.id)
                            {
                                for chunk in &plan {
                                    let chunk_name = format!(
                                        "{}.chunk-{}",
                                        temp_path.file_name().unwrap_or_default().to_string_lossy(),
                                        chunk.index
                                    );
                                    let src = parent.join(&chunk_name);
                                    if src.exists() {
                                        let source =
                                            crate::download::paths::validate_destructive_path(
                                                root, &src,
                                            )?;
                                        let destination =
                                            crate::download::paths::validate_destructive_path(
                                                root,
                                                &sf_temp.join(&chunk_name),
                                            )?;
                                        let _ = std::fs::rename(source, destination);
                                    }
                                }
                            }
                            let mut updated = task;
                            updated.temp_path = new_temp;
                            updated
                        } else {
                            task
                        }
                    } else {
                        task
                    }
                } else {
                    task
                }
            } else {
                task
            }
        } else {
            task
        }
    };

    let mut saved_headers = browser_bridge.load_headers(&task.id);
    saved_headers.remove(header::HOST);
    saved_headers.remove(header::CONTENT_LENGTH);
    saved_headers.remove(header::RANGE);
    saved_headers.remove(header::IF_RANGE);
    let existing_chunks = {
        let connection = database.connect()?;
        crate::database::repositories::chunks::list(&connection, &task.id)
            .map_err(|error| error.to_string())?
    };
    if !existing_chunks.is_empty() {
        let control = TaskControl::new();
        control.set_speed_limit(task.speed_limit_download).await;
        runtime.register(task.id.clone(), control.clone())?;
        let runtime_clone = runtime.clone();
        let database_clone = database.clone();
        let spawned_task = task.clone();
        let connections = task.max_connections.clamp(1, 32) as usize;
        tauri::async_runtime::spawn(async move {
            let id = spawned_task.id.clone();
            let Ok(_permit) = runtime_clone
                .acquire(
                    id.clone(),
                    spawned_task.max_parallel_downloads as usize,
                    spawned_task.priority,
                    spawned_task.queue_order,
                    &control,
                )
                .await
            else {
                runtime_clone.remove(&id);
                return;
            };
            engine::run_segmented(
                app,
                database_clone,
                spawned_task,
                connections,
                control,
                saved_headers,
            )
            .await;
            runtime_clone.remove(&id);
        });
        return Ok(task);
    }
    let offset = if task.supports_range {
        tokio::fs::metadata(&task.temp_path)
            .await
            .ok()
            .and_then(|metadata| i64::try_from(metadata.len()).ok())
            .unwrap_or(0)
    } else {
        0
    };
    if task.file_size.is_some_and(|size| size == offset) && offset > 0 {
        tokio::fs::rename(&task.temp_path, &task.final_path)
            .await
            .map_err(|error| format!("Falha ao finalizar o arquivo parcial completo: {error}"))?;
        let connection = database.connect()?;
        return downloads::update(
            &connection,
            crate::database::models::UpdateDownloadInput {
                id,
                status: crate::database::models::DownloadStatus::Completed,
                total_downloaded: offset,
                speed_current: 0.0,
                speed_average: task.speed_average,
                seeds: None,
                peers: None,
                upload_speed: None,
                total_uploaded: None,
            },
        )
        .map_err(|error| format!("Falha ao finalizar o download: {error}"));
    }
    let (response, actual_offset) = engine::prepare_resume(&task, offset, saved_headers).await?;
    let control = TaskControl::new();
    control.set_speed_limit(task.speed_limit_download).await;
    runtime.register(task.id.clone(), control.clone())?;
    let database = database.clone();
    let runtime = runtime.clone();
    let spawned_task = task.clone();
    let credential_store = browser_bridge.clone();
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
            runtime.remove(&id);
            return;
        };
        engine::run(
            app,
            database.clone(),
            spawned_task,
            response,
            control,
            actual_offset,
        )
        .await;
        runtime.remove(&id);
        if let Ok(connection) = database.connect() {
            if let Ok(Some(current)) = downloads::find(&connection, &id) {
                if matches!(
                    current.status,
                    crate::database::models::DownloadStatus::Completed
                        | crate::database::models::DownloadStatus::Failed
                        | crate::database::models::DownloadStatus::Cancelled
                ) {
                    credential_store.remove_headers(&id);
                }
            }
        }
    });
    Ok(task)
}

pub async fn restore_recovered_torrents(
    database: Database,
    recovered_ids: &[String],
) -> (usize, usize) {
    let manager = crate::download::torrent::get_torrent_manager();
    let mut restored = 0;
    let mut failed = 0;
    let recovered: std::collections::HashSet<&str> =
        recovered_ids.iter().map(String::as_str).collect();
    let tasks = database
        .connect()
        .and_then(|connection| downloads::list(&connection).map_err(|error| error.to_string()))
        .unwrap_or_default();
    for task in tasks {
        if task.download_type != "torrent" && !task.original_url.starts_with("magnet:") {
            continue;
        }
        // Inclui tanto transferências interrompidas nesta inicialização quanto
        // torrents que o próprio usuário já havia deixado pausados.
        if task.status != crate::database::models::DownloadStatus::Paused
            && !recovered.contains(task.id.as_str())
        {
            continue;
        }
        match tokio::time::timeout(
            std::time::Duration::from_secs(45),
            manager.restore_task_handle(&task, true),
        )
        .await
        {
            Ok(Ok(())) => restored += 1,
            Ok(Err(error)) => {
                failed += 1;
                crate::commands::debug::log_warn(
                    "torrent",
                    "Não foi possível restaurar um torrent interrompido.",
                    Some(error),
                    None,
                    Some(task.id.clone()),
                    None,
                );
            }
            Err(_) => {
                failed += 1;
                crate::commands::debug::log_warn(
                    "torrent",
                    "A restauração de um torrent excedeu o tempo limite.",
                    None,
                    None,
                    Some(task.id.clone()),
                    None,
                );
            }
        }
    }
    (restored, failed)
}
