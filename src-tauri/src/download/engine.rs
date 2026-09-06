use crate::database::{
    models::{DownloadStatus, DownloadTask, UpdateDownloadInput},
    repositories::{chunks, downloads},
    Database,
};
use crate::download::retry::{retry_delay, AdaptiveThrottle, MAX_CHUNK_ATTEMPTS};
use crate::download::runtime::TaskControl;
use futures_util::StreamExt;
use reqwest::{header, header::HeaderMap, Client, Response};
use serde::Serialize;
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicI64, AtomicU64, Ordering},
        Arc, Mutex as StdMutex,
    },
    time::{Duration, Instant},
};

pub(crate) const UI_UPDATE_INTERVAL: Duration = Duration::from_millis(200);
pub(crate) const PERSIST_INTERVAL: Duration = Duration::from_secs(1);
const CHUNK_PERSIST_INTERVAL: Duration = Duration::from_secs(2);

fn claim_interval(gate: &AtomicU64, elapsed: Duration, interval: Duration) -> bool {
    let now = elapsed.as_millis().min(u64::MAX as u128) as u64;
    let interval = interval.as_millis().min(u64::MAX as u128) as u64;
    let mut previous = gate.load(Ordering::Relaxed);
    loop {
        if now.saturating_sub(previous) < interval {
            return false;
        }
        match gate.compare_exchange_weak(previous, now, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => return true,
            Err(current) => previous = current,
        }
    }
}

use tauri::{AppHandle, Emitter};
use tokio::{
    fs::{File, OpenOptions},
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
    sync::Mutex as AsyncMutex,
};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub downloaded: i64,
    pub total: Option<i64>,
    pub speed: f64,
    pub status: DownloadStatus,
    pub error: Option<String>,
}

pub use crate::download::preparation::{prepare_with_headers, DEFAULT_USER_AGENT};
pub use crate::download::segmented::run_segmented;
pub use crate::download::simple::run;

pub async fn prepare_resume(
    task: &DownloadTask,
    offset: i64,
    request_headers: HeaderMap,
) -> Result<(Response, i64), String> {
    if task.download_type == "torrent" || task.original_url.starts_with("magnet:") {
        crate::commands::debug::log_warn(
            "download",
            "Um torrent foi encaminhado indevidamente ao cliente HTTP e foi bloqueado.",
            None,
            None,
            Some(task.id.clone()),
            None,
        );
        return Err("Torrents não utilizam cliente HTTP.".into());
    }

    if offset < 0 || task.file_size.is_some_and(|size| offset > size) {
        return Err("O arquivo parcial possui um tamanho incompatível.".into());
    }
    let client = Client::builder()
        .user_agent(DEFAULT_USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| format!("Falha ao preparar conexão: {error}"))?;
    let mut request = client
        .get(&task.current_url)
        .headers(request_headers.clone());
    if offset > 0 {
        request = request.header(header::RANGE, format!("bytes={offset}-"));
    }
    let mut response = request
        .send()
        .await
        .map_err(|error| format!("Falha ao reconectar: {error}"))?;

    if offset > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        response = client
            .get(&task.current_url)
            .headers(minimal_range_headers(&request_headers))
            .header(header::RANGE, format!("bytes={offset}-"))
            .send()
            .await
            .map_err(|error| format!("Falha ao repetir a retomada: {error}"))?;
    }

    if offset > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(format!(
            "O servidor recusou a retomada por HTTP Range (HTTP {}). O arquivo parcial foi preservado.",
            response.status()
        ));
    }
    if offset > 0 {
        validate_content_range(&response, offset, task.file_size, None)?;
    } else if !response.status().is_success() {
        return Err(format!(
            "O servidor respondeu com HTTP {}.",
            response.status()
        ));
    }
    if let (Some(expected), Some(received)) = (
        &task.etag,
        response
            .headers()
            .get(header::ETAG)
            .and_then(|value| value.to_str().ok()),
    ) {
        if expected != received {
            return Err("O ETag mudou; a retomada foi bloqueada para evitar corrupção.".into());
        }
    }
    // CDNs e links assinados frequentemente recalculam Last-Modified entre
    // requisições. O valor é apenas informativo; a segurança da retomada vem
    // de ETag forte (quando estável), Content-Range e tamanho total.
    Ok((response, offset))
}

pub(crate) async fn cleanup_partial(database: &Database, task: &DownloadTask) {
    let root = Path::new(&task.save_path);
    if let Ok(path) =
        crate::download::paths::validate_destructive_path(root, Path::new(&task.temp_path))
    {
        let _ = tokio::fs::remove_file(path).await;
    }
    if let Ok(connection) = database.connect() {
        if let Ok(plan) = chunks::list(&connection, &task.id) {
            for chunk in plan {
                let chunk = chunk_path(&task.temp_path, chunk.index);
                if let Ok(path) = crate::download::paths::validate_destructive_path(root, &chunk) {
                    let _ = tokio::fs::remove_file(path).await;
                }
            }
        }
    }
}

