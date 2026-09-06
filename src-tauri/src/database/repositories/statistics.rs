use rusqlite::{params, Connection, Result};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryStatistic {
    pub name: String,
    pub bytes: i64,
    pub files: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStatistics {
    pub total_downloaded: i64,
    pub completed_bytes: i64,
    pub failed_bytes: i64,
    pub cancelled_bytes: i64,
    pub minimum_disk_written: i64,
    pub disk_read: i64,
    pub completed_downloads: i64,
    pub active_downloads: i64,
    pub failed_downloads: i64,
    pub average_speed: f64,
    pub best_day: Option<String>,
    pub best_day_bytes: i64,
    pub categories: Vec<CategoryStatistic>,
    pub disk_read_available: bool,
}

#[allow(clippy::too_many_arguments)]
pub fn record_snapshot(
    connection: &mut Connection,
    download_id: &str,
    file_name: &str,
    network_bytes: i64,
    disk_read_bytes: i64,
    disk_written_bytes: i64,
    average_speed: f64,
    status: &str,
) -> Result<()> {
    let transaction = connection.transaction()?;
    transaction.execute(
        "INSERT INTO usage_downloads(download_id,file_name,network_bytes,disk_read_bytes,disk_written_bytes,average_speed,io_measured,status) VALUES(?1,?2,?3,?4,?5,?6,1,?7)
         ON CONFLICT(download_id) DO UPDATE SET
           network_bytes=MAX(usage_downloads.network_bytes,excluded.network_bytes),
           disk_read_bytes=MAX(usage_downloads.disk_read_bytes,excluded.disk_read_bytes),
           disk_written_bytes=MAX(usage_downloads.disk_written_bytes,excluded.disk_written_bytes),
           average_speed=MAX(usage_downloads.average_speed,excluded.average_speed),
           io_measured=1,status=excluded.status,completed_at=CURRENT_TIMESTAMP",
        params![download_id, file_name, network_bytes.max(0), disk_read_bytes.max(0), disk_written_bytes.max(0), average_speed.max(0.0), status],
    )?;
    transaction.commit()?;
    Ok(())
}

fn category_for_file(file_name: &str) -> &'static str {
    let extension = file_name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "gif" => "Imagens",
        "mp4" | "mkv" | "mov" | "avi" | "webm" => "Vídeos",
        "mp3" | "wav" | "flac" | "ogg" | "m4a" | "aac" => "Áudios",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "csv" => "Documentos",
        "zip" | "rar" | "7z" | "tar" | "gz" | "tgz" => "Compactados",
        "exe" | "msi" | "apk" | "bat" | "dmg" | "pkg" | "appimage" => "Aplicativos",
        "torrent" => "Torrents",
        _ => "Outros",
    }
}

