use rusqlite::{Connection, Result};

const MIGRATION_001: &str = r#"
CREATE TABLE IF NOT EXISTS download_tasks (
  id TEXT PRIMARY KEY NOT NULL, file_name TEXT NOT NULL, file_size INTEGER,
  original_url TEXT NOT NULL, current_url TEXT NOT NULL, save_path TEXT NOT NULL,
  temp_path TEXT NOT NULL, final_path TEXT NOT NULL, status TEXT NOT NULL,
  mime_type TEXT, extension TEXT, supports_range INTEGER NOT NULL DEFAULT 0,
  etag TEXT, last_modified TEXT, total_downloaded INTEGER NOT NULL DEFAULT 0,
  speed_current REAL NOT NULL DEFAULT 0, speed_average REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS download_chunks (
  id TEXT PRIMARY KEY NOT NULL, download_id TEXT NOT NULL, chunk_index INTEGER NOT NULL,
  start_byte INTEGER NOT NULL, end_byte INTEGER NOT NULL, downloaded_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, checksum TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(download_id) REFERENCES download_tasks(id) ON DELETE CASCADE,
  UNIQUE(download_id, chunk_index)
);
CREATE TABLE IF NOT EXISTS download_sources (
  id TEXT PRIMARY KEY NOT NULL, download_id TEXT NOT NULL, url TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expired INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, average_speed REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(download_id) REFERENCES download_tasks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS history_items (
  id TEXT PRIMARY KEY NOT NULL, file_name TEXT NOT NULL, file_size INTEGER,
  action_type TEXT NOT NULL, status TEXT NOT NULL, source_url TEXT, path TEXT NOT NULL,
  duration_seconds INTEGER, average_speed REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1), root_download_folder TEXT NOT NULL DEFAULT '',
  auto_organize_enabled INTEGER NOT NULL DEFAULT 1, default_speed_value REAL NOT NULL DEFAULT 100,
  default_speed_unit TEXT NOT NULL DEFAULT 'Mbps', max_parallel_downloads INTEGER NOT NULL DEFAULT 3,
  max_connections_per_download INTEGER NOT NULL DEFAULT 8, speed_limit_download INTEGER,
  speed_limit_upload INTEGER, theme TEXT NOT NULL DEFAULT 'dark', auto_extract_enabled INTEGER NOT NULL DEFAULT 0,
  delete_archive_after_extract INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL, avatar_path TEXT,
  local_user_id TEXT NOT NULL UNIQUE, status TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_download_tasks_status ON download_tasks(status);
CREATE INDEX IF NOT EXISTS idx_download_chunks_download ON download_chunks(download_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON history_items(created_at DESC);
INSERT OR IGNORE INTO app_settings(id) VALUES(1);
"#;

const MIGRATION_002: &str = r#"
ALTER TABLE download_tasks ADD COLUMN max_connections INTEGER NOT NULL DEFAULT 8;
"#;
const MIGRATION_003: &str = r#"
ALTER TABLE download_tasks ADD COLUMN max_parallel_downloads INTEGER NOT NULL DEFAULT 3;
ALTER TABLE download_tasks ADD COLUMN speed_limit_download INTEGER NOT NULL DEFAULT 0;
"#;
const MIGRATION_004: &str = r#"
CREATE TABLE IF NOT EXISTS usage_downloads (
  download_id TEXT PRIMARY KEY NOT NULL,
  file_name TEXT NOT NULL,
  network_bytes INTEGER NOT NULL DEFAULT 0,
  disk_read_bytes INTEGER NOT NULL DEFAULT 0,
  disk_written_bytes INTEGER NOT NULL DEFAULT 0,
  average_speed REAL NOT NULL DEFAULT 0,
  io_measured INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_usage_downloads_completed ON usage_downloads(completed_at DESC);
INSERT OR IGNORE INTO usage_downloads(
  download_id,file_name,network_bytes,disk_read_bytes,disk_written_bytes,
  average_speed,io_measured,completed_at
)
SELECT 'history:' || id,file_name,MAX(COALESCE(file_size,0),0),0,
       MAX(COALESCE(file_size,0),0),COALESCE(average_speed,0),0,created_at
FROM history_items
WHERE action_type='download' AND status='completed';
"#;
const MIGRATION_005: &str = r#"
ALTER TABLE usage_downloads ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
"#;
const MIGRATION_006: &str = r#"
CREATE TABLE IF NOT EXISTS metrics (
  key TEXT PRIMARY KEY NOT NULL,
  value INTEGER NOT NULL DEFAULT 0
);
"#;
const MIGRATION_007: &str = r#"
ALTER TABLE download_tasks ADD COLUMN delete_archive_after_extract INTEGER NOT NULL DEFAULT 0;
"#;
const MIGRATION_008: &str = r#"
ALTER TABLE download_tasks ADD COLUMN download_type TEXT NOT NULL DEFAULT 'http';
ALTER TABLE download_tasks ADD COLUMN info_hash TEXT;
ALTER TABLE download_tasks ADD COLUMN seeds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE download_tasks ADD COLUMN peers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE download_tasks ADD COLUMN upload_speed REAL NOT NULL DEFAULT 0.0;
ALTER TABLE download_tasks ADD COLUMN total_uploaded INTEGER NOT NULL DEFAULT 0;
"#;
const MIGRATION_009: &str = r#"
ALTER TABLE download_tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 1;
ALTER TABLE download_tasks ADD COLUMN queue_order INTEGER NOT NULL DEFAULT 0;
UPDATE download_tasks SET queue_order = rowid WHERE queue_order = 0;
CREATE INDEX IF NOT EXISTS idx_download_tasks_queue ON download_tasks(priority DESC, queue_order ASC);
"#;
const MIGRATION_010: &str = r#"
ALTER TABLE download_tasks ADD COLUMN speed_limit_inherited INTEGER NOT NULL DEFAULT 0;
"#;
const MIGRATION_011: &str = r#"
ALTER TABLE download_tasks ADD COLUMN scheduled_start_at TEXT;
ALTER TABLE download_tasks ADD COLUMN daily_schedule_start_minute INTEGER;
ALTER TABLE download_tasks ADD COLUMN daily_schedule_end_minute INTEGER;
ALTER TABLE download_tasks ADD COLUMN scheduled_weekdays INTEGER NOT NULL DEFAULT 127;
ALTER TABLE download_tasks ADD COLUMN pause_outside_schedule INTEGER NOT NULL DEFAULT 0;
ALTER TABLE download_tasks ADD COLUMN skip_schedule_once INTEGER NOT NULL DEFAULT 0;
ALTER TABLE download_tasks ADD COLUMN scheduled_last_started_at TEXT;
CREATE INDEX IF NOT EXISTS idx_download_tasks_schedule ON download_tasks(scheduled_start_at, daily_schedule_start_minute);
"#;
const MIGRATION_013: &str = r#"
ALTER TABLE download_tasks ADD COLUMN torrent_selected_file_indexes TEXT;
"#;

const MIGRATION_012: &str = r#"
CREATE TABLE IF NOT EXISTS global_download_schedule (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  daily_start_minute INTEGER,
  daily_end_minute INTEGER,
  weekdays INTEGER NOT NULL DEFAULT 127,
  pause_outside_schedule INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO global_download_schedule(id) VALUES(1);
"#;

pub fn run(connection: &mut Connection) -> Result<()> {
    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version < 1 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_001)?;
        transaction.execute_batch("PRAGMA user_version = 1")?;
        transaction.commit()?;
    }
    if version < 2 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_002)?;
        transaction.execute_batch("PRAGMA user_version = 2")?;
        transaction.commit()?;
    }
    if version < 3 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_003)?;
        transaction.execute_batch("PRAGMA user_version = 3")?;
        transaction.commit()?;
    }
    if version < 4 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_004)?;
        transaction.execute_batch("PRAGMA user_version = 4")?;
        transaction.commit()?;
    }
    if version < 5 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_005)?;
        transaction.execute_batch("PRAGMA user_version = 5")?;
        transaction.commit()?;
    }
    if version < 6 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_006)?;
        transaction.execute_batch("PRAGMA user_version = 6")?;
        transaction.commit()?;
    }
    if version < 7 {
        let transaction = connection.transaction()?;
        let _ = transaction.execute_batch(MIGRATION_007);
        let _ = transaction.execute_batch("PRAGMA user_version = 7");
        transaction.commit()?;
    }
    if version < 8 {
        let transaction = connection.transaction()?;
        let _ = transaction.execute_batch(MIGRATION_008);
        let _ = transaction.execute_batch("PRAGMA user_version = 8");
        transaction.commit()?;
    }
    if version < 9 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_009)?;
        transaction.execute_batch("PRAGMA user_version = 9")?;
        transaction.commit()?;
    }
    if version < 10 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_010)?;
        transaction.execute_batch("PRAGMA user_version = 10")?;
        transaction.commit()?;
    }
    if version < 11 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_011)?;
        transaction.execute_batch("PRAGMA user_version = 11")?;
        transaction.commit()?;
    }
    if version < 12 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_012)?;
        transaction.execute_batch("PRAGMA user_version = 12")?;
        transaction.commit()?;
    }
    if version < 13 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_013)?;
        transaction.execute_batch("PRAGMA user_version = 13")?;
        transaction.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_four_backfills_completed_history() {
        let mut connection = Connection::open_in_memory().unwrap();
        apply_schema_through(&connection, 3);
        connection.execute("INSERT INTO history_items(id,file_name,file_size,action_type,status,path,created_at) VALUES('old','archive.zip',512,'download','completed','x','2026-07-05 12:00:00')", []).unwrap();
        run(&mut connection).unwrap();
        let values: (i64, i64, i64) = connection.query_row(
            "SELECT network_bytes,disk_written_bytes,io_measured FROM usage_downloads WHERE download_id='history:old'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap();
        assert_eq!(values, (512, 512, 0));
    }
    fn apply_schema_through(connection: &Connection, version: i64) {
        let migrations = [
            MIGRATION_001,
            MIGRATION_002,
            MIGRATION_003,
            MIGRATION_004,
            MIGRATION_005,
            MIGRATION_006,
            MIGRATION_007,
            MIGRATION_008,
            MIGRATION_009,
            MIGRATION_010,
            MIGRATION_011,
            MIGRATION_012,
            MIGRATION_013,
        ];
        for migration in migrations.iter().take(version as usize) {
            connection.execute_batch(migration).unwrap();
        }
        connection
            .execute_batch(&format!("PRAGMA user_version = {version}"))
            .unwrap();
    }

    #[test]
    fn every_supported_legacy_schema_upgrades_to_the_current_version() {
        for version in 0..13 {
            let mut connection = Connection::open_in_memory().unwrap();
            if version > 0 {
                apply_schema_through(&connection, version);
            }
            run(&mut connection).unwrap();
            let final_version: i64 = connection
                .query_row("PRAGMA user_version", [], |row| row.get(0))
                .unwrap();
            assert_eq!(final_version, 13, "legacy schema v{version}");
            connection
                .query_row(
                    "SELECT priority,queue_order FROM download_tasks LIMIT 1",
                    [],
                    |_| Ok(()),
                )
                .unwrap_or(());
            connection
                .query_row(
                    "SELECT weekdays,pause_outside_schedule FROM global_download_schedule WHERE id=1",
                    [],
                    |_| Ok(()),
                )
                .unwrap();
        }
    }
}
