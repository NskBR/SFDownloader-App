use librqbit::dht::DhtPersistenceConfig;
use librqbit::{
    AddTorrent, AddTorrentOptions, DhtSessionConfig, ManagedTorrent, Session, SessionOptions,
};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::RwLock;

pub fn persistence_root() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("APPDATA"))
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("SF Downloader")
        .join("torrent-session")
}

pub fn cached_torrent_path(info_hash: &str) -> PathBuf {
    persistence_root().join(format!("{info_hash}.torrent"))
}

pub fn preferred_restore_source(info_hash: &str, original_source: &str) -> String {
    let cached = cached_torrent_path(info_hash);
    if cached.is_file() {
        cached.to_string_lossy().into_owned()
    } else {
        original_source.to_string()
    }
}

pub fn cache_metainfo(info_hash: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    if bytes.is_empty() {
        return Err("Metadados vazios não podem ser armazenados.".into());
    }
    let root = persistence_root();
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("Falha ao preparar cache do torrent: {error}"))?;
    let target = cached_torrent_path(info_hash);
    if target.metadata().is_ok_and(|metadata| metadata.len() > 0) {
        return Ok(target);
    }
    let temporary = root.join(format!("{info_hash}.{}.tmp", uuid::Uuid::new_v4()));
    std::fs::write(&temporary, bytes)
        .map_err(|error| format!("Falha ao gravar metadados do torrent: {error}"))?;
    if target.exists() {
        let _ = std::fs::remove_file(&target);
    }
    std::fs::rename(&temporary, &target).map_err(|error| {
        let _ = std::fs::remove_file(&temporary);
        format!("Falha ao concluir cache do torrent: {error}")
    })?;
    Ok(target)
}

pub async fn get_or_create(
    slot: &Arc<RwLock<Option<Arc<Session>>>>,
    default_output_dir: &Path,
) -> Result<Arc<Session>, String> {
    let mut guard = slot.write().await;
    if let Some(session) = guard.as_ref() {
        return Ok(session.clone());
    }
    let mut persistence_root = persistence_root();
    if cfg!(test) {
        persistence_root = default_output_dir
            .join("torrent-session")
            .join(uuid::Uuid::new_v4().to_string());
    }
    std::fs::create_dir_all(&persistence_root)
        .map_err(|error| format!("Falha ao preparar persistência do motor Torrent: {error}"))?;
    let opts = SessionOptions {
        dht: Some(DhtSessionConfig {
            persistence: Some(DhtPersistenceConfig {
                config_filename: Some(persistence_root.join("dht.json")),
                ..Default::default()
            }),
            ..Default::default()
        }),
        // O SFDownloader restaura torrents pelo próprio banco de dados. Ativar
        // também a persistência de sessão do librqbit duplica essa responsabilidade
        // e pode bloquear a inicialização ao tentar reabrir handles temporários.
        persistence: None,
        fastresume: false,
        ..Default::default()
    };
    let session = match Session::new_with_opts(default_output_dir.to_path_buf(), opts).await {
        Ok(session) => session,
        Err(persistent_error) => {
            // Um encerramento forçado ou outra instância de desenvolvimento pode
            // deixar ocupada a porta gravada pelo DHT. Não inutilize o Torrent por
            // isso: reinicie o DHT em uma porta livre. A restauração dos downloads
            // continua sendo feita pelo banco de dados do SFDownloader.
            crate::commands::debug::log_warn(
                "torrent",
                "A persistência DHT falhou; o motor será reiniciado sem persistência.",
                Some(persistent_error.to_string()),
                None,
                None,
                None,
            );
            let fallback_opts = SessionOptions {
                dht: Some(DhtSessionConfig {
                    persistence: None,
                    ..Default::default()
                }),
                persistence: None,
                fastresume: false,
                ..Default::default()
            };
            Session::new_with_opts(default_output_dir.to_path_buf(), fallback_opts)
                .await
                .map_err(|fallback_error| {
                    format!(
                        "Falha ao inicializar motor Torrent: {fallback_error} (DHT persistente: {persistent_error})"
                    )
                })?
        }
    };
    *guard = Some(session.clone());
    Ok(session)
}

pub async fn add_handle(
    session: &Arc<Session>,
    source: &str,
    output_dir: &Path,
    paused: bool,
    only_files: Option<Vec<usize>>,
) -> Result<Arc<ManagedTorrent>, String> {
    let opts = AddTorrentOptions {
        output_folder: Some(output_dir.to_string_lossy().to_string()),
        overwrite: true,
        paused,
        only_files,
        ..Default::default()
    };
    let response = if source.starts_with("magnet:") {
        session
            .add_torrent(AddTorrent::from_url(source), Some(opts))
            .await
    } else {
        let bytes = std::fs::read(source)
            .map_err(|_| "Não foi possível ler os metadados deste torrent.".to_string())?;
        session
            .add_torrent(AddTorrent::from_bytes(bytes), Some(opts))
            .await
    }
    .map_err(|error| format!("Falha ao adicionar torrent: {error}"))?;
    response
        .into_handle()
        .ok_or_else(|| "Torrents em lista não suportados".to_string())
}
