import {
  AlertTriangle,
  Ban,
  ChevronDown,
  Clock3,
  Copy,
  Check,
  Download,
  FileText,
  FolderOpen,
  Gauge,
  Minus,
  Pause,
  Play,
  ScanSearch,
  ArrowLeft,
  Users,
  Globe,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { FileIcon } from "../components/downloads/FileIcon";
import { TorrentWindowCloseButton } from "../components/torrent/TorrentWindowCloseButton";
import * as service from "../services/downloadService";
import type { DownloadStatus, DownloadTask } from "../domain/download";
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
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600),
    minutes = Math.ceil((seconds % 3600) / 60);
  return `${hours}h${minutes}m`;
};

const smoothedDownloadSpeed = (previous: number, next: number, status: DownloadStatus) => {
  if (status !== "downloading") return 0;
  if (next <= 0) return previous * 0.82;
  return previous <= 0 ? next : previous * 0.7 + next * 0.3;
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
          <linearGradient id="dw-donut-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
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
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.2s ease" }}
        />
      </svg>
      <div className="dw-donut-center">
        <strong>{status === "completed" ? <Check aria-label="100%" /> : Math.round(clamped) + "%"}</strong>
        
      </div>
    </div>
  );
}

interface TorrentProgressPayload {
  id: string;
  downloaded: number;
  verifiedBytes?: number;
  total: number | null;
  speed: number;
  uploadSpeed?: number;
  seeds?: number;
  peers?: number;
  trackers?: number;
  status: string;
  error?: string | null;
}

