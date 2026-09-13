import {
  Check,
  Copy,
  Archive,
  Download,
  FileText,
  Grid2X2,
  Menu,
  Music2,
  Settings,
  Video,
  X,
  ChevronDown,
  ChevronRight,
  Puzzle,
  Info,
  MoreHorizontal,
  BarChart3,
  Magnet,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from "react";
import type { PageId } from "../../app/navigation";
import type { DownloadTask } from "../../domain/download";
import * as downloadService from "../../services/downloadService";
import { TitleBar } from "./TitleBar";
import { invoke } from "@tauri-apps/api/core";
import logo from "../../assets/sf-logo.svg";
import { version } from "../../../package.json";
import { useTranslation } from "../../i18n";

interface Props extends PropsWithChildren {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  sidebarAnimation: boolean;
  updateInfo?: downloadService.UpdateCheckResult | null;
}

const groups = {
  documents: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"],
  music: ["mp3", "wav", "flac", "ogg", "m4a", "aac"],
  videos: ["mp4", "mkv", "mov", "avi", "webm"],
  archives: ["zip", "rar", "7z", "tar", "gz"],
  applications: ["exe", "msi", "apk", "bat", "appimage", "dmg", "pkg"],
};

const MAX_EXPANDED_WIDTH = 240;
const DEFAULT_WIDTH = MAX_EXPANDED_WIDTH;
const COMPACT_WIDTH = 68;

export function AppShell({
  activePage,
  onNavigate,
  sidebarAnimation,
  updateInfo,
  children,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copiedDiscord, setCopiedDiscord] = useState(false);
  const copyDiscord = () => {
    navigator.clipboard.writeText("nskbr1").then(() => {
      setCopiedDiscord(true);
      setTimeout(() => setCopiedDiscord(false), 2000);
    });
  };
  const [typesOpen, setTypesOpen] = useState(true);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState<{ top: number; left: number; width: number; height: number; visible: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    visible: false,
  });

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("sf_sidebar_width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed)) {
          if (parsed <= 90) return COMPACT_WIDTH;
          return Math.min(Math.max(parsed, 140), MAX_EXPANDED_WIDTH);
        }
      }
    } catch {}
    return DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const isCompact = sidebarWidth <= 90;

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const sidebar = sidebarRef.current;
      if (!sidebar) return;
      const baseLeft = sidebar.getBoundingClientRect().left;
      const rawWidth = e.clientX - baseLeft;

      let finalWidth: number;
      if (rawWidth < 115) {
        finalWidth = COMPACT_WIDTH;
      } else {
        finalWidth = Math.min(Math.max(rawWidth, 140), MAX_EXPANDED_WIDTH);
      }

      setSidebarWidth(finalWidth);
      localStorage.setItem("sf_sidebar_width", finalWidth.toString());
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const toggleSidebarWidth = () => {
    const targetWidth = isCompact ? DEFAULT_WIDTH : COMPACT_WIDTH;
    setSidebarWidth(targetWidth);
    localStorage.setItem("sf_sidebar_width", targetWidth.toString());
  };

  useEffect(() => {
    const update = () => {
      downloadService.listDownloads()
        .then(setDownloads)
        .catch(console.error);
    };
    update();
    const timer = setInterval(update, 2000);
    return () => clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const updatePosition = () => {
      const active =
        sidebar.querySelector<HTMLElement>(".navigation__item--active") ??
        sidebar.querySelector<HTMLElement>(".sidebar-footer-btn.active");
      if (!active) {
        setIndicator((prev) => ({ ...prev, visible: false }));
        return;
      }
      const base = sidebar.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      setIndicator({
        top: rect.top - base.top,
        left: rect.left - base.left,
        width: rect.width,
        height: rect.height,
        visible: true,
      });
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(sidebar);

    const active =
      sidebar.querySelector<HTMLElement>(".navigation__item--active") ??
      sidebar.querySelector<HTMLElement>(".sidebar-footer-btn.active");
    if (active) {
      resizeObserver.observe(active);
    }

    return () => {
      window.removeEventListener("resize", updatePosition);
      resizeObserver.disconnect();
    };
  }, [activePage, typesOpen, sidebarWidth, isCompact]);

  const navigate = (page: PageId) => {
    onNavigate(page);
    setOpen(false);
  };

  const openExternal = (url: string) => {
    void invoke("open_url", { url }).catch(console.error);
  };

  // Calculate dynamic counts
  const allCount = downloads.length;
  const torrentsCount = downloads.filter(d => d.downloadType === "torrent" || d.originalUrl.startsWith("magnet:") || d.extension?.toLowerCase() === "torrent").length;
  const archivesCount = downloads.filter(d => groups.archives.includes(d.extension?.toLowerCase() || "")).length;
  const documentsCount = downloads.filter(d => groups.documents.includes(d.extension?.toLowerCase() || "")).length;
  const videosCount = downloads.filter(d => groups.videos.includes(d.extension?.toLowerCase() || "")).length;
  const musicCount = downloads.filter(d => groups.music.includes(d.extension?.toLowerCase() || "")).length;
  const applicationsCount = downloads.filter(d => groups.applications.includes(d.extension?.toLowerCase() || "")).length;
  const othersCount = downloads.filter(d => {
    const ext = d.extension?.toLowerCase() || "";
    return !groups.archives.includes(ext) &&
           !groups.documents.includes(ext) &&
           !groups.videos.includes(ext) &&
           !groups.music.includes(ext) &&
           !groups.applications.includes(ext);
  }).length;

  const typeItems = [
    { id: "archives" as PageId, label: t.sidebar.archives, icon: Archive, count: archivesCount },
    { id: "torrents" as PageId, label: t.sidebar.torrents, icon: Magnet, count: torrentsCount },
    { id: "documents" as PageId, label: t.sidebar.documents, icon: FileText, count: documentsCount },
    { id: "videos" as PageId, label: t.sidebar.videos, icon: Video, count: videosCount },
    { id: "music" as PageId, label: t.sidebar.music, icon: Music2, count: musicCount },
    { id: "applications" as PageId, label: t.sidebar.applications, icon: Grid2X2, count: applicationsCount },
    { id: "others" as PageId, label: t.sidebar.others, icon: MoreHorizontal, count: othersCount },
  ];

  return (
    <div className="window-frame">
      <TitleBar
        updateInfo={updateInfo}
        showFooterActionsInTitleBar={isCompact}
        activePage={activePage}
        onNavigate={navigate}
        onOpenHelp={() => setHelpOpen(true)}
      />
      <div className="app-shell">
        <button
          className="mobile-menu"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu size={21} />
        </button>
        {open && (
          <button
            className="sidebar-backdrop"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          />
        )}
        <aside
          className={`sidebar ${isCompact ? "sidebar--compact" : ""} ${open ? "sidebar--open" : ""} ${sidebarAnimation !== false ? "" : "sidebar--no-animation"} ${isResizing ? "sidebar--resizing" : ""}`}
          ref={sidebarRef}
          style={{ width: `${sidebarWidth}px` }}
        >
          <span
            className="sidebar-indicator"
            style={{
              transform: `translate(${indicator.left}px, ${indicator.top}px)`,
              width: indicator.width,
              height: indicator.height,
              opacity: indicator.visible ? 1 : 0,
            }}
            aria-hidden="true"
          />
          <div className="brand">
            {isCompact ? (
              <img className="brand__logo" src={logo} alt="SF Downloader" draggable={false} />
            ) : (
              <div className="brand__identity">
                <img className="brand__logo" src={logo} alt="SF Downloader" draggable={false} />
              </div>
            )}
          </div>
          <nav className="navigation sidebar-nav" aria-label="Navegação principal">
            <button
              className={`navigation__item ${activePage === "downloads" ? "navigation__item--active" : ""}`}
              onClick={() => navigate("downloads")}
              title={isCompact ? `${t.sidebar.all} (${allCount})` : undefined}
            >
              <div>
                <span className="navigation__icon"><Download /></span>
                <span>{t.sidebar.all}</span>
              </div>
              <span className="counter-badge">{allCount}</span>
            </button>

            <div className="navigation__types">
              <button
                className={`navigation__group ${isCompact ? "navigation__group--compact" : ""}`}
                onClick={() => setTypesOpen((value) => !value)}
                aria-expanded={typesOpen}
                aria-hidden={isCompact}
                tabIndex={isCompact ? -1 : undefined}
              >
                <span className="navigation__group-label">
                  {typesOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  {t.sidebar.fileTypes}
                </span>
              </button>

              {(typesOpen || isCompact) && typeItems.map((item) => {
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    className={`navigation__item navigation__item--child ${isActive ? "navigation__item--active" : ""}`}
                    onClick={() => navigate(item.id)}
                    title={isCompact ? `${item.label} (${item.count})` : undefined}
                  >
                    <div>
                      <span className="navigation__icon"><item.icon /></span>
                      <span>{item.label}</span>
                    </div>
                    <span className="counter-badge">{item.count}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {!isCompact && (
            <div className="sidebar-actions">
              <div className="sidebar-footer-row">
                <button
                  className={`sidebar-footer-btn ${activePage === "settings" ? "active" : ""}`}
                  onClick={() => navigate("settings")}
                  title={t.sidebar.settings}
                >
                  <Settings size={18} />
                </button>

                <button
                  className={`sidebar-footer-btn ${activePage === "metrics" ? "active" : ""}`}
                  onClick={() => navigate("metrics")}
                  title={t.sidebar.metrics}
                >
                  <BarChart3 size={18} />
                </button>

                <button
                  className="sidebar-footer-btn"
                  onClick={() => setHelpOpen(true)}
                  title={t.sidebar.about}
                >
                  <Info size={18} />
                </button>
              </div>
            </div>
          )}

          <div
            className="sidebar-resizer"
            onMouseDown={startResizing}
            onDoubleClick={toggleSidebarWidth}
            title={t.sidebar.collapse}
          />
        </aside>

        <main className="main-content">
          <div key={activePage} className="page-transition">{children}</div>
        </main>
      </div>

      {helpOpen && (
        <div className="help-overlay" onMouseDown={() => setHelpOpen(false)}>
          <section
            className="help-dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div className="help-brand">
                <img className="help-logo" src={logo} alt="SF Downloader" />
                <div>
                  <span>SF DOWNLOADER</span>
                  <h2>{t.about.title}</h2>
                </div>
              </div>
              <button onClick={() => setHelpOpen(false)} aria-label={t.common.close}>
                <X />
              </button>
            </header>

            <p className="help-intro">
              {t.about.description}
            </p>

            <ul className="help-features">
              <li><Download size={15} /> {t.about.featureSegmented}</li>
              <li><Archive size={15} /> {t.about.featureAutoExtract}</li>
              <li><Grid2X2 size={15} /> {t.about.featureCategories}</li>
              <li><Puzzle size={15} /> {t.about.featureBrowserExt}</li>
            </ul>

            <div className="help-meta">
              <div className="help-meta-row"><span>{t.about.version}</span><b>v{version}</b></div>
              <div className="help-meta-row">
                <span>{t.about.contactDiscord}</span>
                <button
                  className="help-contact-btn"
                  onClick={copyDiscord}
                  title="Discord"
                >
                  <b>nskbr1</b>
                  {copiedDiscord ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <div className="help-meta-row"><span>{t.about.technology}</span><b>Tauri · React · Rust</b></div>
              <div className="help-meta-row">
                <span>{t.about.releaseStatus}</span>
                <b>{t.about.privateBetaFuture}</b>
              </div>
            </div>

            <footer>
              <button
                className="help-link"
                onClick={() => openExternal("https://github.com/NskBR/SFDownloader-App")}
              >
                {t.about.githubRepo}
              </button>
              <button onClick={() => setHelpOpen(false)}>{t.common.close}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
