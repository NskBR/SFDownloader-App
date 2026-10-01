//! Share query pacing across confirmations and download workers. No credentials or CDN URLs are cached.
use super::media::MediaPreview;
use serde::Serialize;
use std::{
    collections::HashMap,
    future::Future,
    sync::{LazyLock, Mutex},
    time::Duration,
};
use tokio::{sync::Mutex as AsyncMutex, time::Instant};

const QUERY_INTERVAL: Duration = Duration::from_secs(5);
const CACHE_TTL: Duration = Duration::from_secs(120);
const MIX_CACHE_TTL: Duration = Duration::from_secs(30);
const CACHE_LIMIT: usize = 12;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryWait {
    pub seconds: u64,
    pub reason: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryError {
    pub message: String,
    pub retry_after_seconds: u64,
    #[serde(skip)]
    limited: bool,
}
impl From<String> for QueryError {
    fn from(message: String) -> Self {
        Self {
            message,
            retry_after_seconds: 0,
            limited: false,
        }
    }
}
impl From<&str> for QueryError {
    fn from(message: &str) -> Self {
        message.to_owned().into()
    }
}
impl QueryError {
    pub fn from_diagnostic(raw: &str, message: String) -> Self {
        Self {
            message,
            retry_after_seconds: 0,
            limited: is_rate_limit(raw),
        }
    }
}
pub fn is_rate_limit(raw: &str) -> bool {
    let s = raw.to_ascii_lowercase();
    s.contains("http error 429")
        || s.contains("http 429")
        || s.contains("status code 429")
        || s.contains("too many requests")
        || s.contains("rate limit")
        || s.contains("rate-limit")
        || s.contains("confirm you're not a bot")
        || s.contains("confirm you’re not a bot")
}

struct State {
    next_allowed: Instant,
    strikes: u32,
    blocked: bool,
}
pub struct QueryCoordinator {
    gate: AsyncMutex<()>,
    state: Mutex<State>,
    cache: Mutex<HashMap<String, (Instant, MediaPreview)>>,
}
pub static COORDINATOR: LazyLock<QueryCoordinator> = LazyLock::new(QueryCoordinator::new);

impl QueryCoordinator {
    fn new() -> Self {
        Self {
            gate: AsyncMutex::new(()),
            state: Mutex::new(State {
                next_allowed: Instant::now(),
                strikes: 0,
                blocked: false,
            }),
            cache: Mutex::new(HashMap::new()),
        }
    }
    fn cached(&self, key: &str) -> Option<MediaPreview> {
        let mut cache = self.cache.lock().ok()?;
        cache.retain(|_, (expires, _)| *expires > Instant::now());
        cache.get(key).map(|(_, p)| p.clone())
    }
    fn wait(&self) -> QueryWait {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let remaining = state.next_allowed.saturating_duration_since(Instant::now());
        QueryWait {
            seconds: remaining.as_secs() + u64::from(remaining.subsec_nanos() > 0),
            reason: if state.blocked {
                "rate-limit"
            } else {
                "cooldown"
            },
        }
    }
    pub fn rate_limited(&self) -> u64 {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.strikes = state.strikes.saturating_add(1);
        let seconds =
            (60u64.saturating_mul(1u64 << state.strikes.saturating_sub(1).min(3))).min(300);
        state.next_allowed = state
            .next_allowed
            .max(Instant::now() + Duration::from_secs(seconds));
        state.blocked = true;
        seconds
    }
    pub async fn lookup<F, Fut>(
        &self,
        key: &str,
        notify: impl Fn(QueryWait),
        fetch: F,
    ) -> Result<MediaPreview, QueryError>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<MediaPreview, QueryError>>,
    {
        if let Some(p) = self.cached(key) {
            return Ok(p);
        }
        let pending = self.gate.lock();
        tokio::pin!(pending);
        let _guard = loop {
            tokio::select! {
                guard = &mut pending => break guard,
                _ = tokio::time::sleep(Duration::from_secs(1)) => notify(QueryWait {seconds:0,reason:"queue"}),
            }
        };
        if let Some(p) = self.cached(key) {
            return Ok(p);
        }
        loop {
            let wait = self.wait();
            if wait.seconds == 0 {
                break;
            }
            notify(wait);
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        // Reserve before launching, so closing a window mid-query cannot bypass the interval.
        {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            state.next_allowed = Instant::now() + QUERY_INTERVAL;
            state.blocked = false;
        }
        notify(QueryWait {
            seconds: 0,
            reason: "query",
        });
        let result = fetch().await;
        {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            state.next_allowed = state.next_allowed.max(Instant::now() + QUERY_INTERVAL);
        }
        match result {
            Ok(preview) => {
                self.state.lock().unwrap_or_else(|e| e.into_inner()).strikes = 0;
                let ttl = if preview.playlist.as_ref().is_some_and(|p| p.mix) {
                    MIX_CACHE_TTL
                } else {
                    CACHE_TTL
                };
                let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
                if cache.len() >= CACHE_LIMIT {
                    if let Some(oldest) = cache
                        .iter()
                        .min_by_key(|(_, (expires, _))| *expires)
                        .map(|(key, _)| key.clone())
                    {
                        cache.remove(&oldest);
                    }
                }
                cache.insert(key.into(), (Instant::now() + ttl, preview.clone()));
                Ok(preview)
            }
            Err(mut error) => {
                if error.limited {
                    self.rate_limited();
                    error.retry_after_seconds = self.wait().seconds;
                }
                Err(error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::download::media::{parse_preview, PlaylistPreview};
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn preview() -> MediaPreview {
        parse_preview(json!({"id":"jNQXAC9IVRw","title":"Test","formats":[{"height":240,"vcodec":"avc1","acodec":"mp4a"}]}), "https://www.youtube.com/watch?v=jNQXAC9IVRw".into(), "jNQXAC9IVRw".into(), false).unwrap()
    }

    #[tokio::test(start_paused = true)]
    async fn queries_are_serialized_and_same_source_reuses_metadata() {
        let coordinator = QueryCoordinator::new();
        let calls = AtomicUsize::new(0);
        let fetch = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            tokio::time::sleep(Duration::from_secs(2)).await;
            Ok(preview())
        };
        let (a, b) = tokio::join!(
            coordinator.lookup("same", |_| {}, fetch),
            coordinator.lookup("same", |_| {}, fetch)
        );
        assert!(a.is_ok() && b.is_ok());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        let began = Instant::now();
        let waits = Mutex::new(Vec::new());
        coordinator
            .lookup("other", |w| waits.lock().unwrap().push(w), fetch)
            .await
            .unwrap();
        assert!(began.elapsed() >= QUERY_INTERVAL);
        assert!(waits
            .lock()
            .unwrap()
            .iter()
            .any(|w| w.reason == "cooldown" && w.seconds == 5));
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn rate_limit_applies_global_increasing_backoff_and_never_caches_errors() {
        let coordinator = QueryCoordinator::new();
        let fail = || async {
            Err(QueryError::from_diagnostic(
                "HTTP Error 429: Too Many Requests",
                "Wait".into(),
            ))
        };
        let first = coordinator.lookup("a", |_| {}, fail).await.unwrap_err();
        assert_eq!(first.retry_after_seconds, 60);
        let began = Instant::now();
        let waits = Mutex::new(Vec::new());
        let second = coordinator
            .lookup("different", |w| waits.lock().unwrap().push(w), fail)
            .await
            .unwrap_err();
        assert!(began.elapsed() >= Duration::from_secs(60));
        assert_eq!(second.retry_after_seconds, 120);
        assert!(waits
            .lock()
            .unwrap()
            .iter()
            .any(|w| w.reason == "rate-limit" && w.seconds == 60));
        assert!(coordinator.cache.lock().unwrap().is_empty());
        assert_eq!(coordinator.rate_limited(), 240);
        assert_eq!(coordinator.rate_limited(), 300);
        assert_eq!(coordinator.rate_limited(), 300);
    }

    #[tokio::test(start_paused = true)]
    async fn closing_during_a_query_releases_the_queue_but_preserves_spacing() {
        let coordinator = QueryCoordinator::new();
        let started = Instant::now();
        {
            let cancelled = coordinator.lookup(
                "closed",
                |_| {},
                || async {
                    tokio::time::sleep(Duration::from_secs(60)).await;
                    Ok(preview())
                },
            );
            tokio::pin!(cancelled);
            tokio::select! { _ = &mut cancelled => panic!("query should still be running"), _ = tokio::time::sleep(Duration::from_secs(1)) => {} }
        }
        coordinator
            .lookup("next", |_| {}, || async { Ok(preview()) })
            .await
            .unwrap();
        assert!(started.elapsed() >= QUERY_INTERVAL);
        assert!(coordinator.cached("closed").is_none());
    }

    #[tokio::test(start_paused = true)]
    async fn mix_cache_expires_earlier_and_cache_is_bounded() {
        let coordinator = QueryCoordinator::new();
        let mut mix = preview();
        mix.playlist = Some(PlaylistPreview {
            entries: vec![],
            unavailable_count: 0,
            mix: true,
            snapshot_limit: Some(50),
        });
        coordinator
            .lookup("mix", |_| {}, || async { Ok(mix) })
            .await
            .unwrap();
        coordinator
            .lookup("video", |_| {}, || async { Ok(preview()) })
            .await
            .unwrap();
        tokio::time::advance(Duration::from_secs(31)).await;
        assert!(coordinator.cached("mix").is_none());
        assert!(coordinator.cached("video").is_some());
        for n in 0..15 {
            coordinator
                .lookup(&n.to_string(), |_| {}, || async { Ok(preview()) })
                .await
                .unwrap();
        }
        assert!(coordinator.cache.lock().unwrap().len() <= CACHE_LIMIT);
    }

    #[test]
    fn rate_limit_detection_does_not_treat_private_video_as_a_temporary_limit() {
        for raw in [
            "HTTP Error 429",
            "Too Many Requests",
            "Sign in to confirm you're not a bot",
            "rate limit exceeded",
            "rate-limited by YouTube",
        ] {
            assert!(is_rate_limit(raw));
        }
        for raw in [
            "Sign in to view this private video",
            "Video unavailable",
            "HTTP Error 403: forbidden",
            "[youtube] xyz429abcde: Video unavailable",
        ] {
            assert!(!is_rate_limit(raw));
        }
        let error = QueryError::from_diagnostic("HTTP Error 429", "Wait".into());
        let json = serde_json::to_value(error).unwrap();
        assert!(json.get("limited").is_none());
        assert_eq!(json["message"], "Wait");
    }
}
