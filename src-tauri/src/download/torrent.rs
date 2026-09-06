use crate::download::torrent_files::{
    has_selected_subset, normalize_selected_file_indexes, remove_initialized_unselected_files,
    remove_known_torrent_files, selected_size,
};
pub use crate::download::torrent_metadata::{
    parse_bencode, sanitize_info_hash, validate_torrent_relative_path, BencodeValue,
    TorrentFileItem, TorrentMetadataResponse,
};
use librqbit::{ManagedTorrent, Session};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};
use tokio::sync::{Mutex, RwLock};

pub struct TorrentEntry {
    pub info_hash: String,
    pub source: String,
    pub handle: Arc<ManagedTorrent>,
    pub metadata_ready: bool,
    pub confirmed: bool,
    pub name: String,
    pub total_size: u64,
    pub files: Vec<TorrentFileItem>,
    pub selected_file_indexes: Vec<usize>,
    pub save_path: String,
    pub tracker_count: i64,
}

pub struct TorrentManager {
    session: Arc<RwLock<Option<Arc<Session>>>>,
    entries: Arc<RwLock<BTreeMap<String, TorrentEntry>>>,
    parse_lock: Arc<Mutex<()>>,
}

static TORRENT_MANAGER: LazyLock<TorrentManager> = LazyLock::new(TorrentManager::new);

const DUPLICATE_TORRENT_MESSAGE: &str =
    "Este torrent já está sendo preparado ou já existe na lista.";

pub fn get_torrent_manager() -> &'static TorrentManager {
    &TORRENT_MANAGER
}

