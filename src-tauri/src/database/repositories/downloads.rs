use crate::database::models::{
    CreateDownloadInput, DownloadStatus, DownloadTask, UpdateDownloadInput,
};
use rusqlite::{params, Connection, OptionalExtension, Result};
use uuid::Uuid;

const COLUMNS: &str = "id,file_name,file_size,original_url,current_url,save_path,temp_path,final_path,status,mime_type,extension,supports_range,max_connections,max_parallel_downloads,speed_limit_download,speed_limit_inherited,etag,last_modified,total_downloaded,speed_current,speed_average,created_at,updated_at,completed_at,delete_archive_after_extract,download_type,info_hash,seeds,peers,upload_speed,total_uploaded,priority,queue_order,scheduled_start_at,daily_schedule_start_minute,daily_schedule_end_minute,scheduled_weekdays,pause_outside_schedule,skip_schedule_once,scheduled_last_started_at,torrent_selected_file_indexes";

fn map_task(row: &rusqlite::Row<'_>) -> Result<DownloadTask> {
    Ok(DownloadTask {
        id: row.get(0)?,
        file_name: row.get(1)?,
        file_size: row.get(2)?,
        original_url: row.get(3)?,
        current_url: row.get(4)?,
        save_path: row.get(5)?,
        temp_path: row.get(6)?,
        final_path: row.get(7)?,
        status: DownloadStatus::parse(&row.get::<_, String>(8)?),
        mime_type: row.get(9)?,
        extension: row.get(10)?,
        supports_range: row.get::<_, i64>(11)? != 0,
        max_connections: row.get(12)?,
        max_parallel_downloads: row.get(13)?,
        speed_limit_download: row.get(14)?,
        speed_limit_inherited: row.get::<_, i64>(15)? != 0,
        etag: row.get(16)?,
        last_modified: row.get(17)?,
        total_downloaded: row.get(18)?,
        speed_current: row.get(19)?,
        speed_average: row.get(20)?,
        created_at: row.get(21)?,
        updated_at: row.get(22)?,
        completed_at: row.get(23)?,
        delete_archive_after_extract: row.get::<_, i64>(24)? != 0,
        download_type: row.get(25).unwrap_or_else(|_| "http".into()),
        info_hash: row.get(26).ok(),
        seeds: row.get(27).unwrap_or(0),
        peers: row.get(28).unwrap_or(0),
        upload_speed: row.get(29).unwrap_or(0.0),
        total_uploaded: row.get(30).unwrap_or(0),
        priority: row.get(31).unwrap_or(1),
        queue_order: row.get(32).unwrap_or(0),
        scheduled_start_at: row.get(33).ok(),
        daily_schedule_start_minute: row.get(34).ok(),
        daily_schedule_end_minute: row.get(35).ok(),
        scheduled_weekdays: row.get(36).unwrap_or(0b111_1111),
        pause_outside_schedule: row.get::<_, i64>(37).unwrap_or(0) != 0,
        skip_schedule_once: row.get::<_, i64>(38).unwrap_or(0) != 0,
        scheduled_last_started_at: row.get(39).ok(),
        torrent_selected_file_indexes: row
            .get::<_, Option<String>>(40)?
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default(),
    })
}

