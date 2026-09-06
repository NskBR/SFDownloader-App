use crate::database::{repositories::metrics, Database};
use std::sync::mpsc;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn metrics_snapshot(database: State<'_, Database>) -> Result<metrics::MetricsSnapshot, String> {
    metrics::snapshot(&database.connect()?)
        .map_err(|error| format!("Falha ao ler métricas: {error}"))
}

#[tauri::command]
pub fn reset_metrics(database: State<'_, Database>) -> Result<(), String> {
    metrics::reset(&database.connect()?)
        .map_err(|error| format!("Falha ao redefinir métricas: {error}"))
}

fn human_bytes(value: i64) -> String {
    let gb = value as f64 / 1024.0 / 1024.0 / 1024.0;
    if gb >= 1.0 {
        format!("{:.2} GB", gb)
    } else {
        let mb = value as f64 / 1024.0 / 1024.0;
        format!("{:.1} MB", mb)
    }
}

#[tauri::command]
pub fn export_metrics(
    app: AppHandle,
    database: State<'_, Database>,
    format: String,
) -> Result<String, String> {
    let snapshot = metrics::snapshot(&database.connect()?)
        .map_err(|error| format!("Falha ao ler métricas: {error}"))?;
    let payload = if format == "txt" {
        format!(
            "Métricas do SF Downloader\n\
             Total baixado: {}\n\
             Concluído: {}\n\
             Cancelado: {}\n\
             Falho: {}\n\
             Extraído: {}\n\
             SSD gravado: {}\n\
             Downloads concluídos: {}\n\
             Duração total: {} ms\n",
            human_bytes(snapshot.total_bytes),
            human_bytes(snapshot.completed_bytes),
            human_bytes(snapshot.cancelled_bytes),
            human_bytes(snapshot.failed_bytes),
            human_bytes(snapshot.extracted_bytes),
            human_bytes(snapshot.ssd_written_bytes),
            snapshot.completed_count,
            snapshot.total_duration_ms,
        )
    } else {
        serde_json::to_string_pretty(&snapshot).map_err(|error| error.to_string())?
    };
    let file_name = if format == "txt" {
        "metricas.txt"
    } else {
        "metricas.json"
    };

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    app.dialog()
        .file()
        .set_title("Exportar métricas")
        .set_file_name(file_name)
        .add_filter("Arquivo de métricas", &["json", "txt"])
        .save_file(move |path: Option<tauri_plugin_dialog::FilePath>| {
            let result = match path {
                Some(path) => {
                    let path = std::path::PathBuf::from(path.to_string());
                    std::fs::write(&path, &payload)
                        .map(|()| path.to_string_lossy().into_owned())
                        .map_err(|error| format!("Falha ao salvar: {error}"))
                }
                None => Err("Exportação cancelada.".to_string()),
            };
            let _ = tx.send(result);
        });
    rx.recv()
        .unwrap_or(Err("Exportação cancelada.".to_string()))
}

#[tauri::command]
pub fn import_metrics(app: AppHandle, database: State<'_, Database>) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<Result<metrics::MetricsSnapshot, String>>();
    app.dialog()
        .file()
        .set_title("Importar métricas")
        .add_filter("Arquivo JSON", &["json"])
        .pick_file(move |path: Option<tauri_plugin_dialog::FilePath>| {
            let result = match path {
                Some(path) => {
                    let path = std::path::PathBuf::from(path.to_string());
                    match std::fs::read_to_string(&path) {
                        Ok(content) => serde_json::from_str(&content)
                            .map_err(|error| format!("JSON inválido: {error}")),
                        Err(error) => Err(format!("Falha ao ler: {error}")),
                    }
                }
                None => Err("Importação cancelada.".to_string()),
            };
            let _ = tx.send(result);
        });
    let snapshot = rx
        .recv()
        .unwrap_or(Err("Importação cancelada.".to_string()))?;
    let connection = database.connect()?;
    metrics::replace(&connection, &snapshot)
        .map_err(|error| format!("Falha ao importar: {error}"))?;
    Ok(())
}
