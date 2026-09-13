import { Minus, Square, X, Puzzle, Sparkles, Download, LoaderCircle, PackageCheck, Settings, BarChart3, Info } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { UpdateCheckResult, UpdateDownloadProgress } from "../../services/downloadService";
import * as downloadService from "../../services/downloadService";
import type { PageId } from "../../app/navigation";
import { useTranslation } from "../../i18n";
import logo from "../../assets/sf-logo.svg";
import { createPortal } from "react-dom";
import "../../styles/update.css";

const appWindow = getCurrentWindow();

const idleUpdateProgress: UpdateDownloadProgress = {
  status: "idle",
  downloaded_bytes: 0,
  total_bytes: null,
  bytes_per_second: 0,
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface TitleBarProps {
  updateInfo?: UpdateCheckResult | null;
  showFooterActionsInTitleBar?: boolean;
  activePage?: PageId;
  onNavigate?: (page: PageId) => void;
  onOpenHelp?: () => void;
}

export function TitleBar({
  updateInfo,
  showFooterActionsInTitleBar,
  activePage,
  onNavigate,
  onOpenHelp,
}: TitleBarProps) {
  const { t } = useTranslation();
  const [extensionConnected, setExtensionConnected] = useState<boolean | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress>(idleUpdateProgress);
  useEffect(() => {
    const updateStatus = () => {
      invoke<boolean>("browser_extension_status")
        .then(setExtensionConnected)
        .catch(() => setExtensionConnected(false));
    };
    updateStatus();
    const timer = setInterval(updateStatus, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!updateInfo?.available) return;
    let unlisten: (() => void) | undefined;
    void downloadService.updateDownloadStatus().then(setUpdateProgress).catch(console.error);
    void listen<UpdateDownloadProgress>("update-download-progress", ({ payload }) => {
      setUpdateProgress(payload);
    }).then((dispose) => { unlisten = dispose; }).catch(console.error);
    return () => unlisten?.();
  }, [updateInfo?.available]);

  const startUpdateDownload = () => {
    if (!updateInfo?.installer_url || !updateInfo.installer_name) {
      void downloadService.openUrl(updateInfo?.release_url ?? "https://github.com/NskBR/SFDownloader-App/releases");
      return;
    }
    setUpdateProgress({ ...idleUpdateProgress, status: "downloading" });
    void downloadService.downloadUpdate(updateInfo.installer_url, updateInfo.installer_name).catch((error) => {
      setUpdateProgress({ ...idleUpdateProgress, status: "failed", message: String(error) });
    });
  };

  const percentage = updateProgress.total_bytes && updateProgress.total_bytes > 0
    ? Math.min(100, Math.round((updateProgress.downloaded_bytes / updateProgress.total_bytes) * 100))
    : null;

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      onDoubleClick={() => void appWindow.toggleMaximize()}
    >
      {(["downloading", "preparing", "installing", "cancelling", "failed"].includes(updateProgress.status)) && createPortal(
        <div className="update-overlay">
          <section className="update-dialog" role="dialog" aria-modal="true" aria-label="Atualização do aplicativo">
            <div className="update-logo">
              <svg viewBox="0 0 100 100" aria-hidden="true" className={percentage === null || updateProgress.status !== "downloading" ? "update-ring--busy" : ""}>
                <circle cx="50" cy="50" r="46" className="update-ring-track" />
                <circle cx="50" cy="50" r="46" pathLength="100" className="update-ring-progress" strokeDasharray={`${updateProgress.status === "downloading" && percentage !== null ? percentage : 24} 100`} />
              </svg>
              <img src={logo} alt="" draggable={false} />
            </div>
            <h2>{updateProgress.status === "failed" ? "Não foi possível atualizar" : updateProgress.status === "downloading" ? "Baixando atualização…" : updateProgress.status === "cancelling" ? "Cancelando…" : "Preparando atualização…"}</h2>
            <p role="status">{updateProgress.status === "failed" ? updateProgress.message : updateProgress.status === "downloading" ? "A instalação começará automaticamente." : "Verificando o instalador e salvando seus downloads."}</p>
            <progress max={100} value={updateProgress.status === "downloading" ? percentage ?? undefined : undefined} aria-label="Progresso da atualização" />
            {updateProgress.status === "downloading" && <small>{percentage === null ? formatBytes(updateProgress.downloaded_bytes) : `${percentage}% · ${formatBytes(updateProgress.downloaded_bytes)}`}</small>}
            {updateProgress.status === "downloading" && <button onClick={() => void downloadService.cancelUpdateDownload()}>Cancelar</button>}
            {updateProgress.status === "failed" && <button autoFocus onClick={() => setUpdateProgress(idleUpdateProgress)}>Fechar</button>}
          </section>
        </div>, document.body)}
      <div className="titlebar-side" data-tauri-drag-region>
        {updateInfo?.available && (updateProgress.status === "idle" || updateProgress.status === "failed") && (
          <button className="nodrag titlebar-update-badge" onClick={startUpdateDownload} title={updateInfo.installer_url ? t.titlebar.downloadUpdate : t.titlebar.locateUpdateInstaller}>
            <Sparkles size={12} className="icon-pulse" />
            <span>{updateProgress.status === "failed" ? t.titlebar.retryUpdateDownload : t.titlebar.downloadUpdate}</span>
            <Download size={12} />
          </button>
        )}
        {updateInfo?.available && (updateProgress.status === "downloading" || updateProgress.status === "cancelling") && (
          <div className="nodrag titlebar-update-download" title={updateProgress.message ?? t.titlebar.downloadingUpdate}>
            <LoaderCircle size={13} className="titlebar-update-spinner" />
            <div className="titlebar-update-download__body">
              <span>{updateProgress.status === "cancelling" ? t.titlebar.cancellingUpdate : percentage === null ? t.titlebar.downloadingUpdate : `${t.titlebar.downloadingUpdate.replace("…", "")} ${percentage}%`}</span>
              <div className="titlebar-update-progress" role="progressbar" aria-label={t.titlebar.updateDownloadProgress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage ?? undefined}>
                <i style={{ width: `${percentage ?? 8}%` }} />
              </div>
              <small>{formatBytes(updateProgress.downloaded_bytes)}{updateProgress.total_bytes ? ` de ${formatBytes(updateProgress.total_bytes)}` : ""}</small>
            </div>
            {updateProgress.status === "downloading" && <button className="titlebar-update-cancel" onClick={() => void downloadService.cancelUpdateDownload()} title={t.titlebar.cancelUpdateDownload} aria-label={t.titlebar.cancelUpdateDownload}><X size={13} /></button>}
          </div>
        )}
        {updateInfo?.available && updateProgress.status === "ready" && (
          <button className="nodrag titlebar-update-badge titlebar-update-badge--install" onClick={() => void downloadService.installDownloadedUpdate().catch(console.error)} title={t.titlebar.installUpdateTooltip}>
            <PackageCheck size={13} />
            <span>{t.titlebar.installUpdate}</span>
          </button>
        )}
      </div>
      <div className="titlebar-center" data-tauri-drag-region>
        <strong>{t.titlebar.title}</strong>
      </div>
      <div className="titlebar-side titlebar-actions" data-tauri-drag-region>
        {showFooterActionsInTitleBar && (
          <div className="nodrag titlebar-footer-actions">
            <button
              className={`titlebar-theme-btn ${activePage === "settings" ? "active" : ""}`}
              onClick={() => onNavigate?.("settings")}
              title={t.sidebar.settings}
              aria-label={t.sidebar.settings}
            >
              <Settings size={16} />
            </button>
            <button
              className={`titlebar-theme-btn ${activePage === "metrics" ? "active" : ""}`}
              onClick={() => onNavigate?.("metrics")}
              title={t.sidebar.metrics}
              aria-label={t.sidebar.metrics}
            >
              <BarChart3 size={16} />
            </button>
            <button
              className="titlebar-theme-btn"
              onClick={() => onOpenHelp?.()}
              title={t.sidebar.about}
              aria-label={t.sidebar.about}
            >
              <Info size={16} />
            </button>
          </div>
        )}

        <div className="nodrag titlebar-integration">
          <button
            className="titlebar-theme-btn"
            onClick={() => void invoke("open_browser_integration_window").catch(console.error)}
            title={`${t.titlebar.browserIntegration} — ${extensionConnected ? t.titlebar.extensionConnected : t.titlebar.extensionDisconnected}`}
            aria-label={`${t.titlebar.browserIntegration} — ${extensionConnected ? t.titlebar.extensionConnected : t.titlebar.extensionDisconnected}`}
          >
            <Puzzle size={16} />
            <span
              className={`sidebar-status-dot ${extensionConnected ? "connected" : "disconnected"}`}
              aria-hidden="true"
            />
          </button>
        </div>
        <div className="window-controls nodrag">
          <button
            aria-label={t.titlebar.minimizeTooltip}
            title={t.titlebar.minimizeTooltip}
            onClick={() => void appWindow.minimize()}
          >
            <Minus size={17} />
          </button>
          <button
            aria-label={t.titlebar.maximizeTooltip}
            title={t.titlebar.maximizeTooltip}
            onClick={() => void appWindow.toggleMaximize()}
          >
            <Square size={14} />
          </button>
          <button
            className="window-close"
            aria-label={t.titlebar.closeTooltip}
            title={t.titlebar.closeTooltip}
            onClick={() => void appWindow.close()}
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
