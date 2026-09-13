import { invoke } from "@tauri-apps/api/core";
import type { DownloadScheduleInput, DownloadTask, ParsedTorrentMeta } from "../domain/download";
import type { AppSettings } from "../domain/settings";
import type { ProfileStatistics } from "../domain/profile";
import type { MetricsSnapshot } from "../domain/metrics";

export interface DownloadPreview {
  url: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  extension: string | null;
}
export const downloadPriorityValue = (value?: string): number => {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  if (normalized === "0" || normalized === "baixa" || normalized === "low")
    return 0;
  if (normalized === "2" || normalized === "alta" || normalized === "high")
    return 2;
  if (normalized === "3" || normalized === "urgente" || normalized === "urgent")
    return 3;
  return 1;
};
const input = (
  url: string,
  settings: AppSettings,
  rootFolder?: string,
  browserRequestId?: string,
  resumeSupport: boolean = true,
  autoExtract = false,
  archivePassword?: string,
  selectedCategory?: string,
  force = false,
  priority?: number,
) => ({
  url,
  rootFolder: rootFolder || settings.rootDownloadFolder,
  autoOrganize: settings.autoOrganizeEnabled,
  deleteArchiveAfterExtract: settings.deleteArchiveAfterExtract,
  maxConnections: settings.maxConnectionsPerDownload,
  maxParallelDownloads: settings.maxParallelDownloads,
  speedLimitDownload: Math.max(
    0,
    Math.round(settings.speedLimitDownloadMbps * 1024 * 1024),
  ),
  speedLimitInherited: true,
  browserRequestId: browserRequestId || null,
  resumeSupport,
  autoExtract,
  archivePassword: archivePassword || null,
  selectedCategory: selectedCategory || null,
  force,
  priority: Math.max(
    0,
    Math.min(
      3,
      Math.round(priority ?? downloadPriorityValue(settings.downloadPriority)),
    ),
  ),
});
export const listDownloads = () => invoke<DownloadTask[]>("list_downloads");
export const inspectDownload = (url: string, requestId?: string) =>
  invoke<DownloadPreview>("inspect_download", {
    url,
    requestId: requestId || null,
  });
export const openDownloadConfirmation = (token: string, url = "") =>
  invoke<void>("open_download_confirmation", { token, url });

// Dedupe global (nível de módulo, sobrevive a remount/StrictMode) para impedir
// janelas de confirmação duplicadas da MESMA URL disparadas em sequência por
// caminhos diferentes (paste, Enter, deep link, extensão). URLs diferentes
// continuam abrindo janelas independentes.
const recentConfirmations = new Map<string, number>();
export function shouldOpenConfirmation(url: string, windowMs = 2500): boolean {
  const now = Date.now();
  for (const [key, time] of recentConfirmations) {
    if (now - time > 10000) recentConfirmations.delete(key);
  }
  const last = recentConfirmations.get(url);
  if (last && now - last < windowMs) return false;
  recentConfirmations.set(url, now);
  return true;
}
export const openProgressWindow = (id: string) =>
  invoke<void>("open_progress_window", { id });
export const openCompleteWindow = (id: string) =>
  invoke<void>("open_complete_window", { id });
export const startDownload = (
  url: string,
  settings: AppSettings,
  rootFolder?: string,
  browserRequestId?: string,
  resumeSupport?: boolean,
  autoExtract = false,
  archivePassword?: string,
  selectedCategory?: string,
  force = false,
  priority?: number,
) =>
  invoke<DownloadTask>("start_download", {
    input: input(
      url,
      settings,
      rootFolder,
      browserRequestId,
      resumeSupport,
      autoExtract,
      archivePassword,
      selectedCategory,
      force,
      priority,
    ),
  });
