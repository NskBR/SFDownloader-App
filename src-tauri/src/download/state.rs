use crate::database::models::DownloadStatus;

/// Estado interno do worker: não é persistido nem enviado diretamente para a UI.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerState {
    Idle,
    CheckingFiles,
    Transferring,
    Finalizing,
    Stopped,
}

/// Classificação estável para a UI. O texto exibido continua sendo definido pelos consumidores.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisplayState {
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

pub fn can_transition(current: &DownloadStatus, next: &DownloadStatus) -> bool {
    use DownloadStatus::*;
    if current == next {
        return true;
    }
    matches!(
        (current, next),
        (
            Pending,
            CheckingFiles | Downloading | Paused | Failed | Cancelled
        ) | (CheckingFiles, Downloading | Paused | Failed | Cancelled)
            | (
                Downloading,
                Paused | Assembling | Completed | Failed | Cancelled
            )
            | (Paused, CheckingFiles | Downloading | Failed | Cancelled)
            | (Assembling, Extracting | Completed | Failed | Cancelled)
            | (Extracting, Completed | Failed | Cancelled)
            | (Completed, Extracting)
            | (
                Failed,
                Pending | CheckingFiles | Downloading | Paused | Cancelled
            )
            | (Cancelled, Pending | CheckingFiles | Downloading | Paused)
    )
}

#[allow(dead_code)]
pub fn display_state(status: &DownloadStatus) -> DisplayState {
    match status {
        DownloadStatus::Pending => DisplayState::Pending,
        DownloadStatus::CheckingFiles => DisplayState::CheckingFiles,
        DownloadStatus::Downloading => DisplayState::Downloading,
        DownloadStatus::Paused => DisplayState::Paused,
        DownloadStatus::Assembling => DisplayState::Assembling,
        DownloadStatus::Extracting => DisplayState::Extracting,
        DownloadStatus::Completed => DisplayState::Completed,
        DownloadStatus::Failed => DisplayState::Failed,
        DownloadStatus::Cancelled => DisplayState::Cancelled,
    }
}

#[cfg(test)]
mod tests {
    use super::{can_transition, display_state, DisplayState};
    use crate::database::models::DownloadStatus;

    #[test]
    fn maps_persisted_status_to_a_display_state() {
        assert_eq!(
            display_state(&DownloadStatus::CheckingFiles),
            DisplayState::CheckingFiles
        );
    }

    #[test]
    fn rejects_terminal_regression() {
        assert!(!can_transition(
            &DownloadStatus::Completed,
            &DownloadStatus::Downloading
        ));
    }
}
