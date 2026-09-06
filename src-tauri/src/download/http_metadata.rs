use reqwest::{header, Response, StatusCode};

pub fn content_range_total(value: &str) -> Option<u64> {
    value.rsplit_once('/')?.1.trim().parse().ok()
}

pub fn response_size(response: &Response) -> Option<u64> {
    response
        .headers()
        .get(header::CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(content_range_total)
        .or_else(|| header_size(response, "x-linked-size"))
        .or_else(|| header_size(response, "x-file-size"))
        .or_else(|| header_size(response, "x-total-content-length"))
        .or_else(|| header_size(response, "x-original-content-length"))
        .or_else(|| {
            if response.status() != StatusCode::PARTIAL_CONTENT {
                response.content_length()
            } else {
                None
            }
        })
        .or_else(|| response.content_length().filter(|&length| length > 1))
}

fn header_size(response: &Response, name: &str) -> Option<u64> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
}

#[cfg(test)]
mod tests {
    use super::content_range_total;

    #[test]
    fn reads_total_size_from_partial_content_range() {
        assert_eq!(content_range_total("bytes 0-0/104857600"), Some(104857600));
        assert_eq!(content_range_total("bytes */*"), None);
    }
}