pub(crate) async fn transfer_segmented(
    app: &AppHandle,
    database: &Database,
    task: &DownloadTask,
    max_connections: usize,
    control: &TaskControl,
    started: Instant,
    request_headers: HeaderMap,
) -> Result<(), String> {
    let total = task
        .file_size
        .ok_or_else(|| "Download segmentado exige tamanho conhecido.".to_string())?;
    update_state(
        database,
        &task.id,
        DownloadStatus::CheckingFiles,
        task.total_downloaded,
        0.0,
        task.speed_average,
    );
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            id: task.id.clone(),
            downloaded: task.total_downloaded,
            total: task.file_size,
            speed: 0.0,
            status: DownloadStatus::CheckingFiles,
            error: None,
        },
    );
    let part_existed = tokio::fs::metadata(&task.temp_path).await.is_ok();
    let mut part = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&task.temp_path)
        .await
        .map_err(|error| format!("Não foi possível criar o arquivo parcial: {error}"))?;
    part.set_len(total as u64)
        .await
        .map_err(|error| format!("Não foi possível reservar espaço para o arquivo: {error}"))?;

    let mut connection = database.connect()?;
    let mut plan = chunks::list(&connection, &task.id).map_err(|error| error.to_string())?;
    if plan.is_empty() {
        let count = adaptive_chunk_count(total, max_connections);
        plan = chunks::create_plan(&mut connection, &task.id, total, count)
            .map_err(|error| error.to_string())?;
    } else {
        chunks::reset_active(&connection, &task.id).map_err(|error| error.to_string())?;
    }
    let mut initial = 0_i64;
    let mut migrated_paths = Vec::new();
    for chunk in &mut plan {
        let legacy_path = chunk_path(&task.temp_path, chunk.index);
        let legacy_size = tokio::fs::metadata(&legacy_path)
            .await
            .ok()
            .and_then(|metadata| i64::try_from(metadata.len()).ok())
            .unwrap_or(0);
        let length = chunk.end_byte - chunk.start_byte + 1;
        let actual = if legacy_size > 0 {
            let actual = legacy_size.min(length);
            migrate_legacy_chunk(&mut part, &legacy_path, chunk.start_byte, actual).await?;
            migrated_paths.push(legacy_path);
            actual
        } else if part_existed {
            chunk.downloaded_bytes.clamp(0, length)
        } else {
            0
        };
        chunk.downloaded_bytes = actual;
        initial += actual;
        chunks::update_progress(
            &connection,
            &chunk.id,
            actual,
            if actual == chunk.end_byte - chunk.start_byte + 1 {
                "done"
            } else {
                "pending"
            },
        )
        .map_err(|error| error.to_string())?;
    }
    part.flush().await.map_err(|error| error.to_string())?;
    part.sync_data().await.map_err(|error| error.to_string())?;
    drop(part);
    for path in migrated_paths {
        if let Ok(path) =
            crate::download::paths::validate_destructive_path(Path::new(&task.save_path), &path)
        {
            let _ = tokio::fs::remove_file(path).await;
        }
    }
    drop(connection);
    update_state(
        database,
        &task.id,
        DownloadStatus::Downloading,
        initial,
        0.0,
        task.speed_average,
    );
    let downloaded = Arc::new(AtomicI64::new(initial));
    let client = Client::builder()
        .user_agent(DEFAULT_USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(10))
        .pool_max_idle_per_host(max_connections)
        .tcp_nodelay(true)
        .build()
        .map_err(|error| error.to_string())?;
    let mut workers = Vec::new();
    let throttle = AdaptiveThrottle::new(max_connections);
    let pending: VecDeque<_> = plan
        .clone()
        .into_iter()
        .filter(|chunk| chunk.downloaded_bytes < chunk.end_byte - chunk.start_byte + 1)
        .collect();
    let worker_count = max_connections.clamp(1, 32).min(pending.len().max(1));
    let queue = Arc::new(AsyncMutex::new(pending));
    let first_error = Arc::new(StdMutex::new(None::<String>));
    let progress_gate = Arc::new(AtomicU64::new(0));
    let persist_gate = Arc::new(AtomicU64::new(0));
    for _ in 0..worker_count {
        let (client, database, task, control, app, downloaded, throttle, request_headers) = (
            client.clone(),
            database.clone(),
            task.clone(),
            control.clone(),
            app.clone(),
            downloaded.clone(),
            throttle.clone(),
            request_headers.clone(),
        );
        let queue = queue.clone();
        let first_error = first_error.clone();
        let progress_gate = progress_gate.clone();
        let persist_gate = persist_gate.clone();
        workers.push(tauri::async_runtime::spawn(async move {
            loop {
                if control.cancellation.is_cancelled() {
                    break;
                }
                let Some(chunk) = queue.lock().await.pop_front() else {
                    break;
                };
                if let Err(error) = download_piece(
                    client.clone(),
                    database.clone(),
                    task.clone(),
                    chunk,
                    control.clone(),
                    app.clone(),
                    downloaded.clone(),
                    started,
                    request_headers.clone(),
                    throttle.clone(),
                    initial,
                    progress_gate.clone(),
                    persist_gate.clone(),
                )
                .await
                {
                    if !control.was_paused() && !control.was_cancelled() {
                        if let Ok(mut first) = first_error.lock() {
                            if first.is_none() {
                                *first = Some(error);
                            }
                        }
                    }
                    break;
                }
            }
        }));
    }
    for worker in workers {
        if let Err(error) = worker.await {
            if let Ok(mut first) = first_error.lock() {
                if first.is_none() {
                    *first = Some(format!("Worker encerrado: {error}"));
                }
            }
        }
    }
    let failure = first_error.lock().ok().and_then(|mut error| error.take());
    if let Some(error) = failure {
        if error.contains("recusou HTTP Range")
            && downloaded.load(Ordering::SeqCst) == 0
            && !control.was_cancelled()
            && !control.was_paused()
        {
            let response = client
                .get(&task.current_url)
                .headers(minimal_range_headers(&request_headers))
                .send()
                .await
                .map_err(|fallback| {
                    format!("Range recusado e o download simples falhou: {fallback}")
                })?;
            if !response.status().is_success() {
                return Err(format!(
                    "Range recusado e o servidor também recusou o download simples (HTTP {}).",
                    response.status()
                ));
            }
            if let Ok(connection) = database.connect() {
                let _ = chunks::delete_plan(&connection, &task.id);
            }
            let fallback_control = TaskControl::new();
            fallback_control
                .set_speed_limit(task.speed_limit_download)
                .await;
            return crate::download::simple::transfer(
                app,
                database,
                task,
                response,
                &fallback_control,
                started,
                0,
            )
            .await;
        }
        return Err(error);
    }
    if control.was_cancelled() {
        return Err("Download cancelado pelo usuário.".into());
    }
    if control.was_paused() {
        return Err("Download pausado.".into());
    }
    update_state(
        database,
        &task.id,
        DownloadStatus::Assembling,
        total,
        0.0,
        task.speed_average,
    );
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            id: task.id.clone(),
            downloaded: total,
            total: Some(total),
            speed: 0.0,
            status: DownloadStatus::Assembling,
            error: None,
        },
    );
    let plan = {
        let connection = database.connect()?;
        chunks::list(&connection, &task.id).map_err(|error| error.to_string())?
    };
    if plan.iter().any(|chunk| {
        chunk.downloaded_bytes != chunk.end_byte - chunk.start_byte + 1 || chunk.status != "done"
    }) {
        return Err(
            "Nem todas as partes foram concluídas; o arquivo parcial foi preservado.".into(),
        );
    }
    let output = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&task.temp_path)
        .await
        .map_err(|error| error.to_string())?;
    output.sync_all().await.map_err(|error| error.to_string())?;
    drop(output);
    let root = Path::new(&task.save_path);
    let temp_path =
        crate::download::paths::validate_destructive_path(root, Path::new(&task.temp_path))?;
    let final_path =
        crate::download::paths::validate_destructive_path(root, Path::new(&task.final_path))?;
    tokio::fs::rename(&temp_path, &final_path)
        .await
        .map_err(|error| error.to_string())?;
    let (disk_read, extracted_written) =
        run_auto_extraction(app, database, task, task.delete_archive_after_extract).await;
    for chunk in &plan {
        let chunk = chunk_path(&task.temp_path, chunk.index);
        if let Ok(path) = crate::download::paths::validate_destructive_path(root, &chunk) {
            let _ = tokio::fs::remove_file(path).await;
        }
    }
    // Attempt to remove the temporary .sf-temp folder if it's empty
    if let Some(temp_folder) = Path::new(&task.temp_path).parent() {
        if let Ok(path) = crate::download::paths::validate_destructive_path(root, temp_folder) {
            let _ = tokio::fs::remove_dir(path).await;
        }
    }
    let elapsed = started.elapsed();
    let speed = (total - initial).max(0) as f64 / elapsed.as_secs_f64().max(0.001);
    update_state(
        database,
        &task.id,
        DownloadStatus::Completed,
        total,
        0.0,
        speed,
    );
    record_usage(
        database,
        task,
        total,
        disk_read,
        total.saturating_add(extracted_written),
        speed,
        "completed",
    );
    record_metrics(
        database,
        total,
        total.saturating_add(extracted_written),
        extracted_written,
        "completed",
        elapsed.as_millis() as i64,
    );
    record_history(database, task, "completed", elapsed, speed);
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            id: task.id.clone(),
            downloaded: total,
            total: Some(total),
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

