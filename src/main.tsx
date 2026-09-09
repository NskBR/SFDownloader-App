import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { App } from "./app/App";
import { ConfirmationPage } from "./pages/ConfirmationPage";
import { DownloadWindow } from "./pages/DownloadWindow";
import { TorrentConfirmationPage } from "./pages/TorrentConfirmationPage";
import { TorrentProgressWindow } from "./pages/TorrentProgressWindow";
import { BrowserIntegrationPage } from "./pages/BrowserIntegrationPage";
import { DebugLogsWindow } from "./pages/DebugLogsWindow";
import { applyExternalSettings, loadSettings, SETTINGS_STORAGE_KEY } from "./services/settingsStorage";
import { applyThemeSettings } from "./services/theme";
import type { AppSettings } from "./domain/settings";
import "./styles/app.css";

const label = getCurrentWindow().label;
const torrentConfirmMatch = label.match(/^download-torrent-confirm-(.*)$/);
const confirmationMatch = label.match(/^download-confirm-(.*)$/);
const torrentProgressMatch = label.match(/^(?:torrent-progress-|download-torrent-live-)(.*)$/);
const isTorrentConfirmation = Boolean(torrentConfirmMatch);
const isConfirmationWindow = Boolean(confirmationMatch);
const isTorrentLiveWindow = Boolean(torrentProgressMatch);
const isLiveWindow = label.startsWith("download-") && !isConfirmationWindow && !isTorrentConfirmation && !isTorrentLiveWindow;
const isBrowserIntegrationWindow = label === "browser-integration";
const isDebugWindow = label === "debug-logs";
const isMainWindow = label === "main";

// Só a janela principal possui a permissão Tauri para controlar o zoom do
// webview. As janelas auxiliares ainda recebem tema, mas não devem tentar
// chamar a API, pois isso polui o console com um erro de permissão a cada
// abertura de confirmação de torrent.
const applyWindowZoom = (scale: number) => {
  if (isMainWindow) {
    void getCurrentWebview().setZoom(scale).catch(console.error);
  }
};

if (isMainWindow) {
  document.documentElement.classList.add("window-type-main");
  document.body.classList.add("window-type-main");
} else if (isConfirmationWindow || isTorrentConfirmation) {
  document.documentElement.classList.add("window-type-confirmation");
  document.body.classList.add("window-type-confirmation");
} else if (isLiveWindow || isTorrentLiveWindow) {
  document.documentElement.classList.add("window-type-live");
  document.body.classList.add("window-type-live");
} else if (isBrowserIntegrationWindow) {
  document.documentElement.classList.add("window-type-integration");
  document.body.classList.add("window-type-integration");
} else if (isDebugWindow) {
  document.documentElement.classList.add("window-type-debug");
  document.body.classList.add("window-type-debug");
}

const confirmationToken = torrentConfirmMatch?.[1] ?? confirmationMatch?.[1];
const confirmationSettings = (() => {
  if (!confirmationToken) return null;
  try {
    const raw = localStorage.getItem(`sf-downloader.confirmation-${confirmationToken}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.themeSettings as AppSettings | undefined;
  } catch {
    return null;
  }
})();
const initialSettings = confirmationSettings ?? loadSettings();
applyThemeSettings(initialSettings);
applyWindowZoom(initialSettings.uiScale);

void listen<AppSettings>("settings-changed", (event) => {
  if (event.payload) {
    const settings = applyExternalSettings(event.payload);
    applyThemeSettings(settings);
    applyWindowZoom(settings.uiScale);
  }
});

void invoke<unknown>("current_theme_settings")
  .then((cached) => {
    if (!cached) return;
    const settings = applyExternalSettings(cached);
    applyThemeSettings(settings);
    applyWindowZoom(settings.uiScale);
  })
  .catch(() => {});

window.addEventListener("storage", (event) => {
  if (event.key === SETTINGS_STORAGE_KEY && event.newValue) {
    const updated = loadSettings();
    applyThemeSettings(updated);
    applyWindowZoom(updated.uiScale);
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isDebugWindow ? (
      <DebugLogsWindow />
    ) : isTorrentConfirmation ? (
      <TorrentConfirmationPage token={torrentConfirmMatch![1]} />
    ) : isConfirmationWindow ? (
      <ConfirmationPage token={confirmationMatch![1]} />
    ) : isTorrentLiveWindow ? (
      <TorrentProgressWindow downloadId={torrentProgressMatch![1]} />
    ) : isLiveWindow ? (
      <DownloadWindow downloadId={label.substring("download-".length)} />
    ) : isBrowserIntegrationWindow ? (
      <BrowserIntegrationPage />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);

if (label !== "main") {
  const reveal = () => void invoke("show_ready_window").catch(console.error);
  const fallback = window.setTimeout(reveal, 2000);
  requestAnimationFrame(() => requestAnimationFrame(async () => {
    await document.fonts?.ready;
    window.clearTimeout(fallback);
    reveal();
  }));
}
