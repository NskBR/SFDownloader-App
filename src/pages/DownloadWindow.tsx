import {
  AlertTriangle,
  Ban,
  ChevronDown,
  Clock3,
  Copy,
  Check,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  Link2,
  Minus,
  Pause,
  Play,
  Trash2,
  X,
  ArrowLeft,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { FileIcon } from "../components/downloads/FileIcon";
import * as service from "../services/downloadService";
import type {
  DownloadProgress,
  DownloadStatus,
  DownloadTask,
} from "../domain/download";
import { elapsedSeconds, formatElapsed } from "../utils/elapsedTime";
import { useTranslation } from "../i18n";

const bytes = (value: number | null) => {
  if (value === null || value < 0) return "Desconhecido";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value,
    index = 0;
  while (size >= 1024 && index < 4) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
};

const eta = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}min`;
  const totalHours = Math.ceil(seconds / 3600);
  if (totalHours < 24) return `${totalHours}h`;

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days < 365) return `${days}d${hours ? ` ${hours}h` : ""}`;

  const years = Math.floor(days / 365);
  const remainingDays = days % 365;
  return `${years}a${remainingDays ? ` ${remainingDays}d` : ""}`;
};

const sourceDomain = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "—";
  }
};

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return (
    date.toLocaleDateString("pt-BR") +
    " " +
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
};

function Donut({ value, status }: { value: number; status: DownloadStatus }) {
  const size = 74,
    stroke = 5,
    radius = (size - stroke) / 2,
    circumference = 2 * Math.PI * radius,
    clamped = Math.max(0, Math.min(100, value)),
    offset = circumference - (clamped / 100) * circumference;
  const strokeColor =
    status === "completed"
      ? "var(--st-completed)"
      : status === "failed" || status === "cancelled"
        ? "var(--st-failed)"
        : status === "paused"
          ? "var(--st-paused)"
          : "url(#dw-donut-gradient)";

  return (
    <div className="dw-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient
            id="dw-donut-gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="var(--ember-stop-1, var(--ember-solid))" />
            <stop offset="100%" stopColor="var(--ember-stop-2, var(--ember-solid))" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--dw-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dashoffset 0.4s ease, stroke 0.2s ease",
          }}
        />
      </svg>
      <div className="dw-donut-center">
        <strong>{status === "completed" ? <Check aria-label="100%" /> : Math.round(clamped) + "%"}</strong>
        
      </div>
    </div>
  );
}

function TitleDownloadIcon({ status }: { status: DownloadStatus }) {
  const strokeColor =
    status === "completed"
      ? "var(--st-completed)"
      : status === "failed" || status === "cancelled"
        ? "var(--st-failed)"
        : status === "paused"
          ? "var(--st-paused)"
          : "url(#dw-title-gradient)";

  return (
    <svg
      className="dw-title-icon"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: "stroke 0.25s ease", flexShrink: 0 }}
    >
      <defs>
        <linearGradient
          id="dw-title-gradient" gradientUnits="userSpaceOnUse"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="var(--ember-stop-1, var(--ember-solid))" />
          <stop offset="100%" stopColor="var(--ember-stop-2, var(--ember-solid))" />
        </linearGradient>
      </defs>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <g className="dw-title-arrow"><polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" /></g>
    </svg>
  );
}

export function DownloadWindow({ downloadId }: { downloadId: string }) {
  const { t } = useTranslation();
  const [task, setTask] = useState<DownloadTask | null>(null);
  const [downloaded, setDownloaded] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [status, setStatus] = useState<DownloadStatus>("pending");
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedError, setCopiedError] = useState(false);
  const [extraction, setExtraction] = useState<string | null>(null);
  const appWindow = getCurrentWindow();
  const mainRef = useRef<HTMLElement>(null);
  const notFoundCount = useRef(0);

  const statusLabels: Record<DownloadStatus, string> = {
    pending: t.downloadWindow.pending,
    connecting: t.downloadWindow.pending,
    checking_files: t.downloadWindow.checkingFiles,
    downloading: t.downloadWindow.downloading,
    paused: t.downloadWindow.paused,
    assembling: t.downloadWindow.assembling,
    extracting: t.downloadWindow.extracting,
    completed: t.downloadWindow.completed,
    failed: t.downloadWindow.failed,
    cancelled: t.downloadWindow.cancelled,
  };

  useEffect(() => {
    void appWindow.show().catch(() => {});
    void appWindow.setFocus().catch(() => {});
  }, []);

  useEffect(() => {
    const fit = async () => {
      await document.fonts?.ready.catch(() => {});
      const targetHeight = cancelOpen
        ? 276
        : detailsOpen
          ? 370
          : status === "failed" || status === "cancelled" || error
            ? 222
            : 220;
      const [innerSize, scaleFactor] = await Promise.all([
        appWindow.innerSize(),
        appWindow.scaleFactor(),
      ]);
      void appWindow
        .setSize(new LogicalSize(innerSize.width / scaleFactor, targetHeight))
        .catch(() => {});
    };
    void fit();
  }, [detailsOpen, cancelOpen, status, error]);

  useEffect(() => {
    let active = true;
    const activeStatuses = [
      "downloading",
      "checking_files",
      "assembling",
      "extracting",
      "completed",
    ];

    const fetchTask = () => {
      void Promise.all([
        service.listDownloads(),
        service.extractionStatus(downloadId),
      ]).then(([list, result]) => {
        if (!active) return;
        const found = list.find(
          (item) => item.id === downloadId || item.infoHash === downloadId,
        );
        if (found) {
          notFoundCount.current = 0;
          setTask((current) => {
            if (!current) return found;
            const isDownloading = activeStatuses.includes(found.status);
            return {
              ...found,
              totalDownloaded: isDownloading
                ? Math.max(current.totalDownloaded, found.totalDownloaded)
                : found.totalDownloaded,
              speedCurrent:
                found.status === "downloading" && found.speedCurrent === 0
                  ? current.speedCurrent
                  : found.speedCurrent,
            };
          });

          setDownloaded((prev) => {
            const isDownloading = activeStatuses.includes(found.status);
            return isDownloading
              ? Math.max(prev, found.totalDownloaded)
              : found.totalDownloaded;
          });

          setSpeed((prev) => {
            if (found.status === "downloading" && found.speedCurrent === 0) {
              return prev;
            }
            return found.speedCurrent;
          });

          setStatus(found.status);
          setExtraction(result);
        } else {
          notFoundCount.current += 1;
          if (notFoundCount.current >= 3) {
            void appWindow.close();
          }
        }
      });
    };

    fetchTask();
    const interval = setInterval(fetchTask, task ? 2000 : 400);

    const listener = listen<DownloadProgress>(
      "download-progress",
      ({ payload }) => {
        if (payload.id !== downloadId) return;

        setStatus(payload.status);

        setDownloaded((prev) => {
          const isDownloading = activeStatuses.includes(payload.status);
          return isDownloading
            ? Math.max(prev, payload.downloaded)
            : payload.downloaded;
        });

        setSpeed((prev) => {
          if (payload.status === "downloading" && payload.speed === 0) {
            return prev;
          }
          return payload.speed;
        });

        setTask((current) => {
          if (!current) {
            fetchTask();
            return current;
          }
          const isDownloading = activeStatuses.includes(payload.status);
          return {
            ...current,
            status: payload.status,
            totalDownloaded: isDownloading
              ? Math.max(current.totalDownloaded, payload.downloaded)
              : payload.downloaded,
            speedCurrent:
              payload.status === "downloading" && payload.speed === 0
                ? current.speedCurrent
                : payload.speed,
          };
        });
        if (payload.error) {
          setError(payload.error);
        }
      },
    );

    return () => {
      active = false;
      clearInterval(interval);
      void listener.then((dispose) => dispose());
    };
  }, [downloadId, task === null]);

  const pauseResume = async () => {
    setError(null);
    try {
      if (["pending", "downloading"].includes(status)) {
        await service.pauseDownload(downloadId);
        setStatus("paused");
        setSpeed(0);
      } else {
        await service.resumeDownload(downloadId);
        setStatus("downloading");
      }
    } catch (cause) {
      setError(String(cause));
    }
  };

  const cancel = async (deleteFiles: boolean) => {
    setBusy(true);
    try {
      await service.cancelDownload(downloadId, deleteFiles);
      setStatus("cancelled");
      setSpeed(0);
      setCancelOpen(false);
      await appWindow.close();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const copyPath = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  const copyError = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedError(true);
      window.setTimeout(() => setCopiedError(false), 1600);
    });
  };

  if (!task)
    return (
      <main className="dw-window">
        <header className="dw-title" data-tauri-drag-region>
          <span>
            <Gauge />
            {t.downloadWindow.title}
          </span>
          <div className="dw-controls">
            <button
              type="button"
              title={t.common.minimize}
              aria-label={t.common.minimize}
              onClick={() => void appWindow.minimize()}
            >
              <Minus />
            </button>
            <button
              type="button"
              title={t.common.close}
              aria-label={t.common.close}
              onClick={() => void appWindow.close()}
            >
              <X />
            </button>
          </div>
        </header>
        <div className="dw-loading" role="status">{t.downloadWindow.loadingDetails}</div>
      </main>
    );

  const total = task.fileSize ?? 0,
    isAssembling = status === "assembling",
    isExtracting = status === "extracting",
    isChecking = status === "checking_files",
    isCompleted = status === "completed",
    isActive = [
      "downloading",
      "assembling",
      "extracting",
      "checking_files",
    ].includes(status),
    isFailed = status === "failed" || status === "cancelled",
    progress = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0,
    remaining =
      speed > 0 && total > downloaded ? (total - downloaded) / speed : -1,
    domain = sourceDomain(task.originalUrl),
    destination = task.finalPath.replace(/[\\/][^\\/]*$/, ""),
    fileType = task.extension?.trim().toUpperCase() || "—";

  return (
    <main
      ref={mainRef}
      className={`dw-window status-${status} ${isCompleted ? "dw-complete" : "dw-progress"}${cancelOpen ? " cancel-open" : ""}`}
    >
      <header className="dw-title" data-tauri-drag-region>
        <span className="dw-title-text" data-tauri-drag-region>
          <TitleDownloadIcon status={status} />
          <span className="dw-title-copy">
            <span
              className="dw-title-name"
              title={task.fileName}
              data-tauri-drag-region
            >
              {task.fileName}
            </span>
            <span className="dw-title-subtitle">
              {t.downloadWindow.fileType} {fileType}
            </span>
          </span>
        </span>
        <div className="dw-controls">
          <button
            title={t.titlebar.minimizeTooltip}
            aria-label={t.titlebar.minimizeTooltip}
            onClick={() => void appWindow.minimize()}
          >
            <Minus />
          </button>
          <button
            title={t.titlebar.closeTooltip}
            aria-label={t.titlebar.closeTooltip}
            onClick={() => void appWindow.close()}
          >
            <X />
          </button>
        </div>
      </header>

      {!detailsOpen && !cancelOpen && (
        <>
          <section className="dw-body">
            <div className="dw-left">
              <Donut value={isCompleted ? 100 : progress} status={status} />
            </div>

            <div className="dw-right">
              <div className="dw-right-top">
                <div className="dw-right-info">
                  <p className="dw-origin">
                    <Link2 size={14} aria-hidden="true" />
                    <span className="dw-origin-domain" title={domain}>{domain}</span>
                  </p>

                  {isCompleted && (
                    <p className="dw-meta dw-inline-status">
                      {t.downloadWindow.completedIn} {formatElapsed(elapsedSeconds(task.createdAt, task.completedAt))}
                    </p>
                  )}
<div className="dw-size-row">
                    
                    {isCompleted && (
                      <button
                        className="dw-icon-btn"
                        title={
                          copied
                            ? t.downloadWindow.copiedPath
                            : t.downloadWindow.copyDestination
                        }
                        onClick={() => copyPath(task.finalPath)}
                      >
                        {copied ? <Check /> : <Copy />}
                      </button>
                    )}
                    <p className="dw-size">
                      {bytes(downloaded)}
                      {!isCompleted && total ? (
                        <em> / {bytes(total)}</em>
                      ) : null}
                    </p>
                  </div>

                  {!isCompleted && (
                    <p className="dw-meta dw-meta-progress">
                      {error ? (
                        <span className="dw-meta-error">
                          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                          <span>{error}</span>
                        </span>
                      ) : isExtracting ? (
                        <span>
                          {extraction || t.downloadWindow.extractingFiles}
                        </span>
                      ) : isAssembling ? (
                        <span>{t.downloadWindow.assemblingParts}</span>
                      ) : isChecking ? (
                        <span className="dw-meta-checking">{t.downloadWindow.checkingIntegrity}</span>
                      ) : (
                        <>
                          {isActive ? `${bytes(speed)}/s` : "0 B/s"}
                          <span className="dw-dot">•</span>
                          {eta(remaining)}<span className="dw-dot">•</span><span className="dw-inline-status">{statusLabels[status]}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                {!isCompleted && !isFailed && (
                      <button
                        className="dw-btn-ghost dw-transport"
                        title={
                          isActive
                            ? t.downloads.pauseDownload
                            : t.downloads.resumeDownload
                        }
                        onClick={() => void pauseResume()}
                      >
                        {isActive ? <Pause /> : <Play />}
                      </button>
                    )}
<div
                  className="dw-file-badge"
                  title={`Arquivo: ${task.fileName}`}
                >
                  <FileIcon extension={task.extension} width={64} height={74} />
                </div>
              </div>

              {!isCompleted && (
                <div
                  className={`dw-bar${isActive ? " dw-bar--active" : ""}${status === "paused" ? " dw-bar--paused" : ""}${isFailed ? " dw-bar--failed" : ""}`}
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                >
                  <i style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </section>

          <div className="dw-divider" />

          <footer className="dw-footer">
            <button
              className="dw-details-toggle"
              onClick={() => setDetailsOpen((value) => !value)}
            >
              <ChevronDown className={detailsOpen ? "open" : ""} />
              {t.downloadWindow.moreDetails}
            </button>

            
{isCompleted ? (
              <div className="dw-footer-actions">
                <button
                  className="dw-btn-primary"
                  onClick={async () => {
                    try {
                      await service.openFile(task.finalPath);
                    } finally {
                      void appWindow.close();
                    }
                  }}
                >
                  <FileText size={16} />
                  {t.common.openFile}
                </button>
                <button
                  className="dw-btn-ghost"
                  onClick={async () => {
                    try {
                      await service.revealInFolder(task.finalPath);
                    } finally {
                      void appWindow.close();
                    }
                  }}
                >
                  <FolderOpen size={16} />
                  {t.common.openFolder}
                </button>
              </div>
            ) : (
              <button
                className="dw-btn-cancel"
                onClick={() => setCancelOpen(true)}
              >
                <Ban size={15} />
                {t.common.cancel}
              </button>
            )}
          </footer>
        </>
      )}

      {detailsOpen && !cancelOpen && (
        <div className="dw-details dw-details-full">
          <div className="dw-details-header" data-tauri-drag-region>
            <button
              className="dw-details-back nodrag"
              onClick={() => setDetailsOpen(false)}
            >
              <ArrowLeft size={16} />
              {t.common.back}
            </button>
            <span className="dw-details-header-title">
              {t.downloadWindow.detailsTitle}
            </span>
          </div>

          <div className="dw-details-compact-body">
            <div className="dw-details-card">
              <div className="dw-detail-row">
                <span className="dw-detail-label">
                  {t.downloadWindow.currentSpeed}
                </span>
                <span className="dw-detail-val">{bytes(speed)}/s</span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">
                  {t.downloadWindow.remainingTime}
                </span>
                <span className="dw-detail-val">{eta(remaining)}</span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">
                  {t.downloadWindow.elapsedTime}
                </span>
                <span className="dw-detail-val">
                  {formatElapsed(
                    elapsedSeconds(task.createdAt, task.completedAt),
                  )}
                </span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">
                  {t.downloadWindow.createdAt}
                </span>
                <span className="dw-detail-val">
                  {formatDateTime(task.createdAt)}
                </span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">
                  {t.downloadWindow.completedAt}
                </span>
                <span className="dw-detail-val">
                  {formatDateTime(task.completedAt)}
                </span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">
                  {t.downloadWindow.originalUrl}
                </span>
                <span
                  className="dw-detail-val dw-detail-url"
                  title={task.originalUrl}
                >
                  {task.originalUrl}
                </span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">
                  {t.downloadWindow.destinationFolder}
                </span>
                <span className="dw-detail-val">{destination}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelOpen && (
        <div className="dw-confirm-cancel">
          <p>{t.downloadWindow.confirmCancelTitle}</p>
          <div className="dw-confirm-cancel-actions">
            <button className="dw-btn-danger" onClick={() => void cancel(true)}>
              {t.downloadWindow.confirmCancelDelete}
            </button>
            <button
              className="dw-btn-warning"
              onClick={() => void cancel(false)}
            >
              {t.downloadWindow.confirmCancelKeep}
            </button>
            <button
              className="dw-btn-secondary"
              onClick={() => setCancelOpen(false)}
            >
              {t.downloadWindow.confirmCancelBack}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}