pub fn create(connection: &Connection, input: CreateDownloadInput) -> Result<DownloadTask> {
    let id = Uuid::new_v4().to_string();
    let queue_order: i64 = connection.query_row(
        "SELECT COALESCE(MAX(queue_order), 0) + 1 FROM download_tasks",
        [],
        |row| row.get(0),
    )?;
    connection.execute(
        "INSERT INTO download_tasks(id,file_name,file_size,original_url,current_url,save_path,temp_path,final_path,status,mime_type,extension,supports_range,max_connections,max_parallel_downloads,speed_limit_download,speed_limit_inherited,etag,last_modified,delete_archive_after_extract,download_type,info_hash,priority,queue_order) VALUES(?1,?2,?3,?4,?4,?5,?6,?7,'pending',?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
        params![id, input.file_name, input.file_size, input.original_url, input.save_path, input.temp_path, input.final_path, input.mime_type, input.extension, input.supports_range, input.max_connections, input.max_parallel_downloads, input.speed_limit_download, input.speed_limit_inherited, input.etag, input.last_modified, input.delete_archive_after_extract, input.download_type, input.info_hash, input.priority.clamp(0, 3), queue_order],
    )?;
    find(connection, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn find(connection: &Connection, id: &str) -> Result<Option<DownloadTask>> {
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM download_tasks WHERE id=?1"),
            [id],
            map_task,
        )
        .optional()
}

pub fn find_by_info_hash(connection: &Connection, info_hash: &str) -> Result<Option<DownloadTask>> {
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM download_tasks WHERE info_hash=?1 OR id=?1"),
            [info_hash],
            map_task,
        )
        .optional()
}

pub fn list(connection: &Connection) -> Result<Vec<DownloadTask>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {COLUMNS} FROM download_tasks ORDER BY created_at DESC"
    ))?;
    let tasks = statement.query_map([], map_task)?.collect();
    tasks
}

