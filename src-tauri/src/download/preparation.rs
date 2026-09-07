use crate::{
    database::models::CreateDownloadInput,
    download::{
        error::DownloadError,
        filename,
        paths::{available_path, category_for_extension, safe_file_name, valid_category_name},
    },
};
use reqwest::{header, header::HeaderMap, Client, Response, Url};
use std::path::Path;

pub const DEFAULT_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
#[derive(Debug)]
pub struct PreparedDownload {
    pub input: CreateDownloadInput,
    pub response: Option<Response>,
}

#[allow(clippy::too_many_arguments)]
pub async fn prepare_with_headers(
    taken_paths: Vec<String>,
    url: &str,
    root: &str,
    auto_organize: bool,
    selected_category: Option<&str>,
    request_headers: HeaderMap,
    max_connections: usize,
    max_parallel_downloads: usize,
    speed_limit_download: u64,
    resume_support: bool,
    delete_archive_after_extract: bool,
) -> Result<PreparedDownload, String> {
    if root.trim().is_empty() {
        return Err("Configure uma pasta principal antes de baixar.".into());
    }
    let download_root = crate::download::paths::canonical_existing_directory(Path::new(root))?;

    if url.starts_with("magnet:") || url.to_lowercase().ends_with(".torrent") {
        let torrent_manager = crate::download::torrent::get_torrent_manager();
        let meta = torrent_manager.parse_torrent(url).await.ok();

        let raw_name = meta
            .as_ref()
            .and_then(|m| m.name())
            .unwrap_or("Torrent Download");
        let file_name = safe_file_name(raw_name);
        let folder = if auto_organize {
            if let Some(category) = selected_category.filter(|value| !value.trim().is_empty()) {
                let category = category.trim();
                if !valid_category_name(category) {
                    return Err("A categoria selecionada possui um nome inválido.".into());
                }
                download_root.join(category)
            } else {
                download_root.join("Torrents")
            }
        } else {
            download_root.clone()
        };
        tokio::fs::create_dir_all(&folder)
            .await
            .map_err(|error| format!("Não foi possível criar a pasta de destino: {error}"))?;
        let folder = crate::download::paths::canonical_existing_directory(&folder)?;

        let temp_folder = folder.join(".sf-temp");
        tokio::fs::create_dir_all(&temp_folder)
            .await
            .map_err(|error| format!("Não foi possível criar a pasta temporária: {error}"))?;
        let temp_folder = crate::download::paths::canonical_existing_directory(&temp_folder)?;

        let final_path = available_path(&folder, &file_name, &taken_paths);
        let temp_name = final_path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or(&file_name);
        let temp_path = temp_folder.join(format!("{}.part", temp_name));

        let total_size = meta.as_ref().and_then(|m| m.total_size()).map(|s| s as i64);
        let info_hash = meta.as_ref().map(|m| m.info_hash().to_string());

        return Ok(PreparedDownload {
            input: CreateDownloadInput {
                file_name,
                file_size: total_size,
                original_url: url.to_owned(),
                save_path: folder.to_string_lossy().into_owned(),
                temp_path: temp_path.to_string_lossy().into_owned(),
                final_path: final_path.to_string_lossy().into_owned(),
                mime_type: Some("application/x-bittorrent".into()),
                extension: Some("torrent".into()),
                supports_range: false,
                max_connections: 1,
                max_parallel_downloads: max_parallel_downloads.clamp(1, 50) as i64,
                speed_limit_download: speed_limit_download.min(i64::MAX as u64) as i64,
                speed_limit_inherited: true,
                etag: None,
                last_modified: None,
                delete_archive_after_extract: false,
                download_type: "torrent".into(),
                info_hash,
                priority: 1,
            },
            response: None,
        });
    }

    if url.starts_with("magnet:") {
        crate::commands::debug::log_warn(
            "download",
            "Um magnet foi encaminhado indevidamente ao cliente HTTP e foi bloqueado.",
            None,
            None,
            None,
            None,
        );
        return Err("Magnet links não utilizam cliente HTTP.".into());
    }

    let parsed = Url::parse(url).map_err(|_| DownloadError::InvalidUrl.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        crate::commands::debug::log_warn(
            "download",
            "Uma URL com esquema não suportado foi bloqueada pelo cliente HTTP.",
            None,
            None,
            None,
            None,
        );
        return Err(DownloadError::UnsupportedUrlScheme.to_string());
    }
    let client = Client::builder()
        .user_agent(DEFAULT_USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| format!("Falha ao preparar conexão: {error}"))?;
    let response = client
        .get(parsed.clone())
        .headers(request_headers.clone())
        .send()
        .await
        .map_err(|error| {
            crate::commands::debug::log_error(
                "download",
                &format!("Falha ao conectar na URL: {error}"),
                Some(error.to_string()),
                Some(url.to_string()),
                None,
                None,
            );
            format!("Falha ao conectar ao servidor: {error}")
        })?;
    if !response.status().is_success() {
        crate::commands::debug::log_error(
            "download",
            &format!("Servidor respondeu com erro HTTP {}", response.status()),
            Some(format!("HTTP Status: {}", response.status())),
            Some(url.to_string()),
            None,
            None,
        );
        return Err(format!(
            "O servidor respondeu com HTTP {}.",
            response.status()
        ));
    }
    let file_name = safe_file_name({
        let disposition_name = response
            .headers()
            .get(header::CONTENT_DISPOSITION)
            .and_then(|value| value.to_str().ok())
            .and_then(filename::from_content_disposition);
        if let Some(name) = disposition_name {
            name
        } else {
            filename::from_url_path(response.url())
                .or_else(|| filename::from_url_path(&parsed))
                .unwrap_or_else(|| "download.bin".into())
        }
    });
    let extension = Path::new(&file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase());
    let folder = if auto_organize {
        if let Some(category) = selected_category.filter(|value| !value.trim().is_empty()) {
            let category = category.trim();
            if !valid_category_name(category) {
                return Err("A categoria selecionada possui um nome inválido.".into());
            }
            download_root.join(category)
        } else {
            download_root.join(category_for_extension(extension.as_deref()))
        }
    } else {
        download_root
    };
    tokio::fs::create_dir_all(&folder)
        .await
        .map_err(|error| format!("Não foi possível criar a pasta de destino: {error}"))?;
    let folder = crate::download::paths::canonical_existing_directory(&folder)?;

    // Create the hidden temporary folder inside the target folder
    let temp_folder = folder.join(".sf-temp");
    tokio::fs::create_dir_all(&temp_folder)
        .await
        .map_err(|error| format!("Não foi possível criar a pasta temporária: {error}"))?;
    let temp_folder = crate::download::paths::canonical_existing_directory(&temp_folder)?;

    let final_path = available_path(&folder, &file_name, &taken_paths);
    let temp_name = final_path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or(&file_name);
    let temp_path = temp_folder.join(format!("{}.part", temp_name));

    let size = response
        .content_length()
        .and_then(|value| i64::try_from(value).ok());
    let mime_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let etag = response
        .headers()
        .get(header::ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let last_modified = response
        .headers()
        .get(header::LAST_MODIFIED)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let mut supports_range = response
        .headers()
        .get(header::ACCEPT_RANGES)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.eq_ignore_ascii_case("bytes"));
    if !supports_range && size.is_some_and(|value| value >= 2 * 1024 * 1024) {
        supports_range = client
            .get(parsed.clone())
            .headers(request_headers.clone())
            .header(header::RANGE, "bytes=0-0")
            .send()
            .await
            .is_ok_and(|probe| probe.status() == reqwest::StatusCode::PARTIAL_CONTENT);
    }

    // Force supports_range to false if the user disabled resume support
    if !resume_support {
        supports_range = false;
    }

    Ok(PreparedDownload {
        input: CreateDownloadInput {
            file_name,
            file_size: size,
            original_url: url.to_owned(),
            save_path: folder.to_string_lossy().into_owned(),
            temp_path: temp_path.to_string_lossy().into_owned(),
            final_path: final_path.to_string_lossy().into_owned(),
            mime_type,
            extension,
            supports_range,
            max_connections: max_connections.clamp(1, 32) as i64,
            max_parallel_downloads: max_parallel_downloads.clamp(1, 50) as i64,
            speed_limit_download: speed_limit_download.min(i64::MAX as u64) as i64,
            speed_limit_inherited: true,
            etag,
            last_modified,
            delete_archive_after_extract,
            download_type: "http".into(),
            info_hash: None,
            priority: 1,
        },
        response: Some(response),
    })
}
