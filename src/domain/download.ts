export type DownloadStatus = "pending" | "connecting" | "checking_files" | "downloading" | "paused" | "assembling" | "extracting" | "completed" | "failed" | "cancelled";

export interface DownloadTask {
  id: string;
  fileName: string;
  fileSize: number | null;
  originalUrl: string;
  currentUrl: string;
  savePath: string;
  tempPath: string;
  finalPath: string;
  status: DownloadStatus;
  mimeType: string | null;
  extension: string | null;
  supportsRange: boolean;
  etag: string | null;
  lastModified: string | null;
  totalDownloaded: number;
  speedCurrent: number;
  speedAverage: number;
  speedLimitDownload: number;
  /** False also covers tasks persisted before the inheritance marker existed. */
  speedLimitInherited?: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  downloadType?: "http" | "torrent";
  infoHash?: string | null;
  seeds?: number;
  peers?: number;
  uploadSpeed?: number;
  totalUploaded?: number;
  priority: number;
  queueOrder: number;
  scheduledStartAt?: string | null;
  dailyScheduleStartMinute?: number | null;
  dailyScheduleEndMinute?: number | null;
  scheduledWeekdays?: number;
  pauseOutsideSchedule?: boolean;
  skipScheduleOnce?: boolean;
  scheduledLastStartedAt?: string | null;
}

export interface DownloadScheduleInput {
  scheduledStartAt?: string | null;
  dailyScheduleStartMinute?: number | null;
  dailyScheduleEndMinute?: number | null;
  scheduledWeekdays?: number;
  pauseOutsideSchedule?: boolean;
}

export interface TorrentFileItem {
  index: number;
  path: string;
  size: number;
}

export interface ParsedTorrentMeta {
  name: string;
  infoHash: string;
  totalSize: number;
  files: TorrentFileItem[];
}

export interface DownloadProgress {
  id: string;
  downloaded: number;
  total: number | null;
  speed: number;
  uploadSpeed?: number;
  seeds?: number;
  peers?: number;
  status: DownloadStatus;
  error: string | null;
}
