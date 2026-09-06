pub mod migrations;
pub mod models;
pub mod repositories;

use rusqlite::Connection;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
    recovered_ids: Arc<Vec<String>>,
}

fn verify_integrity(connection: &Connection) -> Result<(), String> {
    let result: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| format!("Falha ao verificar a integridade do banco: {error}"))?;
    if result.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(format!("integrity_check retornou: {result}"))
    }
}

fn backup_corrupted_database(path: &Path, reason: &str) -> Result<(), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Falha ao gerar identificador de recuperação: {error}"))?
        .as_secs();
    let backup = path.with_extension(format!("sqlite3.corrupt-{timestamp}"));
    std::fs::rename(path, &backup).map_err(|error| {
        format!(
            "Banco corrompido ({reason}) não pôde ser preservado em {}: {error}",
            backup.display()
        )
    })?;
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{}", path.display(), suffix));
        if sidecar.exists() {
            let backup_sidecar = PathBuf::from(format!("{}{}", backup.display(), suffix));
            std::fs::rename(&sidecar, &backup_sidecar).map_err(|error| {
                format!("Não foi possível preservar {}: {error}", sidecar.display())
            })?;
        }
    }
    Ok(())
}

impl Database {
    pub fn initialize(data_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir)
            .map_err(|error| format!("Não foi possível criar o diretório de dados: {error}"))?;
        let mut database = Self {
            path: data_dir.join("sf_downloader.sqlite3"),
            recovered_ids: Arc::new(Vec::new()),
        };
        // Abrir sem PRAGMAs primeiro: um arquivo corrompido pode rejeitar até a ativação
        // do modo WAL. Isso ainda nos permite preservá-lo antes de criar um banco limpo.
        let mut connection = Connection::open(&database.path)
            .map_err(|error| format!("Falha ao abrir o banco local: {error}"))?;
        let initial_check = connection
            .execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")
            .map_err(|error| format!("Falha ao otimizar o banco local: {error}"))
            .and_then(|_| verify_integrity(&connection));
        if let Err(reason) = initial_check {
            drop(connection);
            backup_corrupted_database(&database.path, &reason)?;
            connection = database.connect()?;
            connection
                .execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")
                .map_err(|error| format!("Falha ao recriar o banco local: {error}"))?;
        }
        migrations::run(&mut connection)
            .map_err(|error| format!("Falha ao migrar o banco: {error}"))?;
        let recovered = repositories::downloads::recover_interrupted(&connection)
            .map_err(|error| format!("Falha ao recuperar downloads interrompidos: {error}"))?;
        database.recovered_ids = Arc::new(recovered);
        Ok(database)
    }

    pub fn connect(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.path)
            .map_err(|error| format!("Falha ao abrir o banco local: {error}"))?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 30000; PRAGMA wal_autocheckpoint = 1000;",
            )
            .map_err(|error| format!("Falha ao configurar o banco: {error}"))?;
        Ok(connection)
    }

    pub fn recovered_ids(&self) -> &[String] {
        &self.recovered_ids
    }
}
#[cfg(test)]
mod tests {
    use super::Database;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn preserves_corrupted_database_before_recreating_it() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let data_dir = std::env::temp_dir().join(format!("sfdownloader-db-integrity-{timestamp}"));
        fs::create_dir_all(&data_dir).expect("create temporary data directory");
        fs::write(
            data_dir.join("sf_downloader.sqlite3"),
            b"not a sqlite database",
        )
        .expect("write corrupted database");

        let database = Database::initialize(&data_dir).expect("recover corrupted database");
        database.connect().expect("open recreated database");
        let preserved = fs::read_dir(&data_dir)
            .expect("read recovery directory")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().contains(".corrupt-"));
        assert!(preserved, "the corrupted database must be preserved");

        fs::remove_dir_all(&data_dir).expect("remove temporary data directory");
    }
}
