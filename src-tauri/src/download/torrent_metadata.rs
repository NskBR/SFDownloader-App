use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TorrentFileItem {
    pub index: usize,
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum TorrentMetadataResponse {
    #[serde(rename = "ready")]
    Ready {
        info_hash: String,
        name: String,
        total_size: u64,
        files: Vec<TorrentFileItem>,
    },
    #[serde(rename = "fetchingMetadata")]
    FetchingMetadata {
        info_hash: String,
        name: Option<String>,
    },
    #[serde(rename = "failed")]
    Failed { info_hash: String, message: String },
}

impl TorrentMetadataResponse {
    pub fn name(&self) -> Option<&str> {
        match self {
            Self::Ready { name, .. } => Some(name),
            Self::FetchingMetadata { name, .. } => name.as_deref(),
            Self::Failed { .. } => None,
        }
    }

    pub fn info_hash(&self) -> &str {
        match self {
            Self::Ready { info_hash, .. } => info_hash,
            Self::FetchingMetadata { info_hash, .. } => info_hash,
            Self::Failed { info_hash, .. } => info_hash,
        }
    }

    pub fn total_size(&self) -> Option<u64> {
        match self {
            Self::Ready { total_size, .. } => Some(*total_size),
            Self::FetchingMetadata { .. } | Self::Failed { .. } => None,
        }
    }

    #[allow(dead_code)]
    pub fn files(&self) -> Option<&[TorrentFileItem]> {
        match self {
            Self::Ready { files, .. } => Some(files.as_slice()),
            Self::FetchingMetadata { .. } | Self::Failed { .. } => None,
        }
    }
}

#[derive(Debug, Clone)]
pub enum BencodeValue {
    Int(i64),
    Bytes(Vec<u8>),
    List(Vec<BencodeValue>),
    Dict(BTreeMap<Vec<u8>, BencodeValue>),
}

pub fn parse_bencode(bytes: &[u8]) -> Result<BencodeValue, String> {
    let mut pos = 0;
    let value = parse_bencode_value(bytes, &mut pos)?;
    if pos != bytes.len() {
        return Err("Não foi possível ler os metadados deste torrent.".into());
    }
    Ok(value)
}

fn parse_bencode_value(bytes: &[u8], pos: &mut usize) -> Result<BencodeValue, String> {
    if *pos >= bytes.len() {
        return Err("Não foi possível ler os metadados deste torrent.".into());
    }
    match bytes[*pos] {
        b'i' => {
            *pos += 1;
            let start = *pos;
            while *pos < bytes.len() && bytes[*pos] != b'e' {
                *pos += 1;
            }
            if *pos >= bytes.len() {
                return Err("Não foi possível ler os metadados deste torrent.".into());
            }
            let s = std::str::from_utf8(&bytes[start..*pos])
                .map_err(|_| "Não foi possível ler os metadados deste torrent.".to_string())?;
            if s == "-0" || (s.len() > 1 && !s.starts_with("-") && s.starts_with("0")) {
                return Err("Não foi possível ler os metadados deste torrent.".into());
            }
            let val = s
                .parse::<i64>()
                .map_err(|_| "Não foi possível ler os metadados deste torrent.".to_string())?;
            *pos += 1; // skip 'e'
            Ok(BencodeValue::Int(val))
        }
        b'l' => {
            *pos += 1;
            let mut list = Vec::new();
            while *pos < bytes.len() && bytes[*pos] != b'e' {
                list.push(parse_bencode_value(bytes, pos)?);
            }
            if *pos >= bytes.len() {
                return Err("Não foi possível ler os metadados deste torrent.".into());
            }
            *pos += 1; // skip 'e'
            Ok(BencodeValue::List(list))
        }
        b'd' => {
            *pos += 1;
            let mut dict = BTreeMap::new();
            while *pos < bytes.len() && bytes[*pos] != b'e' {
                let key_val = parse_bencode_value(bytes, pos)?;
                let key = match key_val {
                    BencodeValue::Bytes(b) => b,
                    _ => return Err("Não foi possível ler os metadados deste torrent.".into()),
                };

                let val = parse_bencode_value(bytes, pos)?;
                dict.insert(key, val);
            }
            if *pos >= bytes.len() {
                return Err("Não foi possível ler os metadados deste torrent.".into());
            }
            *pos += 1; // skip 'e'
            Ok(BencodeValue::Dict(dict))
        }
        b'0'..=b'9' => {
            let start = *pos;
            while *pos < bytes.len() && bytes[*pos] != b':' {
                *pos += 1;
            }
            if *pos >= bytes.len() {
                return Err("Não foi possível ler os metadados deste torrent.".into());
            }
            let len_str = std::str::from_utf8(&bytes[start..*pos])
                .map_err(|_| "Não foi possível ler os metadados deste torrent.".to_string())?;
            if len_str.len() > 1 && len_str.starts_with("0") {
                return Err("Não foi possível ler os metadados deste torrent.".into());
            }
            let len = len_str
                .parse::<usize>()
                .map_err(|_| "Não foi possível ler os metadados deste torrent.".to_string())?;
            *pos += 1; // skip ':'
            if *pos + len > bytes.len() {
                return Err("Não foi possível ler os metadados deste torrent.".into());
            }
            let data = bytes[*pos..*pos + len].to_vec();
            *pos += len;
            Ok(BencodeValue::Bytes(data))
        }
        _ => Err("Não foi possível ler os metadados deste torrent.".into()),
    }
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::parse_bencode;

    #[test]
    fn rejects_trailing_data_after_a_complete_bencode_value() {
        assert!(parse_bencode(b"4:spamtrailing").is_err());
        assert!(parse_bencode(b"d3:foo3:barextra").is_err());
        assert!(parse_bencode(b"d3:foo3:bare").is_ok());
        assert!(parse_bencode(b"i03e").is_err());
        assert!(parse_bencode(b"i-0e").is_err());
        assert!(parse_bencode(b"03:foo").is_err());
    }
}
pub fn sanitize_info_hash(raw: &str) -> String {
    let mut s = raw.trim();
    if let Some(inner) = s.strip_prefix("Some(").and_then(|i| i.strip_suffix(")")) {
        s = inner;
    }
    if let Some(inner) = s
        .strip_prefix("Id20(\"")
        .and_then(|i| i.strip_suffix("\")"))
    {
        s = inner;
    } else if let Some(inner) = s.strip_prefix("Id20(").and_then(|i| i.strip_suffix(")")) {
        s = inner;
    }
    let cleaned: String = s
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if cleaned.is_empty() {
        "torrent_hash".to_string()
    } else {
        cleaned
    }
}

pub fn validate_torrent_relative_path(value: &str) -> Result<String, String> {
    let normalized = value.replace('\\', "/");
    let parts: Vec<&str> = normalized.split('/').collect();

    if normalized.trim().is_empty()
        || normalized.starts_with('/')
        || normalized.contains(':')
        || normalized.chars().any(char::is_control)
        || parts
            .iter()
            .any(|part| part.is_empty() || *part == "." || *part == "..")
    {
        return Err("O torrent contém um caminho de arquivo inválido.".into());
    }

    Ok(parts.join("/"))
}
