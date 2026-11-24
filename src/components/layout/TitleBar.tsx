import {checkExtensionVersion} from "../../services/extensionVersionCheck";
import {WindowControlSymbols} from "../ui/WindowControlSymbols";
import {UpdateDownloadPanel} from "../UpdateDownloadPanel";
import {UpdateReleaseNotes} from "../UpdateReleaseNotes";
import { AlertTriangle, Minus, Square, Maximize, X, Puzzle, Sparkles, Download, LoaderCircle, PackageCheck, Settings, BarChart3, Info } from "../icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { UpdateCheckResult, UpdateDownloadProgress } from "../../services/downloadService";
import * as downloadService from "../../services/downloadService";
import type { PageId } from "../../app/navigation";
import { useTranslation } from "../../i18n";
import logo from "../../assets/sf-logo.svg";
import { createPortal } from "react-dom";
import "../../styles/update.css";

const appWindow = getCurrentWindow();
const subscribeControls=(callback:()=>void)=>{window.addEventListener('sf-window-controls',callback);return()=>window.removeEventListener('sf-window-controls',callback);};

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
  navigation?:ReactNode;
  updateInfo?: UpdateCheckResult | null;
  showFooterActionsInTitleBar?: boolean;
  showBrandInTitleBar?:boolean;
  activePage?: PageId;
  onNavigate?: (page: PageId) => void;
  onOpenHelp?: () => void;
}

