import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "../components/layout/AppShell";
import { SettingsPage } from "../pages/SettingsPage";
import { MetricsPage } from "../pages/MetricsPage";
import { DownloadsPage } from "../pages/DownloadsPage";
import { ProfilePage } from "../pages/ProfilePage";
import { useSettings } from "../hooks/useSettings";
import { isPageId, type PageId } from "./navigation";
import * as downloadService from "../services/downloadService";
import { applyThemeSettings } from "../services/theme";
import { FloatingAiWidget } from "../components/ui/FloatingAiWidget";
import { UpdateBanner } from "../components/UpdateBanner";
import { SplashScreen } from "../components/ui/SplashScreen";
interface BrowserDownloadRequest { requestId:string;url:string;fileName:string|null;fileSize:number|null;mimeType:string|null }
const categoryPages:PageId[]=["downloads","active","completed","documents","music","videos","archives","applications","torrents","others"];
const normalizePage=(page:PageId):PageId=>({home:"downloads",organization:"settings",active:"downloads",completed:"downloads"} as Partial<Record<PageId,PageId>>)[page]??page;
const pageFromHash = (): PageId => { const hash = location.hash.slice(1); if(isPageId(hash))return normalizePage(hash); const saved=localStorage.getItem("sf-downloader.last-page")??""; return isPageId(saved)?normalizePage(saved):"active"; };
export function App() {
  const [activePage, setActivePage] = useState<PageId>(pageFromHash);
  const previousPage=useRef<PageId>("active");
  const { settings, persist, saved } = useSettings();
  const processedLinks=useRef(new Set<string>(JSON.parse(sessionStorage.getItem("sf-downloader.processed-links")||"[]")));
  const processedTorrentPaths=useRef(new Set<string>());
  const [updateInfo, setUpdateInfo] = useState<downloadService.UpdateCheckResult | null>(null);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const revealMainAfterSplashPaint = useCallback(() => {
    void invoke<boolean>("is_autostart_boot")
      .then((isAutostart) => {
        if (!isAutostart) return invoke<void>("show_ready_window");
        return undefined;
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashFading(true);
      const removeTimer = setTimeout(() => {
        setSplashVisible(false);
      }, 450);
      return () => clearTimeout(removeTimer);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    void downloadService
      .checkForUpdates()
      .then((res) => {
        if (res && res.available) {
          setUpdateInfo(res);
        }
      })
      .catch((err) => console.log("[UPDATER] Erro ao checar atualizações:", err));
  }, []);

  useEffect(()=>{const media=matchMedia("(prefers-color-scheme: dark)");const apply=()=>{document.documentElement.dataset.theme=settings.theme==="system"?(media.matches?"midnight":"light"):settings.theme;document.documentElement.lang=settings.language};apply();media.addEventListener("change",apply);return()=>media.removeEventListener("change",apply)},[settings.theme,settings.language]);
  useEffect(()=>{
    applyThemeSettings(settings);
  },[settings.accentColor, settings.appColor, settings.interfaceGradient]);
  useEffect(() => {
    void invoke("cache_theme_settings", { themeSettings: settings }).catch(console.error);
  }, [settings]);
  useEffect(()=>{void getCurrentWebview().setZoom(settings.uiScale).catch(console.error)},[settings.uiScale]);
  useEffect(() => { const handler = () => setActivePage(pageFromHash()); addEventListener("hashchange", handler); return () => removeEventListener("hashchange", handler); }, []);
  const navigate = (page: PageId) => { if(page!=="settings")previousPage.current=page;localStorage.setItem("sf-downloader.last-page",page); location.hash = page; setActivePage(page); };
  const openTorrentFile = useCallback((rawPath: string) => {
    const path = rawPath.trim();
    if (!path || !path.toLowerCase().endsWith(".torrent") || processedTorrentPaths.current.has(path)) return;
    processedTorrentPaths.current.add(path);
    window.setTimeout(() => processedTorrentPaths.current.delete(path), 1_000);
    localStorage.setItem("sf-downloader.pending-browser-url", path);
    navigate("active");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("sf-download-request", { detail: path })), 0);
  }, []);
  useEffect(()=>{let dispose:(()=>void)|undefined;const receive=(urls:string[])=>{for(const raw of urls){if(processedLinks.current.has(raw))continue;try{const link=new URL(raw);const target=link.searchParams.get("url");if(link.protocol!=="sfdownloader:"||link.hostname!=="download"||!target||!/^(https?:\/\/|magnet:\?)/i.test(target))continue;processedLinks.current.add(raw);sessionStorage.setItem("sf-downloader.processed-links",JSON.stringify([...processedLinks.current]));localStorage.setItem("sf-downloader.pending-browser-url",target);navigate("active");window.setTimeout(()=>window.dispatchEvent(new CustomEvent("sf-download-request",{detail:target})),0)}catch{continue}}};void getCurrent().then(urls=>{if(urls)receive(urls)});void onOpenUrl(receive).then(unlisten=>{dispose=unlisten});return()=>dispose?.()},[]);
  useEffect(() => {
    let disposeDrop: (() => void) | undefined;
    let disposeOpen: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type !== "drop") return;
      const torrent = payload.paths.find((path) => path.toLowerCase().endsWith(".torrent"));
      if (torrent) openTorrentFile(torrent);
    }).then((unlisten) => { disposeDrop = unlisten; });
    void listen<string>("torrent-file-open", ({ payload }) => openTorrentFile(payload))
      .then((unlisten) => { disposeOpen = unlisten; });
    void invoke<string[]>("take_pending_torrent_files")
      .then((paths) => paths.forEach(openTorrentFile))
      .catch(console.error);
    return () => { disposeDrop?.(); disposeOpen?.(); };
  }, [openTorrentFile]);
  useEffect(()=>{let dispose:(()=>void)|undefined;void listen<BrowserDownloadRequest>("browser-download-request",async({payload})=>{if(!downloadService.shouldOpenConfirmation(payload.url))return;const extension=payload.fileName?.split(".").pop()?.toLowerCase()||null;const token=crypto.randomUUID();localStorage.setItem(`sf-downloader.confirmation-${token}`,JSON.stringify({url:payload.url,destination:settings.rootDownloadFolder,themeSettings:settings,requestId:payload.requestId,preview:{url:payload.url,fileName:payload.fileName||"download",fileSize:payload.fileSize,mimeType:payload.mimeType,extension}}));navigate("active");await downloadService.openDownloadConfirmation(token,payload.url)}).then(unlisten=>{dispose=unlisten});return()=>dispose?.()},[settings]);
  const content = activePage === "settings" ? <SettingsPage settings={settings} onSave={persist} saved={saved} onBack={()=>navigate(previousPage.current)} />
    : activePage === "profile" ? <ProfilePage />
    : activePage === "metrics" ? <MetricsPage />
    : <DownloadsPage settings={settings} onSave={persist} filter={categoryPages.includes(activePage)?activePage:"active"} />;
   return (
     <>
       {splashVisible && <SplashScreen fade={splashFading} onReady={revealMainAfterSplashPaint} />}
       <AppShell activePage={activePage} onNavigate={navigate} sidebarAnimation={settings.sidebarAnimation} updateInfo={updateInfo}>{content}</AppShell>
       {!["settings", "metrics", "profile"].includes(activePage) && (settings.showAiAssistant ?? false) && <FloatingAiWidget />}
     </>
   );
}
