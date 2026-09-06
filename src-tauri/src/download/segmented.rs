use crate::{
    database::{
        models::{DownloadStatus, DownloadTask},
        repositories::chunks,
        Database,
    },
    download::{
        engine::{
            cleanup_partial, record_history, record_metrics, record_usage, transfer_segmented,
            update_state, DownloadProgress,
        },
        runtime::TaskControl,
    },
};
use reqwest::header::HeaderMap;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
pub async fn run_segmented(
    app: AppHandle,
    database: Database,
    task: DownloadTask,
    max_connections: usize,
    control: TaskControl,
    request_headers: HeaderMap,
) {
    let started = Instant::now();
    if let Err(error) = transfer_segmented(
        &app,
        &database,
        &task,
        max_connections,
        &control,
        started,
        request_headers,
    )
    .await
    {
        let paused = control.was_paused();
        let cancelled = control.was_cancelled();
        let status = if paused {
            DownloadStatus::Paused
        } else if cancelled {
            DownloadStatus::Cancelled
        } else {
            DownloadStatus::Failed
        };
        let mut downloaded = database
            .connect()
            .ok()
            .and_then(|connection| chunks::list(&connection, &task.id).ok())
            .map(|items| items.iter().map(|chunk| chunk.downloaded_bytes).sum())
            .unwrap_or(0);
        let observed_downloaded = downloaded;
        if cancelled && control.should_delete_files() {
            cleanup_partial(&database, &task).await;
            downloaded = 0;
        }
        update_state(&database, &task.id, status.clone(), downloaded, 0.0, 0.0);
        if !paused {
            record_usage(
                &database,
                &task,
                observed_downloaded,
                0,
                observed_downloaded,
                0.0,
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
            record_history(&database, &task, status.as_str(), started.elapsed(), 0.0);
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
