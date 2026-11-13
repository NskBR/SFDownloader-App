import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import type { DownloadProgress, DownloadTask } from "../domain/download";
import { listDownloads } from "../services/downloadService";

type Transfer = Pick<DownloadProgress, "downloaded" | "total" | "speed" | "status">;
const activeStatuses = new Set(["downloading", "checking_files", "assembling", "extracting"]);

export function taskbarProgress(transfers: Iterable<Transfer>) {
  let active = false;
  let pausedProgress: number | undefined;
  let best: { progress: number; eta: number } | undefined;
  for (const transfer of transfers) {
    if (transfer.status === "paused") {
      const progress = transfer.total && transfer.total > 0
        ? Math.max(1, Math.min(99, Math.floor(transfer.downloaded / transfer.total * 100)))
        : 1;
      pausedProgress = Math.max(pausedProgress ?? 0, progress);
      continue;
    }
    if (!activeStatuses.has(transfer.status)) continue;
    active = true;
    if (transfer.status !== "downloading" || !transfer.total || transfer.total <= 0) continue;
    const remaining = Math.max(0, transfer.total - transfer.downloaded);
    const progress = Math.max(0, Math.min(99, Math.floor((1 - remaining / transfer.total) * 100)));
    const eta = transfer.speed > 0 ? remaining / transfer.speed : Infinity;
    if (!best || eta < best.eta || (eta === best.eta && progress > best.progress)) {
      best = { progress, eta };
    }
  }
  if (best) return { status: ProgressBarStatus.Normal, progress: best.progress };
  if (active) return { status: ProgressBarStatus.Indeterminate };
  if (pausedProgress !== undefined) return { status: ProgressBarStatus.Paused, progress: pausedProgress };
  return { status: ProgressBarStatus.None };
}

export function useTaskbarProgress() {
  useEffect(() => {
    if (!isTauri() || !/Windows/i.test(navigator.userAgent)) return;
    const mainWindow = getCurrentWindow();
    const transfers = new Map<string, Transfer>();
    let initializing = true;
    const receivedDuringLoad = new Set<string>();
    let disposed = false;
    let lastKey = "";
    let pending = Promise.resolve();
    const update = () => {
      const state = taskbarProgress(transfers.values());
      const key = JSON.stringify(state);
      if (key === lastKey) return;
      lastKey = key;
      pending = pending.then(async () => {
        if (disposed || key !== lastKey) return;
        await mainWindow.setProgressBar(state);
        // SetProgressValue can restore the normal appearance on Windows.
        // Apply the paused state after writing the value.
        if (state.status === ProgressBarStatus.Paused) {
          await mainWindow.setProgressBar({ status: ProgressBarStatus.Paused });
        }
      }).catch((error) => console.error("Taskbar progress:", error));
    };
    const put = (id: string, transfer: Transfer) => {
      if (activeStatuses.has(transfer.status) || transfer.status === "paused") transfers.set(id, transfer);
      else transfers.delete(id);
    };
    const fromTask = (task: DownloadTask) => put(task.id, {
      downloaded: task.totalDownloaded,
      total: task.fileSize,
      speed: task.speedCurrent,
      status: task.status,
    });
    const progress = listen<DownloadProgress>("download-progress", ({ payload }) => {
      if (disposed) return;
      if (initializing) receivedDuringLoad.add(payload.id);
      put(payload.id, payload);
      update();
    });
    const created = listen<DownloadTask>("download-created", ({ payload }) => {
      if (disposed || transfers.has(payload.id) || receivedDuringLoad.has(payload.id)) return;
      fromTask(payload);
      update();
    });
    void Promise.all([progress, created]).then(listDownloads).then((items) => {
      if (disposed) return;
      for (const item of items) {
        if (!receivedDuringLoad.has(item.id) && !transfers.has(item.id)) fromTask(item);
      }
      update();
    }).catch((error) => console.error("Taskbar progress:", error)).finally(() => {
      initializing = false;
      receivedDuringLoad.clear();
    });
    return () => {
      disposed = true;
      void Promise.allSettled([progress.then((unlisten) => unlisten()), created.then((unlisten) => unlisten())]);
      void pending.then(() => mainWindow.setProgressBar({ status: ProgressBarStatus.None })).catch(() => {});
    };
  }, []);
}
