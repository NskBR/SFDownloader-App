use crate::{
    database::{
        models::{DownloadStatus, DownloadTask},
        repositories::downloads,
        Database,
    },
    download::{
        engine::{
            cleanup_partial, record_history, record_metrics, record_usage, run_auto_extraction,
            update_state, DownloadProgress, PERSIST_INTERVAL, UI_UPDATE_INTERVAL,
        },
        runtime::TaskControl,
    },
};
use futures_util::StreamExt;
use reqwest::Response;
use std::{path::Path, time::Instant};
use tauri::{AppHandle, Emitter};
use tokio::{
    fs::{File, OpenOptions},
    io::AsyncWriteExt,
};
pub async fn run(
    app: AppHandle,
    database: Database,
    task: DownloadTask,
    response: Response,
    control: TaskControl,
    offset: i64,
) {
    let started = Instant::now();
    let result = transfer(&app, &database, &task, response, &control, started, offset).await;
    if let Err(error) = result {
        let paused = control.was_paused();
        let cancelled = control.was_cancelled();
        let status = if paused {
            DownloadStatus::Paused
        } else if cancelled {
            DownloadStatus::Cancelled
        } else {
            DownloadStatus::Failed
        };
        let (mut downloaded, average) = database
            .connect()
            .ok()
            .and_then(|connection| downloads::find(&connection, &task.id).ok().flatten())
            .map(|current| (current.total_downloaded, current.speed_average))
            .unwrap_or((0, 0.0));
        downloaded = downloaded.max(
            tokio::fs::metadata(&task.temp_path)
                .await
                .ok()
                .and_then(|metadata| i64::try_from(metadata.len()).ok())
                .unwrap_or(0),
        );
        let observed_downloaded = downloaded;
        if cancelled && control.should_delete_files() {
            cleanup_partial(&database, &task).await;
            downloaded = 0;
        }
        update_state(
            &database,
            &task.id,
            status.clone(),
            downloaded,
            0.0,
            average,
        );
        if !paused {
            record_usage(
                &database,
                &task,
                observed_downloaded,
                0,
                observed_downloaded,
                average,
                status.as_str(),
            );
            record_metrics(
                &database,
                observed_downloaded,
                observed_downloaded,
                0,
                status.as_str(),
                started.elapsed().as_millis() as i64,
            );
            record_history(
                &database,
                &task,
                status.as_str(),
                started.elapsed(),
                average,
            );
        }
        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                id: task.id,
                downloaded,
                total: task.file_size,
                speed: 0.0,
                status,
                error: if paused || cancelled {
                    None
                } else {
                    Some(error)
                },
            },
        );
    }
}

pub(crate) async fn transfer(
    app: &AppHandle,
    database: &Database,
    task: &DownloadTask,
    response: Response,
    control: &TaskControl,
    started: Instant,
    offset: i64,
) -> Result<(), String> {
    let mut file = if offset > 0 {
        OpenOptions::new().append(true).open(&task.temp_path).await
    } else {
        File::create(&task.temp_path).await
    }
    .map_err(|error| format!("Não foi possível abrir o arquivo parcial: {error}"))?;
    let mut stream = response.bytes_stream();
    let mut downloaded = offset;
    let mut last_persist = Instant::now();
    let mut last_ui_update = Instant::now();
    update_state(
        database,
        &task.id,
        DownloadStatus::Downloading,
        offset,
        0.0,
        task.speed_average,
    );
    loop {
        let next = tokio::select! {
            _ = control.cancellation.cancelled() => return Err("Download interrompido pelo usuário.".into()),
            next = stream.next() => next,
        };
        let Some(chunk) = next else { break };
        let bytes = chunk.map_err(|error| format!("Falha durante a transferência: {error}"))?;
        file.write_all(&bytes)
            .await
            .map_err(|error| format!("Falha ao gravar o arquivo: {error}"))?;
        control.throttle(bytes.len()).await;
        downloaded += i64::try_from(bytes.len()).unwrap_or(0);
        let elapsed = started.elapsed().as_secs_f64().max(0.001);
        let speed = (downloaded - offset) as f64 / elapsed;
        if last_persist.elapsed() >= PERSIST_INTERVAL {
            update_state(
                database,
                &task.id,
                DownloadStatus::Downloading,
                downloaded,
                speed,
                speed,
            );
            last_persist = Instant::now();
        }
        if last_ui_update.elapsed() >= UI_UPDATE_INTERVAL {
            let _ = app.emit(
                "download-progress",
                DownloadProgress {
                    id: task.id.clone(),
                    downloaded,
                    total: task.file_size,
                    speed,
                    status: DownloadStatus::Downloading,
                    error: None,
                },
            );
            last_ui_update = Instant::now();
        }
    }
    update_state(
        database,
        &task.id,
        DownloadStatus::Assembling,
        downloaded,
        0.0,
        task.speed_average,
    );
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            id: task.id.clone(),
            downloaded,
            total: task.file_size.or(Some(downloaded)),
            speed: 0.0,
            status: DownloadStatus::Assembling,
            error: None,
        },
    );
    file.flush()
        .await
        .map_err(|error| format!("Falha ao finalizar o arquivo: {error}"))?;
    drop(file);
    let root = Path::new(&task.save_path);
    let temp_path =
        crate::download::paths::validate_destructive_path(root, Path::new(&task.temp_path))?;
    let final_path =
        crate::download::paths::validate_destructive_path(root, Path::new(&task.final_path))?;
    tokio::fs::rename(&temp_path, &final_path)
        .await
        .map_err(|error| format!("Falha ao mover o arquivo concluído: {error}"))?;
    let (disk_read, extracted_written) =
        run_auto_extraction(app, database, task, task.delete_archive_after_extract).await;
    // Attempt to remove the temporary .sf-temp folder if it's empty
    if let Some(temp_folder) = Path::new(&task.temp_path).parent() {
        if let Ok(path) = crate::download::paths::validate_destructive_path(root, temp_folder) {
            let _ = tokio::fs::remove_dir(path).await;
        }
    }
    let elapsed = started.elapsed();
    let average = (downloaded - offset) as f64 / elapsed.as_secs_f64().max(0.001);
    update_state(
        database,
        &task.id,
        DownloadStatus::Completed,
        downloaded,
        0.0,
        average,
    );
    record_usage(
        database,
        task,
        downloaded,
        disk_read,
        downloaded.saturating_add(extracted_written),
        average,
        "completed",
    );
    record_metrics(
        database,
        downloaded,
        downloaded.saturating_add(extracted_written),
        extracted_written,
        "completed",
        elapsed.as_millis() as i64,
    );
    record_history(database, task, "completed", elapsed, average);
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            id: task.id.clone(),
            downloaded,
            total: task.file_size.or(Some(downloaded)),
            speed: 0.0,
            status: DownloadStatus::Completed,
            error: None,
        },
    );
    let progress_label = format!("download-progress-{}", task.id);
    if let Some(window) = tauri::Manager::get_webview_window(app, &progress_label) {
        let _ = window.close();
    }
    let _ = crate::commands::windows::open_complete_window(app.clone(), task.id.clone()).await;
    Ok(())
}
