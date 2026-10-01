import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DownloadTask } from "../domain/download";
import type { AppSettings } from "../domain/settings";
import { downloadPriorityValue } from "./downloadService";

export interface MediaPreview {
  url: string;
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string | null;
  resolutions: number[];
  frameRates?: Record<string, number>;
  viewCount?: number | null;
  channelVerified?: boolean;
  fileStem?: string;
  music: boolean;
  playlist?: { entries: { videoId: string; title: string; index: number; duration?: number | null }[]; unavailableCount: number; mix?: boolean; snapshotLimit?: number | null } | null;
}
export type MediaFormat = "mp4" | "mp3";
export interface MediaDetails {
  task: DownloadTask;
  options: { format: MediaFormat; quality: number; videoId: string; playlist?: { id: string; title: string; index: number; count: number } | null };
  phase: string;
  error: string | null;
}

/** Route YouTube hosts to their own confirmation, including unsupported pages
 * so they receive a media-specific error instead of an HTML download. */
export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname);
  } catch { return false; }
}
export const openMediaConfirmation = (url: string) => invoke<void>("open_media_confirmation", { url });
export interface MediaQueryWait { seconds: number; reason: "queue" | "cooldown" | "rate-limit" | "query" }
export const inspectMedia = async (onWait?: (wait: MediaQueryWait) => void) => {
  const unlisten = onWait ? await listen<MediaQueryWait>("media-query-wait", event => onWait(event.payload)) : undefined;
  try { return await invoke<MediaPreview>("inspect_media"); } finally { unlisten?.(); }
};
export function mediaQueryError(error: unknown): { message: string; retryAfterSeconds: number } {
  if (typeof error === "object" && error !== null && "message" in error) {
    const e = error as {message: unknown;retryAfterSeconds?:unknown};
    return { message:String(e.message), retryAfterSeconds:typeof e.retryAfterSeconds === "number" && Number.isFinite(e.retryAfterSeconds) ? Math.max(0,Math.ceil(e.retryAfterSeconds)) : 0 };
  }
  return {message:String(error),retryAfterSeconds:0};
}
export const mediaDetails = (id: string) => invoke<MediaDetails>("media_download_details", { id });
export const startMediaDownload = (format: MediaFormat, quality: number, rootFolder: string, settings: AppSettings, selectedVideoIds?: string[]) => invoke<DownloadTask>("start_media_download", {
  input: { format, quality, rootFolder, autoOrganize: settings.autoOrganizeEnabled,
    maxParallelDownloads: settings.maxParallelDownloads,
    speedLimitDownload: Math.max(0, Math.round(settings.speedLimitDownloadMbps * 1024 * 1024)),
    priority: downloadPriorityValue(settings.downloadPriority), ...(selectedVideoIds ? {selectedVideoIds} : {}) },
});

export const formatDuration = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2,"0")}`;
};