export const queueDownload = (
  url: string,
  settings: AppSettings,
  rootFolder?: string,
  browserRequestId?: string,
  resumeSupport?: boolean,
  autoExtract = false,
  archivePassword?: string,
  selectedCategory?: string,
  priority?: number,
) =>
  invoke<DownloadTask>("queue_download", {
    input: input(
      url,
      settings,
      rootFolder,
      browserRequestId,
      resumeSupport,
      autoExtract,
      archivePassword,
      selectedCategory,
      false,
      priority,
    ),
  });
export const cancelDownload = (id: string, deleteFiles = false) =>
  invoke<boolean>("cancel_download", { id, deleteFiles });
export const pauseDownload = (id: string) =>
  invoke<boolean>("pause_download", { id });
export const resumeDownload = (id: string) =>
  invoke<DownloadTask>("resume_download", { id });
export const replaceDownloadUrl = (id: string, newUrl: string) =>
  invoke<DownloadTask>("replace_download_url", { id, newUrl });
export const removeDownload = (id: string) =>
  invoke<boolean>("remove_download", { id });
export const revealInFolder = (path: string) =>
  invoke<void>("reveal_in_folder", { path });
export const openFile = (path: string) => invoke<void>("open_file", { path });
export const updateSpeedLimit = (id: string, speedLimit: number) =>
  invoke<void>("update_speed_limit", { id, speedLimit });
export const updateDownloadPriority = (id: string, priority: number) =>
  invoke<DownloadTask>("update_download_priority", { id, priority });
export const moveDownloadQueueItem = (id: string, direction: "up" | "down") =>
  invoke<DownloadTask[]>("move_download_queue_item", { id, direction });
export const prioritizeDownload = (id: string) =>
  invoke<DownloadTask>("prioritize_download", { id });
export const updateDownloadSchedule = (
  id: string,
  scheduleInput: DownloadScheduleInput,
) => invoke<DownloadTask>("update_download_schedule", { id, scheduleInput });
export const bypassDownloadSchedule = (id: string) =>
  invoke<DownloadTask>("bypass_download_schedule", { id });export const nextDownloadExecution = (id: string) =>
  invoke<string | null>("next_download_execution", { id });export interface GlobalDownloadSchedule {
  dailyStartMinute: number | null;
  dailyEndMinute: number | null;
  weekdays: number;
  pauseOutsideSchedule: boolean;
}
export const getGlobalDownloadSchedule = () =>
  invoke<GlobalDownloadSchedule>("get_global_download_schedule");
export const updateGlobalDownloadSchedule = (scheduleInput: GlobalDownloadSchedule) =>
  invoke<GlobalDownloadSchedule>("update_global_download_schedule", { scheduleInput });
export const browserExtensionConnected = () =>
  invoke<boolean>("browser_extension_status");
export interface BrowserBridgeDiagnostics {
  listening: boolean;
  connected: boolean;
  port: number;
  error: string | null;
}
export const browserExtensionDiagnostics = () =>
  invoke<BrowserBridgeDiagnostics>("browser_extension_diagnostics");
export const extractionStatus = (id: string) =>
  invoke<string | null>("extraction_status", { id });
export const openUrl = (url: string) => invoke<void>("open_url", { url });
export const setLaunchOnStartup = (enabled: boolean) =>
  invoke<void>("set_autostart", { enabled });
export const isLaunchOnStartup = () => invoke<boolean>("is_autostart_enabled");
export const getMetrics = () => invoke<MetricsSnapshot>("metrics_snapshot");
export const resetMetrics = () => invoke<void>("reset_metrics");
export const exportMetrics = (format: "json" | "txt") =>
  invoke<string>("export_metrics", { format });
export const importMetrics = () => invoke<void>("import_metrics");
export const profileStatistics = () =>
  invoke<ProfileStatistics>("profile_statistics");
export interface TorrentFileItem {
  index: number;
  path: string;
  size: number;
}

export interface TorrentFileSelection {
  files: TorrentFileItem[];
  selectedFileIndexes: number[];
  lockedFileIndexes: number[];
}

