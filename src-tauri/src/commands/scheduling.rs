use crate::{
    browser_bridge::BrowserBridge,
    database::{
        models::{DownloadScheduleInput, DownloadStatus, DownloadTask, GlobalDownloadSchedule},
        repositories::{downloads, schedules},
        Database,
    },
    download::{
        runtime::DownloadRuntime,
        schedule::{self, ScheduleDecision},
    },
};
use chrono::Local;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn update_download_schedule(
    database: State<'_, Database>,
    id: String,
    schedule_input: DownloadScheduleInput,
) -> Result<DownloadTask, String> {
    schedule::validate_schedule(
        schedule_input.scheduled_start_at.as_deref(),
        schedule_input.daily_schedule_start_minute,
        schedule_input.daily_schedule_end_minute,
        schedule_input.scheduled_weekdays,
    )?;
    let connection = database.connect()?;
    let task = downloads::find(&connection, &id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Download não encontrado.".to_string())?;
    if matches!(
        task.status,
        DownloadStatus::Downloading
            | DownloadStatus::CheckingFiles
            | DownloadStatus::Assembling
            | DownloadStatus::Extracting
    ) {
        return Err("Pause o download antes de alterar sua agenda.".into());
    }
    downloads::update_schedule(&connection, &id, &schedule_input)
        .map_err(|error| format!("Falha ao salvar agenda: {error}"))?;
    downloads::find(&connection, &id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Download não encontrado após salvar a agenda.".to_string())
}

#[tauri::command]
pub fn get_global_download_schedule(
    database: State<'_, Database>,
) -> Result<GlobalDownloadSchedule, String> {
    schedules::get_global_download_schedule(&database.connect()?).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_global_download_schedule(
    database: State<'_, Database>,
    schedule_input: GlobalDownloadSchedule,
) -> Result<GlobalDownloadSchedule, String> {
    schedule::validate_schedule(
        None,
        schedule_input.daily_start_minute,
        schedule_input.daily_end_minute,
        schedule_input.weekdays,
    )?;
    let connection = database.connect()?;
    schedules::update_global_download_schedule(&connection, &schedule_input)
        .map_err(|error| format!("Falha ao salvar agenda global: {error}"))?;
    schedules::get_global_download_schedule(&connection).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn next_download_execution(
    database: State<'_, Database>,
    id: String,
) -> Result<Option<String>, String> {
    let connection = database.connect()?;
    let task = downloads::find(&connection, &id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Download não encontrado.".to_string())?;
    Ok(schedule::next_execution_at(
        &task,
        Local::now().fixed_offset(),
    ))
}
#[tauri::command]
pub async fn bypass_download_schedule(
    app: AppHandle,
    database: State<'_, Database>,
    runtime: State<'_, DownloadRuntime>,
    browser_bridge: State<'_, BrowserBridge>,
    id: String,
) -> Result<DownloadTask, String> {
    let connection = database.connect()?;
    downloads::bypass_schedule_once(&connection, &id)
        .map_err(|error| format!("Falha ao ignorar agenda: {error}"))?;
    crate::commands::task_control::resume_owned(
        app,
        database.inner().clone(),
        runtime.inner().clone(),
        browser_bridge.inner().clone(),
        id,
    )
    .await
}

pub fn start_scheduler(
    app: AppHandle,
    database: Database,
    runtime: DownloadRuntime,
    browser_bridge: BrowserBridge,
) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            if crate::commands::updater::is_preparing_install() { continue; }
            run_due_schedules(&app, &database, &runtime, &browser_bridge).await;
        }
    });
}

async fn run_due_schedules(
    app: &AppHandle,
    database: &Database,
    runtime: &DownloadRuntime,
    browser_bridge: &BrowserBridge,
) {
    let tasks = match database
        .connect()
        .and_then(|connection| downloads::list(&connection).map_err(|error| error.to_string()))
    {
        Ok(tasks) => tasks,
        Err(error) => {
            crate::commands::debug::log_warn(
                "scheduler",
                "Falha ao consultar agendas persistidas",
                Some(error.to_string()),
                None,
                None,
                Some(app),
            );
            return;
        }
    };
    let now = Local::now().fixed_offset();
    let global_schedule = database
        .connect()
        .and_then(|connection| {
            schedules::get_global_download_schedule(&connection).map_err(|error| error.to_string())
        })
        .unwrap_or_default();
    let global_decision = schedule::global_decision_at(&global_schedule, now);
    for task in tasks {
        let decision = schedule::decision_at(&task, now);
        let active = runtime.has(&task.id);
        let pause_for_global = schedule::is_configured(&task)
            && global_schedule.pause_outside_schedule
            && global_decision == ScheduleDecision::Wait;
        let pause_for_task = task.pause_outside_schedule && decision == ScheduleDecision::Wait;
        if active && (pause_for_global || pause_for_task) {
            let _ = runtime.pause(&task.id);
            crate::commands::debug::log_info(
                "scheduler",
                "Agenda pausou download fora da janela permitida",
                Some(format!(
                    "global={pause_for_global}; tarefa={pause_for_task}"
                )),
                None,
                Some(task.id.clone()),
                Some(app),
            );
            continue;
        }
        if decision != ScheduleDecision::Start
            || global_decision == ScheduleDecision::Wait
            || active
        {
            continue;
        }
        if !matches!(
            task.status,
            DownloadStatus::Paused | DownloadStatus::Pending
        ) {
            continue;
        }
        let id = task.id.clone();
        match crate::commands::task_control::resume_owned(
            app.clone(),
            database.clone(),
            runtime.clone(),
            browser_bridge.clone(),
            id.clone(),
        )
        .await
        {
            Ok(_) => {
                if let Ok(connection) = database.connect() {
                    let _ = downloads::mark_schedule_started(&connection, &id, &now.to_rfc3339());
                }
                crate::commands::debug::log_info(
                    "scheduler",
                    "Agenda iniciou download",
                    Some(format!("executado_em={}", now.to_rfc3339())),
                    None,
                    Some(id),
                    Some(app),
                );
            }
            Err(error) => crate::commands::debug::log_warn(
                "scheduler",
                "Agenda não conseguiu iniciar download",
                Some(error),
                None,
                Some(id),
                Some(app),
            ),
        }
    }
}
