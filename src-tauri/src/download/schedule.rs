use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveDate, TimeZone, Timelike, Weekday};

use crate::database::models::{DownloadTask, GlobalDownloadSchedule};

const ALL_WEEKDAYS: i64 = 0b111_1111;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScheduleDecision {
    Start,
    Wait,
    Unscheduled,
}

pub fn is_configured(task: &DownloadTask) -> bool {
    task.scheduled_start_at.is_some()
        || task.daily_schedule_start_minute.is_some()
        || task.daily_schedule_end_minute.is_some()
}

pub fn validate_schedule(
    start_at: Option<&str>,
    daily_start_minute: Option<i64>,
    daily_end_minute: Option<i64>,
    weekdays: i64,
) -> Result<(), String> {
    if let Some(value) = start_at.filter(|value| !value.trim().is_empty()) {
        DateTime::parse_from_rfc3339(value).map_err(|_| {
            "A data agendada deve usar o formato ISO 8601 com fuso horário.".to_string()
        })?;
    }
    match (daily_start_minute, daily_end_minute) {
        (None, None) => {}
        (Some(start), Some(end)) if (0..1_440).contains(&start) && (0..1_440).contains(&end) => {}
        _ => return Err("A janela diária deve informar início e fim entre 00:00 e 23:59.".into()),
    }
    if !(0..=ALL_WEEKDAYS).contains(&weekdays) {
        return Err("Os dias da agenda são inválidos.".into());
    }
    Ok(())
}

pub fn decision_at(task: &DownloadTask, now: DateTime<FixedOffset>) -> ScheduleDecision {
    if task.skip_schedule_once {
        return ScheduleDecision::Start;
    }
    if !is_configured(task) {
        return ScheduleDecision::Unscheduled;
    }
    if let Some(start_at) = task
        .scheduled_start_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
    {
        if now < start_at {
            return ScheduleDecision::Wait;
        }
        return ScheduleDecision::Start;
    }
    let (Some(start), Some(end)) = (
        task.daily_schedule_start_minute,
        task.daily_schedule_end_minute,
    ) else {
        return ScheduleDecision::Wait;
    };
    if !within_daily_window(now, start, end) {
        return ScheduleDecision::Wait;
    }
    let minute = i64::from(now.hour() * 60 + now.minute());
    let schedule_date = if start > end && minute < end {
        now.date_naive() - Duration::days(1)
    } else {
        now.date_naive()
    };
    if !weekday_enabled(task.scheduled_weekdays, schedule_date.weekday()) {
        return ScheduleDecision::Wait;
    }
    let already_started_today = task
        .scheduled_last_started_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .is_some_and(|last| last.date_naive() == schedule_date);
    if already_started_today {
        ScheduleDecision::Wait
    } else {
        ScheduleDecision::Start
    }
}

pub fn next_execution_at(task: &DownloadTask, now: DateTime<FixedOffset>) -> Option<String> {
    if task.skip_schedule_once {
        return Some(now.to_rfc3339());
    }
    if let Some(start_at) = task
        .scheduled_start_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
    {
        return (start_at > now).then(|| start_at.to_rfc3339());
    }
    let (Some(start), Some(_)) = (
        task.daily_schedule_start_minute,
        task.daily_schedule_end_minute,
    ) else {
        return None;
    };
    for offset in 0..8 {
        let date = now.date_naive() + Duration::days(offset);
        if !weekday_enabled(task.scheduled_weekdays, date.weekday()) {
            continue;
        }
        let candidate = local_minute(now.offset(), date, start)?;
        if candidate > now {
            return Some(candidate.to_rfc3339());
        }
    }
    None
}

pub fn global_decision_at(
    schedule: &GlobalDownloadSchedule,
    now: DateTime<FixedOffset>,
) -> ScheduleDecision {
    let (Some(start), Some(end)) = (schedule.daily_start_minute, schedule.daily_end_minute) else {
        return ScheduleDecision::Unscheduled;
    };
    if !within_daily_window(now, start, end) {
        return ScheduleDecision::Wait;
    }
    let minute = i64::from(now.hour() * 60 + now.minute());
    let schedule_date = if start > end && minute < end {
        now.date_naive() - Duration::days(1)
    } else {
        now.date_naive()
    };
    if weekday_enabled(schedule.weekdays, schedule_date.weekday()) {
        ScheduleDecision::Start
    } else {
        ScheduleDecision::Wait
    }
}
pub fn within_daily_window(now: DateTime<FixedOffset>, start: i64, end: i64) -> bool {
    let minute = i64::from(now.hour() * 60 + now.minute());
    if start == end {
        return true;
    }
    if start < end {
        minute >= start && minute < end
    } else {
        minute >= start || minute < end
    }
}

