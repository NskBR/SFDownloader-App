use std::path::Path;
use tauri::{AppHandle, Manager, WebviewWindow};

const FIREFOX_XPI_NAME: &str = "sf_downloader_integration-firefox-0.3.6.xpi";
const FIREFOX_XPI: &[u8] =
    include_bytes!("../../../browser-extension/release/7c2944a3066543438b23-0.3.6.xpi");

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

// Keep each embedded package coherent: mixing a new manifest with old JS breaks loading.
macro_rules! extension_assets {
    ($browser:literal) => {
        &[
            (
                "background.js",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/background.js"
                )) as &[u8],
            ),
            (
                "background-worker.js",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/background-worker.js"
                )) as &[u8],
            ),
            (
                "content.js",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/content.js"
                )) as &[u8],
            ),
            (
                "youtube-url.js",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/youtube-url.js"
                )) as &[u8],
            ),
            (
                "youtube.js",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/youtube.js"
                )) as &[u8],
            ),
            (
                "popup.html",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/popup.html"
                )) as &[u8],
            ),
            (
                "popup.css",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/popup.css"
                )) as &[u8],
            ),
            (
                "popup.js",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/popup.js"
                )) as &[u8],
            ),
            (
                "icons/sf-small.png",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/icons/sf-small.png"
                )) as &[u8],
            ),
            (
                "icons/sf-large.png",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/icons/sf-large.png"
                )) as &[u8],
            ),
            (
                "icons/sf-small-off.png",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/icons/sf-small-off.png"
                )) as &[u8],
            ),
            (
                "icons/sf-large-off.png",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/icons/sf-large-off.png"
                )) as &[u8],
            ),
            (
                "icons/sf-logo.svg",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/icons/sf-logo.svg"
                )) as &[u8],
            ),
            // Publish the manifest after all of its referenced assets have been written.
            (
                "manifest.json",
                include_bytes!(concat!(
                    "../../../browser-extension/dist/",
                    $browser,
                    "/manifest.json"
                )) as &[u8],
            ),
        ]
    };
}

fn bundled_assets(browser: &str) -> Result<&'static [(&'static str, &'static [u8])], String> {
    match browser {
        "chromium" => Ok(extension_assets!("chromium")),
        "firefox" => Ok(extension_assets!("firefox")),
        _ => Err("Navegador de extensão inválido.".into()),
    }
}

fn extract_bundle(destination: &Path, assets: &[(&str, &[u8])]) -> Result<(), String> {
    for (name, bytes) in assets {
        let path = destination.join(name);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Não foi possível preparar a extensão: {e}"))?;
        }
        std::fs::write(&path, bytes).map_err(|e| format!("Não foi possível gravar {name}: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_extension_dir(app: AppHandle, browser: String) -> Result<String, String> {
    let assets = bundled_assets(&browser)?;
    let ext_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("extension")
        .join(browser);
    extract_bundle(&ext_dir, assets)?;
    Ok(ext_dir.to_string_lossy().into_owned())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn firefox_signed_package_matches_the_embedded_extension() {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(FIREFOX_XPI)).unwrap();
        let signed: serde_json::Value =
            serde_json::from_reader(archive.by_name("manifest.json").unwrap()).unwrap();
        let assets = bundled_assets("firefox").unwrap();
        let manifest = assets
            .iter()
            .find(|(name, _)| *name == "manifest.json")
            .unwrap();
        let embedded: serde_json::Value = serde_json::from_slice(manifest.1).unwrap();
        assert_eq!(signed["version"], embedded["version"]);
        assert_eq!(
            signed["browser_specific_settings"]["gecko"]["id"],
            embedded["browser_specific_settings"]["gecko"]["id"]
        );
        assert!(FIREFOX_XPI_NAME.contains(signed["version"].as_str().unwrap()));
        for name in ["META-INF/mozilla.rsa", "META-INF/cose.sig"] {
            assert!(archive.by_name(name).is_ok(), "missing signature: {name}");
        }
        for (name, bytes) in assets.iter().filter(|(name, _)| *name != "manifest.json") {
            let mut contents = Vec::new();
            std::io::Read::read_to_end(&mut archive.by_name(name).unwrap(), &mut contents).unwrap();
            assert_eq!(&contents, bytes, "signed extension differs: {name}");
        }
    }

    #[test]
    fn embedded_extensions_extract_every_manifest_dependency() {
        for browser in ["chromium", "firefox"] {
            let assets = bundled_assets(browser).unwrap();
            let directory =
                std::env::temp_dir().join(format!("sf-extension-{}", uuid::Uuid::new_v4()));
            extract_bundle(&directory, assets).unwrap();
            let manifest: serde_json::Value =
                serde_json::from_slice(&std::fs::read(directory.join("manifest.json")).unwrap())
                    .unwrap();
            let assert_file =
                |file: &str| assert!(directory.join(file).is_file(), "{browser}: missing {file}");
            for script in manifest["content_scripts"].as_array().unwrap() {
                for file in script["js"].as_array().unwrap() {
                    assert_file(file.as_str().unwrap());
                }
            }
            if let Some(worker) = manifest["background"]["service_worker"].as_str() {
                assert_file(worker);
            }
            if let Some(scripts) = manifest["background"]["scripts"].as_array() {
                for file in scripts {
                    assert_file(file.as_str().unwrap());
                }
            }
            for resource in manifest["web_accessible_resources"].as_array().unwrap() {
                for file in resource["resources"].as_array().unwrap() {
                    assert_file(file.as_str().unwrap());
                }
            }
            // Module imports are dependencies too, although they are not listed in the manifest.
            assert_file("youtube-url.js");
            assert_file("background.js");
            std::fs::remove_dir_all(directory).unwrap();
        }
        assert!(bundled_assets("../../invalid").is_err());
    }
}
