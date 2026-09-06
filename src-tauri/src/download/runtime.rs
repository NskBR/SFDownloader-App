use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicI64, AtomicU8, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

#[derive(Default)]
struct SchedulerState {
    active: usize,
    limit: usize,
    queued: Vec<QueuedTask>,
}

struct QueuedTask {
    id: String,
    priority: i64,
    queue_order: i64,
    enqueued_at: Instant,
}

pub struct QueuePermit {
    scheduler: Arc<(Mutex<SchedulerState>, Notify)>,
}
impl Drop for QueuePermit {
    fn drop(&mut self) {
        if let Ok(mut state) = self.scheduler.0.lock() {
            state.active = state.active.saturating_sub(1);
        }
        self.scheduler.1.notify_waiters();
    }
}

const ACTION_NONE: u8 = 0;
const ACTION_PAUSE: u8 = 1;
const ACTION_CANCEL: u8 = 2;

const PRIORITY_AGING_INTERVAL: Duration = Duration::from_secs(120);

fn effective_priority(task: &QueuedTask) -> i64 {
    let boosts = (task.enqueued_at.elapsed().as_secs() / PRIORITY_AGING_INTERVAL.as_secs()) as i64;
    task.priority.saturating_add(boosts).clamp(0, 3)
}

fn compare_queued_tasks(left: &QueuedTask, right: &QueuedTask) -> std::cmp::Ordering {
    effective_priority(right)
        .cmp(&effective_priority(left))
        .then_with(|| left.queue_order.cmp(&right.queue_order))
}

#[derive(Clone)]
pub struct TaskControl {
    pub cancellation: CancellationToken,
    action: Arc<AtomicU8>,
    speed_limit: Arc<AtomicI64>,
    delete_files: Arc<AtomicBool>,
    bandwidth: Arc<tokio::sync::Mutex<BandwidthState>>,
    bandwidth_changed: Arc<tokio::sync::Notify>,
}

struct BandwidthState {
    started: std::time::Instant,
    transferred: i64,
}

impl TaskControl {
    pub fn new() -> Self {
        Self {
            cancellation: CancellationToken::new(),
            action: Arc::new(AtomicU8::new(ACTION_NONE)),
            speed_limit: Arc::new(AtomicI64::new(0)),
            delete_files: Arc::new(AtomicBool::new(false)),
            bandwidth: Arc::new(tokio::sync::Mutex::new(BandwidthState {
                started: std::time::Instant::now(),
                transferred: 0,
            })),
            bandwidth_changed: Arc::new(tokio::sync::Notify::new()),
        }
    }
    pub fn pause(&self) {
        self.action.store(ACTION_PAUSE, Ordering::SeqCst);
        self.cancellation.cancel();
    }
    pub fn cancel(&self, delete_files: bool) {
        self.delete_files.store(delete_files, Ordering::SeqCst);
        self.action.store(ACTION_CANCEL, Ordering::SeqCst);
        self.cancellation.cancel();
    }
    #[allow(dead_code)]
    pub fn abort(&self) {
        self.cancellation.cancel();
    }
    pub fn was_paused(&self) -> bool {
        self.action.load(Ordering::SeqCst) == ACTION_PAUSE
    }
    pub fn was_cancelled(&self) -> bool {
        self.action.load(Ordering::SeqCst) == ACTION_CANCEL
    }
    pub fn should_delete_files(&self) -> bool {
        self.delete_files.load(Ordering::SeqCst)
    }
    pub async fn set_speed_limit(&self, bytes_per_second: i64) {
        self.speed_limit
            .store(bytes_per_second.max(0), Ordering::SeqCst);
        {
            let mut state = self.bandwidth.lock().await;
            state.started = std::time::Instant::now();
            state.transferred = 0;
        }
        self.bandwidth_changed.notify_waiters();
    }
    pub async fn throttle(&self, bytes: usize) {
        {
            let mut state = self.bandwidth.lock().await;
            state.transferred += bytes as i64;
        }
        loop {
            let limit = self.speed_limit.load(Ordering::SeqCst);
            if limit <= 0 {
                return;
            }
            let delay = {
                let state = self.bandwidth.lock().await;
                let expected =
                    std::time::Duration::from_secs_f64(state.transferred as f64 / limit as f64);
                expected.checked_sub(state.started.elapsed())
            };
            let Some(delay) = delay else {
                return;
            };
            tokio::select! {
                _ = tokio::time::sleep(delay) => return,
                _ = self.bandwidth_changed.notified() => {}
            }
        }
    }
}

