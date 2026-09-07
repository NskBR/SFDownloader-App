use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, WebviewWindow};

const FIREFOX_XPI_NAME: &str = "sf_downloader_integration-firefox-0.3.5.xpi";
const FIREFOX_XPI: &[u8] =
    include_bytes!("../../../browser-extension/release/7c2944a3066543438b23-0.3.5.xpi");

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
    let browser = match browser.as_str() {
        "chromium" | "firefox" => browser,
        _ => return Err("Navegador de extensão inválido.".into()),
    };
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
    } else {
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
    }

    Ok(ext_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_firefox_xpi_path(app: AppHandle) -> Result<String, String> {
    let xpi_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("extension")
        .join("firefox");
    std::fs::create_dir_all(&xpi_dir).map_err(|error| error.to_string())?;

    let xpi_path = xpi_dir.join(FIREFOX_XPI_NAME);
    std::fs::write(&xpi_path, FIREFOX_XPI)
        .map_err(|error| format!("Não foi possível preparar o XPI assinado: {error}"))?;
    Ok(xpi_path.to_string_lossy().into_owned())
}
