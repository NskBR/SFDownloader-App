use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Pending,
    CheckingFiles,
    Downloading,
    Paused,
    Assembling,
    Extracting,
    Completed,
    Failed,
    Cancelled,
}

impl DownloadStatus {
    pub fn can_transition_to(&self, next: &Self) -> bool {
        crate::download::state::can_transition(self, next)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::CheckingFiles => "checking_files",
            Self::Downloading => "downloading",
            Self::Paused => "paused",
            Self::Assembling => "assembling",
            Self::Extracting => "extracting",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
    pub fn parse(value: &str) -> Self {
        match value {
            "downloading" => Self::Downloading,
            "checking_files" => Self::CheckingFiles,
            "paused" => Self::Paused,
            "assembling" => Self::Assembling,
            "extracting" => Self::Extracting,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "cancelled" => Self::Cancelled,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub id: String,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub original_url: String,
    pub current_url: String,
    pub save_path: String,
    pub temp_path: String,
    pub final_path: String,
    pub status: DownloadStatus,
    pub mime_type: Option<String>,
    pub extension: Option<String>,
    pub supports_range: bool,
    pub max_connections: i64,
    pub max_parallel_downloads: i64,
    pub speed_limit_download: i64,
    pub speed_limit_inherited: bool,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub total_downloaded: i64,
    pub speed_current: f64,
    pub speed_average: f64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub delete_archive_after_extract: bool,
    pub download_type: String,
    pub info_hash: Option<String>,
    pub seeds: i64,
    pub peers: i64,
    pub upload_speed: f64,
    pub total_uploaded: i64,
    pub priority: i64,
    pub queue_order: i64,
    pub scheduled_start_at: Option<String>,
    pub daily_schedule_start_minute: Option<i64>,
    pub daily_schedule_end_minute: Option<i64>,
    pub scheduled_weekdays: i64,
    pub pause_outside_schedule: bool,
    pub skip_schedule_once: bool,
    pub scheduled_last_started_at: Option<String>,
    #[serde(default)]
    pub torrent_selected_file_indexes: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DownloadScheduleInput {
    pub scheduled_start_at: Option<String>,
    pub daily_schedule_start_minute: Option<i64>,
    pub daily_schedule_end_minute: Option<i64>,
    #[serde(default = "default_schedule_weekdays")]
    pub scheduled_weekdays: i64,
    #[serde(default)]
    pub pause_outside_schedule: bool,
}

fn default_schedule_weekdays() -> i64 {
    0b111_1111
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GlobalDownloadSchedule {
    pub daily_start_minute: Option<i64>,
    pub daily_end_minute: Option<i64>,
    #[serde(default = "default_schedule_weekdays")]
    pub weekdays: i64,
    #[serde(default)]
    pub pause_outside_schedule: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDownloadInput {
    pub file_name: String,
    pub file_size: Option<i64>,
    pub original_url: String,
    pub save_path: String,
    pub temp_path: String,
    pub final_path: String,
    pub mime_type: Option<String>,
    pub extension: Option<String>,
    pub supports_range: bool,
    #[serde(default = "default_max_connections")]
    pub max_connections: i64,
    #[serde(default = "default_parallel_downloads")]
    pub max_parallel_downloads: i64,
    #[serde(default)]
    pub speed_limit_download: i64,
    #[serde(default)]
    pub speed_limit_inherited: bool,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub delete_archive_after_extract: bool,
    #[serde(default = "default_download_type")]
    pub download_type: String,
    pub info_hash: Option<String>,
    #[serde(default = "default_priority")]
    pub priority: i64,
}

fn default_download_type() -> String {
    "http".into()
}

fn default_max_connections() -> i64 {
    8
}
fn default_parallel_downloads() -> i64 {
    3
}
fn default_priority() -> i64 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadInput {
    pub id: String,
    pub status: DownloadStatus,
    pub total_downloaded: i64,
    pub speed_current: f64,
    pub speed_average: f64,
    #[serde(default)]
    pub seeds: Option<i64>,
    #[serde(default)]
    pub peers: Option<i64>,
    #[serde(default)]
    pub upload_speed: Option<f64>,
    #[serde(default)]
    pub total_uploaded: Option<i64>,
}

#[allow(dead_code)]
#[cfg(test)]
mod tests {
    use super::DownloadStatus;

    #[test]
    fn accepts_expected_download_lifecycle_transitions() {
        use DownloadStatus::*;
        for (current, next) in [
            (Pending, CheckingFiles),
            (CheckingFiles, Downloading),
            (Downloading, Paused),
            (Paused, Downloading),
            (Downloading, Assembling),
            (Assembling, Completed),
            (Completed, Extracting),
            (Extracting, Completed),
            (Failed, Downloading),
            (Cancelled, Downloading),
        ] {
            assert!(current.can_transition_to(&next), "{current:?} -> {next:?}");
        }
    }

    #[test]
    fn rejects_terminal_or_out_of_order_transitions() {
        use DownloadStatus::*;
        for (current, next) in [
            (Completed, Downloading),
            (Assembling, Downloading),
            (Extracting, Downloading),
            (Pending, Completed),
        ] {
            assert!(!current.can_transition_to(&next), "{current:?} -> {next:?}");
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadChunk {
    pub id: String,
    pub download_id: String,
    pub index: i64,
    pub start_byte: i64,
    pub end_byte: i64,
    pub downloaded_bytes: i64,
    pub status: String,
    pub checksum: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSource {
    pub id: String,
    pub download_id: String,
    pub url: String,
    pub added_at: String,
    pub expired: bool,
    pub last_error: Option<String>,
    pub average_speed: f64,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: String,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub action_type: String,
    pub status: String,
    pub source_url: Option<String>,
    pub path: String,
    pub duration_seconds: Option<i64>,
    pub average_speed: Option<f64>,
    pub created_at: String,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub id: i64,
    pub root_download_folder: String,
    pub auto_organize_enabled: bool,
    pub default_speed_value: f64,
    pub default_speed_unit: String,
    pub max_parallel_downloads: i64,
    pub max_connections_per_download: i64,
    pub speed_limit_download: Option<i64>,
    pub speed_limit_upload: Option<i64>,
    pub theme: String,
    pub auto_extract_enabled: bool,
    pub delete_archive_after_extract: bool,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub display_name: String,
    pub avatar_path: Option<String>,
    pub local_user_id: String,
    pub status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
