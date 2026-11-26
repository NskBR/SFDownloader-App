use arc_swap::ArcSwapOption;
use governor::DefaultDirectRateLimiter as RateLimiter;
use governor::Quota;
use serde::Deserialize;
use serde::Serialize;
use std::num::NonZeroU32;
use std::sync::Arc;

#[derive(Default, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct LimitsConfig {
    pub upload_bps: Option<NonZeroU32>,
    pub download_bps: Option<NonZeroU32>,
}

struct Limit {
    limiter: ArcSwapOption<(RateLimiter,NonZeroU32)>,
    changed:tokio::sync::Notify,
    current_bps: std::sync::atomic::AtomicU32,
}

impl Limit {
    fn new_inner(bps: Option<NonZeroU32>) -> Option<Arc<(RateLimiter,NonZeroU32)>> {
        let bps = bps?;
        Some(Arc::new((RateLimiter::direct(Quota::per_second(bps)),bps)))
    }

    fn new(bps: Option<NonZeroU32>) -> Self {
        use std::sync::atomic::AtomicU32;
        Self {
            limiter: ArcSwapOption::new(Self::new_inner(bps)),
            changed:tokio::sync::Notify::new(),
            current_bps: AtomicU32::new(bps.map(|v| v.get()).unwrap_or(0)),
        }
    }

    async fn acquire(&self, size: NonZeroU32) -> crate::Result<()> {
        let mut remaining=size.get();
        while remaining>0 {
            let changed=self.changed.notified();tokio::pin!(changed);changed.as_mut().enable();
            let Some(limiter)=self.limiter.load_full() else{return Ok(());};
            let batch=NonZeroU32::new(remaining.min(limiter.1.get())).unwrap();
            tokio::select! {
                result=limiter.0.until_n_ready(batch)=>{result?;remaining-=batch.get();}
                _=&mut changed=>{}
            }
        }
        Ok(())
    }

    fn set(&self, limit: Option<NonZeroU32>) {
        use std::sync::atomic::Ordering;
        let new = Self::new_inner(limit);
        self.limiter.swap(new);
        self.current_bps
            .store(limit.map(|v| v.get()).unwrap_or(0), Ordering::Relaxed);
        self.changed.notify_waiters();
    }

    fn get(&self) -> Option<NonZeroU32> {
        use std::sync::atomic::Ordering;
        NonZeroU32::new(self.current_bps.load(Ordering::Relaxed))
    }
}

pub struct Limits {
    down: Limit,
    up: Limit,
}

impl Limits {
    pub fn new(config: LimitsConfig) -> Self {
        Self {
            down: Limit::new(config.download_bps),
            up: Limit::new(config.upload_bps),
        }
    }

    pub async fn prepare_for_upload(&self, len: NonZeroU32) -> crate::Result<()> {
        self.up.acquire(len).await
    }

    pub async fn prepare_for_download(&self, len: NonZeroU32) -> crate::Result<()> {
        self.down.acquire(len).await
    }

    pub fn set_upload_bps(&self, bps: Option<NonZeroU32>) {
        self.up.set(bps);
    }

    pub fn set_download_bps(&self, bps: Option<NonZeroU32>) {
        self.down.set(bps);
    }

    pub fn get_upload_bps(&self) -> Option<NonZeroU32> {
        self.up.get()
    }

    pub fn get_download_bps(&self) -> Option<NonZeroU32> {
        self.down.get()
    }

    pub fn get_config(&self) -> LimitsConfig {
        LimitsConfig {
            upload_bps: self.get_upload_bps(),
            download_bps: self.get_download_bps(),
        }
    }
}

#[cfg(test)]
mod upload_limit_tests {
 use super::*;
 #[tokio::test]
 async fn small_quota_waits_instead_of_rejecting_a_whole_torrent_block(){
  let limits=Arc::new(Limits::new(LimitsConfig{upload_bps:NonZeroU32::new(1024),download_bps:None}));
  let waiter=tokio::spawn({let limits=limits.clone();async move{limits.prepare_for_upload(NonZeroU32::new(16384).unwrap()).await}});
  tokio::time::sleep(std::time::Duration::from_millis(20)).await;
  assert!(!waiter.is_finished());limits.set_upload_bps(None);
  tokio::time::timeout(std::time::Duration::from_millis(300),waiter).await.unwrap().unwrap().unwrap();
 }
 #[tokio::test]
 async fn upload_quota_does_not_limit_download_or_another_torrent(){
  let limited=Limits::new(LimitsConfig{upload_bps:NonZeroU32::new(1),download_bps:None});
  let other=Limits::new(Default::default());
  tokio::time::timeout(std::time::Duration::from_millis(100),limited.prepare_for_download(NonZeroU32::new(16384).unwrap())).await.unwrap().unwrap();
  tokio::time::timeout(std::time::Duration::from_millis(100),other.prepare_for_upload(NonZeroU32::new(16384).unwrap())).await.unwrap().unwrap();
 }
}
