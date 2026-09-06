use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, WebviewWindow};

pub fn start_drag_folder(window: &WebviewWindow, path: &str) -> Result<(), String> {
    let folder_path = crate::download::paths::canonical_existing_directory(Path::new(path))?;

    let drag_item = drag::DragItem::Files(vec![folder_path]);
    let app_data = window
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let icon_path = app_data
        .join("extension")
        .join("chromium")
        .join("icons")
        .join("sf-small.png");
    let preview_icon = if icon_path.exists() {
        drag::Image::File(icon_path)
    } else {
        drag::Image::File(std::path::PathBuf::new())
    };

    drag::start_drag(
        window,
        drag_item,
        preview_icon,
        |_result, _cursor| {
            crate::commands::debug::log_debug(
                "extension",
                "A operação de arrastar o pacote da extensão foi encerrada.",
                None,
                None,
                None,
            )
        },
        drag::Options::default(),
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_extension_dir(app: AppHandle, browser: String) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let ext_dir = app_data.join("extension").join(&browser);

    std::fs::create_dir_all(&ext_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(ext_dir.join("icons")).map_err(|e| e.to_string())?;

    let candidates = [
        PathBuf::from("browser-extension")
            .join("dist")
            .join(&browser),
        PathBuf::from("../browser-extension")
            .join("dist")
            .join(&browser),
        PathBuf::from("../../browser-extension")
            .join("dist")
            .join(&browser),
        app_data
            .join("..")
            .join("..")
            .join("browser-extension")
            .join("dist")
            .join(&browser),
    ];
    let project_dist = candidates
        .into_iter()
        .find(|p| p.exists())
        .unwrap_or_else(|| PathBuf::from(""));

    if browser == "chromium" {
        let files = [
            "manifest.json",
            "background.js",
            "content.js",
            "popup.html",
            "popup.css",
            "popup.js",
            "icons/sf-small.png",
            "icons/sf-large.png",
            "icons/sf-small-off.png",
            "icons/sf-large-off.png",
        ];
        for file in files {
            let src_file = project_dist.join(file);
            let dest_file = ext_dir.join(file);
            if let Ok(bytes) = std::fs::read(&src_file) {
                let _ = std::fs::write(&dest_file, bytes);
            } else {
                let embedded_bytes: &[u8] = match file {
                    "manifest.json" => {
                        include_bytes!("../../../browser-extension/dist/chromium/manifest.json")
                    }
                    "background.js" => {
                        include_bytes!("../../../browser-extension/dist/chromium/background.js")
                    }
                    "content.js" => {
                        include_bytes!("../../../browser-extension/dist/chromium/content.js")
                    }
                    "popup.html" => {
                        include_bytes!("../../../browser-extension/dist/chromium/popup.html")
                    }
                    "popup.css" => {
                        include_bytes!("../../../browser-extension/dist/chromium/popup.css")
                    }
                    "popup.js" => {
                        include_bytes!("../../../browser-extension/dist/chromium/popup.js")
                    }
                    "icons/sf-small.png" => include_bytes!(
                        "../../../browser-extension/dist/chromium/icons/sf-small.png"
                    ),
                    "icons/sf-large.png" => include_bytes!(
                        "../../../browser-extension/dist/chromium/icons/sf-large.png"
                    ),
                    "icons/sf-small-off.png" => include_bytes!(
                        "../../../browser-extension/dist/chromium/icons/sf-small-off.png"
                    ),
                    "icons/sf-large-off.png" => include_bytes!(
                        "../../../browser-extension/dist/chromium/icons/sf-large-off.png"
                    ),
                    _ => &[],
                };
                if !embedded_bytes.is_empty() {
                    let _ = std::fs::write(&dest_file, embedded_bytes);
                }
            }
        }
    } else if browser == "firefox" {
        let files = [
            "manifest.json",
            "background.js",
            "content.js",
            "popup.html",
            "popup.css",
            "popup.js",
            "icons/sf-small.png",
            "icons/sf-large.png",
            "icons/sf-small-off.png",
            "icons/sf-large-off.png",
        ];
        for file in files {
            let src_file = project_dist.join(file);
            let dest_file = ext_dir.join(file);
            if let Ok(bytes) = std::fs::read(&src_file) {
                let _ = std::fs::write(&dest_file, bytes);
            } else {
                let embedded_bytes: &[u8] = match file {
                    "manifest.json" => {
                        include_bytes!("../../../browser-extension/dist/firefox/manifest.json")
                    }
                    "background.js" => {
                        include_bytes!("../../../browser-extension/dist/firefox/background.js")
                    }
                    "content.js" => {
                        include_bytes!("../../../browser-extension/dist/firefox/content.js")
                    }
                    "popup.html" => {
                        include_bytes!("../../../browser-extension/dist/firefox/popup.html")
                    }
                    "popup.css" => {
                        include_bytes!("../../../browser-extension/dist/firefox/popup.css")
                    }
                    "popup.js" => {
                        include_bytes!("../../../browser-extension/dist/firefox/popup.js")
                    }
                    "icons/sf-small.png" => {
                        include_bytes!("../../../browser-extension/dist/firefox/icons/sf-small.png")
                    }
                    "icons/sf-large.png" => {
                        include_bytes!("../../../browser-extension/dist/firefox/icons/sf-large.png")
                    }
                    "icons/sf-small-off.png" => {
                        include_bytes!(
                            "../../../browser-extension/dist/firefox/icons/sf-small-off.png"
                        )
                    }
                    "icons/sf-large-off.png" => {
                        include_bytes!(
                            "../../../browser-extension/dist/firefox/icons/sf-large-off.png"
                        )
                    }
                    _ => &[],
                };
                if !embedded_bytes.is_empty() {
                    let _ = std::fs::write(&dest_file, embedded_bytes);
                }
            }
        }

        // Copia o arquivo XPI para instalação direta ou manual.
        let release_candidates = [
            PathBuf::from("browser-extension").join("release"),
            PathBuf::from("../browser-extension").join("release"),
            PathBuf::from("../../browser-extension").join("release"),
            app_data
                .join("..")
                .join("..")
                .join("browser-extension")
                .join("release"),
        ];
        let release_dir = release_candidates
            .into_iter()
            .find(|p| p.exists())
            .unwrap_or_else(|| PathBuf::from(""));
        let xpi_bytes = find_latest_xpi(&release_dir)
            .and_then(|path| std::fs::read(&path).ok())
            .unwrap_or_else(|| {
                include_bytes!("../../../browser-extension/release/firefox-extension.xpi").to_vec()
            });
        let _ = std::fs::write(ext_dir.join("firefox-extension.xpi"), &xpi_bytes);
        let _ = std::fs::write(ext_dir.join("integration.xpi"), &xpi_bytes);
    }

    Ok(ext_dir.to_string_lossy().to_string())
}

// Retorna o primeiro arquivo .xpi encontrado na pasta. A pasta release/ deve
// conter apenas o XPI da versão atual, então não há necessidade de comparar
// versões por nome de arquivo.
pub(crate) fn find_latest_xpi(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("xpi"))
        .max_by_key(|path| std::fs::metadata(path).and_then(|m| m.modified()).ok())
}