#[allow(clippy::too_many_arguments)]
async fn download_piece(
    client: Client,
    database: Database,
    task: DownloadTask,
    mut chunk: crate::database::models::DownloadChunk,
    control: TaskControl,
    app: AppHandle,
    total_downloaded: Arc<AtomicI64>,
    started: Instant,
    request_headers: HeaderMap,
    throttle: AdaptiveThrottle,
    session_offset: i64,
    progress_gate: Arc<AtomicU64>,
    persist_gate: Arc<AtomicU64>,
) -> Result<(), String> {
    let length = chunk.end_byte - chunk.start_byte + 1;
    for attempt in 0..MAX_CHUNK_ATTEMPTS {
        if control.cancellation.is_cancelled() {
            return Err("Download interrompido pelo usuário.".into());
        }
        let start = chunk.start_byte + chunk.downloaded_bytes;
        let headers = if attempt == 0 {
            request_headers.clone()
        } else {
            minimal_range_headers(&request_headers)
        };
        let request = client
            .get(&task.current_url)
            .headers(headers)
            .header(header::ACCEPT_ENCODING, "identity")
            .header(header::RANGE, format!("bytes={start}-{}", chunk.end_byte));
        throttle.wait().await;
        let _single_connection = if attempt > 0 {
            Some(throttle.fallback_lock.lock().await)
        } else {
            None
        };
        let permit = throttle
            .permits
            .acquire()
            .await
            .map_err(|error| error.to_string())?;
        let response = match request.send().await {
            Ok(response) => response,
            Err(error) => {
                drop(permit);
                if attempt + 1 == MAX_CHUNK_ATTEMPTS {
                    return Err(error.to_string());
                }
                tokio::time::sleep(retry_delay(None, attempt, chunk.index)).await;
                continue;
            }
        };
        let status = response.status();
        if matches!(status.as_u16(), 408 | 429 | 500 | 502 | 503 | 504) {
            let delay = retry_delay(Some(&response), attempt, chunk.index);
            drop(permit);
            if matches!(status.as_u16(), 429 | 503) {
                throttle.limit(delay);
            }
            if attempt + 1 == MAX_CHUNK_ATTEMPTS {
                return Err(format!(
                    "Servidor indisponível após {MAX_CHUNK_ATTEMPTS} tentativas (HTTP {status})."
                ));
            }
            tokio::time::sleep(delay).await;
            continue;
        }
        if status != reqwest::StatusCode::PARTIAL_CONTENT {
            drop(permit);
            if attempt < 2 {
                throttle.limit(Duration::from_millis(500));
                tokio::time::sleep(retry_delay(None, attempt, chunk.index)).await;
                continue;
            }
            return Err(format!(
                "Servidor recusou HTTP Range ({status}) mesmo após tentativas com headers mínimos e menos conexões."
            ));
        }
        let response_length =
            validate_content_range(&response, start, task.file_size, Some(chunk.end_byte))?;
        validate_remote_identity(&response, &task)?;
        let result = async {
            let mut file = OpenOptions::new().write(true).open(&task.temp_path).await.map_err(|error| error.to_string())?;
            file.seek(std::io::SeekFrom::Start(start as u64)).await.map_err(|error| error.to_string())?;
            let mut stream = response.bytes_stream(); let mut last_save = Instant::now(); let mut response_downloaded = 0_i64;
            while let Some(next) = tokio::select! { _ = control.cancellation.cancelled() => return Err("Download interrompido pelo usuário.".into()), value = stream.next() => value } {
                let data = next.map_err(|error| error.to_string())?; let remaining = (length - chunk.downloaded_bytes).min(response_length-response_downloaded).max(0) as usize;
                if data.len() > remaining { return Err("O servidor enviou mais bytes do que declarou no Content-Range.".into()); }
                let slice = &data[..];
                file.write_all(slice).await.map_err(|error| error.to_string())?; chunk.downloaded_bytes += slice.len() as i64; response_downloaded += slice.len() as i64;
                control.throttle(slice.len()).await;
                let aggregate = total_downloaded.fetch_add(slice.len() as i64, Ordering::Relaxed) + slice.len() as i64;
                let elapsed = started.elapsed();
                if claim_interval(&progress_gate, elapsed, UI_UPDATE_INTERVAL) {
                    let speed = (aggregate - session_offset).max(0) as f64 / elapsed.as_secs_f64().max(0.001);
                    let _ = app.emit("download-progress", DownloadProgress { id: task.id.clone(), downloaded: aggregate, total: task.file_size, speed, status: DownloadStatus::Downloading, error: None });
                }
                if last_save.elapsed() >= CHUNK_PERSIST_INTERVAL {
                    let speed = (aggregate - session_offset).max(0) as f64
                        / elapsed.as_secs_f64().max(0.001);
                    if let Ok(connection) = database.connect() {
                        let _ = chunks::update_progress(
                            &connection,
                            &chunk.id,
                            chunk.downloaded_bytes,
                            "downloading",
                        );
                        if claim_interval(&persist_gate, elapsed, PERSIST_INTERVAL) {
                            let _ = downloads::update_progress(
                                &connection,
                                &UpdateDownloadInput {
                                    id: task.id.clone(),
                                    status: DownloadStatus::Downloading,
                                    total_downloaded: aggregate,
                                    speed_current: speed,
                                    speed_average: speed,
                                    seeds: None,
                                    peers: None,
                                    upload_speed: None,
                                    total_uploaded: None,
                                },
                            );
                        }
                    }
                    last_save = Instant::now();
                }
                if chunk.downloaded_bytes >= length { break; }
            }
            file.flush().await.map_err(|error| error.to_string())?;
            if response_downloaded != response_length { return Err(format!("Resposta parcial incompleta: esperado {response_length}, recebido {response_downloaded}.")); }
            if chunk.downloaded_bytes != length { return Err("Resposta terminou antes do fim da faixa.".into()); }
            if let Ok(connection) = database.connect() { chunks::update_progress(&connection, &chunk.id, chunk.downloaded_bytes, "done").map_err(|error| error.to_string())?; }
            Ok(())
        }.await;
        drop(permit);
        if control.cancellation.is_cancelled() {
            if let Ok(connection) = database.connect() {
                let _ = chunks::update_progress(
                    &connection,
                    &chunk.id,
                    chunk.downloaded_bytes,
                    "pending",
                );
            }
            return result;
        }
        if result.is_ok() {
            return result;
        }
        if attempt + 1 < MAX_CHUNK_ATTEMPTS {
            tokio::time::sleep(retry_delay(None, attempt, chunk.index)).await;
        } else {
            return result;
        }
    }
    unreachable!()
}

