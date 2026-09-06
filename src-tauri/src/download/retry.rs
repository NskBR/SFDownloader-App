use reqwest::{header, Response};
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex as StdMutex,
    },
    time::{Duration, Instant, SystemTime},
};
use tokio::sync::{Mutex as AsyncMutex, Semaphore};
pub(crate) const MAX_CHUNK_ATTEMPTS: usize = 8;
#[derive(Clone)]
pub(crate) struct AdaptiveThrottle {
    pub(crate) permits: Arc<Semaphore>,
    concurrency: Arc<AtomicUsize>,
    max_concurrency: usize,
    cooldown_until: Arc<StdMutex<Instant>>,
    last_recovery: Arc<StdMutex<Instant>>,
    pub(crate) fallback_lock: Arc<AsyncMutex<()>>,
}

impl AdaptiveThrottle {
    pub(crate) fn new(connections: usize) -> Self {
        let connections = connections.clamp(1, 32);
        Self {
            permits: Arc::new(Semaphore::new(connections)),
            concurrency: Arc::new(AtomicUsize::new(connections)),
            max_concurrency: connections,
            cooldown_until: Arc::new(StdMutex::new(Instant::now())),
            last_recovery: Arc::new(StdMutex::new(Instant::now())),
            fallback_lock: Arc::new(AsyncMutex::new(())),
        }
    }

    pub(crate) async fn wait(&self) {
        let until = self
            .cooldown_until
            .lock()
            .map(|value| *value)
            .unwrap_or_else(|_| Instant::now());
        if until > Instant::now() {
            tokio::time::sleep_until(tokio::time::Instant::from_std(until)).await;
        }
        let current = self.concurrency.load(Ordering::SeqCst);
        if current < self.max_concurrency {
            if let Ok(mut last) = self.last_recovery.lock() {
                if last.elapsed() >= Duration::from_secs(5)
                    && self
                        .concurrency
                        .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst)
                        .is_ok()
                {
                    self.permits.add_permits(1);
                    *last = Instant::now();
                }
            }
        }
    }

    pub(crate) fn limit(&self, delay: Duration) {
        if let Ok(mut until) = self.cooldown_until.lock() {
            *until = (*until).max(Instant::now() + delay);
        }
        let current = self.concurrency.load(Ordering::SeqCst);
        let target = (current / 2).max(1);
        let removed = self.permits.forget_permits(current.saturating_sub(target));
        if removed > 0 {
            self.concurrency.fetch_sub(removed, Ordering::SeqCst);
            if let Ok(mut last) = self.last_recovery.lock() {
                *last = Instant::now();
            }
        }
    }
}

pub(crate) fn retry_delay(
    response: Option<&Response>,
    attempt: usize,
    chunk_index: i64,
) -> Duration {
    if let Some(value) = response
        .and_then(|response| response.headers().get(header::RETRY_AFTER))
        .and_then(|value| value.to_str().ok())
    {
        if let Ok(seconds) = value.trim().parse::<u64>() {
            return Duration::from_secs(seconds.clamp(1, 120));
        }
        if let Ok(date) = httpdate::parse_http_date(value) {
            if let Ok(delay) = date.duration_since(SystemTime::now()) {
                return delay.clamp(Duration::from_secs(1), Duration::from_secs(120));
            }
        }
    }
    let exponential = 1_u64 << attempt.min(5);
    let jitter = ((chunk_index.unsigned_abs() + attempt as u64 * 17) % 700) + 100;
    Duration::from_millis(exponential * 500 + jitter)
}
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn adaptive_throttle_recovers_after_provider_cooldown() {
        let throttle = AdaptiveThrottle::new(4);
        throttle.limit(Duration::ZERO);
        assert_eq!(throttle.concurrency.load(Ordering::SeqCst), 2);
        *throttle.last_recovery.lock().unwrap() = Instant::now() - Duration::from_secs(6);
        throttle.wait().await;
        assert_eq!(throttle.concurrency.load(Ordering::SeqCst), 3);
    }
}
