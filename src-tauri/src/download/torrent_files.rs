use crate::download::paths::validate_destructive_path;
use crate::download::torrent_metadata::TorrentFileItem;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

pub fn has_selected_subset(files: &[TorrentFileItem], selected_file_indexes: &[usize]) -> bool {
    let selected = selected_indexes(selected_file_indexes);
    !selected.is_empty()
        && selected.iter().all(|index| *index < files.len())
        && selected.len() < files.len()
}

pub fn selected_size(files: &[TorrentFileItem], selected_file_indexes: &[usize]) -> u64 {
    selected_indexes(selected_file_indexes)
        .into_iter()
        .filter_map(|index| files.get(index).map(|file| file.size))
        .sum()
}

pub fn selected_progress(
    files: &[TorrentFileItem],
    selected_file_indexes: &[usize],
    file_progress: &[u64],
) -> u64 {
    selected_indexes(selected_file_indexes)
        .into_iter()
        .filter_map(|index| {
            let file = files.get(index)?;
            Some(
                file_progress
                    .get(index)
                    .copied()
                    .unwrap_or(0)
                    .min(file.size),
            )
        })
        .sum()
}

pub fn normalize_selected_file_indexes(
    files: &[TorrentFileItem],
    selected_file_indexes: &[usize],
) -> Vec<usize> {
    let mut normalized = selected_indexes(selected_file_indexes)
        .into_iter()
        .filter(|index| *index < files.len())
        .collect::<Vec<_>>();
    normalized.sort_unstable();
    normalized
}

pub fn selected_indexes(selected_file_indexes: &[usize]) -> HashSet<usize> {
    selected_file_indexes.iter().copied().collect()
}

pub fn remove_initialized_unselected_files(
    save_dir: &Path,
    files: &[TorrentFileItem],
    selected_file_indexes: &[usize],
) -> Vec<PathBuf> {
    let selected = selected_indexes(selected_file_indexes);
    files
        .iter()
        .filter(|file| !selected.contains(&file.index))
        .filter_map(|file| {
            let relative = Path::new(&file.path);
            if !relative
                .components()
                .all(|component| matches!(component, Component::Normal(_)))
            {
                return None;
            }
            let path = save_dir.join(relative);
            let path = validate_destructive_path(save_dir, &path).ok()?;
            let initialized_empty_file = std::fs::metadata(&path)
                .map(|metadata| metadata.is_file() && metadata.len() == 0)
                .unwrap_or(false);
            if initialized_empty_file {
                std::fs::remove_file(&path).ok()?;
                Some(path)
            } else {
                None
            }
        })
        .collect()
}

pub fn remove_known_torrent_files(
    save_dir: &Path,
    files: &[TorrentFileItem],
    selected_file_indexes: &[usize],
) -> Vec<PathBuf> {
    let selected = selected_indexes(selected_file_indexes);
    let is_subset = has_selected_subset(files, selected_file_indexes);
    files
        .iter()
        .filter(|file| !is_subset || selected.contains(&file.index))
        .filter_map(|file| {
            let relative = Path::new(&file.path);
            if !relative
                .components()
                .all(|component| matches!(component, Component::Normal(_)))
            {
                return None;
            }
            let candidate = save_dir.join(relative);
            let candidate = validate_destructive_path(save_dir, &candidate).ok()?;
            if std::fs::metadata(&candidate)
                .map(|metadata| metadata.is_file())
                .unwrap_or(false)
            {
                std::fs::remove_file(&candidate).ok()?;
                Some(candidate)
            } else {
                None
            }
        })
        .collect()
}
pub fn remove_empty_unselected_files(
    save_dir: &Path,
    files: &[TorrentFileItem],
    selected_file_indexes: &[usize],
) {
    let selected = selected_indexes(selected_file_indexes);
    for file in files.iter().filter(|file| !selected.contains(&file.index)) {
        let relative = Path::new(&file.path);
        let safe_relative = relative
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir));
        if !safe_relative {
            continue;
        }

        let candidate = save_dir.join(relative);
        let Ok(candidate) = validate_destructive_path(save_dir, &candidate) else {
            continue;
        };
        if std::fs::metadata(&candidate)
            .map(|metadata| metadata.is_file() && metadata.len() == 0)
            .unwrap_or(false)
        {
            let _ = std::fs::remove_file(candidate);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        has_selected_subset, normalize_selected_file_indexes, remove_initialized_unselected_files,
        remove_known_torrent_files, selected_progress, selected_size,
    };
    use crate::download::torrent_metadata::TorrentFileItem;

    fn files() -> Vec<TorrentFileItem> {
        vec![
            TorrentFileItem {
                index: 0,
                path: "first.bin".into(),
                size: 10,
            },
            TorrentFileItem {
                index: 1,
                path: "second.bin".into(),
                size: 20,
            },
        ]
    }

    #[test]
    fn identifies_a_real_file_subset() {
        assert!(has_selected_subset(&files(), &[1]));
        assert!(!has_selected_subset(&files(), &[]));
        assert!(!has_selected_subset(&files(), &[0, 1]));
    }

    #[test]
    fn sums_only_selected_files() {
        assert_eq!(selected_size(&files(), &[1, 1, 99]), 20);
    }

    #[test]
    fn selection_progress_is_deduplicated_and_clamped_to_file_sizes() {
        assert_eq!(selected_progress(&files(), &[1, 1, 99], &[8, 25]), 20);
        assert_eq!(selected_progress(&files(), &[0, 1], &[4]), 4);
    }

    #[test]
    fn normalizes_selection_before_persisting_it() {
        assert_eq!(
            normalize_selected_file_indexes(&files(), &[1, 0, 1, 99]),
            [0, 1]
        );
    }
    #[test]
    fn cleanup_removes_only_known_selected_files() {
        let root = std::env::temp_dir().join(format!(
            "sfdownloader-torrent-files-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("first.bin"), b"one").unwrap();
        std::fs::write(root.join("second.bin"), b"two").unwrap();
        std::fs::write(root.join("unrelated.txt"), b"keep").unwrap();
        let removed = remove_known_torrent_files(&root, &files(), &[1]);
        assert_eq!(removed, vec![root.join("second.bin")]);
        assert!(root.join("first.bin").exists());
        assert!(!root.join("second.bin").exists());
        assert!(root.join("unrelated.txt").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn initialization_cleanup_preserves_preexisting_unselected_content() {
        let root = std::env::temp_dir().join(format!(
            "sfdownloader-torrent-init-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("first.bin"), b"selected").unwrap();
        std::fs::write(root.join("second.bin"), b"existing").unwrap();
        assert!(remove_initialized_unselected_files(&root, &files(), &[0]).is_empty());
        assert!(root.join("second.bin").exists());
        std::fs::write(root.join("second.bin"), b"").unwrap();
        assert_eq!(
            remove_initialized_unselected_files(&root, &files(), &[0]),
            vec![root.join("second.bin")]
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