export function TitleBar({
  updateInfo,
  navigation,
  showFooterActionsInTitleBar,
  showBrandInTitleBar,
  activePage,
  onNavigate,
  onOpenHelp,
}: TitleBarProps) {
  const { t } = useTranslation();
  const appleControls=useSyncExternalStore(subscribeControls,()=>document.documentElement.dataset.windowControls==='apple');
  const [showReleaseNotes,setShowReleaseNotes]=useState(false);
  const [previewUpdate,setPreviewUpdate]=useState(import.meta.env.DEV);
  const [previewTransfer,setPreviewTransfer]=useState(false);
  useEffect(()=>{
    const open=()=>setShowReleaseNotes(true);
    window.addEventListener("sf-show-update-notes",open);
    return()=>window.removeEventListener("sf-show-update-notes",open);
  },[]);
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      try {
        const maximized = await appWindow.isMaximized();
        if (!disposed && current === revision) document.documentElement.dataset.windowMaximized = String(maximized);
      } catch { /* Keep the normal frame if window state is unavailable. */ }
    };
    void refresh();
    const listener = appWindow.onResized(() => { void refresh(); });
    return () => {
      disposed = true;
      void listener.then(unlisten => unlisten()).catch(() => {});
      delete document.documentElement.dataset.windowMaximized;
    };
  }, []);
  const [extensionWarning,setExtensionWarning]=useState("");
  const [extensionConnected, setExtensionConnected] = useState<boolean | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress>(idleUpdateProgress);
  useEffect(() => {
    let active=true,revision=0;
    const updateStatus = async () => {
      const current=++revision;
      try {
        const connected=await downloadService.browserExtensionConnected();
        const checked=connected?await checkExtensionVersion():null;
        if(!active||current!==revision)return;
        setExtensionConnected(connected);
        setExtensionWarning(checked?.outdated?`Extensão ${checked.installedVersion} desatualizada. Disponível: ${checked.availableVersion}.`:'');
      }catch{/* A failed IPC request must not replace a successful version check. */}
    };
    void updateStatus();
    const timer = setInterval(()=>void updateStatus(), 3000);
    return () => {active=false;clearInterval(timer);};
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

  const updateTotal = updateProgress.total_bytes && updateProgress.total_bytes > 0 ? updateProgress.total_bytes : updateInfo?.installer_size && updateInfo.installer_size > 0 ? updateInfo.installer_size : null;
  const percentage = updateTotal
    ? Math.min(100, Math.round((updateProgress.downloaded_bytes / updateTotal) * 100))
    : null;

  const updateControls = <>
    {previewUpdate && !updateInfo?.available && <div className="nodrag titlebar-update-preview" onDoubleClick={event=>event.stopPropagation()}>
      <button type="button" className="titlebar-update-badge" title="Simulação visual: nenhum download será iniciado" onClick={()=>setPreviewTransfer(true)}>
        <Sparkles size={12}/><span>{t.titlebar.downloadUpdate}</span><Download size={12}/>
      </button>
      <button type="button" className="titlebar-theme-btn" title="Encerrar simulação" aria-label="Encerrar simulação" onClick={()=>setPreviewUpdate(false)}><X size={12}/></button>
    </div>}
        {updateInfo?.available && (updateProgress.status === "idle" || updateProgress.status === "failed") && (
          <button className="nodrag titlebar-update-badge" onClick={()=>setShowReleaseNotes(true)} title={updateInfo.installer_url ? t.titlebar.downloadUpdate : t.titlebar.locateUpdateInstaller}>
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
  </>;

  const windowControls = (        <div className="window-controls nodrag" onDoubleClick={event=>event.stopPropagation()}>
{appleControls && <>          <button
            className="window-close"
            aria-label={t.titlebar.closeTooltip}
            title={t.titlebar.closeTooltip}
            onClick={() => void appWindow.close()}
          >
            <X size={18} /><WindowControlSymbols index={2}/>
          </button>
          <button
            aria-label={t.titlebar.minimizeTooltip}
            title={t.titlebar.minimizeTooltip}
            onClick={() => void appWindow.minimize()}
          >
            <Minus size={17} /><WindowControlSymbols index={0}/>
          </button>
          <button
            aria-label={t.titlebar.maximizeTooltip}
            title={t.titlebar.maximizeTooltip}
            onClick={() => void appWindow.toggleMaximize()}
          >
            <Square size={14} className="window-maximize-standard" /><Maximize size={13} className="window-maximize-corners" /><WindowControlSymbols index={1}/>
          </button>
</>}{!appleControls && <>          <button
            aria-label={t.titlebar.minimizeTooltip}
            title={t.titlebar.minimizeTooltip}
            onClick={() => void appWindow.minimize()}
          >
            <Minus size={17} /><WindowControlSymbols index={0}/>
          </button>
          <button
            aria-label={t.titlebar.maximizeTooltip}
            title={t.titlebar.maximizeTooltip}
            onClick={() => void appWindow.toggleMaximize()}
          >
            <Square size={14} className="window-maximize-standard" /><Maximize size={13} className="window-maximize-corners" /><WindowControlSymbols index={1}/>
          </button>
          <button
            className="window-close"
            aria-label={t.titlebar.closeTooltip}
            title={t.titlebar.closeTooltip}
            onClick={() => void appWindow.close()}
          >
            <X size={18} /><WindowControlSymbols index={2}/>
          </button>
</>}
        </div>);

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      onDoubleClick={() => void appWindow.toggleMaximize()}
    >
      {import.meta.env.DEV && previewTransfer && createPortal(<div className="update-overlay"><UpdateDownloadPanel preview percentage={62} downloaded={Math.round(128*1024**2*.62)} total={128*1024**2} speed={4.8*1024**2} onCancel={()=>setPreviewTransfer(false)}/></div>,document.body)}
      {showReleaseNotes && updateInfo?.available && <UpdateReleaseNotes update={updateInfo} onCancel={()=>setShowReleaseNotes(false)} onConfirm={()=>{setShowReleaseNotes(false);startUpdateDownload();}}/>}
      {(["downloading", "preparing", "installing", "cancelling", "failed"].includes(updateProgress.status)) && createPortal(
        <div className="update-overlay">
          {updateProgress.status === "downloading" ? <UpdateDownloadPanel percentage={percentage} downloaded={updateProgress.downloaded_bytes} total={updateTotal} speed={updateProgress.bytes_per_second} onCancel={()=>void downloadService.cancelUpdateDownload()}/> : <section className="update-dialog" role="dialog" aria-modal="true" aria-label="Atualização do aplicativo">
            <div className="update-logo">
              <svg viewBox="0 0 100 100" aria-hidden="true" className="update-ring--busy">
                <circle cx="50" cy="50" r="46" className="update-ring-track" />
                <circle cx="50" cy="50" r="46" pathLength="100" className="update-ring-progress" strokeDasharray="24 100" />
              </svg>
              <img src={logo} alt="" draggable={false} />
            </div>
            <h2>{updateProgress.status === "failed" ? "Não foi possível atualizar" : updateProgress.status === "cancelling" ? "Cancelando…" : "Preparando atualização…"}</h2>
            <p role="status">{updateProgress.status === "failed" ? updateProgress.message : "Verificando o instalador e salvando seus downloads."}</p>
            <progress max={100} aria-label="Progresso da atualização" />
            {updateProgress.status === "failed" && <button autoFocus onClick={() => setUpdateProgress(idleUpdateProgress)}>Fechar</button>}
          </section>}
        </div>, document.body)}
      <div className="titlebar-side" data-tauri-drag-region>
        {appleControls && windowControls}
        {showBrandInTitleBar && <img className="titlebar-brand-logo" src={logo} alt="SF Downloader" draggable={false}/>}
        {navigation}
        {!navigation && updateControls}
      </div>
      <div className="titlebar-center" data-tauri-drag-region>
        <strong>{t.titlebar.title}</strong>
      </div>
      <div className="titlebar-side titlebar-actions" data-tauri-drag-region>
        {navigation && updateControls}
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
            className={`titlebar-theme-btn titlebar-extension-button ${extensionWarning?"extension-needs-update":""}`}
            onClick={() => window.dispatchEvent(new Event("sf-open-integration"))}
            title={extensionWarning || `${t.titlebar.browserIntegration} — ${extensionConnected ? t.titlebar.extensionConnected : t.titlebar.extensionDisconnected}`}
            aria-label={`${t.titlebar.browserIntegration} — ${extensionConnected ? t.titlebar.extensionConnected : t.titlebar.extensionDisconnected}`}
          >
            <Puzzle size={16} />
            <span className="titlebar-extension-label">{t.titlebar.extensionLabel}</span>{extensionWarning&&<AlertTriangle size={13} className="extension-version-warning"/>}
            <span
              className={`sidebar-status-dot ${extensionConnected ? "connected" : "disconnected"}`}
              aria-hidden="true"
            />
          </button>
        </div>
        {!appleControls && windowControls}
      </div>
    </header>
  );
}
