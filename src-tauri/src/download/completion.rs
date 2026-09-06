use crate::{
    database::{
        models::{DownloadStatus, DownloadTask, UpdateDownloadInput},
        repositories::{
            downloads,
            history::{self, CreateHistory},
            metrics, statistics,
        },
        Database,
    },
    download::engine::DownloadProgress,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
pub(crate) async fn run_auto_extraction(
    app: &AppHandle,
    database: &Database,
    task: &DownloadTask,
    delete_archive: bool,
) -> (i64, i64) {
    let Some(password) = crate::download::extraction::take(&task.id) else {
        return (0, 0);
    };
    update_state(
        database,
        &task.id,
        DownloadStatus::Extracting,
        task.file_size.unwrap_or(task.total_downloaded),
        0.0,
        task.speed_average,
    );
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            id: task.id.clone(),
            downloaded: task.file_size.unwrap_or(task.total_downloaded),
            total: task.file_size,
            speed: 0.0,
            status: DownloadStatus::Extracting,
            error: None,
        },
    );
    let extraction_result =
        crate::download::extraction::extract_archive(task.final_path.clone(), password).await;
    let result = match &extraction_result {
        Ok(path) => {
            if delete_archive {
                if let Ok(path) = crate::download::paths::validate_destructive_path(
                    std::path::Path::new(&task.save_path),
                    std::path::Path::new(&task.final_path),
                ) {
                    let _ = tokio::fs::remove_file(path).await;
                }
            }
            format!("Extração concluída em {}", path.display())
        }
        Err(error) => format!("Erro na extração: {error}"),
    };
    crate::download::extraction::save_result(&task.id, result);
    let disk_read = tokio::fs::metadata(&task.final_path)
        .await
        .ok()
        .and_then(|metadata| i64::try_from(metadata.len()).ok())
        .unwrap_or(0);
    let extracted_written = i64::try_from(crate::download::extraction::take_extracted_size(
        &task.final_path,
    ))
    .unwrap_or(i64::MAX);
    (disk_read, extracted_written)
}

pub(crate) fn record_usage(
    database: &Database,
    task: &DownloadTask,
    network_bytes: i64,
    disk_read_bytes: i64,
    disk_written_bytes: i64,
    average_speed: f64,
    status: &str,
) {
    if let Ok(mut connection) = database.connect() {
        let _ = statistics::record_snapshot(
            &mut connection,
            &task.id,
            &task.file_name,
            network_bytes,
            disk_read_bytes,
            disk_written_bytes,
            average_speed,
            status,
        );
    }
}

pub(crate) fn update_state(
    database: &Database,
    id: &str,
    status: DownloadStatus,
    downloaded: i64,
    current: f64,
    average: f64,
) {
    if let Ok(connection) = database.connect() {
        let _ = downloads::update_progress(
            &connection,
            &UpdateDownloadInput {
                id: id.to_owned(),
                status,
                total_downloaded: downloaded,
                speed_current: current,
                speed_average: average,
                seeds: None,
                peers: None,
                upload_speed: None,
                total_uploaded: None,
            },
        );
    }
}

pub(crate) fn record_metrics(
    database: &Database,
    network_bytes: i64,
    disk_written_bytes: i64,
    extracted_bytes: i64,
    status: &str,
    duration_ms: i64,
) {
    if let Ok(connection) = database.connect() {
        let _ = metrics::record(
            &connection,
            network_bytes,
            disk_written_bytes,
            extracted_bytes,
            status,
            duration_ms,
        );
    }
}

pub(crate) fn record_history(
    database: &Database,
    task: &DownloadTask,
    status: &str,
    duration: Duration,
    average: f64,
) {
    if let Ok(connection) = database.connect() {
        let _ = history::create(
            &connection,
            CreateHistory {
                file_name: &task.file_name,
                file_size: task.file_size,
                status,
                source_url: &task.original_url,
                path: &task.final_path,
                duration_seconds: duration.as_secs() as i64,
                average_speed: average,
            },
        );
    }
}
