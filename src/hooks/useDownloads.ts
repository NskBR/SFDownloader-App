import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { DownloadProgress, DownloadTask } from "../domain/download";
import type { AppSettings } from "../domain/settings";
import * as service from "../services/downloadService";

export function useDownloads(settings: AppSettings) {
  const [downloads, setDownloads] = useState<DownloadTask[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [completed, setCompleted] = useState<DownloadTask | null>(null);
  const latest = useRef(new Map<string, DownloadProgress>());
  useEffect(() => {
    service
      .listDownloads()
      .then((items) => {
        setDownloads((current) => {
          return items.map((item) => {
            const existing = current.find((c) => c.id === item.id);
            const latestProg = latest.current.get(item.id);
            const isActive = ["downloading", "checking_files", "assembling", "extracting", "completed"].includes(item.status);
            const maxDownloaded = isActive
              ? Math.max(item.totalDownloaded, existing?.totalDownloaded ?? 0, latestProg?.downloaded ?? 0)
              : item.totalDownloaded;
            const maxSpeed = item.status === "downloading" && item.speedCurrent === 0
              ? Math.max(existing?.speedCurrent ?? 0, latestProg?.speed ?? 0)
              : item.speedCurrent;
            return {
              ...item,
              totalDownloaded: maxDownloaded,
              speedCurrent: maxSpeed,
            };
          });
        });
      })
      .catch(() =>
        setError("Não foi possível carregar os downloads persistidos."),
      )
      .finally(() => setLoading(false));
    const progressListener = listen<DownloadProgress>(
      "download-progress",
      ({ payload }) => {
        latest.current.set(payload.id, payload);
        setDownloads((items) => {
          const previous = items.find((i) => i.id === payload.id);
          const known = items.some((i) => i.id === payload.id);
          const next = known
            ? items.map((i) => {
                if (i.id !== payload.id) return i;
                const isActive = ["downloading", "checking_files", "assembling", "extracting", "completed"].includes(payload.status);
                const nextDownloaded = isActive
                  ? Math.max(i.totalDownloaded, payload.downloaded)
                  : payload.downloaded;
                const nextSpeed = payload.status === "downloading" && payload.speed === 0
                  ? i.speedCurrent
                  : payload.speed;
                return {
                  ...i,
                  totalDownloaded: nextDownloaded,
                  fileSize: payload.total ?? i.fileSize,
                  speedCurrent: nextSpeed,
                  status: payload.status,
                  completedAt:
                    payload.status === "completed"
                      ? new Date().toISOString()
                      : i.completedAt,
                };
              })
            : items;
          if (
            payload.status === "completed" &&
            previous?.status !== "completed"
          )
            setCompleted(next.find((i) => i.id === payload.id) ?? null);
          return next;
        });
        if (payload.error) setError(payload.error);
      },
    );
    const createdListener = listen<DownloadTask>(
      "download-created",
      ({ payload }) =>
        setDownloads((items) =>
          items.some((i) => i.id === payload.id) ? items : [payload, ...items],
        ),
    );
    return () => {
      void progressListener.then((dispose) => dispose());
      void createdListener.then((dispose) => dispose());
    };
  }, []);
  const start = async (url: string, root?: string) => {
    setError(null);
    const task = await service.startDownload(url, settings, root);
    const progress = latest.current.get(task.id);
    const current = progress
      ? {
          ...task,
          totalDownloaded: progress.downloaded,
          fileSize: progress.total ?? task.fileSize,
          speedCurrent: progress.speed,
          status: progress.status,
        }
      : task;
    setDownloads((items) =>
      items.some((i) => i.id === current.id) ? items : [current, ...items],
    );
  };
  const queue = async (url: string, root?: string) => {
    const task = await service.queueDownload(url, settings, root);
    setDownloads((items) => [task, ...items]);
  };
  const remove = async (ids: string[]) => {
    await Promise.all(ids.map(service.removeDownload));
    setDownloads((items) => items.filter((i) => !ids.includes(i.id)));
  };
  const cancel = async (id: string) => {
    if (await service.cancelDownload(id))
      setDownloads((items) =>
        items.map((i) =>
          i.id === id ? { ...i, status: "cancelled", speedCurrent: 0 } : i,
        ),
      );
    else setError("O download não está mais ativo.");
  };
  const pause = async (id: string) => {
    if (await service.pauseDownload(id))
      setDownloads((items) =>
        items.map((i) =>
          i.id === id ? { ...i, status: "paused", speedCurrent: 0 } : i,
        ),
      );
    else setError("O download não está mais ativo.");
  };
  const resume = async (id: string) => {
    try {
      await service.resumeDownload(id);
      setDownloads((items) =>
        items.map((i) => (i.id === id ? { ...i, status: "downloading" } : i)),
      );
    } catch (cause) {
      setError(
        typeof cause === "string"
          ? cause
          : "Não foi possível retomar o download.",
      );
    }
  };
  const setSpeedLimit = async (id: string, speedLimit: number) => {
    try {
      await service.updateSpeedLimit(id, speedLimit);
      setDownloads((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, speedLimitDownload: speedLimit, speedLimitInherited: false }
            : item,
        ),
      );
    } catch (cause) {
      setError(
        typeof cause === "string"
          ? cause
          : "Não foi possível atualizar o limite de velocidade.",
      );
    }
  };
  const setSchedule = async (id: string, schedule: import("../domain/download").DownloadScheduleInput) => {
    try {
      const task = await service.updateDownloadSchedule(id, schedule);
      setDownloads((items) => items.map((item) => (item.id === id ? { ...item, ...task } : item)));
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Não foi possível salvar a agenda do download.");
    }
  };
  const bypassSchedule = async (id: string) => {
    try {
      const task = await service.bypassDownloadSchedule(id);
      setDownloads((items) => items.map((item) => (item.id === id ? { ...item, ...task, status: "downloading" } : item)));
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Não foi possível ignorar a agenda.");
    }
  };
  const setPriority = async (id: string, priority: number) => {
    try {
      const task = await service.updateDownloadPriority(id, priority);
      setDownloads((items) =>
        items.map((item) => (item.id === id ? { ...item, priority: task.priority } : item)),
      );
    } catch (cause) {
      setError(
        typeof cause === "string"
          ? cause
          : "Não foi possível atualizar a prioridade do download.",
      );
    }
  };
  const moveQueueItem = async (id: string, direction: "up" | "down") => {
    try {
      const updated = await service.moveDownloadQueueItem(id, direction);
      const byId = new Map(updated.map((item) => [item.id, item]));
      setDownloads((items) =>
        items.map((item) => {
          const next = byId.get(item.id);
          return next ? { ...item, queueOrder: next.queueOrder } : item;
        }),
      );
    } catch (cause) {
      setError(
        typeof cause === "string"
          ? cause
          : "Não foi possível reordenar a fila de downloads.",
      );
    }
  };
  const prioritize = async (id: string) => {
    try {
      const task = await service.prioritizeDownload(id);
      setDownloads((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, priority: task.priority, queueOrder: task.queueOrder }
            : item,
        ),
      );
    } catch (cause) {
      setError(
        typeof cause === "string"
          ? cause
          : "Não foi possível priorizar o download na fila.",
      );
    }
  };
  return {
    downloads,
    loading,
    error,
    setError,
    start,
    queue,
    remove,
    cancel,
    pause,
    resume,
    setSpeedLimit,
    setPriority,
    setSchedule,
    bypassSchedule,
    moveQueueItem,
    prioritize,
    completed,
    dismissCompleted: () => setCompleted(null),
  };
}
