use crate::download::torrent::get_torrent_manager;
use crate::download::torrent_files::{
    has_selected_subset, remove_empty_unselected_files, selected_progress, selected_size,
};
use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;

// Initializing progress counts scanned bytes, not verified downloadable content.
fn torrent_finished(stats: &librqbit::TorrentStats) -> bool {
    matches!(
        stats.state,
        librqbit::TorrentStatsState::Live | librqbit::TorrentStatsState::Paused
    ) && stats.error.is_none()
        && stats.finished
}

#[derive(Default)]
struct VerificationRate {
    previous: Option<(u64, Instant)>,
}
impl VerificationRate {
    fn sample(&mut self, checked: Option<u64>, now: Instant) -> f64 {
        let Some(bytes) = checked else {
            self.previous = None;
            return 0.0;
        };
        let previous = self.previous.replace((bytes, now));
        previous
            .filter(|(old, time)| bytes >= *old && now > *time)
            .map(|(old, time)| (bytes - old) as f64 / now.duration_since(time).as_secs_f64())
            .unwrap_or(0.0)
    }
}

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
    let mut verification_rate = VerificationRate::default();
    let mut write_rate = VerificationRate::default();
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
            let is_initializing = matches!(
                stats.state,
                librqbit::TorrentStatsState::Initializing { .. }
            );
            let io = super::torrent_io::totals(&info_hash);
            let now = Instant::now();
            let verification_speed = verification_rate.sample(
                if is_initializing {
                    io.map(|v| v.0)
                } else {
                    None
                },
                now,
            );
            let disk_write_speed = write_rate.sample(io.map(|v| v.1), now);

            let has_selected_subset =
                has_selected_subset(&entry.files, &entry.selected_file_indexes);

            let logical_total_size = if has_selected_subset {
                selected_size(&entry.files, &entry.selected_file_indexes) as i64
            } else {
                task.file_size.unwrap_or(entry.total_size as i64)
            };

            let total_size = logical_total_size;

            let is_finished = torrent_finished(&stats);
            let downloaded = if is_initializing {
                0
            } else if is_finished {
                total_size
            } else if has_selected_subset {
                selected_progress(
                    &entry.files,
                    &entry.selected_file_indexes,
                    &stats.file_progress,
                ) as i64
            } else {
                stats.progress_bytes as i64
            };
            let downloaded = downloaded.clamp(0, total_size.max(0));

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
            let real_downloaded = if is_initializing { current_downloaded } else { downloaded };
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
                    // Live is active even while waiting for peers or receiving zero bytes.
                    // Throughput must not change the task lifecycle or put it back in the queue.
                    TorrentStatsState::Live => (DownloadStatus::Downloading, "downloading"),
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
                    // Preserve the last known downloaded count while the disk is checked.
                    "downloaded": real_downloaded,
                    // verifiedBytes = bytes verificados no disco (só durante checking_files)
                    "verifiedBytes": if is_initializing { stats.progress_bytes } else { 0 },
                    "verificationTotal": if is_initializing { stats.total_bytes } else { 0 },
                    "verificationSpeed": verification_speed,
                    "verificationReadBytes": if is_initializing { io.map(|v|v.0) } else { None },
                    "diskWriteSpeed": disk_write_speed,
                    "total": total_size,
                    "speed": speed_bytes,
                    "uploadSpeed": upload_speed,
                    "totalUploaded": stats.uploaded_bytes,
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

#[cfg(test)]
mod regression_tests {
    use super::*;
    use librqbit::{TorrentStats, TorrentStatsState};
    use std::time::Duration;
    fn stats(state: TorrentStatsState, finished: bool) -> TorrentStats {
        TorrentStats {
            state,
            finished,
            file_progress: vec![10],
            progress_bytes: 1000,
            uploaded_bytes: 0,
            total_bytes: 1000,
            live: None,
            error: None,
        }
    }
    #[test]
    fn scanning_existing_nested_folder_never_completes_download() {
        // Even a full scan (or a count larger than a file selection) proves no hashes valid.
        let mut snapshot = stats(TorrentStatsState::Initializing { paused: false }, false);
        assert!(!torrent_finished(&snapshot));
        snapshot.finished = true;
        assert!(!torrent_finished(&snapshot));
        snapshot.state = TorrentStatsState::Live;
        snapshot.finished = false;
        assert!(!torrent_finished(&snapshot));
        snapshot.finished = true;
        assert!(torrent_finished(&snapshot));
        snapshot.error = Some("verification failed".into());
        assert!(!torrent_finished(&snapshot));
    }
    #[test]
    fn completed_selection_is_accepted_even_with_unselected_files_missing() {
        let snapshot = stats(TorrentStatsState::Paused, true);
        assert!(torrent_finished(&snapshot));
    }
    #[test]
    fn verification_rate_uses_elapsed_time_and_resets_between_scans() {
        let start = Instant::now();
        let mut rate = VerificationRate::default();
        assert_eq!(rate.sample(Some(100), start), 0.0);
        assert_eq!(
            rate.sample(Some(1100), start + Duration::from_millis(500)),
            2000.0
        );
        assert_eq!(rate.sample(Some(0), start + Duration::from_secs(1)), 0.0);
        assert_eq!(rate.sample(None, start + Duration::from_secs(2)), 0.0);
        assert_eq!(rate.sample(Some(1000), start + Duration::from_secs(3)), 0.0);
    }
}
