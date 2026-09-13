#![allow(linker_messages)]

use crate::download::paths::valid_category_name;

const CATEGORY_FOLDERS: [&str; 9] = [
    "Imagens",
    "Vídeos",
    "Áudios",
    "Documentos",
    "Compactados",
    "Modelos de IA",
    "Aplicativos",
    "Torrents",
    "Outros",
];

#[tauri::command]
fn create_category_folders(
    root_path: String,
    custom_categories: Vec<String>,
) -> Result<Vec<String>, String> {
    let trimmed = root_path.trim();
    if trimmed.is_empty() {
        return Err("A pasta principal não pode ficar vazia.".into());
    }
    let root = std::path::PathBuf::from(trimmed);
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("Não foi possível criar a pasta principal: {error}"))?;
    let categories = CATEGORY_FOLDERS
        .iter()
        .map(|category| (*category).to_string())
        .chain(custom_categories)
        .collect::<Vec<_>>();
    categories
        .iter()
        .map(|category| {
            if !valid_category_name(category) {
                return Err(format!("Nome de categoria inválido: {category}"));
            }
            let path = root.join(category);
            std::fs::create_dir_all(&path)
                .map_err(|error| format!("Não foi possível criar '{}': {error}", path.display()))?;
            Ok(path.to_string_lossy().into_owned())
        })
        .collect()
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())
    } else {
        manager.disable().map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn is_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn is_autostart_boot() -> bool {
    std::env::args().any(|arg| arg == "--autostart" || arg == "--minimized" || arg == "--tray")
}

fn pending_torrent_files() -> &'static std::sync::Mutex<Vec<String>> {
    static FILES: std::sync::OnceLock<std::sync::Mutex<Vec<String>>> = std::sync::OnceLock::new();
    FILES.get_or_init(|| std::sync::Mutex::new(Vec::new()))
}

fn torrent_paths_from_args(arguments: impl IntoIterator<Item = String>) -> Vec<String> {
    arguments
        .into_iter()
        .filter_map(|argument| {
            let path = argument.trim_matches('"');
            std::path::Path::new(path)
                .extension()
                .filter(|extension| extension.eq_ignore_ascii_case("torrent"))
                .map(|_| path.to_string())
        })
        .collect()
}

fn queue_torrent_files(paths: impl IntoIterator<Item = String>) {
    let mut pending = pending_torrent_files()
        .lock()
        .expect("fila de arquivos torrent indisponível");
    for path in paths {
        if !pending.iter().any(|queued| queued == &path) {
            pending.push(path);
        }
    }
}

#[tauri::command]
fn take_pending_torrent_files() -> Vec<String> {
    let mut pending = pending_torrent_files()
        .lock()
        .expect("fila de arquivos torrent indisponível");
    std::mem::take(&mut *pending)
}

#[derive(Default)]
struct WindowThemeSettings(std::sync::Mutex<Option<serde_json::Value>>);

#[tauri::command]
fn cache_theme_settings(
    theme_settings: serde_json::Value,
    state: tauri::State<'_, WindowThemeSettings>,
) {
    if let Ok(mut cached) = state.0.lock() {
        *cached = Some(theme_settings);
    }
}

