use crate::database::models::GlobalDownloadSchedule;
use rusqlite::{params, Connection, Result};

pub fn get_global_download_schedule(connection: &Connection) -> Result<GlobalDownloadSchedule> {
    connection.query_row(
        "SELECT daily_start_minute,daily_end_minute,weekdays,pause_outside_schedule FROM global_download_schedule WHERE id=1",
        [],
        |row| {
            Ok(GlobalDownloadSchedule {
                daily_start_minute: row.get(0)?,
                daily_end_minute: row.get(1)?,
                weekdays: row.get(2)?,
                pause_outside_schedule: row.get::<_, i64>(3)? != 0,
            })
        },
    )
}

pub fn update_global_download_schedule(
    connection: &Connection,
    schedule: &GlobalDownloadSchedule,
) -> Result<()> {
    connection.execute(
        "UPDATE global_download_schedule SET daily_start_minute=?1,daily_end_minute=?2,weekdays=?3,pause_outside_schedule=?4,updated_at=CURRENT_TIMESTAMP WHERE id=1",
        params![schedule.daily_start_minute, schedule.daily_end_minute, schedule.weekdays.clamp(0, 127), schedule.pause_outside_schedule],
    )?;
    Ok(())
}