impl TorrentManager {
    pub fn new() -> Self {
        Self {
            session: Arc::new(RwLock::new(None)),
            entries: Arc::new(RwLock::new(BTreeMap::new())),
            parse_lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn entries(&self) -> &Arc<RwLock<BTreeMap<String, TorrentEntry>>> {
        &self.entries
    }

    pub fn session(&self) -> &Arc<RwLock<Option<Arc<Session>>>> {
        &self.session
    }
    pub async fn get_session(&self, default_output_dir: &Path) -> Result<Arc<Session>, String> {
        crate::download::torrent_session::get_or_create(&self.session, default_output_dir).await
    }

    #[cfg(test)]
    pub async fn start_torrent_handle(
        &self,
        session: &Arc<Session>,
        source: &str,
        output_dir: &Path,
    ) -> Result<Arc<ManagedTorrent>, String> {
        crate::download::torrent_session::add_handle(session, source, output_dir, false, None).await
    }

    pub(crate) async fn start_torrent_handle_configured(
        &self,
        session: &Arc<Session>,
        source: &str,
        output_dir: &Path,
        paused: bool,
        only_files: Option<Vec<usize>>,
    ) -> Result<Arc<ManagedTorrent>, String> {
        crate::download::torrent_session::add_handle(
            session, source, output_dir, paused, only_files,
        )
        .await
    }

    pub async fn restore_task_handle(
        &self,
        task: &crate::database::models::DownloadTask,
        paused: bool,
    ) -> Result<(), String> {
        let info_hash = task
            .info_hash
            .as_deref()
            .map(sanitize_info_hash)
            .filter(|hash| !hash.is_empty())
            .ok_or_else(|| "Torrent salvo sem info hash válido.".to_string())?;

        if self.entries.read().await.contains_key(&info_hash) {
            return Ok(());
        }

        let _restore_guard = self.parse_lock.lock().await;
        if self.entries.read().await.contains_key(&info_hash) {
            return Ok(());
        }

        let save_path = Path::new(&task.save_path);
        std::fs::create_dir_all(save_path)
            .map_err(|error| format!("Falha ao preparar destino do torrent: {error}"))?;
        let session = self.get_session(save_path).await?;
        let source = crate::download::torrent_session::preferred_restore_source(
            &info_hash,
            &task.original_url,
        );
        let only_files = (!task.torrent_selected_file_indexes.is_empty())
            .then(|| task.torrent_selected_file_indexes.clone());
        let handle = match self
            .start_torrent_handle_configured(
                &session,
                &source,
                save_path,
                paused,
                only_files.clone(),
            )
            .await
        {
            Ok(handle) => handle,
            Err(cache_error) if source != task.original_url => {
                let _ = std::fs::remove_file(
                    crate::download::torrent_session::cached_torrent_path(&info_hash),
                );
                self.start_torrent_handle_configured(
                    &session,
                    &task.original_url,
                    save_path,
                    paused,
                    only_files,
                )
                .await
                .map_err(|source_error| {
                    format!(
                        "Cache do torrent inválido ({cache_error}); a fonte original também falhou: {source_error}"
                    )
                })?
            }
            Err(error) => return Err(error),
        };
        let actual_info_hash = sanitize_info_hash(&format!("{:?}", handle.info_hash()));
        if actual_info_hash != info_hash {
            let _ = session
                .delete(librqbit::api::TorrentIdOrHash::Id(handle.id()), false)
                .await;
            return Err("Os metadados restaurados não correspondem ao torrent salvo.".into());
        }

        let (files, torrent_bytes) = handle
            .with_metadata(|metadata| {
                let files = metadata
                    .file_infos
                    .iter()
                    .enumerate()
                    .map(|(index, file)| TorrentFileItem {
                        index,
                        path: file.relative_filename.to_string_lossy().replace('\\', "/"),
                        size: file.len,
                    })
                    .collect::<Vec<_>>();
                (files, metadata.torrent_bytes.to_vec())
            })
            .map_err(|error| {
                format!("Metadados do torrent restaurado não estão disponíveis: {error}")
            })?;
        for file in &files {
            validate_torrent_relative_path(&file.path)?;
        }
        let _ = crate::download::torrent_session::cache_metainfo(&info_hash, &torrent_bytes);
        let total_size = files.iter().map(|file| file.size).sum::<u64>();
        let selected_file_indexes = if task.torrent_selected_file_indexes.is_empty() {
            handle.only_files().unwrap_or_default()
        } else {
            task.torrent_selected_file_indexes.clone()
        };
        let tracker_count = task
            .original_url
            .split('&')
            .filter(|part| part.starts_with("tr="))
            .count() as i64;

        self.entries.write().await.insert(
            info_hash.clone(),
            TorrentEntry {
                info_hash,
                source: task.original_url.clone(),
                handle,
                metadata_ready: true,
                confirmed: true,
                name: task.file_name.clone(),
                total_size: if total_size > 0 {
                    total_size
                } else {
                    task.file_size.unwrap_or_default().max(0) as u64
                },
                files,
                selected_file_indexes,
                save_path: task.save_path.clone(),
                tracker_count,
            },
        );
        Ok(())
    }
    pub async fn parse_torrent(&self, source: &str) -> Result<TorrentMetadataResponse, String> {
        self.parse_torrent_with_app(None, None, source).await
    }

    pub async fn parse_torrent_with_app(
        &self,
        _app: Option<tauri::AppHandle>,
        _token: Option<&str>,
        source: &str,
    ) -> Result<TorrentMetadataResponse, String> {
        let _parse_guard = self.parse_lock.lock().await;
        if source.starts_with("magnet:") {
            let magnet = librqbit::Magnet::parse(source)
                .map_err(|_| "Não foi possível ler os metadados deste torrent.".to_string())?;
            let info_hash = sanitize_info_hash(&format!("{:?}", magnet.as_id20()));
            let name = magnet.name.clone();
            let tracker_count = source
                .split('&')
                .filter(|part| part.starts_with("tr="))
                .count() as i64;

            // Verificar se handle persistente já existe no TorrentManager
            {
                let read_guard = self.entries.read().await;
                if let Some(existing) = read_guard.get(&info_hash) {
                    // O React StrictMode executa efeitos duas vezes no ambiente de
                    // desenvolvimento. Se a primeira chamada acabou de resolver o
                    // magnet, devolva o mesmo resultado para a segunda chamada em
                    // vez de exibir um falso erro de torrent duplicado.
                    if existing.metadata_ready && !existing.confirmed {
                        return Ok(TorrentMetadataResponse::Ready {
                            info_hash: existing.info_hash.clone(),
                            name: existing.name.clone(),
                            total_size: existing.total_size,
                            files: existing.files.clone(),
                        });
                    }
                    return Err(DUPLICATE_TORRENT_MESSAGE.into());
                }
            }

            // O librqbit resolve os metadados do magnet dentro de add_torrent:
            // ele só devolve o handle depois que recebeu o metainfo. Portanto,
            // faça essa espera aqui com limite explícito, em vez de criar um
            // observador que nunca começa enquanto add_torrent está bloqueado.
            let temp_dir = std::env::temp_dir();
            let session = self.get_session(&temp_dir).await?;
            let handle = match tokio::time::timeout(
                tokio::time::Duration::from_secs(40),
                self.start_torrent_handle_configured(&session, source, &temp_dir, false, None),
            )
            .await
            {
                Ok(Ok(handle)) => handle,
                Ok(Err(error)) => {
                    crate::commands::debug::log_warn(
                        "torrent",
                        "Não foi possível adicionar o magnet ao motor Torrent.",
                        Some(error.clone()),
                        None,
                        None,
                        None,
                    );
                    return Err(error);
                }
                Err(_) => {
                    let message = "Não foi possível obter os metadados deste magnet em 40 segundos. Verifique se há pares e trackers disponíveis.";
                    crate::commands::debug::log_warn(
                        "torrent",
                        "A obtenção de metadados do magnet excedeu o tempo limite.",
                        None,
                        None,
                        None,
                        None,
                    );
                    return Err(message.into());
                }
            };

            // A negociação já terminou quando o handle é devolvido. Pause antes
            // de expor os arquivos, para que nada seja gravado no diretório
            // temporário antes da confirmação do usuário.
            let _ = session.pause(&handle).await;
            let meta_name = handle.name().or(name).unwrap_or_else(|| "Torrent".into());
            let files = handle
                .with_metadata(|metadata| {
                    metadata
                        .file_infos
                        .iter()
                        .enumerate()
                        .map(|(index, file)| TorrentFileItem {
                            index,
                            path: file.relative_filename.to_string_lossy().replace('\\', "/"),
                            size: file.len,
                        })
                        .collect::<Vec<_>>()
                })
                .map_err(|error| format!("Falha ao ler os metadados recebidos: {error}"))?;
            let total_size = files.iter().map(|file| file.size).sum::<u64>();
            if files.is_empty() || total_size == 0 {
                let _ = session
                    .delete(librqbit::api::TorrentIdOrHash::Id(handle.id()), false)
                    .await;
                return Err("Os metadados recebidos não contêm arquivos válidos.".into());
            }

            self.entries.write().await.insert(
                info_hash.clone(),
                TorrentEntry {
                    info_hash: info_hash.clone(),
                    source: source.to_string(),
                    handle,
                    metadata_ready: true,
                    confirmed: false,
                    name: meta_name.clone(),
                    total_size,
                    files: files.clone(),
                    selected_file_indexes: vec![],
                    save_path: temp_dir.to_string_lossy().to_string(),
                    tracker_count,
                },
            );

            return Ok(TorrentMetadataResponse::Ready {
                info_hash,
                name: meta_name,
                total_size,
                files,
            });
        }

        let path = PathBuf::from(source);
        if !path.exists() {
            return Err("Não foi possível ler os metadados deste torrent.".into());
        }

        let metadata_fs = std::fs::metadata(&path)
            .map_err(|_| "Não foi possível ler os metadados deste torrent.".to_string())?;
        if metadata_fs.len() == 0 {
            return Err("Não foi possível ler os metadados deste torrent.".into());
        }

        let bytes = std::fs::read(&path)
            .map_err(|_| "Não foi possível ler os metadados deste torrent.".to_string())?;
        let root_val = parse_bencode(&bytes)?;
        let root_dict = match root_val {
            BencodeValue::Dict(d) => d,
            _ => return Err("Não foi possível ler os metadados deste torrent.".into()),
        };

        let info_dict = match root_dict.get(b"info".as_slice()) {
            Some(BencodeValue::Dict(d)) => d,
            _ => return Err("Não foi possível ler os metadados deste torrent.".into()),
        };

        let name = match info_dict.get(b"name".as_slice()) {
            Some(BencodeValue::Bytes(b)) => String::from_utf8_lossy(b).trim().to_string(),
            _ => return Err("Não foi possível ler os metadados deste torrent.".into()),
        };
        let name = validate_torrent_relative_path(&name)?;

        let mut files = Vec::new();
        let mut total_size: u64 = 0;

        if let Some(BencodeValue::List(file_list)) = info_dict.get(b"files".as_slice()) {
            if file_list.is_empty() {
                return Err("Não foi possível ler os metadados deste torrent.".into());
            }

            for (idx, item) in file_list.iter().enumerate() {
                let file_dict = match item {
                    BencodeValue::Dict(d) => d,
                    _ => return Err("Não foi possível ler os metadados deste torrent.".into()),
                };

                let file_size = match file_dict.get(b"length".as_slice()) {
                    Some(BencodeValue::Int(l)) if *l > 0 => *l as u64,
                    _ => return Err("Não foi possível ler os metadados deste torrent.".into()),
                };

                let path_list = match file_dict.get(b"path".as_slice()) {
                    Some(BencodeValue::List(pl)) if !pl.is_empty() => pl,
                    _ => return Err("Não foi possível ler os metadados deste torrent.".into()),
                };

                let mut path_parts = Vec::new();
                for part in path_list {
                    if let BencodeValue::Bytes(pb) = part {
                        let s = String::from_utf8_lossy(pb).to_string();
                        if s.is_empty() {
                            return Err("O torrent contém um caminho de arquivo inválido.".into());
                        }
                        path_parts.push(s);
                    }
                }

                if path_parts.is_empty() {
                    return Err("O torrent contém um caminho de arquivo inválido.".into());
                }

                let rel_path = validate_torrent_relative_path(&path_parts.join("/"))?;

                total_size = total_size.checked_add(file_size).ok_or_else(|| {
                    "Não foi possível ler os metadados deste torrent.".to_string()
                })?;

                files.push(TorrentFileItem {
                    index: idx,
                    path: rel_path,
                    size: file_size,
                });
            }
        } else if let Some(BencodeValue::Int(single_len)) = info_dict.get(b"length".as_slice()) {
            if *single_len <= 0 {
                return Err("Não foi possível ler os metadados deste torrent.".into());
            }
            let file_size = *single_len as u64;
            total_size = file_size;
            files.push(TorrentFileItem {
                index: 0,
                path: name.clone(),
                size: file_size,
            });
        } else {
            return Err("Não foi possível ler os metadados deste torrent.".into());
        }

        if total_size == 0 || files.is_empty() {
            return Err("Não foi possível ler os metadados deste torrent.".into());
        }

        let temp_dir = std::env::temp_dir();
        let session = self.get_session(&temp_dir).await?;
        let handle = self
            .start_torrent_handle_configured(&session, source, &temp_dir, true, None)
            .await?;
        let info_hash = sanitize_info_hash(&format!("{:?}", handle.info_hash()));

        let is_duplicate = self.entries.read().await.contains_key(&info_hash);
        if is_duplicate {
            let _ = session
                .delete(librqbit::api::TorrentIdOrHash::Id(handle.id()), false)
                .await;
            return Err(DUPLICATE_TORRENT_MESSAGE.into());
        }

        {
            let mut guard = self.entries.write().await;
            guard.insert(
                info_hash.clone(),
                TorrentEntry {
                    info_hash: info_hash.clone(),
                    source: source.to_string(),
                    handle,
                    metadata_ready: true,
                    confirmed: false,
                    name: name.clone(),
                    total_size,
                    files: files.clone(),
                    selected_file_indexes: vec![],
                    save_path: temp_dir.to_string_lossy().to_string(),
                    tracker_count: 0,
                },
            );
        }

        let meta = TorrentMetadataResponse::Ready {
            name: name.clone(),
            info_hash,
            total_size,
            files: files.clone(),
        };

        Ok(meta)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn confirm_torrent(
        &self,
        app: &tauri::AppHandle,
        database: &crate::database::Database,
        runtime: &crate::download::runtime::DownloadRuntime,
        info_hash: &str,
        save_path: &str,
        selected_file_indexes: &[usize],
        start_immediately: bool,
    ) -> Result<crate::database::models::DownloadTask, String> {
        {
            let conn = database.connect().map_err(|e| e.to_string())?;
            if let Some(existing) =
                crate::database::repositories::downloads::find_by_info_hash(&conn, info_hash)
                    .map_err(|e| format!("Erro ao consultar torrents existentes: {e}"))?
            {
                return Err(format!(
                    "{} ({})",
                    DUPLICATE_TORRENT_MESSAGE, existing.file_name
                ));
            }
        }

        let mut guard = self.entries.write().await;
        let entry = guard.get_mut(info_hash).ok_or_else(|| {
            format!("Handle do torrent não encontrado para info_hash: {info_hash}")
        })?;

        if !entry.metadata_ready {
            return Err("Metadados do torrent ainda não foram baixados.".into());
        }

        for file in &entry.files {
            validate_torrent_relative_path(&file.path)?;
        }

        let normalized_selection =
            normalize_selected_file_indexes(&entry.files, selected_file_indexes);
        if !selected_file_indexes.is_empty() && normalized_selection.is_empty() {
            return Err("A seleção do torrent não contém nenhum arquivo válido.".into());
        }
        let selected_file_indexes = normalized_selection.as_slice();

        let has_selected_subset = has_selected_subset(&entry.files, selected_file_indexes);

        // Testar validade do diretório e teste de escrita
        let save_dir = PathBuf::from(save_path);
        std::fs::create_dir_all(&save_dir).map_err(|e| {
            crate::commands::debug::log_error(
                "torrent",
                "Não foi possível criar a pasta de destino do torrent.",
                Some(e.to_string()),
                None,
                None,
                None,
            );
            format!("Não foi possível criar pasta de destino: {e}")
        })?;

        let test_file = save_dir.join(format!(".sf_test_{}.tmp", uuid::Uuid::new_v4()));
        if let Err(e) = std::fs::write(&test_file, b"test") {
            crate::commands::debug::log_error(
                "torrent",
                "Não há permissão para gravar no destino do torrent.",
                Some(e.to_string()),
                None,
                None,
                None,
            );
            return Err(format!("Sem permissão de escrita em {}: {e}", save_path));
        } else {
            let _ = std::fs::remove_file(test_file);
        }

        // Aplicar seleção de arquivos (update_only_files) na sessão do librqbit
        if has_selected_subset {
            let selected_set: std::collections::HashSet<usize> =
                selected_file_indexes.iter().copied().collect();
            if let Some(ref session) = *self.session.read().await {
                if let Err(e) = session
                    .update_only_files(&entry.handle, &selected_set)
                    .await
                {
                    crate::commands::debug::log_warn(
                        "torrent",
                        "Não foi possível aplicar a seleção parcial de arquivos do torrent.",
                        Some(e.to_string()),
                        None,
                        None,
                        None,
                    );
                }
            }
        }

        let selected_total_size = if has_selected_subset {
            selected_size(&entry.files, selected_file_indexes)
        } else {
            entry.total_size
        };

        let old_handle_id = entry.handle.id();
        let torrent_bytes = entry
            .handle
            .with_metadata(|metadata| metadata.torrent_bytes.to_vec())
            .map_err(|error| format!("Metadados do torrent não estão disponíveis: {error}"))?;
        let cached_source =
            crate::download::torrent_session::cache_metainfo(info_hash, &torrent_bytes)?;
        let only_files = if !selected_file_indexes.is_empty()
            && selected_file_indexes.len() < entry.files.len()
        {
            Some(selected_file_indexes.to_vec())
        } else {
            None
        };
        let session = self
            .session
            .read()
            .await
            .clone()
            .ok_or_else(|| "Sessão Torrent não disponível.".to_string())?;
        session
            .delete(librqbit::api::TorrentIdOrHash::Id(old_handle_id), true)
            .await
            .map_err(|e| format!("Falha ao preparar destino do torrent: {e}"))?;

        let final_handle = self
            .start_torrent_handle_configured(
                &session,
                &cached_source.to_string_lossy(),
                &save_dir,
                !start_immediately,
                only_files,
            )
            .await?;

        entry.handle = final_handle;
        entry.confirmed = true;
        entry.save_path = save_path.to_string();
        entry.selected_file_indexes = selected_file_indexes.to_vec();

        // Remover do disco arquivos desmarcados que a inicialização de armazenamento do librqbit cria automaticamente
        if has_selected_subset {
            remove_initialized_unselected_files(&save_dir, &entry.files, selected_file_indexes);
        }

        let conn = database.connect().map_err(|e| e.to_string())?;

        let final_path = if entry.files.len() == 1 {
            save_dir
                .join(&entry.files[0].path)
                .to_string_lossy()
                .into_owned()
        } else {
            save_dir.to_string_lossy().into_owned()
        };

        let input = crate::database::models::CreateDownloadInput {
            file_name: entry.name.clone(),
            file_size: if selected_total_size > 0 {
                Some(selected_total_size as i64)
            } else {
                None
            },
            original_url: entry.source.clone(),
            save_path: save_path.to_string(),
            temp_path: save_path.to_string(),
            final_path,
            mime_type: Some("application/x-bittorrent".into()),
            extension: Some("torrent".into()),
            supports_range: false,
            max_connections: 1,
            max_parallel_downloads: 5,
            speed_limit_download: 0,
            speed_limit_inherited: false,
            etag: None,
            last_modified: None,
            delete_archive_after_extract: false,
            download_type: "torrent".into(),
            info_hash: Some(info_hash.to_string()),
            priority: 1,
        };

        let task = crate::database::repositories::downloads::create(&conn, input)
            .map_err(|e| format!("Erro ao criar registro no banco: {e}"))?;
        crate::database::repositories::downloads::update_torrent_selection(
            &conn,
            &task.id,
            selected_file_indexes,
        )
        .map_err(|e| format!("Erro ao persistir seleção do torrent: {e}"))?;
        let task = crate::database::repositories::downloads::find(&conn, &task.id)
            .map_err(|e| format!("Erro ao reler torrent criado: {e}"))?
            .ok_or_else(|| "Torrent criado não foi encontrado no banco.".to_string())?;

        if start_immediately {
            let control = crate::download::runtime::TaskControl::new();
            runtime.register(task.id.clone(), control.clone())?;
            let database_clone = database.clone();
            let spawned_task = task.clone();
            let app_handle = app.clone();
            let runtime_clone = runtime.clone();
            let task_id = task.id.clone();

            tokio::spawn(async move {
                run_torrent(app_handle, database_clone, spawned_task, control).await;
                runtime_clone.remove(&task_id);
            });
        }

        Ok(task)
    }

    pub async fn cancel_torrent(
        &self,
        app: &tauri::AppHandle,
        database: &crate::database::Database,
        info_hash: &str,
        delete_files: bool,
    ) -> Result<(), String> {
        let mut actual_info_hash = info_hash.to_string();
        let mut db_task_id = info_hash.to_string();

        if let Ok(conn) = database.connect() {
            if let Ok(Some(task)) =
                crate::database::repositories::downloads::find_by_info_hash(&conn, info_hash)
            {
                db_task_id = task.id.clone();
                if let Some(h) = task.info_hash {
                    actual_info_hash = h;
                }
            }
        }

        let mut guard = self.entries.write().await;
        if let Some(entry) = guard
            .remove(&actual_info_hash)
            .or_else(|| guard.remove(info_hash))
        {
            let id_num = entry.handle.id();
            if delete_files {
                let _ = remove_known_torrent_files(
                    Path::new(&entry.save_path),
                    &entry.files,
                    &entry.selected_file_indexes,
                );
            }
            if let Some(ref session) = *self.session.read().await {
                let _ = session
                    .delete(librqbit::api::TorrentIdOrHash::Id(id_num), false)
                    .await;
            }
        }

        // Apagar os arquivos de cache/persistência (.bitv e .torrent) da pasta torrent-session
        let persistence_root = crate::download::torrent_session::persistence_root();

        for h in [&actual_info_hash, info_hash] {
            let bitv = persistence_root.join(format!("{}.bitv", h));
            let torrent_file = persistence_root.join(format!("{}.torrent", h));
            if bitv.exists() {
                let _ = std::fs::remove_file(&bitv);
            }
            if torrent_file.exists() {
                let _ = std::fs::remove_file(&torrent_file);
            }
        }

        if let Ok(conn) = database.connect() {
            let _ = conn.execute(
                "UPDATE download_tasks SET status='cancelled', speed_current=0.0, updated_at=CURRENT_TIMESTAMP WHERE id=?1 OR info_hash=?2",
                rusqlite::params![db_task_id, actual_info_hash],
            );
        }

        use tauri::Emitter;
        let payload = serde_json::json!({
            "id": db_task_id,
            "downloaded": 0,
            "total": null,
            "speed": 0.0,
            "status": "cancelled",
            "error": null
        });
        let _ = app.emit("download-progress", payload.clone());
        let _ = app.emit("download-updated", db_task_id);

        if actual_info_hash != info_hash {
            let payload_hash = serde_json::json!({
                "id": info_hash,
                "downloaded": 0,
                "total": null,
                "speed": 0.0,
                "status": "cancelled",
                "error": null
            });
            let _ = app.emit("download-progress", payload_hash);
            let _ = app.emit("download-updated", info_hash);
        }

        Ok(())
    }
}

pub use crate::download::torrent_runner::run_torrent;

#[cfg(test)]
mod tests {
    use super::*;

    fn create_bencode_string(s: &str) -> Vec<u8> {
        format!("{}:{}", s.len(), s).into_bytes()
    }

    fn create_bencode_int(i: i64) -> Vec<u8> {
        format!("i{}e", i).into_bytes()
    }

    fn create_bencode_dict(items: &[(&[u8], Vec<u8>)]) -> Vec<u8> {
        let mut out = vec![b'd'];
        for (k, v) in items {
            out.extend(format!("{}:", k.len()).bytes());
            out.extend(*k);
            out.extend(v);
        }
        out.push(b'e');
        out
    }

    #[test]
    fn accepts_v1_v2_and_hybrid_magnets_offline() {
        let magnets = [
            "magnet:?xt=urn:btih:631a31dd0a46257d5078c0dee4e66e26f73e42ac&dn=v1-test",
            "magnet:?xt=urn:btmh:1220caf1e1c30e81cb361b9ee167c4aa64228a7fa4fa9f6105232b28ad099f3a302e&dn=v2-test",
            "magnet:?xt=urn:btih:631a31dd0a46257d5078c0dee4e66e26f73e42ac&xt=urn:btmh:1220d8dd32ac93357c368556af3ac1d95c9d76bd0dff6fa9833ecdac3d53134efabb&dn=hybrid-test",
        ];
        for source in magnets {
            let magnet = librqbit::Magnet::parse(source).expect("valid test magnet");
            assert!(!sanitize_info_hash(&format!("{:?}", magnet.as_id20())).is_empty());
        }
    }
    #[tokio::test]
    async fn test_tauri_command_parse_torrent_single_file() {
        let dir = std::env::temp_dir().join(format!(
            "sf-downloader-torrent-single-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("source.torrent");

        let info_dict = create_bencode_dict(&[
            (b"name", create_bencode_string("example.iso")),
            (b"length", create_bencode_int(1048576)),
            (b"piece length", create_bencode_int(262_144)),
            (b"pieces", create_bencode_string(&"\0".repeat(20))),
        ]);
        let root_dict = create_bencode_dict(&[(b"info", info_dict)]);

        std::fs::write(&file_path, &root_dict).unwrap();

        let manager = TorrentManager::new();
        let meta = manager
            .parse_torrent(&file_path.to_string_lossy())
            .await
            .unwrap();

        assert_eq!(meta.name().unwrap(), "example.iso");
        assert_eq!(meta.total_size().unwrap(), 1048576);
        let files = meta.files().unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "example.iso");
        assert_eq!(files[0].size, 1048576);
        assert!(meta.total_size().unwrap() > 0);
        assert!(!files.is_empty());
        assert!(files.iter().all(|file| file.size > 0));

        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("example.iso"));
        assert!(json.contains("1048576"));
        assert!(json.contains("total_size"));
        assert!(json.contains("files"));

        let deserialized: TorrentMetadataResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, meta);

        let _ = std::fs::remove_file(file_path);
    }

    #[test]
    fn metadata_timeout_response_serializes_for_the_frontend() {
        let response = TorrentMetadataResponse::Failed {
            info_hash: "abc123".into(),
            message: "Sem pares disponíveis.".into(),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"status\":\"failed\""));

        let deserialized: TorrentMetadataResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, response);
        assert_eq!(deserialized.info_hash(), "abc123");
        assert_eq!(deserialized.name(), None);
    }