pub fn update(connection: &Connection, input: UpdateDownloadInput) -> Result<DownloadTask> {
    update_progress(connection, &input)?;
    find(connection, &input.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn update_progress(connection: &Connection, input: &UpdateDownloadInput) -> Result<()> {
    let completed = matches!(input.status, DownloadStatus::Completed);
    let current = find(connection, &input.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    if !current.status.can_transition_to(&input.status) {
        return Err(rusqlite::Error::InvalidQuery);
    }
    let affected = connection.execute(
        "UPDATE download_tasks SET status=?2,total_downloaded=?3,speed_current=?4,speed_average=?5,seeds=COALESCE(?7,seeds),peers=COALESCE(?8,peers),upload_speed=COALESCE(?9,upload_speed),total_uploaded=COALESCE(?10,total_uploaded),updated_at=CURRENT_TIMESTAMP,completed_at=CASE WHEN ?6 THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE id=?1",
        params![input.id, input.status.as_str(), input.total_downloaded, input.speed_current, input.speed_average, completed, input.seeds, input.peers, input.upload_speed, input.total_uploaded],
    )?;
    if affected == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

pub fn remove(connection: &Connection, id: &str) -> Result<bool> {
    Ok(connection.execute("DELETE FROM download_tasks WHERE id=?1", [id])? > 0)
}

pub fn replace_url(connection: &Connection, id: &str, url: &str) -> Result<()> {
    connection.execute(
        "UPDATE download_tasks SET current_url=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![id, url],
    )?;
    connection.execute(
        "INSERT INTO download_sources(id,download_id,url) VALUES(?1,?2,?3)",
        params![Uuid::new_v4().to_string(), id, url],
    )?;
    Ok(())
}

pub fn update_temp_path(connection: &Connection, id: &str, temp_path: &str) -> Result<()> {
    connection.execute(
        "UPDATE download_tasks SET temp_path=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![id, temp_path],
    )?;
    Ok(())
}

pub fn recover_interrupted(connection: &Connection) -> Result<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT id,temp_path,total_downloaded FROM download_tasks
         WHERE status IN ('pending','checking_files','downloading','assembling','extracting')
         ORDER BY priority DESC, queue_order ASC",
    )?;
    let interrupted: Vec<(String, String, i64)> = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_>>()?;
    drop(statement);
    for (id, temp_path, recorded) in &interrupted {
        let (chunk_total, chunk_count): (i64, i64) = connection.query_row(
            "SELECT COALESCE(SUM(downloaded_bytes),0),COUNT(*) FROM download_chunks WHERE download_id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let actual = if chunk_count > 0 {
            chunk_total
        } else {
            std::fs::metadata(temp_path)
                .ok()
                .and_then(|metadata| i64::try_from(metadata.len()).ok())
                .unwrap_or(*recorded)
        };
        connection.execute("UPDATE download_tasks SET status='paused',total_downloaded=?2,speed_current=0,updated_at=CURRENT_TIMESTAMP WHERE id=?1", params![id,actual])?;
    }
    Ok(interrupted.into_iter().map(|(id, _, _)| id).collect())
}
pub fn update_schedule(
    connection: &Connection,
    id: &str,
    schedule: &crate::database::models::DownloadScheduleInput,
) -> Result<()> {
    connection.execute(
        "UPDATE download_tasks SET scheduled_start_at=?2,daily_schedule_start_minute=?3,daily_schedule_end_minute=?4,scheduled_weekdays=?5,pause_outside_schedule=?6,skip_schedule_once=0,scheduled_last_started_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![id, schedule.scheduled_start_at, schedule.daily_schedule_start_minute, schedule.daily_schedule_end_minute, schedule.scheduled_weekdays.clamp(0, 127), schedule.pause_outside_schedule],
    )?;
    Ok(())
}

pub fn bypass_schedule_once(connection: &Connection, id: &str) -> Result<()> {
    connection.execute(
        "UPDATE download_tasks SET skip_schedule_once=1,updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        [id],
    )?;
    Ok(())
}

pub fn mark_schedule_started(connection: &Connection, id: &str, started_at: &str) -> Result<()> {
    connection.execute(
        "UPDATE download_tasks SET scheduled_last_started_at=?2,scheduled_start_at=NULL,skip_schedule_once=0,updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![id, started_at],
    )?;
    Ok(())
}
pub fn update_torrent_selection(
    connection: &Connection,
    id: &str,
    selected_file_indexes: &[usize],
) -> Result<()> {
    let value =
        serde_json::to_string(selected_file_indexes).map_err(|_| rusqlite::Error::InvalidQuery)?;
    connection.execute(
        "UPDATE download_tasks SET torrent_selected_file_indexes=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![id, value],
    )?;
    Ok(())
}

pub fn update_torrent_selection_and_size(
    connection: &Connection,
    id: &str,
    selected_file_indexes: &[usize],
    file_size: i64,
) -> Result<()> {
    let value =
        serde_json::to_string(selected_file_indexes).map_err(|_| rusqlite::Error::InvalidQuery)?;
    connection.execute(
        "UPDATE download_tasks SET file_size=?2,torrent_selected_file_indexes=?3,updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![id, file_size, value],
    )?;
    Ok(())
}
pub fn update_speed_limit(connection: &Connection, id: &str, speed_limit: i64) -> Result<()> {
    connection.execute(
        "UPDATE download_tasks SET speed_limit_download=?2, speed_limit_inherited=0, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![id, speed_limit],
    )?;
    Ok(())
}

pub fn update_priority(connection: &Connection, id: &str, priority: i64) -> Result<()> {
    connection.execute(
        "UPDATE download_tasks SET priority=?2, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![id, priority.clamp(0, 3)],
    )?;
    Ok(())
}

pub fn move_queue_order(
    connection: &Connection,
    id: &str,
    move_up: bool,
) -> Result<Vec<DownloadTask>> {
    let current = find(connection, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    if !matches!(
        current.status,
        DownloadStatus::Pending | DownloadStatus::Paused
    ) {
        return Ok(vec![current]);
    }

    let neighbor_query = if move_up {
        "SELECT id FROM download_tasks
         WHERE priority=?1 AND status IN ('pending','paused') AND queue_order < ?2
         ORDER BY queue_order DESC LIMIT 1"
    } else {
        "SELECT id FROM download_tasks
         WHERE priority=?1 AND status IN ('pending','paused') AND queue_order > ?2
         ORDER BY queue_order ASC LIMIT 1"
    };
    let neighbor_id = connection
        .query_row(
            neighbor_query,
            params![current.priority, current.queue_order],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let Some(neighbor_id) = neighbor_id else {
        return Ok(vec![current]);
    };
    let neighbor = find(connection, &neighbor_id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    connection.execute(
        "UPDATE download_tasks
         SET queue_order=CASE id WHEN ?1 THEN ?2 WHEN ?3 THEN ?4 ELSE queue_order END,
             updated_at=CURRENT_TIMESTAMP
         WHERE id IN (?1,?3)",
        params![
            current.id,
            neighbor.queue_order,
            neighbor.id,
            current.queue_order
        ],
    )?;
    Ok(vec![
        find(connection, &current.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?,
        find(connection, &neighbor.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?,
    ])
}

pub fn promote_queue_item(connection: &Connection, id: &str) -> Result<DownloadTask> {
    let current = find(connection, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    if current.status != DownloadStatus::Pending {
        return Ok(current);
    }
    let first_order: i64 = connection.query_row(
        "SELECT COALESCE(MIN(queue_order), 0) FROM download_tasks
         WHERE status='pending' AND priority=3",
        [],
        |row| row.get(0),
    )?;
    let queue_order = first_order.saturating_sub(1);
    connection.execute(
        "UPDATE download_tasks
         SET priority=3, queue_order=?2, updated_at=CURRENT_TIMESTAMP
         WHERE id=?1",
        params![id, queue_order],
    )?;
    find(connection, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::migrations;

    fn input() -> CreateDownloadInput {
        CreateDownloadInput {
            file_name: "arquivo.zip".into(),
            file_size: Some(1024),
            original_url: "https://example.com/arquivo.zip".into(),
            save_path: "C:/Downloads".into(),
            temp_path: "C:/Downloads/arquivo.zip.part".into(),
            final_path: "C:/Downloads/arquivo.zip".into(),
            mime_type: Some("application/zip".into()),
            extension: Some("zip".into()),
            supports_range: true,
            max_connections: 8,
            max_parallel_downloads: 3,
            speed_limit_download: 0,
            speed_limit_inherited: false,
            etag: None,
            last_modified: None,
            delete_archive_after_extract: false,
            download_type: "http".into(),
            info_hash: None,
            priority: 1,
        }
    }

    #[test]
    fn download_crud_cycle() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let created = create(&connection, input()).unwrap();
        assert_eq!(list(&connection).unwrap().len(), 1);
        let updated = update(
            &connection,
            UpdateDownloadInput {
                id: created.id.clone(),
                status: DownloadStatus::Paused,
                total_downloaded: 512,
                speed_current: 0.0,
                speed_average: 20.0,
                seeds: None,
                peers: None,
                upload_speed: None,
                total_uploaded: None,
            },
        )
        .unwrap();
        assert_eq!(updated.status, DownloadStatus::Paused);
        assert_eq!(updated.total_downloaded, 512);
        assert!(remove(&connection, &created.id).unwrap());
        assert!(list(&connection).unwrap().is_empty());
    }

    #[test]
    fn optional_torrent_statistics_are_preserved_when_not_measured() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let created = create(&connection, input()).unwrap();
        update_progress(
            &connection,
            &UpdateDownloadInput {
                id: created.id.clone(),
                status: DownloadStatus::Downloading,
                total_downloaded: 512,
                speed_current: 100.0,
                speed_average: 90.0,
                seeds: Some(4),
                peers: Some(7),
                upload_speed: Some(20.0),
                total_uploaded: Some(321),
            },
        )
        .unwrap();
        update_progress(
            &connection,
            &UpdateDownloadInput {
                id: created.id.clone(),
                status: DownloadStatus::Paused,
                total_downloaded: 512,
                speed_current: 0.0,
                speed_average: 90.0,
                seeds: None,
                peers: None,
                upload_speed: None,
                total_uploaded: None,
            },
        )
        .unwrap();

        let paused = find(&connection, &created.id).unwrap().unwrap();
        assert_eq!(paused.seeds, 4);
        assert_eq!(paused.peers, 7);
        assert_eq!(paused.upload_speed, 20.0);
        assert_eq!(paused.total_uploaded, 321);
    }

    #[test]
    fn progress_updates_allow_pause_and_resume_but_reject_terminal_regression() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let created = create(&connection, input()).unwrap();
        let update_status = |status| UpdateDownloadInput {
            id: created.id.clone(),
            status,
            total_downloaded: 256,
            speed_current: 0.0,
            speed_average: 0.0,
            seeds: None,
            peers: None,
            upload_speed: None,
            total_uploaded: None,
        };

        update(&connection, update_status(DownloadStatus::Downloading)).unwrap();
        update(&connection, update_status(DownloadStatus::Paused)).unwrap();
        update(&connection, update_status(DownloadStatus::Downloading)).unwrap();
        update(&connection, update_status(DownloadStatus::Completed)).unwrap();

        assert!(update(&connection, update_status(DownloadStatus::Downloading)).is_err());
        let persisted = find(&connection, &created.id).unwrap().unwrap();
        assert_eq!(persisted.status, DownloadStatus::Completed);
    }

    #[test]
    fn speed_limit_source_is_preserved_and_manual_edits_become_custom() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let mut inherited_input = input();
        inherited_input.speed_limit_download = 2 * 1024 * 1024;
        inherited_input.speed_limit_inherited = true;
        let created = create(&connection, inherited_input).unwrap();
        assert!(created.speed_limit_inherited);

        update_speed_limit(&connection, &created.id, 512 * 1024).unwrap();
        let persisted = find(&connection, &created.id).unwrap().unwrap();
        assert_eq!(persisted.speed_limit_download, 512 * 1024);
        assert!(!persisted.speed_limit_inherited);
    }
    #[test]
    fn download_schedule_is_persisted_and_can_be_cleared() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let created = create(&connection, input()).unwrap();
        let schedule = crate::database::models::DownloadScheduleInput {
            scheduled_start_at: Some("2026-09-01T12:00:00-03:00".into()),
            daily_schedule_start_minute: None,
            daily_schedule_end_minute: None,
            scheduled_weekdays: 0b001_1111,
            pause_outside_schedule: false,
        };
        update_schedule(&connection, &created.id, &schedule).unwrap();
        let persisted = find(&connection, &created.id).unwrap().unwrap();
        assert_eq!(
            persisted.scheduled_start_at.as_deref(),
            Some("2026-09-01T12:00:00-03:00")
        );
        assert_eq!(persisted.scheduled_weekdays, 0b001_1111);

        update_schedule(
            &connection,
            &created.id,
            &crate::database::models::DownloadScheduleInput::default(),
        )
        .unwrap();
        let cleared = find(&connection, &created.id).unwrap().unwrap();
        assert!(cleared.scheduled_start_at.is_none());
        assert!(cleared.daily_schedule_start_minute.is_none());
    }
    #[test]
    fn priority_and_queue_order_are_persisted() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let mut first_input = input();
        first_input.priority = 3;
        let first = create(&connection, first_input).unwrap();
        let second = create(&connection, input()).unwrap();

        assert_eq!(first.priority, 3);
        assert!(second.queue_order > first.queue_order);
        update_priority(&connection, &second.id, 0).unwrap();
        assert_eq!(find(&connection, &second.id).unwrap().unwrap().priority, 0);
    }

    #[test]
    fn interrupted_downloads_are_recovered_by_priority_then_creation_order() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let first = create(&connection, input()).unwrap();
        let second = create(&connection, input()).unwrap();
        update_priority(&connection, &second.id, 3).unwrap();
        for task in [&first, &second] {
            update(
                &connection,
                UpdateDownloadInput {
                    id: task.id.clone(),
                    status: DownloadStatus::Downloading,
                    total_downloaded: 0,
                    speed_current: 0.0,
                    speed_average: 0.0,
                    seeds: None,
                    peers: None,
                    upload_speed: None,
                    total_uploaded: None,
                },
            )
            .unwrap();
        }

        assert_eq!(
            recover_interrupted(&connection).unwrap(),
            vec![second.id, first.id]
        );
    }

    #[test]
    fn queue_order_can_be_moved_within_the_same_priority() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let first = create(&connection, input()).unwrap();
        let second = create(&connection, input()).unwrap();
        let third = create(&connection, input()).unwrap();

        let moved = move_queue_order(&connection, &third.id, true).unwrap();
        let reordered_third = moved.iter().find(|task| task.id == third.id).unwrap();
        let reordered_second = moved.iter().find(|task| task.id == second.id).unwrap();
        assert!(reordered_third.queue_order < reordered_second.queue_order);
        assert!(
            find(&connection, &first.id).unwrap().unwrap().queue_order
                < reordered_third.queue_order
        );
    }

    #[test]
    fn pending_item_can_be_promoted_to_the_next_available_slot() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let urgent = create(&connection, input()).unwrap();
        update_priority(&connection, &urgent.id, 3).unwrap();
        let normal = create(&connection, input()).unwrap();

        let promoted = promote_queue_item(&connection, &normal.id).unwrap();
        assert_eq!(promoted.priority, 3);
        assert!(promoted.queue_order < urgent.queue_order);
    }

    #[test]
    fn interrupted_download_becomes_paused_with_actual_file_size() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let temp_path = std::env::temp_dir().join(format!("sf-downloader-{}.part", Uuid::new_v4()));
        std::fs::write(&temp_path, [1_u8, 2, 3, 4]).unwrap();
        let mut new_download = input();
        new_download.temp_path = temp_path.to_string_lossy().into_owned();
        let created = create(&connection, new_download).unwrap();
        update(
            &connection,
            UpdateDownloadInput {
                id: created.id.clone(),
                status: DownloadStatus::Downloading,
                total_downloaded: 2,
                speed_current: 10.0,
                speed_average: 10.0,
                seeds: None,
                peers: None,
                upload_speed: None,
                total_uploaded: None,
            },
        )
        .unwrap();
        assert_eq!(recover_interrupted(&connection).unwrap().len(), 1);
        let recovered = find(&connection, &created.id).unwrap().unwrap();
        assert_eq!(recovered.status, DownloadStatus::Paused);
        assert_eq!(recovered.total_downloaded, 4);
        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn preallocated_segmented_file_recovers_from_chunk_progress() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let temp_path = std::env::temp_dir().join(format!("sf-downloader-{}.part", Uuid::new_v4()));
        let file = std::fs::File::create(&temp_path).unwrap();
        file.set_len(1024).unwrap();
        let mut new_download = input();
        new_download.temp_path = temp_path.to_string_lossy().into_owned();
        let created = create(&connection, new_download).unwrap();
        connection.execute(
            "INSERT INTO download_chunks(id,download_id,chunk_index,start_byte,end_byte,downloaded_bytes,status) VALUES('c',?1,0,0,1023,256,'downloading')",
            [&created.id],
        ).unwrap();
        update(
            &connection,
            UpdateDownloadInput {
                id: created.id.clone(),
                status: DownloadStatus::Downloading,
                total_downloaded: 128,
                speed_current: 10.0,
                speed_average: 10.0,
                seeds: None,
                peers: None,
                upload_speed: None,
                total_uploaded: None,
            },
        )
        .unwrap();
        recover_interrupted(&connection).unwrap();
        let recovered = find(&connection, &created.id).unwrap().unwrap();
        assert_eq!(recovered.total_downloaded, 256);
        let _ = std::fs::remove_file(temp_path);
    }
    #[test]
    fn torrent_file_selection_survives_a_database_round_trip() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        let mut torrent = input();
        torrent.download_type = "torrent".into();
        torrent.info_hash = Some("selection-test".into());
        let created = create(&connection, torrent).unwrap();
        update_torrent_selection_and_size(&connection, &created.id, &[0, 2, 5], 4096).unwrap();
        let restored = find(&connection, &created.id).unwrap().unwrap();
        assert_eq!(restored.torrent_selected_file_indexes, vec![0, 2, 5]);
        assert_eq!(restored.file_size, Some(4096));
    }
}