fn adaptive_chunk_count(total: i64, connections: usize) -> usize {
    const MIB: i64 = 1024 * 1024;
    let target = match total {
        value if value <= 64 * MIB => 2 * MIB,
        value if value <= 1024 * MIB => 8 * MIB,
        value if value <= 8 * 1024 * MIB => 32 * MIB,
        _ => 64 * MIB,
    };
    let connections = connections.clamp(1, 32);
    let natural = ((total + target - 1) / target) as usize;
    let maximum_by_size = ((total + MIB - 1) / MIB) as usize;
    natural
        .max(connections * 4)
        .min(connections * 16)
        .min(maximum_by_size)
        .max(2)
}

fn parse_content_range(value: &str) -> Option<(i64, i64, i64)> {
    let range = value.trim().strip_prefix("bytes ")?;
    let (bounds, total) = range.split_once('/')?;
    let (start, end) = bounds.split_once('-')?;
    let (start, end, total) = (start.parse().ok()?, end.parse().ok()?, total.parse().ok()?);
    (start >= 0 && end >= start && total > end).then_some((start, end, total))
}

fn validate_content_range(
    response: &Response,
    expected_start: i64,
    expected_total: Option<i64>,
    requested_end: Option<i64>,
) -> Result<i64, String> {
    let raw = response
        .headers()
        .get(header::CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "Resposta 206 sem Content-Range.".to_string())?;
    let (start, end, total) =
        parse_content_range(raw).ok_or_else(|| format!("Content-Range inválido: {raw}"))?;
    if start != expected_start {
        return Err(format!(
            "Faixa incorreta: solicitado início {expected_start}, servidor respondeu {start}."
        ));
    }
    if requested_end.is_some_and(|requested| end > requested) {
        return Err(format!("Faixa excedeu o limite solicitado: {end}."));
    }
    if let Some(expected) = expected_total {
        if total != expected {
            return Err(format!(
                "Tamanho remoto mudou: esperado {expected}, recebido {total}."
            ));
        }
    }
    let length = end - start + 1;
    if response
        .content_length()
        .is_some_and(|received| received != length as u64)
    {
        return Err(format!(
            "Content-Length incompatível com Content-Range: esperado {length}."
        ));
    }
    Ok(length)
}

