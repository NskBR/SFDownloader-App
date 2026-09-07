import {
  AlertTriangle,
  FolderOpen,
  Pause,
  Play,
  Search,
  Trash2,
  X,
  Link2,
  CheckCircle2,
  XCircle,
  Clock,
  MoreVertical,
  FileText,
  List,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Activity,
  Gauge,
  Zap,
  ArrowDown,
  CheckSquare,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DownloadSortKey as SortKey,
  useDownloadViewPreferences,
} from "../hooks/useDownloadViewPreferences";
import { invoke } from "@tauri-apps/api/core";
import { useContextMenu } from "../hooks/useContextMenu";
import { useDownloadSelection } from "../hooks/useDownloadSelection";
import { listen } from "@tauri-apps/api/event";
import type { AppSettings } from "../domain/settings";
import type { PageId } from "../app/navigation";
import { useDownloads } from "../hooks/useDownloads";
import * as service from "../services/downloadService";
import type { DownloadTask } from "../domain/download";
import { sortDownloads } from "../domain/downloadOrdering";
import { ipcErrorMessage } from "../domain/ipcErrors";
import { queuePositions } from "../domain/downloadQueue";
import { parseSpeedLimitMebibytesPerSecond } from "../domain/speedLimit";
import { CircularProgress } from "../components/downloads/CircularProgress";
import { FileIcon } from "../components/downloads/FileIcon";
import { DownloadsToolbar } from "../components/downloads/DownloadsToolbar";
import { CustomSelect } from "../components/ui/CustomSelect";
import { useTranslation } from "../i18n";

const bytes = (value: number | null) => {
  if (value === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value,
    index = 0;
  while (size >= 1024 && index < 4) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
};

const sourceDomain = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
};

const fileExtension = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : null;
};

const labels: Record<string, string> = {
  pending: "Preparando",
  checking_files: "Verificando arquivos",
  downloading: "Baixando",
  paused: "Pausado",
  assembling: "Montando arquivo",
  extracting: "Extraindo arquivo",
  completed: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
};

import { categoryForFile, cleanExtension } from "../domain/categories";

const groups: Record<string, string[]> = {
  documents: [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "csv",
    "rtf",
    "odt",
    "epub",
  ],
  music: ["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma", "opus", "alac"],
  videos: [
    "mp4",
    "mkv",
    "mov",
    "avi",
    "webm",
    "flv",
    "wmv",
    "m4v",
    "3gp",
    "ts",
  ],
  archives: [
    "zip",
    "rar",
    "7z",
    "tar",
    "gz",
    "tgz",
    "bz2",
    "xz",
    "cab",
    "img",
    "dmg",
    "z01",
    "z02",
    "r00",
    "r01",
    "001",
  ],
  applications: [
    "exe",
    "msi",
    "apk",
    "bat",
    "cmd",
    "ps1",
    "appimage",
    "deb",
    "rpm",
    "run",
    "bin",
    "jar",
    "vbs",
    "wsf",
    "com",
    "gadget",
    "sh",
    "command",
    "app",
  ],
};

