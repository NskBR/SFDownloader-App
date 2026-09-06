import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  Chrome,
  Copy,
  Check,
  X,
  Puzzle,
  Flame,
  Package,
  ExternalLink,
  FolderOpen,
  AlertTriangle,
  CircleCheck,
} from "lucide-react";
import * as service from "../services/downloadService";
import { useTranslation } from "../i18n";

type Tab = "chromium" | "firefox";

export function BrowserIntegrationPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("chromium");
  const [chromiumFolder, setChromiumFolder] = useState("");
  const [firefoxFolder, setFirefoxFolder] = useState("");
  const [copied, setCopied] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<service.BrowserBridgeDiagnostics | null>(null);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    invoke<string>("get_extension_dir", { browser: "chromium" })
      .then(setChromiumFolder)
      .catch(console.error);
    invoke<string>("get_extension_dir", { browser: "firefox" })
      .then(setFirefoxFolder)
      .catch(console.error);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void service.browserExtensionDiagnostics().then((result) => {
        if (active) setBridgeStatus(result);
      }).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };
  const xpiFileName = "integration.xpi";
  const openXpi = () =>
    firefoxFolder && void service.openFile(`${firefoxFolder}/${xpiFileName}`).catch(console.error);
  const close = () => void appWindow.close();

  return (
    <div className="integr-layout">
      <header className="integr-header" data-tauri-drag-region>
        <div className="integr-title">
          <Puzzle size={18} />
          <div>
            <strong>{t.browserIntegration.title}</strong>
            <span>{t.browserIntegration.subtitle}</span>
          </div>
        </div>
        <button className="integr-close nodrag" type="button" onClick={close} title={t.common.close} aria-label={t.common.close}>
          <X size={16} />
        </button>
      </header>

      <div className="integr-tabs">
        <button
          className={`integr-tab ${tab === "chromium" ? "active" : ""}`}
          onClick={() => setTab("chromium")}
        >
          <Chrome size={15} />
          {t.browserIntegration.chromiumTab}
          <span className="integr-tab-sub">{t.browserIntegration.chromiumSub}</span>
        </button>
        <button
          className={`integr-tab ${tab === "firefox" ? "active" : ""}`}
          onClick={() => setTab("firefox")}
        >
          <Flame size={15} />
          {t.browserIntegration.firefoxTab}
          <span className="integr-tab-sub">{t.browserIntegration.firefoxSub}</span>
        </button>
      </div>

      <main className="integr-body">
        {bridgeStatus && (
          <div className={`integr-bridge-status ${bridgeStatus.error ? "error" : bridgeStatus.connected ? "connected" : "waiting"}`} role={bridgeStatus.error ? "alert" : "status"}>
            {bridgeStatus.error ? <AlertTriangle size={17} /> : <CircleCheck size={17} />}
            <div>
              <strong>
                {bridgeStatus.error
                  ? t.browserIntegration.bridgeErrorTitle
                  : bridgeStatus.connected
                    ? t.browserIntegration.bridgeConnected
                    : t.browserIntegration.bridgeWaiting}
              </strong>
              <span>{bridgeStatus.error ?? `${t.browserIntegration.localPort}: ${bridgeStatus.port}`}</span>
            </div>
          </div>
        )}
        {tab === "chromium" ? (
          <div className="integr-install">
            <div className="integr-drop" onMouseDown={(e) => { e.preventDefault(); chromiumFolder && void invoke("start_drag_folder", { path: chromiumFolder }).catch(console.error); }} title={t.browserIntegration.dragToChromiumTooltip}>
              <div className="integr-drop-icon">
                <Package size={26} />
              </div>
              <strong>{t.browserIntegration.dragToChromiumTitle}</strong>
              <span>
                {t.browserIntegration.dragToChromiumDesc}
              </span>
            </div>

            <ol className="integr-steps">
              <li>
                {t.browserIntegration.step1Chromium}
                <div className="integr-code">
                  <code>chrome://extensions</code>
                  <button className="integr-copy" onClick={() => copy("chrome://extensions")} title={t.common.copy}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              </li>
              <li>
                {t.browserIntegration.step2Chromium}
              </li>
              <li>
                {t.browserIntegration.step3Chromium}
              </li>
            </ol>
          </div>
        ) : (
          <div className="integr-install">
            <div
              className="integr-xpi"
              onClick={openXpi}
              onMouseDown={(e) => {
                e.preventDefault();
                firefoxFolder && void invoke("start_drag_folder", { path: `${firefoxFolder}/${xpiFileName}` }).catch(console.error);
              }}
              title={t.browserIntegration.dragToFirefoxTooltip}
            >
              <div className="integr-drop-icon">
                <Package size={26} />
              </div>
              <strong>{xpiFileName} {t.browserIntegration.dragOrClick}</strong>
              <span>
                {t.browserIntegration.dragToFirefoxDesc}
              </span>
            </div>

            <div className="integr-actions">
              <button className="primary-button" onClick={openXpi} title={t.browserIntegration.openInFirefox}>
                <ExternalLink size={15} />
                {t.browserIntegration.openInFirefox}
              </button>
              <button
                className="secondary-button"
                onClick={() => firefoxFolder && void service.revealInFolder(`${firefoxFolder}/${xpiFileName}`)}
                title={t.browserIntegration.openFolderInExplorer}
              >
                <FolderOpen size={15} />
                {t.browserIntegration.openFolderInExplorer}
              </button>
            </div>

            <ol className="integr-steps">
              <li>
                {t.browserIntegration.step1Firefox}
              </li>
              <li>
                {t.browserIntegration.step2Firefox}
              </li>
              <li>
                {t.browserIntegration.step3Firefox}
              </li>
            </ol>
          </div>
        )}
      </main>
    </div>
  );
}