fn validate_remote_identity(response: &Response, task: &DownloadTask) -> Result<(), String> {
    if let (Some(expected), Some(received)) = (
        &task.etag,
        response
            .headers()
            .get(header::ETAG)
            .and_then(|value| value.to_str().ok()),
    ) {
        if expected != received {
            return Err("O ETag mudou durante o download.".into());
        }
    }
    // Last-Modified não é um identificador confiável em CDNs; não interrompe
    // chunks válidos que já passaram pelas verificações de Content-Range.
    Ok(())
}

fn chunk_path(temp_path: &str, index: i64) -> PathBuf {
    PathBuf::from(format!("{temp_path}.chunk-{index}"))
}

fn minimal_range_headers(original: &HeaderMap) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for name in [
        header::AUTHORIZATION,
        header::COOKIE,
        header::REFERER,
        header::ORIGIN,
        header::USER_AGENT,
        header::ACCEPT,
        header::ACCEPT_LANGUAGE,
    ] {
        if let Some(value) = original.get(&name) {
            headers.insert(name, value.clone());
        }
    }
    headers.insert(
        header::ACCEPT_ENCODING,
        header::HeaderValue::from_static("identity"),
    );
    headers
}

async fn migrate_legacy_chunk(
    part: &mut File,
    legacy_path: &Path,
    offset: i64,
    length: i64,
) -> Result<(), String> {
    let legacy = File::open(legacy_path)
        .await
        .map_err(|error| format!("Falha ao abrir parte antiga: {error}"))?;
    part.seek(std::io::SeekFrom::Start(offset as u64))
        .await
        .map_err(|error| error.to_string())?;
    let copied = tokio::io::copy(&mut legacy.take(length as u64), part)
        .await
        .map_err(|error| format!("Falha ao migrar parte antiga: {error}"))?;
    if copied != length as u64 {
        return Err("Uma parte antiga terminou antes do tamanho registrado.".into());
    }
    Ok(())
}

