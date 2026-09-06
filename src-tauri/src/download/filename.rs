use reqwest::Url;

pub fn from_content_disposition(header_value: &str) -> Option<String> {
    for part in header_value.split(';') {
        let trimmed = part.trim();
        if let Some(rest) = trimmed.strip_prefix("filename*=") {
            let clean = rest.trim_matches(['"', '\'']);
            let encoded = clean.split_once("''").map_or(clean, |(_, value)| value);
            let decoded = percent_decode(encoded);
            let name = decoded.trim();
            if !name.is_empty() {
                return Some(name.to_owned());
            }
        }
    }

    for part in header_value.split(';') {
        let trimmed = part.trim();
        if let Some(rest) = trimmed.strip_prefix("filename=") {
            let name = rest.trim_matches(['"', '\'']).trim();
            if !name.is_empty() {
                return Some(name.to_owned());
            }
        }
    }

    None
}

pub fn from_url_path(url: &Url) -> Option<String> {
    let segments: Vec<&str> = url
        .path_segments()?
        .filter(|segment| !segment.is_empty())
        .collect();
    for segment in segments.into_iter().rev() {
        let decoded = percent_decode(segment);
        let name = decoded.trim();
        if is_generic_path_segment(name) {
            continue;
        }
        if name.contains('.') && !name.ends_with('.') {
            return Some(name.to_owned());
        }
    }
    None
}

fn is_generic_path_segment(value: &str) -> bool {
    matches!(
        value.to_lowercase().as_str(),
        "download" | "resolve" | "main" | "master" | "raw" | "blob" | "files"
    )
}

fn percent_decode(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let input_bytes = input.as_bytes();
    let mut index = 0;
    while index < input_bytes.len() {
        if input_bytes[index] == b'%' && index + 2 < input_bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&input_bytes[index + 1..index + 3]).unwrap_or_default(),
                16,
            ) {
                bytes.push(byte);
                index += 3;
                continue;
            }
        }
        bytes.push(if input_bytes[index] == b'+' {
            b' '
        } else {
            input_bytes[index]
        });
        index += 1;
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_rfc_5987_filename_over_legacy_filename() {
        let header = "attachment; filename=report.zip; filename*=UTF-8''relat%C3%B3rio.zip";
        assert_eq!(
            from_content_disposition(header).as_deref(),
            Some("relatório.zip")
        );
    }

    #[test]
    fn derives_filename_from_meaningful_url_segment() {
        let url =
            Url::parse("https://example.test/download/files/arquivo%20final.zip?token=1").unwrap();
        assert_eq!(from_url_path(&url).as_deref(), Some("arquivo final.zip"));
    }

    #[test]
    fn ignores_generic_or_extensionless_segments() {
        let url = Url::parse("https://example.test/download/files").unwrap();
        assert_eq!(from_url_path(&url), None);
    }
}