export type TorrentMetadataResponse =
  | {
      status: "ready";
      infoHash: string;
      name: string;
      totalSize: number;
      files: TorrentFileItem[];
    }
  | {
      status: "fetchingMetadata";
      infoHash: string;
      name?: string;
    }
  | {
      status: "failed";
      infoHash: string;
      message: string;
    };

export const parseTorrentInfo = async (
  source: string,
  token?: string,
): Promise<TorrentMetadataResponse> => {
  return invoke<TorrentMetadataResponse>("parse_torrent_info", {
    token,
    source,
  });
};

export const confirmTorrent = (input: {
  infoHash: string;
  savePath: string;
  selectedFileIndexes: number[];
  startImmediately: boolean;
}) => invoke<DownloadTask>("confirm_torrent", input);

export const cancelTorrent = (infoHash: string, deleteFiles: boolean = false) =>
  invoke<void>("cancel_torrent", { infoHash, deleteFiles });

export const getTorrentFileSelection = (infoHash: string) =>
  invoke<TorrentFileSelection>("torrent_file_selection", { infoHash });

export const updateTorrentFileSelection = (
  infoHash: string,
  selectedFileIndexes: number[],
) =>
  invoke<TorrentFileSelection>("update_torrent_file_selection", {
    infoHash,
    selectedFileIndexes,
  });

export const openTorrentProgressWindow = (infoHash: string, taskId: string) =>
  invoke<void>("open_torrent_progress_window", { infoHash, taskId });

export const openTorrentFileSelectionWindow = (taskId: string) =>
  invoke<void>("open_torrent_file_selection_window", { taskId });

export interface UpdateCheckResult {
  available: boolean;
  current_version: string;
  latest_version: string;
  release_url: string;
  release_name?: string | null;
  release_notes?: string | null;
  installer_url?: string | null;
  installer_name?: string | null;
  installer_size?: number | null;
}

export const checkForUpdates = (repoOverride?: string) =>
  invoke<UpdateCheckResult>("check_for_updates", { repoOverride });

export interface UpdateDownloadProgress {
  status: "idle" | "downloading" | "cancelling" | "ready" | "preparing" | "installing" | "failed";
  downloaded_bytes: number;
  total_bytes?: number | null;
  bytes_per_second: number;
  installer_name?: string | null;
  message?: string | null;
}

export const updateDownloadStatus = () =>
  invoke<UpdateDownloadProgress>("update_download_status");
export const downloadUpdate = (installerUrl: string, installerName: string) => {
  const style = getComputedStyle(document.documentElement);
  const normalize = (token: string, fallback: string) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return fallback;
    context.fillStyle = fallback;
    context.fillStyle = style.getPropertyValue(token).trim() || fallback;
    return /^#[0-9a-f]{6}$/i.test(context.fillStyle) ? context.fillStyle : fallback;
  };
  return invoke<void>("download_update", { installerUrl, installerName, theme: [normalize("--panel", "#12151b"), normalize("--text", "#f4f6fa"), normalize("--ember-solid", "#06b6d4")] });
};
export const cancelUpdateDownload = () =>
  invoke<void>("cancel_update_download");
export const installDownloadedUpdate = () =>
  invoke<void>("install_downloaded_update");

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  level: "error" | "warn" | "info";
  category: string;
  message: string;
  details?: string | null;
  targetUrl?: string | null;
  downloadId?: string | null;
  correlationId: string;
  failureKind?: "recoverable" | "definitive" | null;
}

export const getDebugLogs = () => invoke<DebugLogEntry[]>("get_debug_logs");
export interface DiagnosticReport {
  generatedAt: string;
  appVersion: string;
  operatingSystem: string;
  architecture: string;
  engine: {
    activeTasks: number;
    queuedTasks: number;
    parallelLimit: number;
  };
  logs: DebugLogEntry[];
}
export const getDiagnosticReport = () => invoke<DiagnosticReport>("get_diagnostic_report");
export const clearDebugLogs = () => invoke<void>("clear_debug_logs");
export const openDebugWindow = () => invoke<void>("open_debug_window");