pub(crate) use crate::download::completion::{
    record_history, record_metrics, record_usage, run_auto_extraction, update_state,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::download::paths::{category_for_extension, safe_file_name};
    use axum::{
        http::{header as axum_header, HeaderValue, StatusCode},
        response::{IntoResponse, Redirect},
        routing::get,
        Router,
    };
    use tokio::{
        io::AsyncWriteExt,
        net::TcpListener,
        task::JoinHandle,
        time::{sleep, Duration},
    };
    const TEST_PAYLOAD: &[u8] = b"download-engine-integration-payload";
    const RANGE_PROBE_SIZE: usize = 2 * 1024 * 1024;

    async fn spawn_test_server(router: Router) -> (String, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        (format!("http://{address}"), server)
    }

    async fn spawn_disconnect_server() -> (String, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 64\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=truncated.bin\r\n\r\npartial-body").await.unwrap();
            socket.shutdown().await.unwrap();
            sleep(Duration::from_millis(100)).await;
        });
        (format!("http://{address}"), server)
    }

    fn temporary_download_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sf-downloader-engine-test-{}",
            uuid::Uuid::new_v4()
        ))
    }

    async fn inspect_local_download(
        url: &str,
        root: &Path,
    ) -> Result<crate::download::preparation::PreparedDownload, String> {
        prepare_with_headers(
            Vec::new(),
            url,
            &root.to_string_lossy(),
            false,
            None,
            HeaderMap::new(),
            4,
            2,
            0,
            true,
            false,
        )
        .await
    }
    async fn downloadable_file() -> impl IntoResponse {
        (
            [
                (
                    axum_header::CONTENT_DISPOSITION,
                    HeaderValue::from_static(
                        "attachment; filename*=UTF-8''relat%C3%B3rio-final.pdf",
                    ),
                ),
                (
                    axum_header::CONTENT_TYPE,
                    HeaderValue::from_static("application/pdf"),
                ),
                (
                    axum_header::ACCEPT_RANGES,
                    HeaderValue::from_static("bytes"),
                ),
                (
                    axum_header::ETAG,
                    HeaderValue::from_static("\"local-etag\""),
                ),
                (
                    axum_header::LAST_MODIFIED,
                    HeaderValue::from_static("Wed, 21 Oct 2015 07:28:00 GMT"),
                ),
            ],
            TEST_PAYLOAD,
        )
    }

    async fn slow_download() -> axum::response::Response {
        tokio::time::sleep(Duration::from_millis(25)).await;
        downloadable_file().await.into_response()
    }

    async fn range_probe_file(headers: axum::http::HeaderMap) -> axum::response::Response {
        if headers.contains_key(axum_header::RANGE) {
            (
                StatusCode::PARTIAL_CONTENT,
                [
                    (
                        axum_header::CONTENT_RANGE,
                        HeaderValue::from_static("bytes 0-0/2097152"),
                    ),
                    (axum_header::CONTENT_LENGTH, HeaderValue::from_static("1")),
                ],
                vec![b'x'],
            )
                .into_response()
        } else {
            (
                [
                    (
                        axum_header::CONTENT_DISPOSITION,
                        HeaderValue::from_static("attachment; filename=range-probe.bin"),
                    ),
                    (
                        axum_header::CONTENT_TYPE,
                        HeaderValue::from_static("application/octet-stream"),
                    ),
                ],
                vec![b'x'; RANGE_PROBE_SIZE],
            )
                .into_response()
        }
    }

    fn resume_response(
        headers: axum::http::HeaderMap,
        etag: &'static str,
        last_modified: &'static str,
    ) -> axum::response::Response {
        if !headers
            .get(axum_header::RANGE)
            .is_some_and(|value| value == "bytes=4-")
        {
            return (StatusCode::OK, b"abcdefgh".to_vec()).into_response();
        }
        (
            StatusCode::PARTIAL_CONTENT,
            [
                (
                    axum_header::CONTENT_RANGE,
                    HeaderValue::from_static("bytes 4-7/8"),
                ),
                (axum_header::CONTENT_LENGTH, HeaderValue::from_static("4")),
                (axum_header::ETAG, HeaderValue::from_static(etag)),
                (
                    axum_header::LAST_MODIFIED,
                    HeaderValue::from_static(last_modified),
                ),
            ],
            b"efgh".to_vec(),
        )
            .into_response()
    }

    fn resume_task(url: &str, etag: Option<&str>, last_modified: Option<&str>) -> DownloadTask {
        DownloadTask {
            id: "resume-test".into(),
            file_name: "resume.bin".into(),
            file_size: Some(8),
            original_url: url.into(),
            current_url: url.into(),
            save_path: String::new(),
            temp_path: String::new(),
            final_path: String::new(),
            status: DownloadStatus::Paused,
            mime_type: Some("application/octet-stream".into()),
            extension: Some("bin".into()),
            supports_range: true,
            max_connections: 1,
            max_parallel_downloads: 1,
            speed_limit_download: 0,
            speed_limit_inherited: false,
            etag: etag.map(str::to_owned),
            last_modified: last_modified.map(str::to_owned),
            total_downloaded: 4,
            speed_current: 0.0,
            speed_average: 0.0,
            created_at: String::new(),
            updated_at: String::new(),
            completed_at: None,
            delete_archive_after_extract: false,
            download_type: "http".into(),
            info_hash: None,
            seeds: 0,
            peers: 0,
            upload_speed: 0.0,
            total_uploaded: 0,
            priority: 1,
            queue_order: 0,
            scheduled_start_at: None,
            daily_schedule_start_minute: None,
            daily_schedule_end_minute: None,
            scheduled_weekdays: 127,
            pause_outside_schedule: false,
            skip_schedule_once: false,
            scheduled_last_started_at: None,
            torrent_selected_file_indexes: vec![],
        }
    }

    #[test]
    fn sanitizes_server_file_names() {
        assert_eq!(safe_file_name("../relatorio?.pdf"), "_relatorio_.pdf");
    }

    #[test]
    fn resolves_known_categories() {
        assert_eq!(category_for_extension(Some("zip")), "Compactados");
        assert_eq!(category_for_extension(Some("unknown")), "Outros");
    }

    #[test]
    fn parses_valid_content_range() {
        assert_eq!(
            parse_content_range("bytes 1024-2047/4096"),
            Some((1024, 2047, 4096))
        );
        assert_eq!(parse_content_range("bytes 10-5/20"), None);
        assert_eq!(parse_content_range("bytes */4096"), None);
    }

    #[test]
    fn adaptive_plan_creates_work_queue_without_tiny_chunks() {
        assert_eq!(adaptive_chunk_count(2 * 1024 * 1024, 8), 2);
        let large = adaptive_chunk_count(10 * 1024 * 1024 * 1024, 8);
        assert!((32..=128).contains(&large));
    }

    #[test]
    fn progress_gate_limits_updates_to_five_per_second() {
        let gate = AtomicU64::new(0);
        assert!(!claim_interval(
            &gate,
            Duration::from_millis(199),
            UI_UPDATE_INTERVAL
        ));
        assert!(claim_interval(
            &gate,
            Duration::from_millis(200),
            UI_UPDATE_INTERVAL
        ));
        assert!(!claim_interval(
            &gate,
            Duration::from_millis(399),
            UI_UPDATE_INTERVAL
        ));
        assert!(claim_interval(
            &gate,
            Duration::from_millis(400),
            UI_UPDATE_INTERVAL
        ));
    }

    #[tokio::test]
    async fn inspect_download_uses_local_metadata_and_rfc5987_filename() {
        let app = Router::new().route("/download", get(downloadable_file));
        let (base_url, server) = spawn_test_server(app).await;
        let root = temporary_download_root();

        let prepared = inspect_local_download(&format!("{base_url}/download"), &root)
            .await
            .expect("o servidor local deve preparar o download");

        assert_eq!(prepared.input.file_name, "relatório-final.pdf");
        assert_eq!(prepared.input.file_size, Some(TEST_PAYLOAD.len() as i64));
        assert_eq!(prepared.input.mime_type.as_deref(), Some("application/pdf"));
        assert_eq!(prepared.input.etag.as_deref(), Some("\"local-etag\""));
        assert_eq!(
            prepared.input.last_modified.as_deref(),
            Some("Wed, 21 Oct 2015 07:28:00 GMT")
        );
        assert!(prepared.input.supports_range);
        assert_eq!(prepared.input.download_type, "http");
        assert!(prepared.response.is_some());

        server.abort();
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
    #[tokio::test]
    async fn inspect_download_follows_local_redirect() {
        let app = Router::new()
            .route("/download", get(downloadable_file))
            .route(
                "/redirect",
                get(|| async { Redirect::temporary("/download") }),
            );
        let (base_url, server) = spawn_test_server(app).await;
        let root = temporary_download_root();

        let prepared = inspect_local_download(&format!("{base_url}/redirect"), &root)
            .await
            .expect("o redirecionamento local deve ser seguido");

        assert_eq!(prepared.input.file_name, "relatório-final.pdf");
        assert_eq!(
            prepared.response.expect("resposta final").url().path(),
            "/download"
        );

        server.abort();
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
    #[tokio::test]
    async fn inspect_download_probes_range_when_header_is_absent() {
        let app = Router::new().route("/range-probe", get(range_probe_file));
        let (base_url, server) = spawn_test_server(app).await;
        let root = temporary_download_root();

        let prepared = inspect_local_download(&format!("{base_url}/range-probe"), &root)
            .await
            .expect("o probe Range local deve preparar o download");

        assert_eq!(prepared.input.file_name, "range-probe.bin");
        assert_eq!(prepared.input.file_size, Some(RANGE_PROBE_SIZE as i64));
        assert!(prepared.input.supports_range);

        server.abort();
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
    #[tokio::test]
    async fn inspect_download_reports_local_http_errors() {
        let app = Router::new()
            .route(
                "/missing",
                get(|| async { (StatusCode::NOT_FOUND, "arquivo inexistente") }),
            )
            .route("/unauthorized", get(|| async { StatusCode::UNAUTHORIZED }))
            .route("/forbidden", get(|| async { StatusCode::FORBIDDEN }))
            .route(
                "/range",
                get(|| async { StatusCode::RANGE_NOT_SATISFIABLE }),
            )
            .route("/limited", get(|| async { StatusCode::TOO_MANY_REQUESTS }))
            .route(
                "/unavailable",
                get(|| async { StatusCode::INTERNAL_SERVER_ERROR }),
            );
        let (base_url, server) = spawn_test_server(app).await;
        let root = temporary_download_root();

        let error = inspect_local_download(&format!("{base_url}/missing"), &root)
            .await
            .expect_err("a resposta 404 deve falhar");

        for (path, status) in [
            ("/unauthorized", "401 Unauthorized"),
            ("/forbidden", "403 Forbidden"),
            ("/range", "416 Range Not Satisfiable"),
            ("/limited", "429 Too Many Requests"),
            ("/unavailable", "500 Internal Server Error"),
        ] {
            let error = inspect_local_download(&format!("{base_url}{path}"), &root)
                .await
                .expect_err("a resposta de erro deve falhar");
            assert_eq!(error, format!("O servidor respondeu com HTTP {status}."));
        }

        assert_eq!(error, "O servidor respondeu com HTTP 404 Not Found.");
        server.abort();
    }
    #[tokio::test]
    async fn prepare_resume_accepts_matching_content_range_and_etag() {
        let app = Router::new().route(
            "/resume",
            get(|headers| async move {
                resume_response(headers, "\"stable-etag\"", "Wed, 21 Oct 2015 07:28:00 GMT")
            }),
        );
        let (base_url, server) = spawn_test_server(app).await;
        let task = resume_task(&format!("{base_url}/resume"), Some("\"stable-etag\""), None);

        let (response, offset) = prepare_resume(&task, 4, HeaderMap::new())
            .await
            .expect("a retomada local deve aceitar Content-Range e ETag estáveis");

        assert_eq!(offset, 4);
        assert_eq!(response.status(), reqwest::StatusCode::PARTIAL_CONTENT);
        server.abort();
    }
    #[tokio::test]
    async fn prepare_resume_blocks_changed_etag() {
        let app = Router::new().route(
            "/changed-etag",
            get(|headers| async move {
                resume_response(headers, "\"changed-etag\"", "Wed, 21 Oct 2015 07:28:00 GMT")
            }),
        );
        let (base_url, server) = spawn_test_server(app).await;
        let task = resume_task(
            &format!("{base_url}/changed-etag"),
            Some("\"stable-etag\""),
            None,
        );

        let error = match prepare_resume(&task, 4, HeaderMap::new()).await {
            Err(error) => error,
            Ok(_) => panic!("o ETag alterado deve bloquear a retomada"),
        };

        assert_eq!(
            error,
            "O ETag mudou; a retomada foi bloqueada para evitar corrupção."
        );
        server.abort();
    }
    #[tokio::test]
    async fn prepare_resume_accepts_changed_last_modified_with_stable_etag() {
        let app = Router::new().route(
            "/changed-last-modified",
            get(|headers| async move {
                resume_response(headers, "\"stable-etag\"", "Thu, 22 Oct 2015 07:28:00 GMT")
            }),
        );
        let (base_url, server) = spawn_test_server(app).await;
        let task = resume_task(
            &format!("{base_url}/changed-last-modified"),
            Some("\"stable-etag\""),
            Some("Tue, 20 Oct 2015 07:28:00 GMT"),
        );

        let (response, offset) = prepare_resume(&task, 4, HeaderMap::new())
            .await
            .expect("Last-Modified alterado não deve invalidar uma retomada com ETag estável");

        assert_eq!(offset, 4);
        assert_eq!(response.status(), reqwest::StatusCode::PARTIAL_CONTENT);
        server.abort();
    }
    #[tokio::test]
    async fn prepare_resume_retries_with_minimal_headers_after_range_refusal() {
        let app = Router::new().route(
            "/fallback",
            get(|headers: axum::http::HeaderMap| async move {
                if headers.contains_key("x-first-range-attempt") {
                    (StatusCode::OK, b"abcdefgh".to_vec()).into_response()
                } else {
                    resume_response(headers, "\"stable-etag\"", "Wed, 21 Oct 2015 07:28:00 GMT")
                }
            }),
        );
        let (base_url, server) = spawn_test_server(app).await;
        let task = resume_task(
            &format!("{base_url}/fallback"),
            Some("\"stable-etag\""),
            None,
        );

        let mut request_headers = HeaderMap::new();
        request_headers.insert(
            "x-first-range-attempt",
            header::HeaderValue::from_static("1"),
        );

        let (response, offset) = prepare_resume(&task, 4, request_headers)
            .await
            .expect("a segunda tentativa deve usar headers mínimos e aceitar Range");

        assert_eq!(offset, 4);
        assert_eq!(response.status(), reqwest::StatusCode::PARTIAL_CONTENT);
        server.abort();
    }
    #[tokio::test]
    async fn prepare_resume_rejects_invalid_content_range() {
        let app = Router::new().route(
            "/invalid-range",
            get(|_headers: axum::http::HeaderMap| async move {
                (
                    StatusCode::PARTIAL_CONTENT,
                    [
                        (
                            axum_header::CONTENT_RANGE,
                            HeaderValue::from_static("bytes 0-3/8"),
                        ),
                        (axum_header::CONTENT_LENGTH, HeaderValue::from_static("4")),
                        (
                            axum_header::ETAG,
                            HeaderValue::from_static("\"stable-etag\""),
                        ),
                    ],
                    b"abcd".to_vec(),
                )
                    .into_response()
            }),
        );
        let (base_url, server) = spawn_test_server(app).await;
        let task = resume_task(
            &format!("{base_url}/invalid-range"),
            Some("\"stable-etag\""),
            None,
        );

        let error = match prepare_resume(&task, 4, HeaderMap::new()).await {
            Err(error) => error,
            Ok(_) => panic!("Content-Range com início incorreto deve falhar"),
        };

        assert_eq!(
            error,
            "Faixa incorreta: solicitado início 4, servidor respondeu 0."
        );
        server.abort();
    }
    #[tokio::test]
    async fn inspect_download_keeps_unknown_size_without_content_length() {
        let app = Router::new().route(
            "/stream-without-length",
            get(|| async {
                axum::response::Response::builder()
                    .header(
                        axum_header::CONTENT_DISPOSITION,
                        "attachment; filename=stream.bin",
                    )
                    .header(axum_header::CONTENT_TYPE, "application/octet-stream")
                    .body(axum::body::Body::from_stream(futures_util::stream::once(
                        async {
                            Ok::<_, std::convert::Infallible>(axum::body::Bytes::from_static(
                                TEST_PAYLOAD,
                            ))
                        },
                    )))
                    .expect("a resposta de streaming deve ser válida")
            }),
        );
        let (base_url, server) = spawn_test_server(app).await;
        let root = temporary_download_root();

        let prepared = inspect_local_download(&format!("{base_url}/stream-without-length"), &root)
            .await
            .expect("a resposta por streaming deve ser preparada");

        assert_eq!(prepared.input.file_name, "stream.bin");
        assert_eq!(prepared.input.file_size, None);
        server.abort();
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
    #[tokio::test]
    async fn inspect_download_accepts_slow_local_response() {
        let app = Router::new().route("/slow-download", get(slow_download));
        let (base_url, server) = spawn_test_server(app).await;
        let root = temporary_download_root();

        let prepared = inspect_local_download(&format!("{base_url}/slow-download"), &root)
            .await
            .expect("a resposta lenta deve ser preparada");

        assert_eq!(prepared.input.file_name, "relatório-final.pdf");
        assert_eq!(prepared.input.file_size, Some(TEST_PAYLOAD.len() as i64));
        server.abort();
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
    #[tokio::test]
    async fn prepared_response_reports_truncated_body_after_disconnect() {
        let (url, server) = spawn_disconnect_server().await;
        let root = temporary_download_root();

        let prepared = inspect_local_download(&url, &root)
            .await
            .expect("os headers da resposta truncada ainda devem ser inspecionados");

        let response = prepared.response.expect("a resposta deve ser preservada");

        assert!(response.bytes().await.is_err());
        server
            .await
            .expect("o servidor local deve encerrar normalmente");
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
}
