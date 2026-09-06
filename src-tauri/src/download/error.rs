use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DownloadError {
    InvalidUrl,
    UnsupportedUrlScheme,
}

impl Display for DownloadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidUrl => formatter.write_str("A URL informada é inválida."),
            Self::UnsupportedUrlScheme => {
                formatter.write_str("Apenas URLs HTTP ou HTTPS são permitidas.")
            }
        }
    }
}

impl std::error::Error for DownloadError {}

#[cfg(test)]
mod tests {
    use super::DownloadError;

    #[test]
    fn keeps_user_facing_url_errors_stable() {
        assert_eq!(
            DownloadError::InvalidUrl.to_string(),
            "A URL informada é inválida."
        );
    }
}