    #[test]
    fn rejects_unsafe_torrent_relative_paths() {
        assert_eq!(
            validate_torrent_relative_path("season/episode.mkv").unwrap(),
            "season/episode.mkv"
        );
        let unicode_path = "Séries/日本語/episódio-01.mkv";
        assert_eq!(
            validate_torrent_relative_path(unicode_path).unwrap(),
            unicode_path
        );
        let long_path = format!("{}{}.bin", "pasta/".repeat(40), "arquivo".repeat(20));
        assert_eq!(
            validate_torrent_relative_path(&long_path).unwrap(),
            long_path
        );

        for path in [
            "../outside.mkv",
            "folder/../../outside.mkv",
            "/absolute.mkv",
            "C:/outside.mkv",
        ] {
            assert_eq!(
                validate_torrent_relative_path(path).unwrap_err(),
                "O torrent contém um caminho de arquivo inválido."
            );
        }
    }

    fn create_bencode_list(items: &[Vec<u8>]) -> Vec<u8> {
        let mut out = vec![b'l'];
        for item in items {
            out.extend(item);
        }
        out.push(b'e');
        out
    }

    #[tokio::test]
    async fn test_tauri_command_parse_torrent_multi_file() {
        let dir = std::env::temp_dir().join(format!(
            "sf-downloader-torrent-multi-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("source.torrent");

        let path1 = create_bencode_list(&[
            create_bencode_string("Season 01"),
            create_bencode_string("Episode 01.mkv"),
        ]);
        let file1_dict =
            create_bencode_dict(&[(b"length", create_bencode_int(2048)), (b"path", path1)]);

        let path2 = create_bencode_list(&[
            create_bencode_string("Season 01"),
            create_bencode_string("Episode 02.mkv"),
        ]);
        let file2_dict =
            create_bencode_dict(&[(b"length", create_bencode_int(4096)), (b"path", path2)]);

        let files_list = create_bencode_list(&[file1_dict, file2_dict]);

        let info_dict = create_bencode_dict(&[
            (b"files", files_list),
            (b"name", create_bencode_string("Example Pack")),
            (b"piece length", create_bencode_int(262_144)),
            (b"pieces", create_bencode_string(&"\0".repeat(20))),
        ]);
        let root_dict = create_bencode_dict(&[(b"info", info_dict)]);

        std::fs::write(&file_path, &root_dict).unwrap();

        let manager = TorrentManager::new();
        let meta = manager
            .parse_torrent(&file_path.to_string_lossy())
            .await
            .unwrap();

        assert_eq!(meta.name().unwrap(), "Example Pack");
        assert_eq!(meta.total_size().unwrap(), 6144);
        let files = meta.files().unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "Season 01/Episode 01.mkv");
        assert_eq!(files[0].size, 2048);
        assert_eq!(files[1].path, "Season 01/Episode 02.mkv");
        assert_eq!(files[1].size, 4096);

        assert!(meta.total_size().unwrap() > 0);
        assert!(!files.is_empty());
        assert!(files.iter().all(|file| file.size > 0));

        let json = serde_json::to_string(&meta).unwrap();
        let deserialized: TorrentMetadataResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, meta);

        let _ = std::fs::remove_file(file_path);
    }