pub fn weekday_enabled(mask: i64, weekday: Weekday) -> bool {
    let bit = match weekday {
        Weekday::Mon => 0,
        Weekday::Tue => 1,
        Weekday::Wed => 2,
        Weekday::Thu => 3,
        Weekday::Fri => 4,
        Weekday::Sat => 5,
        Weekday::Sun => 6,
    };
    mask & (1_i64 << bit) != 0
}

fn local_minute(
    offset: &FixedOffset,
    date: NaiveDate,
    minute: i64,
) -> Option<DateTime<FixedOffset>> {
    let time = date.and_hms_opt((minute / 60) as u32, (minute % 60) as u32, 0)?;
    offset.from_local_datetime(&time).single()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{DownloadStatus, DownloadTask};

    fn task() -> DownloadTask {
        DownloadTask {
            id: "scheduled".into(),
            file_name: "file.bin".into(),
            file_size: None,
            original_url: "https://example.test/file.bin".into(),
            current_url: "https://example.test/file.bin".into(),
            save_path: String::new(),
            temp_path: String::new(),
            final_path: String::new(),
            status: DownloadStatus::Paused,
            mime_type: None,
            extension: None,
            supports_range: true,
            max_connections: 1,
            max_parallel_downloads: 1,
            speed_limit_download: 0,
            speed_limit_inherited: false,
            etag: None,
            last_modified: None,
            total_downloaded: 0,
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
            queue_order: 1,
            scheduled_start_at: None,
            daily_schedule_start_minute: None,
            daily_schedule_end_minute: None,
            scheduled_weekdays: ALL_WEEKDAYS,
            pause_outside_schedule: false,
            skip_schedule_once: false,
            scheduled_last_started_at: None,
            torrent_selected_file_indexes: vec![],
        }
    }

    fn at(value: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(value).unwrap()
    }

    #[test]
    fn one_time_schedule_waits_then_starts() {
        let mut scheduled = task();
        scheduled.scheduled_start_at = Some("2026-08-31T12:00:00-03:00".into());
        assert_eq!(
            decision_at(&scheduled, at("2026-08-31T11:59:00-03:00")),
            ScheduleDecision::Wait
        );
        assert_eq!(
            decision_at(&scheduled, at("2026-08-31T12:00:00-03:00")),
            ScheduleDecision::Start
        );
    }

    #[test]
    fn daily_window_handles_overnight_and_weekdays() {
        let mut scheduled = task();
        scheduled.daily_schedule_start_minute = Some(22 * 60);
        scheduled.daily_schedule_end_minute = Some(2 * 60);
        scheduled.scheduled_weekdays = 1 << 0; // Monday
        assert!(within_daily_window(
            at("2026-08-31T23:00:00-03:00"),
            1320,
            120
        ));
        assert_eq!(
            decision_at(&scheduled, at("2026-08-31T23:00:00-03:00")),
            ScheduleDecision::Start
        );
        assert_eq!(
            decision_at(&scheduled, at("2026-09-01T01:00:00-03:00")),
            ScheduleDecision::Start
        );
    }

    #[test]
    fn global_window_gates_scheduled_tasks_and_can_cross_midnight() {
        let schedule = GlobalDownloadSchedule {
            daily_start_minute: Some(22 * 60),
            daily_end_minute: Some(2 * 60),
            weekdays: 1 << 0, // Monday
            pause_outside_schedule: true,
        };
        assert_eq!(
            global_decision_at(&schedule, at("2026-08-31T23:00:00-03:00")),
            ScheduleDecision::Start
        );
        assert_eq!(
            global_decision_at(&schedule, at("2026-09-01T01:00:00-03:00")),
            ScheduleDecision::Start
        );
        assert_eq!(
            global_decision_at(&schedule, at("2026-09-01T03:00:00-03:00")),
            ScheduleDecision::Wait
        );
    }
    #[test]
    fn next_execution_respects_the_persisted_weekday_mask() {
        let mut scheduled = task();
        scheduled.daily_schedule_start_minute = Some(9 * 60);
        scheduled.daily_schedule_end_minute = Some(18 * 60);
        scheduled.scheduled_weekdays = 1 << 1; // Tuesday
        assert_eq!(
            next_execution_at(&scheduled, at("2026-08-31T10:00:00-03:00")).as_deref(),
            Some("2026-09-01T09:00:00-03:00")
        );
    }
}