export function DownloadsPage({
  settings,
  onSave,
  filter,
}: {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  filter: PageId;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(false);
  const [speedLimitDialog, setSpeedLimitDialog] = useState<DownloadTask | null>(null);
  const [speedLimitValue, setSpeedLimitValue] = useState("0");
  const {
    contextMenu: ctxMenu,
    setContextMenu: setCtxMenu,
    contextMenuRef: ctxMenuRef,
    openContextMenu,
  } = useContextMenu<DownloadTask>();
  const { view, sort, changeSort, changeView } = useDownloadViewPreferences();

  const {
    downloads,
    loading,
    error,
    setError,
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
  } = useDownloads(settings);

  const saveSpeedLimit = async () => {
    if (!speedLimitDialog) return;
    const mebibytes = parseSpeedLimitMebibytesPerSecond(speedLimitValue);
    if (mebibytes === null) {
      setError(t.downloads.speedLimitInvalid);
      return;
    }
    await setSpeedLimit(speedLimitDialog.id, Math.round(mebibytes * 1024 * 1024));
    setSpeedLimitDialog(null);
  };

  const handleMenuAction = useCallback(
    async (action: string, downloadId: string) => {
      const dl = downloads.find((d) => d.id === downloadId);
      switch (action) {
        case "pause":
          pause(downloadId);
          break;
        case "resume":
          resume(downloadId);
          break;
        case "limit": {
          const current = dl?.speedLimitDownload ?? 0;
          if (dl) {
            setSpeedLimitValue(current > 0 ? String(current / 1024 / 1024) : "0");
            setSpeedLimitDialog(dl);
          }
          break;
        }
        case "schedule": {
          const value = window.prompt(
            t.downloads.schedulePrompt,
            dl?.scheduledStartAt
              ? new Date(dl.scheduledStartAt).toLocaleString()
              : "",
          );
          if (value === null) break;
          if (!value.trim()) {
            await setSchedule(downloadId, {});
            break;
          }
          const scheduledAt = new Date(value);
          if (Number.isNaN(scheduledAt.getTime())) {
            setError(t.downloads.scheduleInvalid);
            break;
          }
          await setSchedule(downloadId, {
            scheduledStartAt: scheduledAt.toISOString(),
            scheduledWeekdays: 127,
          });
          break;
        }
        case "daily-schedule": {
          const value = window.prompt(t.downloads.dailySchedulePrompt, "");
          if (value === null) break;
          if (!value.trim()) {
            await setSchedule(downloadId, {});
            break;
          }
          const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(value.trim());
          if (!match) {
            setError(t.downloads.dailyScheduleInvalid);
            break;
          }
          const [, startHour, startMinute, endHour, endMinute] = match;
          const start = Number(startHour) * 60 + Number(startMinute);
          const end = Number(endHour) * 60 + Number(endMinute);
          if (start >= 1_440 || end >= 1_440) {
            setError(t.downloads.dailyScheduleInvalid);
            break;
          }
          await setSchedule(downloadId, {
            dailyScheduleStartMinute: start,
            dailyScheduleEndMinute: end,
            scheduledWeekdays: 127,
          });
          break;
        }
        case "bypass-schedule":
          await bypassSchedule(downloadId);
          break;        case "priority": {
          const value = window.prompt(
            t.downloads.priorityPrompt,
            String(dl?.priority ?? 1),
          );
          if (value === null) break;
          const priority = Number(value.trim());
          if (!Number.isInteger(priority) || priority < 0 || priority > 3) {
            setError(t.downloads.priorityInvalid);
            break;
          }
          await setPriority(downloadId, priority);
          break;
        }
        case "move-up":
          await moveQueueItem(downloadId, "up");
          break;
        case "move-down":
          await moveQueueItem(downloadId, "down");
          break;
        case "prioritize":
          await prioritize(downloadId);
          break;
        case "cancel":
          cancel(downloadId);
          break;
        case "folder":
          if (dl) service.revealInFolder(dl.finalPath);
          break;
        case "open":
          if (dl) service.openFile(dl.finalPath);
          break;
        case "delete":
          if (window.confirm("Tem certeza que deseja excluir este download?"))
            remove([downloadId]);
          break;
      }
    },
    [
      downloads,
      pause,
      resume,
      cancel,
      remove,
      setError,
      setPriority,
      moveQueueItem,
      prioritize,
      t.downloads.priorityInvalid,
      t.downloads.priorityPrompt,
    ],
  );

  useEffect(() => {
    const unlisten = listen<{ action: string; downloadId: string }>(
      "context-menu-action",
      (event) => {
        handleMenuAction(event.payload.action, event.payload.downloadId);
      },
    );
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [handleMenuAction]);

  const handleContextMenu = (event: React.MouseEvent, item: DownloadTask) => {
    if (!selected.has(item.id)) selectOnly(item.id);
    openContextMenu(event, item);
  };

  const runMenuAction = (action: string, item: DownloadTask) => {
    setCtxMenu(null);
    if (selected.size > 1 && selected.has(item.id)) {
      const selectedIds = Array.from(selected);
      switch (action) {
        case "pause":
          selectedIds.forEach((id) => pause(id));
          break;
        case "resume":
          selectedIds.forEach((id) => resume(id));
          break;
        case "cancel":
          selectedIds.forEach((id) => cancel(id));
          break;
        case "delete":
          if (
            window.confirm(
              `Tem certeza que deseja excluir os ${selectedIds.length} downloads selecionados?`,
            )
          ) {
            remove(selectedIds);
            setSelected(new Set());
          }
          break;
        case "folder":
          if (item) service.revealInFolder(item.finalPath);
          break;
        case "open":
          if (item) service.openFile(item.finalPath);
          break;
        case "limit":
          void handleMenuAction(action, item.id);
          break;
        case "priority":
          void handleMenuAction(action, item.id);
          break;
        case "move-up":
          void handleMenuAction(action, item.id);
          break;
        case "move-down":
          void handleMenuAction(action, item.id);
          break;
        case "prioritize":
          void handleMenuAction(action, item.id);
          break;
      }
    } else {
      handleMenuAction(action, item.id);
    }
  };

  const inspect = async (raw: string) => {
    const url = raw.trim();
    if (!url) return;
    if (!service.shouldOpenConfirmation(url)) return;
    setStarting(true);
    setError(null);
    try {
      const token = crypto.randomUUID();
      localStorage.setItem(
        `sf-downloader.confirmation-${token}`,
        JSON.stringify({ url, destination: settings.rootDownloadFolder }),
      );
      await service.openDownloadConfirmation(token, url);
    } catch (cause) {
      setError(ipcErrorMessage(cause, "Não foi possível abrir a confirmação do download."));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    const receive = (event: Event) => {
      const value =
        (event as CustomEvent<string>).detail ||
        localStorage.getItem("sf-downloader.pending-browser-url");
      if (!value) return;
      localStorage.removeItem("sf-downloader.pending-browser-url");
      void inspect(value);
    };
    window.addEventListener("sf-download-request", receive);
    const pending = localStorage.getItem("sf-downloader.pending-browser-url");
    if (pending)
      receive(new CustomEvent("sf-download-request", { detail: pending }));
    return () => window.removeEventListener("sf-download-request", receive);
  }, [settings.rootDownloadFolder]);

  const filtered = downloads.filter((item) => {
    if (
      filter === "active" &&
      ![
        "pending",
        "checking_files",
        "downloading",
        "paused",
        "assembling",
        "extracting",
        "failed",
      ].includes(item.status)
    )
      return false;
    if (filter === "completed" && item.status !== "completed") return false;
    const ext =
      cleanExtension(item.fileName) ||
      (item.extension ? item.extension.toLowerCase().trim() : "") ||
      cleanExtension(item.finalPath) ||
      cleanExtension(item.originalUrl);
    if (filter === "torrents") {
      if (
        item.downloadType !== "torrent" &&
        !item.originalUrl.startsWith("magnet:") &&
        ext !== "torrent"
      )
        return false;
    } else if (filter === "others") {
      const allKnown = Object.values(groups).flat();
      const cat = categoryForFile(
        item.fileName,
        settings.customCategories,
        item.finalPath,
        item.originalUrl,
      );
      if (allKnown.includes(ext) || cat !== "Outros") return false;
    } else if (filter in groups) {
      const extensions = groups[filter];
      const catName = categoryForFile(
        item.fileName,
        settings.customCategories,
        item.finalPath,
        item.originalUrl,
      );
      const matchesCategoryName =
        (filter === "archives" && catName === "Compactados") ||
        (filter === "videos" && catName === "Vídeos") ||
        (filter === "music" && catName === "Áudios") ||
        (filter === "documents" && catName === "Documentos") ||
        (filter === "applications" && catName === "Aplicativos");

      if (!matchesCategoryName && !extensions.includes(ext)) return false;
    }
    return item.fileName.toLowerCase().includes(search.toLowerCase());
  });
  const visible = sortDownloads(filtered, sort);

  const {
    selected,
    setSelected,
    selectAll,
    deselectAll,
    selectOnly,
    handleSelect,
  } = useDownloadSelection(visible.map((item) => item.id));
  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "status", label: t.downloads.sortStatus },
    { key: "size", label: t.downloads.sortSize },
    { key: "date", label: t.downloads.sortDate },
    { key: "queue", label: t.downloads.sortQueue },
  ];

  const pauseSelected = useCallback(() => {
    selected.forEach((id) => pause(id));
  }, [selected, pause]);

  const resumeSelected = useCallback(() => {
    selected.forEach((id) => resume(id));
  }, [selected, resume]);

  const deleteSelected = useCallback(() => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      window.confirm(
        `Tem certeza que deseja excluir os ${ids.length} downloads selecionados?`,
      )
    ) {
      remove(ids);
      setSelected(new Set());
    }
  }, [selected, remove]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Escape") {
        deselectAll();
      } else if (e.key === "Delete") {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectAll, deselectAll, deleteSelected]);

  const openDetails = (id: string, status: string) => {
    if (status === "completed") service.openCompleteWindow(id);
    else service.openProgressWindow(id);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString("pt-BR") +
      " " +
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    );
  };

  const getCompletedElapsed = (item: DownloadTask) => {
    if (!item.createdAt || !item.completedAt) return "";
    const seconds = Math.max(
      0,
      Math.floor(
        (new Date(item.completedAt).getTime() -
          new Date(item.createdAt).getTime()) /
          1000,
      ),
    );
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    return remSeconds === 0 ? `${minutes}min` : `${minutes}min ${remSeconds}s`;
  };

  const formatTimeRemaining = (item: DownloadTask) => {
    if (item.status !== "downloading" || !item.speedCurrent || !item.fileSize)
      return "";
    const remainingSeconds = Math.ceil(
      (item.fileSize - item.totalDownloaded) / item.speedCurrent,
    );
    if (remainingSeconds <= 0) return "—";
    if (remainingSeconds < 60)
      return `${remainingSeconds}s ${t.downloads.remaining}`;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    if (minutes < 60) return `${minutes}m ${seconds}s ${t.downloads.remaining}`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${t.downloads.remaining}`;
  };

  const activeDownloads = downloads.filter((d) => d.status === "downloading");
  const totalSpeed = activeDownloads.reduce(
    (sum, d) => sum + d.speedCurrent,
    0,
  );
  const pendingPositions = useMemo(
    () => queuePositions(downloads),
    [downloads],
  );

  return (
    <>
      <DownloadsToolbar
        search={search}
        onSearchChange={setSearch}
        onInspect={(value) => void inspect(value)}
        placeholder={t.common.searchPlaceholder}
        sort={sort}
        sortOptions={sortOptions}
        onSortChange={changeSort}
        view={view}
        onViewChange={changeView}
      />

      {/* Main Content Area */}
      <section className="downloads-workspace">
        {!settings.rootDownloadFolder && (
          <div className="compact-notice">
            <AlertTriangle />
            <div>
              <strong>Defina uma pasta de destino nas Configurações</strong>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="dismissible-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        {loading ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--muted)",
              padding: "40px",
            }}
          >
            {t.common.loading}
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-downloads-state">
            <FolderOpen size={48} />
            <strong>{t.downloads.emptyTitle}</strong>
          </div>
        ) : (
          <div className={`cards-scroll-container view-${view}`}>
            {visible.map((item) => {
              const progress = item.fileSize
                ? Math.min(100, (item.totalDownloaded / item.fileSize) * 100)
                : 0;
              const queuePosition = pendingPositions.get(item.id);
              const scheduleLabel = item.scheduledStartAt
                ? t.downloads.scheduledFor.replace(
                    "{time}",
                    new Date(item.scheduledStartAt).toLocaleString(),
                  )
                : item.dailyScheduleStartMinute !== undefined &&
                    item.dailyScheduleStartMinute !== null
                  ? t.downloads.scheduledDaily
                  : null;

              const isCompleted = item.status === "completed";
              const isFailed =
                item.status === "failed" || item.status === "cancelled";
              const isWaiting =
                item.status === "pending" ||
                item.status === "checking_files" ||
                item.status === "assembling" ||
                item.status === "extracting";
              const isPaused = item.status === "paused";
              const isDownloading = item.status === "downloading";

              const statusClass = isDownloading
                ? "downloading"
                : isPaused
                  ? "paused"
                  : isCompleted
                    ? "completed"
                    : item.status === "cancelled"
                      ? "cancelled"
                      : item.status === "failed"
                        ? "failed"
                        : "waiting";
              const statusLabel = isDownloading
                ? t.downloads.statusDownloading
                : isPaused
                  ? t.downloads.statusPaused
                  : isCompleted
                    ? t.downloads.statusCompleted
                    : item.status === "cancelled"
                      ? t.downloads.statusCancelled
                      : item.status === "failed"
                        ? t.downloads.statusFailed
                        : t.downloads.statusWaiting;

              const isSelected = selected.has(item.id);
              const isMultiSelected = isSelected && selected.size > 1;
              const isSingleSelected = isSelected && selected.size === 1;

              return (
                <article
                  key={item.id}
                  className={`download-card status-${statusClass} ${isSelected ? "selected" : ""} ${isMultiSelected ? "selected-multi" : ""} ${isSingleSelected ? "selected-single" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${item.fileName}: ${statusLabel}`}
                  onClick={(event) => handleSelect(item.id, event)}
                  onDoubleClick={() => openDetails(item.id, item.status)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelect(item.id, event as unknown as React.MouseEvent);
                    }
                  }}
                  onContextMenu={(event) => handleContextMenu(event, item)}
                >
                  {/* Left Column: Status Indicator */}
                  <div className="card-indicator-col">
                    {(isDownloading || isPaused || isFailed) && progress > 0 ? (
                      <CircularProgress
                        value={progress}
                        color={
                          isDownloading
                            ? "var(--ember)"
                            : `var(--st-${statusClass})`
                        }
                      />
                    ) : isCompleted ? (
                      <div className="indicator-icon-wrapper success">
                        <div className="completed-check">
                          <CheckCircle2 />
                        </div>
                        <div className="completed-file-icon">
                          <FileIcon
                            extension={fileExtension(item.fileName)}
                            width={38}
                            height={44}
                          />
                        </div>
                      </div>
                    ) : isFailed ? (
                      <div className="indicator-icon-wrapper error">
                        <XCircle />
                      </div>
                    ) : (
                      <div className="indicator-icon-wrapper waiting">
                        <Clock />
                      </div>
                    )}
                  </div>

                  {/* Center Column: Title, Info, Progress Bar */}
                  <div className="card-details-col">
                    <div className="card-title-row">
                      <h3 className="card-file-name" title={item.fileName}>
                        {item.fileName}
                      </h3>
                      <span className={`status-tag ${statusClass}`}>
                        {statusLabel}
                      </span>
                      {isWaiting && (
                        <span className="card-date">
                          {
                            [
                              t.downloads.priorityLow,
                              t.downloads.priorityNormal,
                              t.downloads.priorityHigh,
                              t.downloads.priorityUrgent,
                            ][Math.max(0, Math.min(3, item.priority ?? 1))]
                          }
                        </span>
                      )}
                      {isDownloading && item.speedLimitDownload > 0 && (
                        <span className="card-date" title={t.downloads.speedLimit}>
                          {t.downloads.speedLimit}: {bytes(item.speedLimitDownload)}/s
                        </span>
                      )}
                      <span className="card-date">
                        {formatDate(item.createdAt)}
                      </span>
                    </div>

                    {item.originalUrl && (
                      <button
                        type="button"
                        className="card-source"
                        title={t.downloads.copySourceLink}
                        onClick={(event) => {
                          event.stopPropagation();
                          void navigator.clipboard.writeText(item.originalUrl);
                        }}
                      >
                        <Link2 size={12} />
                        <span>{sourceDomain(item.originalUrl)}</span>
                      </button>
                    )}

                    <div className="card-info-row">
                      {isDownloading ? (
                        <>
                          <span className="meta-size">
                            {bytes(item.totalDownloaded)} /{" "}
                            {bytes(item.fileSize)}
                          </span>
                          <span className="meta-sep" aria-hidden>
                            ·
                          </span>
                          <span className="meta-speed">
                            {bytes(item.speedCurrent)}/s
                          </span>
                          <span className="meta-sep" aria-hidden>
                            ·
                          </span>
                          <span className="meta-eta accent">
                            {formatTimeRemaining(item)}
                          </span>
                        </>
                      ) : isCompleted ? (
                        <>
                          <span className="meta-size">
                            {bytes(item.fileSize)}
                          </span>
                          <span className="meta-sep" aria-hidden>
                            ·
                          </span>
                          <span className="meta-done">
                            {t.downloads.completedIn}{" "}
                            {getCompletedElapsed(item)}
                          </span>
                        </>
                      ) : isFailed ? (
                        <>
                          <span className="meta-status err">
                            {item.status === "cancelled"
                              ? t.downloads.statusCancelled
                              : t.downloads.statusFailed}
                          </span>
                          {item.fileSize && (
                            <>
                              <span className="meta-sep" aria-hidden>
                                ·
                              </span>
                              <span className="meta-size">
                                {bytes(item.totalDownloaded)} {t.downloads.of}{" "}
                                {bytes(item.fileSize)}
                              </span>
                            </>
                          )}
                        </>
                      ) : isPaused ? (
                        <>
                          <span className="meta-status paused">
                            {t.downloads.statusPaused}
                          </span>
                          <span className="meta-sep" aria-hidden>
                            ·
                          </span>
                          <span className="meta-size">
                            {bytes(item.totalDownloaded)} {t.downloads.of}{" "}
                            {bytes(item.fileSize)}
                          </span>
                        </>
                      ) : (
                        <span className="meta-status">
                          {scheduleLabel ??
                            (item.status === "pending" && queuePosition
                              ? t.downloads.waitingForSlot.replace(
                                  "{position}",
                                  String(queuePosition),
                                )
                              : t.downloads.statusWaiting)}
                        </span>
                      )}
                    </div>

                    {(isDownloading || isPaused) && (
                      <div className="card-progress-bar-track">
                        <div
                          className="card-progress-bar-fill"
                          style={{
                            width: `${progress}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Right Column: Actions */}
                  <div className="card-actions-col">
                    {isCompleted && (
                      <button
                        className="card-action-btn"
                        title={t.downloads.openFolder}
                        onClick={(e) => {
                          e.stopPropagation();
                          service.revealInFolder(item.finalPath);
                        }}
                      >
                        <FolderOpen />
                      </button>
                    )}

                    {(isPaused || isFailed || isWaiting) && (
                      <button
                        className="card-action-btn"
                        title={t.downloads.resumeDownload}
                        onClick={(e) => {
                          e.stopPropagation();
                          void resume(item.id);
                        }}
                      >
                        <Play />
                      </button>
                    )}

                    {isDownloading && (
                      <button
                        className="card-action-btn"
                        title={t.downloads.pauseDownload}
                        onClick={(e) => {
                          e.stopPropagation();
                          void pause(item.id);
                        }}
                      >
                        <Pause />
                      </button>
                    )}

                    {!isCompleted && !isFailed && (
                      <button
                        className="card-action-btn"
                        title={t.common.cancel}
                        onClick={(e) => {
                          e.stopPropagation();
                          void cancel(item.id);
                        }}
                      >
                        <X />
                      </button>
                    )}

                    {isFailed && (
                      <button
                        className="card-action-btn"
                        title={t.downloads.deleteDownload}
                        onClick={(e) => {
                          e.stopPropagation();
                          remove([item.id]);
                        }}
                      >
                        <Trash2 />
                      </button>
                    )}

                    <button
                      className="card-action-btn menu-btn"
                      title={t.downloads.viewDetails}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, item);
                      }}
                    >
                      <MoreVertical />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Discreete Footer */}
      <footer className="flux-footer">
        <div className="footer-left">
          <ArrowDown />
          <span>
            <strong>{bytes(totalSpeed)}/s</strong> {t.downloads.currentSpeed}
          </span>
        </div>

        <div className="footer-center">
          <button
            type="button"
            className="footer-action-btn pause"
            title={t.downloads.pauseAll}
            onClick={() =>
              downloads
                .filter((d) => d.status === "downloading")
                .forEach((d) => void pause(d.id))
            }
          >
            <Pause size={13} />
            <span>{t.downloads.pauseAll}</span>
          </button>
          <button
            type="button"
            className="footer-action-btn resume"
            title={t.downloads.resumeAll}
            onClick={() =>
              downloads
                .filter((d) => d.status === "paused")
                .forEach((d) => void resume(d.id))
            }
          >
            <Play size={13} />
            <span>{t.downloads.resumeAll}</span>
          </button>
        </div>

        <div className="footer-right">
          <Zap />
          <span>{t.downloads.maxSimultaneous}</span>
          <CustomSelect
            value={String(settings.maxParallelDownloads)}
            options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({
              value: String(n),
              label: String(n),
            }))}
            onChange={(val) => {
              const next = {
                ...settings,
                maxParallelDownloads: parseInt(val, 10),
              };
              onSave(next);
            }}
            className="footer-custom-select"
          />
        </div>
      </footer>

      {speedLimitDialog && (
        <div className="speed-limit-dialog-backdrop" onMouseDown={() => setSpeedLimitDialog(null)}>
          <section
            className="speed-limit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="speed-limit-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span className="speed-limit-dialog-icon"><Gauge size={18} /></span>
              <div>
                <h2 id="speed-limit-dialog-title">{t.downloads.speedLimit}</h2>
                <p title={speedLimitDialog.fileName}>{speedLimitDialog.fileName}</p>
              </div>
              <button type="button" onClick={() => setSpeedLimitDialog(null)} aria-label={t.common.close}><X size={17} /></button>
            </header>
            <label className="speed-limit-dialog-field">
              <span>{t.downloads.speedLimitPrompt}</span>
              <div><input autoFocus inputMode="decimal" value={speedLimitValue} onChange={(event) => setSpeedLimitValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveSpeedLimit(); }} /><b>MB/s</b></div>
            </label>
            <div className="speed-limit-dialog-presets">
              {[0, 1, 5, 10, 25].map((value) => <button key={value} type="button" className={Number(speedLimitValue) === value ? "active" : ""} onClick={() => setSpeedLimitValue(String(value))}>{value === 0 ? t.settings.downloadsTab.noLimit : `${value} MB/s`}</button>)}
            </div>
            <footer>
              <button type="button" className="speed-limit-dialog-cancel" onClick={() => setSpeedLimitDialog(null)}>{t.common.cancel}</button>
              <button type="button" className="speed-limit-dialog-save" onClick={() => void saveSpeedLimit()}>{t.common.save}</button>
            </footer>
          </section>
        </div>
      )}

      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {ctxMenu.item.status === "downloading" && (
            <button
              className="ctx-item"
              onClick={() => runMenuAction("pause", ctxMenu.item)}
            >
              <Pause size={15} /> {t.downloads.pauseDownload}
            </button>
          )}
          <button
            className="ctx-item"
            onClick={() => runMenuAction("limit", ctxMenu.item)}
          >
            <Gauge size={15} /> {t.downloads.speedLimit}
          </button>
          {!["completed", "cancelled"].includes(ctxMenu.item.status) && (
            <button
              className="ctx-item"
              onClick={() => runMenuAction("priority", ctxMenu.item)}
            >
              <Activity size={15} /> {t.downloads.priority}
            </button>
          )}
          {["paused", "pending"].includes(ctxMenu.item.status) && (
            <>
              <button
                className="ctx-item"
                onClick={() => runMenuAction("schedule", ctxMenu.item)}
              >
                <Clock size={15} /> {t.downloads.schedule}
              </button>
              <button
                className="ctx-item"
                onClick={() => runMenuAction("daily-schedule", ctxMenu.item)}
              >
                <Clock size={15} /> {t.downloads.dailySchedule}
              </button>
              {(ctxMenu.item.scheduledStartAt ||
                ctxMenu.item.dailyScheduleStartMinute !== undefined) && (
                <button
                  className="ctx-item"
                  onClick={() => runMenuAction("bypass-schedule", ctxMenu.item)}
                >
                  <Play size={15} /> {t.downloads.scheduleBypass}
                </button>
              )}
            </>
          )}          {ctxMenu.item.status === "pending" && (
            <button
              className="ctx-item"
              onClick={() => runMenuAction("prioritize", ctxMenu.item)}
            >
              <Zap size={15} /> {t.downloads.downloadNext}
            </button>
          )}
          {["pending", "paused"].includes(ctxMenu.item.status) && (
            <>
              <button
                className="ctx-item"
                onClick={() => runMenuAction("move-up", ctxMenu.item)}
              >
                <ChevronUp size={15} /> {t.downloads.moveQueueUp}
              </button>
              <button
                className="ctx-item"
                onClick={() => runMenuAction("move-down", ctxMenu.item)}
              >
                <ChevronDown size={15} /> {t.downloads.moveQueueDown}
              </button>
            </>
          )}
          {["paused", "failed", "cancelled"].includes(ctxMenu.item.status) && (
            <button
              className="ctx-item"
              onClick={() => runMenuAction("resume", ctxMenu.item)}
            >
              <Play size={15} /> {t.downloads.resumeDownload}
            </button>
          )}
          {["pending", "downloading", "paused"].includes(
            ctxMenu.item.status,
          ) && (
            <button
              className="ctx-item"
              onClick={() => runMenuAction("cancel", ctxMenu.item)}
            >
              <X size={15} /> {t.common.cancel}
            </button>
          )}

          <div className="ctx-sep" />

          <button
            className="ctx-item"
            onClick={() => runMenuAction("folder", ctxMenu.item)}
          >
            <FolderOpen size={15} /> {t.downloads.openFolder}
          </button>
          {ctxMenu.item.status === "completed" && (
            <button
              className="ctx-item"
              onClick={() => runMenuAction("open", ctxMenu.item)}
            >
              <FileText size={15} /> {t.common.openFile}
            </button>
          )}
          <button
            className="ctx-item ctx-item--danger"
            onClick={() => runMenuAction("delete", ctxMenu.item)}
          >
            <Trash2 size={15} /> {t.downloads.deleteDownload}
          </button>
        </div>
      )}
    </>
  );
}