    #[tokio::test]
    async fn test_torrent_errors_no_fallback() {
        let manager = TorrentManager::new();

        let err1 = manager.parse_torrent("non_existent_file.torrent").await;
        assert_eq!(
            err1.unwrap_err(),
            "Não foi possível ler os metadados deste torrent."
        );

        let dir = std::env::temp_dir();
        let empty_file = dir.join(format!("empty_{}.torrent", uuid::Uuid::new_v4()));
        std::fs::write(&empty_file, []).unwrap();
        let err2 = manager.parse_torrent(&empty_file.to_string_lossy()).await;
        assert_eq!(
            err2.unwrap_err(),
            "Não foi possível ler os metadados deste torrent."
        );
        let _ = std::fs::remove_file(empty_file);

        let invalid_file = dir.join(format!("invalid_{}.torrent", uuid::Uuid::new_v4()));
        std::fs::write(&invalid_file, b"not a bencode file").unwrap();
        let err3 = manager.parse_torrent(&invalid_file.to_string_lossy()).await;
        assert_eq!(
            err3.unwrap_err(),
            "Não foi possível ler os metadados deste torrent."
        );
        let _ = std::fs::remove_file(invalid_file);
    }

    #[tokio::test]
    async fn test_torrent_manager_confirm_and_cancel() {
        let manager = TorrentManager::new();
        let dir = std::env::temp_dir().join(format!(
            "sf-downloader-torrent-manager-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let info_dict = create_bencode_dict(&[
            (b"name", create_bencode_string("test_game.iso")),
            (b"length", create_bencode_int(1048576)),
            (b"piece length", create_bencode_int(262_144)),
            (b"pieces", create_bencode_string(&"\0".repeat(20))),
        ]);
        let root_dict = create_bencode_dict(&[(b"info", info_dict)]);
        let file_path = dir.join("source.torrent");
        std::fs::write(&file_path, &root_dict).unwrap();

        let session = manager.get_session(&dir).await.unwrap();
        let handle = manager
            .start_torrent_handle(&session, &file_path.to_string_lossy(), &dir)
            .await
            .unwrap();
        let info_hash = "test_info_hash_123".to_string();

        {
            let mut guard = manager.entries.write().await;
            guard.insert(
                info_hash.clone(),
                TorrentEntry {
                    info_hash: info_hash.clone(),
                    source: file_path.to_string_lossy().to_string(),
                    handle: handle.clone(),
                    metadata_ready: true,
                    confirmed: false,
                    name: "test_game.iso".into(),
                    total_size: 1048576,
                    files: vec![TorrentFileItem {
                        index: 0,
                        path: "test_game.iso".into(),
                        size: 1048576,
                    }],
                    selected_file_indexes: vec![0],
                    save_path: dir.to_string_lossy().to_string(),
                    tracker_count: 0,
                },
            );
        }

        // Confirmar que a chave existe e o handle está salvo
        {
            let guard = manager.entries.read().await;
            let entry = guard.get(&info_hash).unwrap();
            assert_eq!(entry.info_hash, info_hash);
            assert!(entry.metadata_ready);
            assert_eq!(entry.total_size, 1048576);
            assert_eq!(entry.handle.id(), handle.id());
        }

        let _ = std::fs::remove_file(file_path);
    }
}
