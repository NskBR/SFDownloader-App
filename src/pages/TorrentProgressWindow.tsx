import {TorrentPeerDetails,peerRatio,type ConnectionDetails} from "../components/torrent/TorrentPeerDetails";
import {invoke} from "@tauri-apps/api/core";
import {TorrentTelemetryTooltip} from "../components/torrent/TorrentTelemetryTooltip";
import {TorrentPeerStatus} from "../components/torrent/TorrentPeerStatus";
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
  HardDriveDownload,
  Minus,
  Pause,
  Play,
  ScanSearch,
  ArrowLeft,
  Users,
  Globe,
  Upload,
  X,
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

const formatRemaining=(seconds:number)=>{if(!Number.isFinite(seconds)||seconds<0)return "Calculando…";const total=Math.ceil(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),rest=total%60;return [hours?`${hours} h`:"",minutes?`${minutes} min`:"",rest||!hours&&!minutes?`${rest} s`:""].filter(Boolean).join(" ");};
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
      : status === "checking_files"
      ? "var(--st-checking)"
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
  verificationTotal?: number;
  verificationSpeed?: number;
  verificationReadBytes?: number;
  diskWriteSpeed?: number;
  total: number | null;
  speed: number;
  uploadSpeed?: number;
  totalUploaded?: number;
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
  const [verificationTotal,setVerificationTotal]=useState(0);
  const [verificationSpeed,setVerificationSpeed]=useState(0);
  const [verificationReadBytes,setVerificationReadBytes]=useState<number|null>(null);
  const [speed, setSpeed] = useState(0);
  const [diskWriteSpeed,setDiskWriteSpeed]=useState<number|null>(null);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [totalUploaded,setTotalUploaded]=useState(0);
  const [peers, setPeers] = useState(0);
  const [trackers, setTrackers] = useState(0);
  const [status, setStatus] = useState<DownloadStatus>("pending");
  const [verificationComplete,setVerificationComplete]=useState(false);
  const previousVerificationStatus=useRef<DownloadStatus>("pending");
  const verificationCompletionTimer=useRef<ReturnType<typeof setTimeout>>();
  useEffect(()=>{
    const previous=previousVerificationStatus.current;
    previousVerificationStatus.current=status;
    if(previous==="checking_files" && (status==="downloading" || status==="connecting")){
      setVerificationComplete(true);
      clearTimeout(verificationCompletionTimer.current);
      verificationCompletionTimer.current=setTimeout(()=>setVerificationComplete(false),800);
    }else if(!["downloading","connecting"].includes(status)){
      clearTimeout(verificationCompletionTimer.current);
      setVerificationComplete(false);
    }
  },[status]);
  useEffect(()=>()=>clearTimeout(verificationCompletionTimer.current),[]);

  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab,setDetailsTab]=useState<"download"|"peers">("download");
  const detailsPanel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!detailsOpen)return;
    const area=detailsPanel.current?.firstElementChild as HTMLElement|null;
    if(!area)return;
    const wheel=(event:WheelEvent)=>{
      if(event.ctrlKey || event.shiftKey || Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
      if(area.scrollHeight<=area.clientHeight)return;
      event.preventDefault();event.stopPropagation();
      const unit=event.deltaMode===1?16:event.deltaMode===2?area.clientHeight:1;
      area.scrollTop+=event.deltaY*unit*0.4;
    };
    area.addEventListener("wheel",wheel,{passive:false});
    return()=>area.removeEventListener("wheel",wheel);
  },[detailsOpen,detailsTab]);

  const [connectionDetails,setConnectionDetails]=useState<ConnectionDetails|null>(null);
  const [connectionError,setConnectionError]=useState(false);
  useEffect(()=>{
    if(!detailsOpen)return;
    let disposed=false;
    let previous:{time:number;details:ConnectionDetails}|null=null;
    let timer:ReturnType<typeof setTimeout>;
    const refresh=async()=>{
      try{const details=await invoke<NonNullable<typeof connectionDetails>>("torrent_connection_details",{id:downloadId});if(!disposed){
        const now=performance.now();
        for(const [address,peer] of Object.entries(details.peers)){
          const before=previous?.details.peers[address];const seconds=previous?(now-previous.time)/1000:0;
          if(before&&seconds>0){peer.downloadRate=Math.max(0,peer.counters.fetched_bytes-before.counters.fetched_bytes)/seconds;peer.uploadRate=Math.max(0,peer.counters.uploaded_bytes-before.counters.uploaded_bytes)/seconds;}
        }
        previous={time:now,details};setConnectionDetails(details);setConnectionError(false);
      }}
      catch{if(!disposed)setConnectionError(true);}
      if(!disposed)timer=setTimeout(()=>void refresh(),2000);
    };
    void refresh();return()=>{disposed=true;clearTimeout(timer);};
  },[detailsOpen,downloadId]);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const transportLock=useRef(false);
  const [transportAction,setTransportAction]=useState<"pausing"|"resuming"|null>(null);
  const transportLabel=transportAction==="resuming" ? (t.common.back==="Voltar"?"Retomando…":"Resuming…") : (t.common.back==="Voltar"?"Pausando…":"Pausing…");

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
            : status === "checking_files" ? 252 : 232;
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
          setTotalUploaded(found.totalUploaded ?? 0);
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
      setVerificationTotal(payload.verificationTotal??0);
      setVerificationReadBytes(payload.verificationReadBytes??null);
      setDiskWriteSpeed(payload.status==="downloading"||payload.status==="connecting"?payload.diskWriteSpeed??null:null);
      setVerificationSpeed(payload.status==="checking_files"?payload.verificationSpeed??0:0);

      setSpeed((prev) =>
        smoothedDownloadSpeed(prev, payload.speed, payload.status as DownloadStatus),
      );

      if (payload.uploadSpeed !== undefined) setUploadSpeed(payload.uploadSpeed);
      if (payload.totalUploaded !== undefined) setTotalUploaded(payload.totalUploaded);
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
    if(transportLock.current || busy)return;
    transportLock.current=true;
    const resuming=!["pending","connecting","checking_files","downloading"].includes(status);
    setTransportAction(resuming?"resuming":"pausing");
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
      if(resuming && String(cause).includes("Este download já está ativo.")){
        setStatus("downloading");
      }else{
        setError(String(cause));
      }
    } finally {
      transportLock.current=false;
      setTransportAction(null);
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
        <WindowSkeleton label={t.torrentWindow.loading}/>
      </main>
    );

  const total = task.fileSize ?? 0,
    isChecking = status === "checking_files",
    isCompleted = status === "completed",
    isActive = status === "downloading",
    isRunning = ["pending", "connecting", "checking_files", "downloading"].includes(status),
    isFailed = status === "failed" || status === "cancelled",
    // Durante verificação, mostramos progresso de verificação no donut
    verifyProgress = isChecking && verificationTotal > 0 ? Math.min(100, (verifiedBytes / verificationTotal) * 100) : 0,
    downloadProgress = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0,
    progress = verificationComplete ? 100 : isChecking ? verifyProgress : (isCompleted ? 100 : downloadProgress),
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
    <main ref={mainRef} className={`dw-window torrent-download-window status-${verificationComplete ? "checking_files" : status} ${isCompleted ? "dw-complete" : "dw-progress"}${cancelOpen ? " cancel-open" : ""}`}>
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
              <Donut value={isCompleted ? 100 : progress} status={verificationComplete ? "checking_files" : status} />
            </div>

            <div className="dw-right">
              <div className="dw-right-top">
                <div className="dw-right-info">
                  {!error && (
                    <p className="dw-origin torrent-origin-telemetry">
                      <Globe size={14} aria-hidden="true" /> <span className="dw-origin-domain">P2P BitTorrent</span>
                      {!isChecking && !isCompleted && <TorrentTelemetryTooltip className="torrent-disk-write" label="Escrita nos arquivos" title="Escrita nos arquivos" rows={[["Taxa atual",isRunning&&diskWriteSpeed!==null?`${bytes(diskWriteSpeed)}/s`:"—"]]} note="Bytes gravados pelo aplicativo. Pode incluir cache do Windows."><HardDriveDownload aria-hidden="true"/><span className="torrent-stat-value">Escrita · {isRunning&&diskWriteSpeed!==null?`${bytes(diskWriteSpeed)}/s`:"—"}</span></TorrentTelemetryTooltip>}
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
                      {transportAction ? <span className="dw-meta-item" role="status">{transportLabel}</span> : isChecking || verificationComplete ? (
                        <span className="dw-meta-item dw-meta-checking">
                          <ScanSearch aria-hidden="true" />
                          <span>{verificationComplete ? (t.common.back === "Voltar" ? "Verificação concluída" : "Verification complete") : t.downloadWindow.checkingIntegrity}{!verificationComplete && <small className="torrent-verification-speed" title="Taxa de verificação dos arquivos locais; pode incluir leitura em cache.">Leitura · {bytes(verificationSpeed)}/s{verificationReadBytes!==null&&` · ${bytes(verificationReadBytes)} lidos`}</small>}</span>
                        </span>
                      ) : (
                        <div className="dw-meta-stats">
                          <TorrentTelemetryTooltip label={t.torrentWindow.downloadSpeed} title="Velocidade de transferência" rows={[["Download",isActive?`${bytes(speed)}/s`:"0 B/s"],["Upload",isActive?`${bytes(uploadSpeed)}/s`:"0 B/s"]]}>
                            <Download aria-hidden="true" />
                            <span className="torrent-stat-value">{isActive ? `${bytes(speed)}/s` : "0 B/s"}</span>
                          </TorrentTelemetryTooltip>
                          <TorrentPeerStatus peers={peers} trackers={trackers} totalUploaded={bytes(totalUploaded)}/>
                          <TorrentTelemetryTooltip label={t.downloadWindow.remainingTime} title="Tempo restante" rows={[["Estimativa",isActive&&remaining>=0?formatRemaining(remaining):statusLabels[status]],["Falta baixar",total>0?bytes(Math.max(0,total-downloaded)):"—"]]} note="Estimativa baseada na velocidade atual; pode variar.">
                            <Clock3 aria-hidden="true" />
                            <span className="torrent-stat-value">{isActive?eta(remaining):statusLabels[status]}</span>
                          </TorrentTelemetryTooltip>
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
                      <button className="dw-btn-ghost dw-transport" disabled={busy || transportAction!==null} aria-busy={transportAction!==null} title={transportAction?transportLabel:isRunning ? t.downloads.pauseDownload : t.downloads.resumeDownload} aria-label={transportAction?transportLabel:isRunning ? t.downloads.pauseDownload : t.downloads.resumeDownload} onClick={() => void pauseResume()}>
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
                <div className={`dw-bar${isActive ? " dw-bar--active" : ""}${isChecking || verificationComplete ? " dw-bar--checking" : ""}${status === "paused" ? " dw-bar--paused" : ""}${isFailed ? " dw-bar--failed" : ""}`} role="progressbar" aria-valuenow={Math.round(progress)}>
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
          <div className="torrent-details-tabs nodrag" role="tablist" aria-label={t.torrentWindow.detailsTitle}>
            {(["download","peers"] as const).map(tab=><button key={tab} type="button" role="tab" id={`torrent-tab-${tab}`} aria-selected={detailsTab===tab} aria-controls={`torrent-panel-${tab}`} onClick={()=>setDetailsTab(tab)} onKeyDown={event=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){event.preventDefault();const next=event.key==="Home"?"download":event.key==="End"?"peers":tab==="download"?"peers":"download";setDetailsTab(next);document.getElementById(`torrent-tab-${next}`)?.focus();}}} tabIndex={detailsTab===tab?0:-1}>{tab==="download"?<Download size={14}/>:<Users size={14}/>} {tab==="download"?"Download":"Peers"}</button>)}
          </div>
            <button type="button" className="dw-details-close nodrag" aria-label={t.common.close} title={t.common.close} onClick={() => void appWindow.close()}><X size={16}/></button>
          </div>

          <div ref={detailsPanel} className="dw-details-compact-body torrent-details-panel" role="tabpanel" id={`torrent-panel-${detailsTab}`} aria-labelledby={`torrent-tab-${detailsTab}`}>

            {detailsTab==="peers" ? <div className="dw-details-card torrent-connection-details">
              <TorrentPeerDetails details={connectionDetails} error={connectionError} formatBytes={bytes}/>
            </div> : <div className="dw-details-card">
              <div className="dw-detail-row"><span className="dw-detail-label">Info hash</span><span className="dw-detail-val">{task.infoHash || "—"}</span></div>
              <div className="dw-detail-row"><span className="dw-detail-label">Recebido / total</span><span className="dw-detail-val">{bytes(downloaded)} / {bytes(total)}</span></div>
              <div className="dw-detail-row"><span className="dw-detail-label">Total enviado</span><span className="dw-detail-val">{bytes(totalUploaded)}</span></div>
              <div className="dw-detail-row"><span className="dw-detail-label">Ratio (enviado / recebido)</span><span className="dw-detail-val">{peerRatio(downloaded,totalUploaded)}</span></div>
              <div className="dw-detail-row"><span className="dw-detail-label">Tempo estimado</span><span className="dw-detail-val">{remaining>=0?formatRemaining(remaining):"—"}</span></div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">{t.torrentWindow.downloadSpeed}</span>
                <span className="dw-detail-val">{bytes(speed)}/s</span>
              </div>
              <div className="dw-detail-row"><span className="dw-detail-label">Escrita nos arquivos</span><span className="dw-detail-val">{isRunning&&diskWriteSpeed!==null?`${bytes(diskWriteSpeed)}/s`:"—"}</span></div>
              {isChecking&&<div className="dw-detail-row"><span className="dw-detail-label">Leitura na verificação</span><span className="dw-detail-val">{bytes(verificationSpeed)}/s</span></div>}
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
            </div>}
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






import { WindowSkeleton } from "../components/WindowSkeleton";
