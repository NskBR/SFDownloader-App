use crate::{
    browser_bridge::BrowserBridge,
    download::{filename, http_metadata},
};
use reqwest::{header, header::HeaderMap, header::HeaderName, header::HeaderValue, Url};
use serde::Serialize;
use std::{path::Path, time::Duration};
use tauri::State;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPreview {
    pub url: String,
    pub file_name: String,
    pub file_size: Option<u64>,
    pub mime_type: Option<String>,
    pub extension: Option<String>,
}

#[tauri::command]
pub async fn inspect_download(
    browser_bridge: State<'_, BrowserBridge>,
    url: String,
    request_id: Option<String>,
) -> Result<DownloadPreview, String> {
    if url.starts_with("magnet:") || url.to_lowercase().ends_with(".torrent") {
        let manager = crate::download::torrent::get_torrent_manager();
        let meta = manager.parse_torrent(&url).await.ok();
        let file_name = meta
            .as_ref()
            .and_then(|m| m.name())
            .unwrap_or("Torrent Download")
            .to_string();
        let extension = Path::new(&file_name)
            .extension()
            .and_then(|v| v.to_str())
            .map(|v| v.to_lowercase())
            .or_else(|| Some("torrent".into()));
        let total_size = meta.as_ref().and_then(|m| m.total_size());
        return Ok(DownloadPreview {
            url,
            file_name,
            file_size: total_size,
            mime_type: Some("application/x-bittorrent".into()),
            extension,
        });
    }

    let parsed = Url::parse(&url).map_err(|_| "A URL informada é inválida.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Apenas URLs HTTP, HTTPS ou Magnet Links são permitidas.".into());
    }

    // Resolvers especiais para páginas de compartilhamento (Gofile, Pixeldrain)
    if let Some(host) = parsed.host_str() {
        let host_lower = host.to_lowercase();
        if host_lower == "gofile.io" || host_lower.ends_with(".gofile.io") {
            if let Some(content_id) = parsed.path_segments().and_then(|mut s| {
                if s.next() == Some("d") {
                    s.next()
                } else {
                    None
                }
            }) {
                let api_url =
                    format!("https://api.gofile.io/contents/{content_id}?wt=4fd6sg89d7s6");
                if let Ok(client) = reqwest::Client::builder()
                    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
                    .timeout(Duration::from_secs(8))
                    .build()
                {
                    if let Ok(res) = client.get(&api_url).send().await {
                        if res.status().is_success() {
                            if let Ok(json) = res.json::<serde_json::Value>().await {
                                if json.get("status").and_then(|s| s.as_str()) == Some("ok") {
                                    if let Some(data) = json.get("data") {
                                        // Gofile data pode conter children ou propriedades diretas do item
                                        let item = if let Some(children) = data.get("children").and_then(|c| c.as_object()) {
                                            children.values().next().unwrap_or(data)
                                        } else {
                                            data
                                        };
                                        let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("download.bin").to_string();
                                        let size = item.get("size").and_then(|s| s.as_u64());
                                        let direct_link = item.get("link").and_then(|l| l.as_str()).unwrap_or(&url).to_string();
                                        let mime_type = item.get("mimetype").and_then(|m| m.as_str()).map(str::to_owned);
                                        let extension = Path::new(&name)
                                            .extension()
                                            .and_then(|v| v.to_str())
                                            .map(|v| v.to_lowercase());
                                        return Ok(DownloadPreview {
                                            url: direct_link,
                                            file_name: name,
                                            file_size: size,
                                            mime_type,
                                            extension,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else if host_lower == "pixeldrain.com" || host_lower.ends_with(".pixeldrain.com") {
            if let Some(file_id) = parsed.path_segments().and_then(|mut s| {
                if s.next() == Some("u") {
                    s.next()
                } else {
                    None
                }
            }) {
                let api_url = format!("https://pixeldrain.com/api/file/{file_id}/info");
                if let Ok(client) = reqwest::Client::builder()
                    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
                    .timeout(Duration::from_secs(8))
                    .build()
                {
                    if let Ok(res) = client.get(&api_url).send().await {
                        if res.status().is_success() {
                            if let Ok(json) = res.json::<serde_json::Value>().await {
                                let name = json.get("name").and_then(|n| n.as_str()).unwrap_or("download.bin").to_string();
                                let size = json.get("size").and_then(|s| s.as_u64());
                                let mime_type = json.get("mime_type").and_then(|m| m.as_str()).map(str::to_owned);
                                let extension = Path::new(&name)
                                    .extension()
                                    .and_then(|v| v.to_str())
                                    .map(|v| v.to_lowercase());
                                let direct_link = format!("https://pixeldrain.com/api/file/{file_id}");
                                return Ok(DownloadPreview {
                                    url: direct_link,
                                    file_name: name,
                                    file_size: size,
                                    mime_type,
                                    extension,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    let bridge_headers = browser_bridge.get_headers(request_id.as_deref());
    let mut default_headers = HeaderMap::new();

    for (name, val) in bridge_headers.iter() {
        default_headers.insert(name.clone(), val.clone());
    }

    if !default_headers.contains_key(header::USER_AGENT) {
        default_headers.insert(
            header::USER_AGENT,
            HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
        );
    }
    if !default_headers.contains_key(header::ACCEPT) {
        default_headers.insert(
            header::ACCEPT,
            HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"),
        );
    }
    if !default_headers.contains_key(header::ACCEPT_LANGUAGE) {
        default_headers.insert(
            header::ACCEPT_LANGUAGE,
            HeaderValue::from_static("pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"),
        );
    }
    if !default_headers.contains_key("sec-ch-ua") {
        if let Ok(v) = HeaderValue::from_str(
            "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
        ) {
            default_headers.insert(HeaderName::from_static("sec-ch-ua"), v);
        }
    }
    if !default_headers.contains_key("sec-ch-ua-mobile") {
        default_headers.insert(
            HeaderName::from_static("sec-ch-ua-mobile"),
            HeaderValue::from_static("?0"),
        );
    }
    if !default_headers.contains_key("sec-ch-ua-platform") {
        default_headers.insert(
            HeaderName::from_static("sec-ch-ua-platform"),
            HeaderValue::from_static("\"Windows\""),
        );
    }

    if !default_headers.contains_key(header::REFERER) {
        if let Some(host) = parsed.host_str() {
            let host_l = host.to_lowercase();
            let referer_val = if host_l.contains("megaup.net") {
                "https://megaup.net/".to_string()
            } else if host_l.contains("gofile.io") {
                "https://gofile.io/".to_string()
            } else if host_l.contains("mediafire.com") {
                "https://www.mediafire.com/".to_string()
            } else {
                format!("{}://{}/", parsed.scheme(), host)
            };
            if let Ok(v) = HeaderValue::from_str(&referer_val) {
                default_headers.insert(header::REFERER, v);
            }
        }
    }

    let client = reqwest::Client::builder()
        .default_headers(default_headers.clone())
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(Duration::from_secs(14))
        .build()
        .map_err(|e| e.to_string())?;

    // First, try a no-redirect HEAD to capture intermediate headers (e.g. HuggingFace X-Linked-Size)
    let no_redirect_client = reqwest::Client::builder()
        .default_headers(default_headers.clone())
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(6))
        .build()
        .ok();

    let mut linked_size: Option<u64> = None;
    if let Some(ref nrc) = no_redirect_client {
        if let Ok(pre) = nrc.head(parsed.clone()).send().await {
            linked_size = http_metadata::response_size(&pre);
        }
    }

    let head_result = client.head(parsed.clone()).send().await;
    let partial_request = || {
        client
            .get(parsed.clone())
            .header(header::RANGE, "bytes=0-0")
            .header(header::ACCEPT_ENCODING, "identity")
    };

    let response = match head_result {
        Ok(head)
            if head.status().is_success()
                && http_metadata::response_size(&head)
                    .filter(|&s| s > 1)
                    .is_some() =>
        {
            head
        }
        Ok(head) if head.status().is_success() => match partial_request().send().await {
            Ok(partial) if partial.status().is_success() => partial,
            _ => head,
        },
        Ok(_) => partial_request()
            .send()
            .await
            .map_err(|get_error| format!("Falha ao consultar o arquivo: {get_error}"))?,
        Err(_) => partial_request()
            .send()
            .await
            .map_err(|get_error| format!("Falha ao conectar ao servidor: {get_error}"))?,
    };

    if !response.status().is_success() {
        return Err(format!(
            "O servidor respondeu com HTTP {}.",
            response.status()
        ));
    }

    let file_name = response
        .headers()
        .get(header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .and_then(filename::from_content_disposition)
        .or_else(|| filename::from_url_path(response.url()))
        .or_else(|| filename::from_url_path(&parsed))
        .unwrap_or_else(|| "download.bin".into());
    let extension = Path::new(&file_name)
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| v.to_lowercase());

    let mut file_size = http_metadata::response_size(&response);

    // Fallback 1: Intermediate redirect linked size
    if file_size.unwrap_or(0) <= 1 {
        if let Some(ls) = linked_size {
            if ls > 1 {
                file_size = Some(ls);
            }
        }
    }

    // Fallback 2: Direct partial GET on final resolved URL if redirected
    if file_size.unwrap_or(0) <= 1 && response.url() != &parsed {
        if let Ok(final_part) = client
            .get(response.url().clone())
            .header(header::RANGE, "bytes=0-0")
            .header(header::ACCEPT_ENCODING, "identity")
            .send()
            .await
        {
            if final_part.status().is_success() {
                if let Some(sz) = http_metadata::response_size(&final_part) {
                    if sz > 1 {
                        file_size = Some(sz);
                    }
                }
            }
        }
    }

    // Fallback 3: Direct HEAD on final resolved URL
    if file_size.unwrap_or(0) <= 1 {
        if let Ok(final_head) = client.head(response.url().clone()).send().await {
            if final_head.status().is_success() {
                if let Some(sz) = http_metadata::response_size(&final_head) {
                    if sz > 1 {
                        file_size = Some(sz);
                    }
                }
            }
        }
    }

    Ok(DownloadPreview {
        url,
        file_name,
        file_size,
        mime_type: response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned),
        extension,
    })
}
