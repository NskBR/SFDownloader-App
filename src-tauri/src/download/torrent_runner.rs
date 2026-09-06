use crate::download::torrent::get_torrent_manager;
use crate::download::torrent_files::{
    has_selected_subset, remove_empty_unselected_files, selected_progress, selected_size,
};
use std::collections::HashMap;
use std::path::Path;

pub async fn run_torrent(
    app: tauri::AppHandle,
    database: crate::database::Database,
    task: crate::database::models::DownloadTask,
    control: crate::download::runtime::TaskControl,
) {
    use crate::database::models::{DownloadStatus, UpdateDownloadInput};
    use crate::database::repositories::downloads;
    use tauri::Emitter;

    let connection = match database.connect() {
        Ok(c) => c,
        Err(_) => return,
    };

    let manager = get_torrent_manager();
    let info_hash = task.info_hash.clone().unwrap_or_default();

    let mut current_downloaded = task.total_downloaded;
    let mut average_speed = task.speed_average.max(0.0);
    let mut peer_fetched_bytes: HashMap<String, u64> = HashMap::new();
    let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(500));
    loop {
        interval.tick().await;

        if control.was_paused() {
            let _ = downloads::update_progress(
                &connection,
                &UpdateDownloadInput {
                    id: task.id.clone(),
                    status: DownloadStatus::Paused,
                    total_downloaded: current_downloaded,
                    speed_current: 0.0,
                    speed_average: 0.0,
                    seeds: None,
                    peers: None,
                    upload_speed: None,
                    total_uploaded: None,
                },
            );
            let _ = app.emit(
                "download-progress",
                serde_json::json!({
                    "id": task.id,
                    "downloaded": current_downloaded,
                    "total": task.file_size,
                    "speed": 0.0,
                    "status": "paused",
                    "error": null
                }),
            );
            break;
        }

        if control.was_cancelled() {
            let _ = manager
                .cancel_torrent(&app, &database, &info_hash, false)
                .await;
            break;
        }

        // Buscar handle no TorrentManager
        let guard = manager.entries().read().await;
        if let Some(entry) = guard.get(&info_hash) {
            let stats = entry.handle.stats();

            let has_selected_subset =
                has_selected_subset(&entry.files, &entry.selected_file_indexes);

            let logical_total_size = if has_selected_subset {
                selected_size(&entry.files, &entry.selected_file_indexes) as i64
            } else {
                task.file_size.unwrap_or(entry.total_size as i64)
            };

            let total_size = logical_total_size;

            let downloaded = if has_selected_subset {
                selected_progress(
                    &entry.files,
                    &entry.selected_file_indexes,
                    &stats.file_progress,
                ) as i64
            } else if stats.finished {
                total_size
            } else {
                stats.progress_bytes as i64
            };

            // Garantir que baixado nunca ultrapasse o total_size da seleção ou do torrent
            let downloaded = if total_size > 0 {
                downloaded.min(total_size)
            } else {
                downloaded
            };

            let is_finished = if total_size > 0 {
                downloaded >= total_size
            } else {
                stats.finished
            };

            let speed_bytes = stats
                .live
                .as_ref()
                .map(|l| l.download_speed.mbps * 1024.0 * 1024.0)
                .unwrap_or(0.0);

            let upload_speed = stats
                .live
                .as_ref()
                .map(|l| l.upload_speed.mbps * 1024.0 * 1024.0)
                .unwrap_or(0.0);
            average_speed = if speed_bytes > 0.0 {
                if average_speed > 0.0 {
                    average_speed * 0.7 + speed_bytes * 0.3
                } else {
                    speed_bytes
                }
            } else {
                average_speed * 0.82
            };

            // A quantidade de conexões `live` tende a ficar estacionada no teto
            // configurado (normalmente 128). Para a interface, conte apenas peers
            // que realmente entregaram bytes desde a amostragem anterior.
            let current_peer_bytes = entry.handle.with_state(|state| match state {
                librqbit::ManagedTorrentState::Live(live) => live
                    .per_peer_stats_snapshot(Default::default())
                    .peers
                    .into_iter()
                    .map(|(address, peer)| (address, peer.counters.fetched_bytes))
                    .collect::<HashMap<_, _>>(),
                _ => HashMap::new(),
            });
            let peers = current_peer_bytes
                .iter()
                .filter(|(address, fetched)| {
                    **fetched > peer_fetched_bytes.get(*address).copied().unwrap_or(0)
                })
                .count() as i64;
            peer_fetched_bytes = current_peer_bytes;

            // Mapear estado real do librqbit para DownloadStatus
            use librqbit::TorrentStatsState;
            let is_initializing = matches!(stats.state, TorrentStatsState::Initializing { .. });
            let real_downloaded = if is_initializing { 0_i64 } else { downloaded };
            current_downloaded = real_downloaded;

            let (db_status, ui_status) = if stats.error.is_some() {
                (DownloadStatus::Failed, "failed")
            } else if is_finished {
                (DownloadStatus::Completed, "completed")
            } else {
                match stats.state {
                    TorrentStatsState::Initializing { .. } => {
                        (DownloadStatus::CheckingFiles, "checking_files")
                    }
                    TorrentStatsState::Live => {
                        // Exibir "Baixando" APENAS quando já baixou algum byte real (> 0)
                        // E a velocidade real de download for >= 1.0 KB/s.
                        // Caso contrário, exibir "Conectando P2P" (Conectando-se aos pares).
                        if real_downloaded > 0 && speed_bytes >= 1024.0 {
                            (DownloadStatus::Downloading, "downloading")
                        } else {
                            (DownloadStatus::Downloading, "connecting")
                        }
                    }
                    TorrentStatsState::Paused => (DownloadStatus::Paused, "paused"),
                    TorrentStatsState::Error => (DownloadStatus::Failed, "failed"),
                }
            };

            let _ = downloads::update_progress(
                &connection,
                &UpdateDownloadInput {
                    id: task.id.clone(),
                    status: db_status,
                    total_downloaded: real_downloaded,
                    speed_current: speed_bytes,
                    speed_average: average_speed,
                    // A versão atual do librqbit não expõe a quantidade de seeds
                    // separadamente em TorrentStats. Não grave zero como se fosse
                    // uma medição real.
                    seeds: None,
                    peers: Some(peers),
                    upload_speed: Some(upload_speed),
                    total_uploaded: Some(stats.uploaded_bytes as i64),
                },
            );

            let _ = app.emit(
                "download-progress",
                serde_json::json!({
                    "id": task.id,
                    // downloaded = bytes REALMENTE baixados (0 durante verificação)
                    "downloaded": real_downloaded,
                    // verifiedBytes = bytes verificados no disco (só durante checking_files)
                    "verifiedBytes": if is_initializing { downloaded } else { 0_i64 },
                    "total": total_size,
                    "speed": speed_bytes,
                    "uploadSpeed": upload_speed,
                    "peers": peers,
                    "trackers": entry.tracker_count,
                    "status": ui_status,
                    "error": stats.error.clone()
                }),
            );

            if is_finished && has_selected_subset {
                remove_empty_unselected_files(
                    Path::new(&entry.save_path),
                    &entry.files,
                    &entry.selected_file_indexes,
                );
            }

            if is_finished {
                // Política da Beta: após terminar o download, interromper o upload.
                // A tarefa e seus arquivos continuam disponíveis para o usuário.
                let session_guard = manager.session().read().await;
                if let Some(ref session) = *session_guard {
                    let _ = session.pause(&entry.handle).await;
                }
            }

            if is_finished || stats.error.is_some() {
                break;
            }
        } else {
            break;
        }
    }
}