#[derive(Clone, Default)]
pub struct DownloadRuntime {
    tasks: Arc<Mutex<HashMap<String, TaskControl>>>,
    scheduler: Arc<(Mutex<SchedulerState>, Notify)>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDiagnostics {
    pub active_tasks: usize,
    pub queued_tasks: usize,
    pub parallel_limit: usize,
}

impl DownloadRuntime {
    pub fn diagnostics(&self) -> RuntimeDiagnostics {
        let (queued_tasks, parallel_limit) = self
            .scheduler
            .0
            .lock()
            .map(|state| (state.queued.len(), state.limit))
            .unwrap_or((0, 0));
        let active_tasks = self.tasks.lock().map(|tasks| tasks.len()).unwrap_or(0);
        RuntimeDiagnostics {
            active_tasks,
            queued_tasks,
            parallel_limit,
        }
    }

    pub async fn acquire(
        &self,
        id: String,
        limit: usize,
        priority: i64,
        queue_order: i64,
        control: &TaskControl,
    ) -> Result<QueuePermit, String> {
        let limit = limit.clamp(1, 50);
        loop {
            {
                let mut state = self
                    .scheduler
                    .0
                    .lock()
                    .map_err(|_| "Falha ao acessar a fila de downloads.".to_string())?;
                state.limit = limit;
                if !state.queued.iter().any(|task| task.id == id) {
                    state.queued.push(QueuedTask {
                        id: id.clone(),
                        priority: priority.clamp(0, 3),
                        queue_order,
                        enqueued_at: Instant::now(),
                    });
                }
                state.queued.sort_by(compare_queued_tasks);
                if state.active < state.limit
                    && state.queued.first().is_some_and(|task| task.id == id)
                {
                    state.active += 1;
                    state.queued.remove(0);
                    return Ok(QueuePermit {
                        scheduler: self.scheduler.clone(),
                    });
                }
            }
            tokio::select! {
                _ = self.scheduler.1.notified() => {},
                _ = control.cancellation.cancelled() => {
                    if let Ok(mut state) = self.scheduler.0.lock() {
                        state.queued.retain(|task| task.id != id);
                    }
                    self.scheduler.1.notify_waiters();
                    return Err("Download removido da fila.".into());
                },
            }
        }
    }
    pub fn update_priority(&self, id: &str, priority: i64) -> Result<(), String> {
        let mut state = self
            .scheduler
            .0
            .lock()
            .map_err(|_| "Falha ao acessar a fila de downloads.".to_string())?;
        if let Some(task) = state.queued.iter_mut().find(|task| task.id == id) {
            task.priority = priority.clamp(0, 3);
        }
        drop(state);
        self.scheduler.1.notify_waiters();
        Ok(())
    }
    pub fn update_queue_order(&self, id: &str, queue_order: i64) -> Result<(), String> {
        let mut state = self
            .scheduler
            .0
            .lock()
            .map_err(|_| "Falha ao acessar a fila de downloads.".to_string())?;
        if let Some(task) = state.queued.iter_mut().find(|task| task.id == id) {
            task.queue_order = queue_order;
        }
        drop(state);
        self.scheduler.1.notify_waiters();
        Ok(())
    }
    pub fn register(&self, id: String, control: TaskControl) -> Result<(), String> {
        let mut tasks = self
            .tasks
            .lock()
            .map_err(|_| "Falha ao acessar downloads ativos.".to_string())?;
        if tasks.contains_key(&id) {
            return Err("Este download já está ativo.".into());
        }
        tasks.insert(id, control);
        Ok(())
    }
    pub fn pause(&self, id: &str) -> Result<bool, String> {
        self.signal(id, true, false)
    }
    pub fn cancel(&self, id: &str, delete_files: bool) -> Result<bool, String> {
        self.signal(id, false, delete_files)
    }
    fn signal(&self, id: &str, pause: bool, delete_files: bool) -> Result<bool, String> {
        let tasks = self
            .tasks
            .lock()
            .map_err(|_| "Falha ao acessar downloads ativos.".to_string())?;
        if let Some(control) = tasks.get(id) {
            if pause {
                control.pause()
            } else {
                control.cancel(delete_files)
            };
            return Ok(true);
        }
        Ok(false)
    }
    pub fn remove(&self, id: &str) {
        if let Ok(mut tasks) = self.tasks.lock() {
            tasks.remove(id);
        }
    }
    pub fn has(&self, id: &str) -> bool {
        if let Ok(tasks) = self.tasks.lock() {
            tasks.contains_key(id)
        } else {
            false
        }
    }
    pub fn control(&self, id: &str) -> Result<Option<TaskControl>, String> {
        self.tasks
            .lock()
            .map(|tasks| tasks.get(id).cloned())
            .map_err(|_| "Falha ao acessar downloads ativos.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pause_and_cancel_have_distinct_intents() {
        let paused = TaskControl::new();
        paused.pause();
        assert!(paused.was_paused());
        assert!(!paused.was_cancelled());
        let cancelled = TaskControl::new();
        cancelled.cancel(false);
        assert!(cancelled.was_cancelled());
        assert!(!cancelled.was_paused());
        assert!(!cancelled.should_delete_files());

        let deleting = TaskControl::new();
        deleting.cancel(true);
        assert!(deleting.was_cancelled());
        assert!(deleting.should_delete_files());
    }

    #[test]
    fn scheduler_ages_waiting_tasks_to_avoid_starvation() {
        let now = Instant::now();
        let mut queued = [
            QueuedTask {
                id: "fresh-high".into(),
                priority: 2,
                queue_order: 1,
                enqueued_at: now,
            },
            QueuedTask {
                id: "waiting-normal".into(),
                priority: 1,
                queue_order: 2,
                enqueued_at: now - PRIORITY_AGING_INTERVAL * 2,
            },
        ];

        queued.sort_by(compare_queued_tasks);
        assert_eq!(queued[0].id, "waiting-normal");
        assert_eq!(effective_priority(&queued[0]), 3);
    }

    #[tokio::test]
    async fn scheduler_honors_parallel_limit() {
        let runtime = DownloadRuntime::default();
        let first = TaskControl::new();
        let second = TaskControl::new();
        let permit = runtime
            .acquire("first".into(), 1, 1, 1, &first)
            .await
            .unwrap();
        assert!(tokio::time::timeout(
            std::time::Duration::from_millis(20),
            runtime.acquire("second".into(), 1, 1, 2, &second)
        )
        .await
        .is_err());
        drop(permit);
        assert!(tokio::time::timeout(
            std::time::Duration::from_millis(100),
            runtime.acquire("second".into(), 1, 1, 2, &second)
        )
        .await
        .is_ok());
    }

    #[tokio::test]
    async fn scheduler_removes_paused_and_cancelled_tasks_while_waiting() {
        let runtime = DownloadRuntime::default();
        let active = TaskControl::new();
        let permit = runtime
            .acquire("active".into(), 1, 1, 1, &active)
            .await
            .unwrap();

        for (id, control) in [
            ("paused", TaskControl::new()),
            ("cancelled", TaskControl::new()),
        ] {
            let waiter = {
                let runtime = runtime.clone();
                let control = control.clone();
                tokio::spawn(async move { runtime.acquire(id.into(), 1, 1, 2, &control).await })
            };
            tokio::task::yield_now().await;
            if id == "paused" {
                control.pause();
            } else {
                control.cancel(true);
            }
            let result = tokio::time::timeout(std::time::Duration::from_millis(100), waiter)
                .await
                .expect("queued task should be released immediately")
                .expect("task join should succeed");
            assert!(matches!(result, Err(message) if message == "Download removido da fila."));
        }

        assert!(runtime.scheduler.0.lock().unwrap().queued.is_empty());
        drop(permit);
    }

    #[tokio::test]
    async fn scheduler_prefers_higher_priority_without_preempting_active_work() {
        let runtime = DownloadRuntime::default();
        let active = TaskControl::new();
        let normal = TaskControl::new();
        let urgent = TaskControl::new();
        let permit = runtime
            .acquire("active".into(), 1, 1, 1, &active)
            .await
            .unwrap();

        let normal_wait = {
            let runtime = runtime.clone();
            let normal = normal.clone();
            tokio::spawn(async move { runtime.acquire("normal".into(), 1, 1, 2, &normal).await })
        };
        tokio::task::yield_now().await;
        let urgent_wait = {
            let runtime = runtime.clone();
            let urgent = urgent.clone();
            tokio::spawn(async move { runtime.acquire("urgent".into(), 1, 3, 3, &urgent).await })
        };
        tokio::task::yield_now().await;

        drop(permit);
        let urgent_permit =
            tokio::time::timeout(std::time::Duration::from_millis(100), urgent_wait)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
        assert!(!normal_wait.is_finished());
        drop(urgent_permit);

        assert!(normal_wait.await.unwrap().is_ok());
    }

    #[tokio::test(start_paused = true)]
    async fn segmented_workers_share_one_task_bandwidth_budget() {
        let control = TaskControl::new();
        control.set_speed_limit(100).await;
        let first = tokio::spawn({
            let control = control.clone();
            async move { control.throttle(60).await }
        });
        let second = tokio::spawn({
            let control = control.clone();
            async move { control.throttle(40).await }
        });
        tokio::task::yield_now().await;
        tokio::task::yield_now().await;
        assert!(!first.is_finished());
        assert!(!second.is_finished());

        control.set_speed_limit(0).await;
        tokio::task::yield_now().await;
        assert!(first.is_finished());
        assert!(second.is_finished());
        first.await.unwrap();
        second.await.unwrap();
    }
    #[tokio::test(start_paused = true)]
    async fn throttle_reacts_to_a_dynamic_limit_change() {
        let control = TaskControl::new();
        control.set_speed_limit(100).await;
        let waiter = tokio::spawn({
            let control = control.clone();
            async move { control.throttle(100).await }
        });
        tokio::task::yield_now().await;
        assert!(!waiter.is_finished());
        control.set_speed_limit(0).await;
        tokio::task::yield_now().await;
        assert!(waiter.is_finished());
        waiter.await.unwrap();
    }
}