#[tauri::command]
fn current_theme_settings(
    state: tauri::State<'_, WindowThemeSettings>,
) -> Option<serde_json::Value> {
    state.0.lock().ok().and_then(|cached| cached.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    queue_torrent_files(torrent_paths_from_args(std::env::args()));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let torrents = torrent_paths_from_args(argv);
            queue_torrent_files(torrents.iter().cloned());
            for torrent in torrents {
                let _ = app.emit("torrent-file-open", torrent);
            }
            show_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(|app| {
            app.manage(WindowThemeSettings::default());
            let open_item =
                MenuItem::with_id(app, "tray-open", "Abrir SFDownloader", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(
                app,
                "tray-hide",
                "Minimizar para a bandeja",
                true,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "tray-quit", "Sair", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &hide_item, &quit_item])?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("SFDownloader")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "tray-open" => show_main_window(app),
                    "tray-hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "tray-quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } | TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            let data_dir = app.path().app_data_dir()?;
            let database =
                database::Database::initialize(&data_dir).map_err(std::io::Error::other)?;
            let recovered_ids = database.recovered_ids().to_vec();
            let runtime = download::runtime::DownloadRuntime::default();
            let browser_bridge = browser_bridge::BrowserBridge::default();
            app.manage(database.clone());
            app.manage(runtime.clone());
            app.manage(browser_bridge.clone());
            commands::debug::log_info(
                "system",
                "SFDownloader iniciado.",
                Some(format!(
                    "versão={}; sistema={}; arquitetura={}; engine=pronta",
                    env!("CARGO_PKG_VERSION"),
                    std::env::consts::OS,
                    std::env::consts::ARCH
                )),
                None,
                None,
                Some(app.handle()),
            );
            browser_bridge::start(app.handle().clone(), browser_bridge.clone());
            let startup_app = app.handle().clone();
            let startup_database = database.clone();
            let startup_runtime = runtime.clone();
            let startup_bridge = browser_bridge.clone();
            let startup_recovered_ids = recovered_ids.clone();
            commands::scheduling::start_scheduler(
                startup_app.clone(),
                startup_database.clone(),
                startup_runtime,
                startup_bridge,
            );
            tauri::async_runtime::spawn(async move {
                let (restored, failed) = commands::task_control::restore_recovered_torrents(
                    startup_database.clone(),
                    &startup_recovered_ids,
                )
                .await;
                commands::debug::log_info(
                    "torrent",
                    "Restauração automática de torrents finalizada",
                    Some(format!("restaurados={restored}, falhas={failed}")),
                    None,
                    None,
                    Some(&startup_app),
                );
            });
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
                    1104.0, 611.0,
                ))));
                let is_autostart = std::env::args()
                    .any(|arg| arg == "--autostart" || arg == "--minimized" || arg == "--tray");
                // A janela principal só é exibida pelo frontend, depois que o
                // pré-loader está pintado. Mostrar aqui expunha um frame cinza
                // do WebView antes de o HTML/CSS inicial estar disponível.
                if is_autostart {
                    let _ = window.hide();
                }
            }
            if !recovered_ids.is_empty() {
                commands::debug::log_info(
                    "scheduler",
                    "Downloads interrompidos foram marcados como pausados para recuperação",
                    Some(format!("quantidade={}", recovered_ids.len())),
                    None,
                    None,
                    Some(app.handle()),
                );
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    _ => {}
                }
            }
        })
        .on_menu_event(|app, event| {
            let id_str = event.id().as_ref().to_string();
            if id_str.starts_with("tray-") {
                return;
            }
            if let Some((action, download_id)) = id_str.split_once('_') {
                let _ = app.emit(
                    "context-menu-action",
                    serde_json::json!({
                        "action": action,
                        "downloadId": download_id
                    }),
                );
            }
        })
        .invoke_handler(tauri::generate_handler![
            create_category_folders,
            browser_bridge::browser_extension_status,
            browser_bridge::browser_extension_diagnostics,
            browser_bridge::update_extension_theme,
            commands::context_menu::show_download_context_menu,
            commands::downloads::create_download,
            commands::downloads::list_downloads,
            commands::downloads::update_download,
            commands::downloads::remove_download,
            commands::downloads::list_history,
            commands::downloads::remove_history_item,
            commands::downloads::clear_history,
            commands::profile::profile_statistics,
            commands::downloads::reveal_in_folder,
            commands::downloads::open_file,
            commands::transfer::start_download,
            commands::inspection::inspect_download,
            commands::windows::open_download_confirmation,
            commands::transfer::queue_download,
            commands::task_control::cancel_download,
            commands::task_control::pause_download,
            commands::task_control::resume_download,
            commands::task_control::replace_download_url,
            commands::windows::open_progress_window,
            commands::windows::open_complete_window,
            commands::windows::show_ready_window,
            commands::transfer::update_speed_limit,
            commands::transfer::update_download_priority,
            commands::transfer::prioritize_download,
            commands::transfer::move_download_queue_item,
            commands::scheduling::update_download_schedule,
            commands::scheduling::bypass_download_schedule,
            commands::scheduling::next_download_execution,
            commands::scheduling::get_global_download_schedule,
            commands::scheduling::update_global_download_schedule,
            commands::windows::open_browser_integration_window,
            commands::browser_extension::get_extension_dir,
            commands::browser_extension::get_firefox_xpi_path,
            commands::system::open_folder,
            commands::system::open_url,
            commands::transfer::start_drag_folder,
            commands::transfer::parse_torrent_info,
            commands::transfer::confirm_torrent,
            commands::transfer::cancel_torrent,
            commands::transfer::torrent_file_selection,
            commands::transfer::update_torrent_file_selection,
            commands::windows::open_torrent_progress_window,
            commands::windows::open_torrent_file_selection_window,
            commands::metrics::metrics_snapshot,
            commands::metrics::reset_metrics,
            commands::metrics::export_metrics,
            commands::metrics::import_metrics,
            set_autostart,
            is_autostart_enabled,
            is_autostart_boot,
            take_pending_torrent_files,
            cache_theme_settings,
            current_theme_settings,
            download::extraction::extraction_status,
            commands::updater::check_for_updates,
            commands::updater::update_download_status,
            commands::updater::download_update,
            commands::updater::cancel_update_download,
            commands::updater::install_downloaded_update,
            commands::debug::get_debug_logs,
            commands::debug::get_diagnostic_report,
            commands::debug::clear_debug_logs,
            commands::debug::open_debug_window
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o SF Downloader");
}
mod browser_bridge;
mod commands;
mod database;
mod download;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_skip_taskbar(false);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod category_tests {
    use super::valid_category_name;

    #[test]
    fn category_names_cannot_escape_the_download_root() {
        assert!(valid_category_name("Jogos antigos"));
        assert!(!valid_category_name("../Documentos"));
        assert!(!valid_category_name("Jogos\\PC"));
        assert!(!valid_category_name("."));
    }
}