function TitleDownloadIcon({ status }: { status: DownloadStatus }) {
  const strokeColor =
    status === "completed"
      ? "var(--st-completed)"
      : status === "failed" || status === "cancelled"
      ? "var(--st-failed)"
      : status === "paused"
      ? "var(--st-paused)"
      : "url(#dw-torrent-title-gradient)";

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
        <linearGradient id="dw-torrent-title-gradient" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="100%">
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

export function TorrentProgressWindow({ downloadId }: { downloadId: string }) {
  const { t } = useTranslation();
  const [task, setTask] = useState<DownloadTask | null>(null);
  const [downloaded, setDownloaded] = useState(0);
  const [verifiedBytes, setVerifiedBytes] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [peers, setPeers] = useState(0);
  const [trackers, setTrackers] = useState(0);
  const [status, setStatus] = useState<DownloadStatus>("pending");
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const appWindow = getCurrentWindow();
  const mainRef = useRef<HTMLElement>(null);

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
            ? 228
            : 232;
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

  const notFoundCount = useRef(0);

  useEffect(() => {
    let active = true;
    const activeStatuses = ["downloading", "checking_files", "assembling", "extracting", "completed"];

    const fetchTask = () => {
      void service.listDownloads().then((list) => {
        if (!active) return;
        const found = list.find((item) => item.id === downloadId || item.infoHash === downloadId);
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
              speedCurrent: found.status === "downloading" && found.speedCurrent === 0
                ? current.speedCurrent
                : found.speedCurrent,
            };
          });

          setDownloaded((prev) => {
            const isDownloading = activeStatuses.includes(found.status);
            return isDownloading ? Math.max(prev, found.totalDownloaded) : found.totalDownloaded;
          });

          setSpeed((prev) => smoothedDownloadSpeed(prev, found.speedCurrent, found.status));

          setUploadSpeed(found.uploadSpeed ?? 0);
          setPeers(found.peers ?? 0);
          setStatus((prev) => (prev === "pending" ? found.status : prev));
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

    const listener = listen<TorrentProgressPayload>("download-progress", ({ payload }) => {
      if (payload.id !== downloadId) {
        return;
      }
      setStatus(payload.status as DownloadStatus);

      setDownloaded((prev) => {
        const isDownloading = activeStatuses.includes(payload.status);
        return isDownloading ? Math.max(prev, payload.downloaded) : payload.downloaded;
      });

      if (payload.verifiedBytes !== undefined) setVerifiedBytes(payload.verifiedBytes);

      setSpeed((prev) =>
        smoothedDownloadSpeed(prev, payload.speed, payload.status as DownloadStatus),
      );

      if (payload.uploadSpeed !== undefined) setUploadSpeed(payload.uploadSpeed);
      if (payload.peers !== undefined) setPeers(payload.peers);
      if (payload.trackers !== undefined) setTrackers(payload.trackers);

      setTask((current) => {
        if (!current) {
          fetchTask();
          return current;
        }
        const isDownloading = activeStatuses.includes(payload.status);
        return {
          ...current,
          status: payload.status as DownloadStatus,
          totalDownloaded: isDownloading
            ? Math.max(current.totalDownloaded, payload.downloaded)
            : payload.downloaded,
          speedCurrent: payload.status === "downloading" && payload.speed === 0
            ? current.speedCurrent
            : payload.speed,
        };
      });
      if (payload.error) setError(payload.error);
    });

    return () => {
      active = false;
      clearInterval(interval);
      void listener.then((dispose) => dispose());
    };
  }, [downloadId, task === null]);

  const pauseResume = async () => {
    setError(null);
    const taskId = task?.id ?? downloadId;
    try {
      if (["pending", "connecting", "checking_files", "downloading"].includes(status)) {
        await service.pauseDownload(taskId);
        setStatus("paused");
        setSpeed(0);
      } else {
        await service.resumeDownload(taskId);
        setStatus("downloading");
      }
    } catch (cause) {
      setError(String(cause));
    }
  };

  const cancel = async (deleteFiles: boolean) => {
    setBusy(true);
    try {
      await service.cancelDownload(task?.id ?? downloadId, deleteFiles);
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

  if (!task)
    return (
      <main className="dw-window">
        <header className="dw-title" data-tauri-drag-region>
          <span>
            <Gauge />
            {t.torrentWindow.title}
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
            <TorrentWindowCloseButton title={t.common.close} onClose={() => void appWindow.close()} />
          </div>
        </header>
        <div className="dw-loading" role="status">{t.torrentWindow.loading}</div>
      </main>
    );

  const total = task.fileSize ?? 0,
    isChecking = status === "checking_files",
    isCompleted = status === "completed",
    isActive = status === "downloading",
    isRunning = ["pending", "connecting", "checking_files", "downloading"].includes(status),
    isFailed = status === "failed" || status === "cancelled",
    // Durante verificação, mostramos progresso de verificação no donut
    verifyProgress = isChecking && total > 0 ? Math.min(100, (verifiedBytes / total) * 100) : 0,
    downloadProgress = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0,
    progress = isChecking ? verifyProgress : (isCompleted ? 100 : downloadProgress),
    remaining = isActive && speed > 0 && total > downloaded ? (total - downloaded) / speed : -1,
    destination = task.finalPath.replace(/[\\/][^\\/]*$/, ""),
    fileType = task.extension?.trim().toUpperCase() || "TORRENT",
    isDiskSpaceError = Boolean(
      error && /os error 112|espaço insuficiente|not enough space/i.test(error),
    ),
    errorTitle = isDiskSpaceError
      ? t.downloadWindow.diskSpaceErrorTitle
      : t.downloadWindow.downloadErrorTitle,
    errorMessage = isDiskSpaceError
      ? t.downloadWindow.diskSpaceErrorHint
      : error;

  return (
    <main ref={mainRef} className={`dw-window torrent-download-window status-${status} ${isCompleted ? "dw-complete" : "dw-progress"}${cancelOpen ? " cancel-open" : ""}`}>
      <header className="dw-title" data-tauri-drag-region>
        <span className="dw-title-text" data-tauri-drag-region>
          <TitleDownloadIcon status={status} />
          <span className="dw-title-copy">
            <span className="dw-title-name" title={task.fileName} data-tauri-drag-region>
              {task.fileName}
            </span>
            <span className="dw-title-subtitle">
              {t.downloadWindow.fileType} {fileType}
            </span>
          </span>
        </span>
        <div className="dw-controls">
          <button title={t.titlebar.minimizeTooltip} aria-label={t.titlebar.minimizeTooltip} onClick={() => void appWindow.minimize()}>
            <Minus />
          </button>
          <TorrentWindowCloseButton title={t.titlebar.closeTooltip} onClose={() => void appWindow.close()} />
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
                  {!error && (
                    <p className="dw-origin">
                      <Globe size={14} aria-hidden="true" /> <span className="dw-origin-domain">P2P BitTorrent</span>
                    </p>
                  )}

                  {isCompleted && <p className="dw-meta dw-inline-status">{statusLabels[status]}</p>}
<div className="dw-size-row">
                    
                    {isCompleted && (
                      <button className="dw-icon-btn" title={copied ? t.downloadWindow.copiedPath : t.downloadWindow.copyDestination} aria-label={copied ? t.downloadWindow.copiedPath : t.downloadWindow.copyDestination} onClick={() => copyPath(task.finalPath)}>
                        {copied ? <Check /> : <Copy />}
                      </button>
                    )}
                    <p className="dw-size">
                      {bytes(isChecking ? 0 : downloaded)}{!isCompleted && total ? <em> / {bytes(total)}</em> : null}
                    </p>
                  </div>

                  {!isCompleted && !error && (
                    <div className="dw-meta" aria-live="polite">
                      {isChecking ? (
                        <span className="dw-meta-item dw-meta-checking">
                          <ScanSearch aria-hidden="true" />
                          {t.downloadWindow.checkingIntegrity}
                        </span>
                      ) : (
                        <div className="dw-meta-stats">
                          <span className="dw-meta-item" title={t.torrentWindow.downloadSpeed}>
                            <Download aria-hidden="true" />
                            {isActive ? `${bytes(speed)}/s` : "0 B/s"}
                          </span>
                          <span className="dw-meta-item" title={t.torrentWindow.peers}>
                            <Users aria-hidden="true" />
                            {peers}
                          </span>
                          <span className="dw-meta-item" title={t.downloadWindow.remainingTime}>
                            <Clock3 aria-hidden="true" />
                            {eta(remaining)}
                          </span>
                          {!isActive && (
                            <span className="dw-meta-item dw-inline-status">
                              {statusLabels[status]}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="dw-error-card" role="alert">
                      <span className="dw-error-card-icon">
                        <AlertTriangle aria-hidden="true" />
                      </span>
                      <span className="dw-error-card-content">
                        <strong>{errorTitle}</strong>
                        <span title={errorMessage ?? undefined}>{errorMessage}</span>
                      </span>
                    </div>
                  )}
                </div>

                {!isCompleted && !isFailed && (
                      <button className="dw-btn-ghost dw-transport" title={isRunning ? t.downloads.pauseDownload : t.downloads.resumeDownload} aria-label={isRunning ? t.downloads.pauseDownload : t.downloads.resumeDownload} onClick={() => void pauseResume()}>
                        {isRunning ? <Pause /> : <Play />}
                      </button>
                    )}
{!isFailed && (
                  <div className="dw-file-badge" title={`Arquivo: ${task.fileName}`}>
                    <FileIcon extension={task.extension || "torrent"} width={64} height={74} />
                  </div>
                )}
              </div>

              {!isCompleted && (
                <div className={`dw-bar${isActive ? " dw-bar--active" : ""}${isChecking ? " dw-bar--checking" : ""}${status === "paused" ? " dw-bar--paused" : ""}${isFailed ? " dw-bar--failed" : ""}`} role="progressbar" aria-valuenow={Math.round(progress)}>
                  <i style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </section>

          <div className="dw-divider" />

          <footer className="dw-footer">
            <button className="dw-details-toggle" onClick={() => setDetailsOpen((value) => !value)}>
              <ChevronDown className={detailsOpen ? "open" : ""} />
              {t.downloadWindow.moreDetails}
            </button>

            {!isCompleted && !isFailed && (
              <button className="dw-btn-ghost dw-edit-files" onClick={() => void service.openTorrentFileSelectionWindow(task.id)}>
                <FileText size={16} />
                Editar arquivos
              </button>
            )}
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
              <button className="dw-btn-cancel" onClick={() => setCancelOpen(true)} disabled={busy}>
                <Ban size={15} />
                {t.common.cancel}
              </button>
            )}
          </footer>
        </>
      )}

      {detailsOpen && (
        <div className="dw-details dw-details-full">
          <div className="dw-details-header" data-tauri-drag-region>
            <button className="dw-details-back nodrag" onClick={() => setDetailsOpen(false)}>
              <ArrowLeft size={16} />
              {t.common.back}
            </button>
            <span className="dw-details-header-title">{t.torrentWindow.detailsTitle}</span>
          </div>

          <div className="dw-details-compact-body">
            <div className="dw-details-card">
              <div className="dw-detail-row">
                <span className="dw-detail-label">{t.torrentWindow.downloadSpeed}</span>
                <span className="dw-detail-val">{bytes(speed)}/s</span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">{t.torrentWindow.uploadSpeed}</span>
                <span className="dw-detail-val">{bytes(uploadSpeed)}/s</span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">{t.torrentWindow.peers}</span>
                <span className="dw-detail-val">{peers}</span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">{t.torrentWindow.trackers}</span>
                <span className="dw-detail-val">{trackers || "—"}</span>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">{t.downloadWindow.destinationFolder}</span>
                <span className="dw-detail-val">{destination}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelOpen && (
        <section className="dw-cancel-sheet" role="dialog" aria-modal="true" aria-labelledby="torrent-cancel-title">
          <div className="dw-cancel-sheet-header">
            <span className="dw-cancel-sheet-icon"><Ban aria-hidden="true" /></span>
            <div className="dw-cancel-sheet-text">
              <h2 id="torrent-cancel-title" className="dw-cancel-sheet-title">Cancelar torrent?</h2>
              <p className="dw-cancel-sheet-desc">Escolha se os arquivos locais devem permanecer no diretório.</p>
            </div>
          </div>
          <div className="dw-cancel-sheet-sep" />
          <div className="dw-cancel-sheet-actions">
            <button className="dw-cancel-btn-keep" onClick={() => setCancelOpen(false)} disabled={busy}>Voltar</button>
            <button className="dw-cancel-btn-keep" onClick={() => void cancel(false)} disabled={busy}>
              Manter arquivos
            </button>
            <button className="dw-cancel-btn-delete" onClick={() => void cancel(true)} disabled={busy}>
              Excluir arquivos
            </button>
          </div>
        </section>
      )}
    </main>
  );
}