pub fn profile(connection: &Connection) -> Result<ProfileStatistics> {
    let mut statement = connection.prepare(
        "SELECT file_name,MAX(network_bytes,0),MAX(disk_read_bytes,0),\
         MAX(disk_written_bytes,0),date(completed_at),MAX(average_speed,0),io_measured,status \
         FROM usage_downloads",
    )?;
    let completed = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?.max(0),
                row.get::<_, i64>(2)?.max(0),
                row.get::<_, i64>(3)?.max(0),
                row.get::<_, String>(4)?,
                row.get::<_, f64>(5)?.max(0.0),
                row.get::<_, i64>(6)? != 0,
                row.get::<_, String>(7)?,
            ))
        })?
        .collect::<Result<Vec<_>>>()?;

    let mut total_downloaded = 0_i64;
    let mut completed_bytes = 0_i64;
    let mut failed_bytes = 0_i64;
    let mut cancelled_bytes = 0_i64;
    let mut disk_read = 0_i64;
    let mut disk_written = 0_i64;
    let mut speed_total = 0_f64;
    let mut measured_count = 0_i64;
    let mut days = HashMap::<String, i64>::new();
    let mut category_totals = HashMap::<String, (i64, i64)>::new();
    let completed_count = completed
        .iter()
        .filter(|item| item.7 == "completed")
        .count() as i64;
    for (file_name, bytes, read, written, day, speed, measured, status) in &completed {
        total_downloaded = total_downloaded.saturating_add(*bytes);
        match status.as_str() {
            "completed" => completed_bytes = completed_bytes.saturating_add(*bytes),
            "failed" => failed_bytes = failed_bytes.saturating_add(*bytes),
            "cancelled" => cancelled_bytes = cancelled_bytes.saturating_add(*bytes),
            _ => {}
        }
        disk_read = disk_read.saturating_add(*read);
        disk_written = disk_written.saturating_add(*written);
        speed_total += speed;
        if *measured {
            measured_count += 1;
        }
        let day_total = days.entry(day.clone()).or_default();
        *day_total = day_total.saturating_add(*bytes);
        let entry = category_totals
            .entry(category_for_file(file_name).to_string())
            .or_default();
        entry.0 = entry.0.saturating_add(*bytes);
        entry.1 += 1;
    }

    let (best_day, best_day_bytes) = days
        .into_iter()
        .max_by_key(|(_, bytes)| *bytes)
        .map(|(day, bytes)| (Some(day), bytes))
        .unwrap_or((None, 0));
    let mut categories = category_totals
        .into_iter()
        .map(|(name, (bytes, files))| CategoryStatistic { name, bytes, files })
        .collect::<Vec<_>>();
    categories.sort_by_key(|item| std::cmp::Reverse(item.bytes));

    let active_downloads = connection.query_row(
        "SELECT COUNT(*) FROM download_tasks WHERE status IN ('pending','checking_files','downloading','paused','assembling','extracting')",
        [],
        |row| row.get(0),
    )?;
    let failed_downloads = connection.query_row(
        "SELECT COUNT(*) FROM download_tasks WHERE status IN ('failed','cancelled')",
        [],
        |row| row.get(0),
    )?;

    Ok(ProfileStatistics {
        total_downloaded,
        completed_bytes,
        failed_bytes,
        cancelled_bytes,
        minimum_disk_written: disk_written,
        disk_read,
        completed_downloads: completed_count,
        active_downloads,
        failed_downloads,
        average_speed: if completed.is_empty() {
            0.0
        } else {
            speed_total / completed.len() as f64
        },
        best_day,
        best_day_bytes,
        categories,
        disk_read_available: measured_count > 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::migrations;

    #[test]
    fn aggregates_completed_downloads_by_day_and_category() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        connection.execute("INSERT INTO usage_downloads(download_id,file_name,network_bytes,disk_read_bytes,disk_written_bytes,average_speed,io_measured,completed_at) VALUES('1','game.zip',100,100,250,20,1,'2026-07-05 10:00:00'),('2','video.mp4',300,0,300,40,1,'2026-07-05 11:00:00')", []).unwrap();
        let result = profile(&connection).unwrap();
        assert_eq!(result.total_downloaded, 400);
        assert_eq!(result.completed_bytes, 400);
        assert_eq!(result.disk_read, 100);
        assert_eq!(result.minimum_disk_written, 550);
        assert_eq!(result.completed_downloads, 2);
        assert_eq!(result.best_day.as_deref(), Some("2026-07-05"));
        assert_eq!(result.categories[0].name, "Vídeos");
    }

    #[test]
    fn completion_is_recorded_only_once() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::run(&mut connection).unwrap();
        record_snapshot(
            &mut connection,
            "d",
            "file.zip",
            100,
            100,
            220,
            10.0,
            "failed",
        )
        .unwrap();
        record_snapshot(
            &mut connection,
            "d",
            "file.zip",
            80,
            80,
            80,
            5.0,
            "cancelled",
        )
        .unwrap();
        let result = profile(&connection).unwrap();
        assert_eq!(result.total_downloaded, 100);
        assert_eq!(result.cancelled_bytes, 100);
        assert_eq!(result.minimum_disk_written, 220);
        assert_eq!(result.completed_downloads, 0);
    }
}
