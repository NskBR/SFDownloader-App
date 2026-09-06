const MENU_ID = "sf-downloader-download";
const BRIDGE = "http://127.0.0.1:17831";

// Tipos desativados por padrão de fábrica
const DEFAULT_DISABLED_EXTENSIONS = [
  ".JPG",
  ".JPEG",
  ".PNG",
  ".WEBP",
  ".GIF",
  ".TXT",
];

// Extensões de recursos internos da web que NUNCA devem ser capturados automaticamente como downloads
const BLOCKED_ASSET_EXTENSIONS = new Set([
  // Páginas web e scripts de servidor
  "HTML", "HTM", "XHTML", "PHP", "ASP", "ASPX", "JSP", "CGI", "PL", "PY", "SH", "BAT", "CMD",
  // Folhas de estilo, scripts JavaScript, source maps, WebAssembly
  "CSS", "JS", "MJS", "CJS", "MAP", "TS", "TSX", "JSX", "WASM",
  // Dados e APIs
  "JSON", "XML",
  // Fontes web (evita que Google Fonts / buscas no Google abram downloads)
  "WOFF", "WOFF2", "TTF", "OTF", "EOT", "PFB", "PFM", "AFM",
  // Ícones e gráficos de páginas web carregados como assets
  "ICO", "CUR", "SVG",
  // Manifestos e feeds
  "MANIFEST", "WEBMANIFEST", "RSS", "ATOM"
]);

// MIME types de recursos da web que nunca devem ser interceptados
const BLOCKED_MIME_LIST = [
  "text/html",
  "application/xhtml+xml",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/x-javascript",
  "text/css",
  "application/json",
  "text/json",
  "text/xml",
  "application/xml",
  "font/",
  "application/font",
  "application/x-font",
  "application/vnd.ms-fontobject",
  "image/x-icon",
  "image/vnd.microsoft.icon"
];

// Padrões de domínios conhecidos de CDNs de fontes, telemetria e assets estáticos
const BLOCKED_HOST_PATTERNS = [
  "fonts.gstatic.com",
  "fonts.googleapis.com",
  "gstatic.com",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "ajax.googleapis.com",
  "update.microsoft.com",
  "windowsupdate.com",
  "telemetry",
  "analytics"
];

let bridge = { connected: false, token: "", fileExts: [], blockedHosts: [] };
let captureEnabledState = true;
let disabledExtensionsState = [];
const requests = new Map();
const recentHeaders = new Map();
const intercepted = new Set();
const interceptedUrls = new Map();
const MAX_TRACKED_REQUESTS = 500;
const TRACKED_REQUEST_TTL_MS = 30_000;

const validUrl = url => /^(https?:\/\/|magnet:\?)/i.test(url || "") || (url || "").startsWith("magnet:");

function isBlockedHost(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "127.0.0.1" || host === "localhost") return true;
    if (BLOCKED_HOST_PATTERNS.some(pattern => host.includes(pattern))) return true;
    if ((bridge.blockedHosts || []).some(bh => host.includes(bh.toLowerCase()))) return true;
    return false;
  } catch {
    return true;
  }
}

// Tracks URLs already taken over so a single browser download is not sent to
// the app twice (once via onHeadersReceived, once via onDeterminingFilename).
function markInterceptedUrl(url) {
  if (!url) return;
  interceptedUrls.set(url, Date.now());
  setTimeout(() => {
    if (interceptedUrls.get(url) && Date.now() - interceptedUrls.get(url) >= 5000) {
      interceptedUrls.delete(url);
    }
  }, 5000);
}

function wasInterceptedUrl(url) {
  return Boolean(url) && interceptedUrls.has(url);
}

function rememberRequest(requestId, request) {
  requests.set(requestId, request);
  while (requests.size > MAX_TRACKED_REQUESTS) {
    requests.delete(requests.keys().next().value);
  }
  setTimeout(() => requests.delete(requestId), TRACKED_REQUEST_TTL_MS);
}

function rememberHeaders(url, headers) {
  recentHeaders.set(url, headers);
  while (recentHeaders.size > MAX_TRACKED_REQUESTS) {
    recentHeaders.delete(recentHeaders.keys().next().value);
  }
  setTimeout(() => recentHeaders.delete(url), TRACKED_REQUEST_TTL_MS);
}

const normalizeExtension = value => {
  const cleaned = String(value || "").trim().toUpperCase();
  if (!cleaned) return "";
  return cleaned.startsWith(".") ? cleaned : `.${cleaned}`;
};

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function applyExtensionFilters(fileExts, disabledExtensions = []) {
  const blocked = new Set((disabledExtensions || []).map(normalizeExtension).filter(Boolean));
  return (fileExts || []).map(normalizeExtension).filter(ext => ext && !blocked.has(ext));
}

function saveBridgeToStorage() {
  chrome.storage.local.set({
    connected: bridge.connected,
    fileExts: bridge.fileExts || [],
    blockedHosts: bridge.blockedHosts || [],
    themeAccent: bridge.themeAccent || null,
    themeBg: bridge.themeBg || null,
    language: bridge.language || "pt-BR"
  });
}

function updateContextMenu(language) {
  const isEn = (language || "").toLowerCase().startsWith("en");
  const title = isEn ? "Download with SF Downloader" : "Baixar com SF Downloader";
  try {
    if (chrome.contextMenus && typeof chrome.contextMenus.update === "function") {
      chrome.contextMenus.update(MENU_ID, { title }, () => {
        if (chrome.runtime.lastError) {
          chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({ id: MENU_ID, title, contexts: ["link", "video", "audio", "image"] }, () => void chrome.runtime.lastError);
          });
        }
      });
    }
  } catch {}
}

function updateExtensionIcon(connected, language = bridge.language) {
  const actionAPI = chrome.action || chrome.browserAction;
  if (!actionAPI) return;

  const iconPath = connected
    ? { 32: "icons/sf-small.png", 128: "icons/sf-large.png" }
    : { 32: "icons/sf-small-off.png", 128: "icons/sf-large-off.png" };

  const isEn = (language || "").toLowerCase().startsWith("en");
  const title = connected
    ? (isEn ? "SF Downloader (Connected)" : "SF Downloader (Conectado)")
    : (isEn ? "SF Downloader (Disconnected / App Closed)" : "SF Downloader (Desconectado / App Fechado)");

  try {
    if (typeof actionAPI.setIcon === "function") {
      actionAPI.setIcon({ path: iconPath }).catch(() => {});
    }
    if (typeof actionAPI.setTitle === "function") {
      actionAPI.setTitle({ title }).catch(() => {});
    }
  } catch {}
}

let syncPromise = null;

function syncBridge() {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const { captureEnabled = captureEnabledState, disabledExtensions = disabledExtensionsState, language: savedLang } = await storageGet(["captureEnabled", "disabledExtensions", "language"]);
    captureEnabledState = captureEnabled;
    disabledExtensionsState = disabledExtensions || [];
    if (!captureEnabledState) {
      if (bridge.connected) {
        try { await fetch(`${BRIDGE}/disconnect`, { method: "POST" }); } catch {}
      }
      bridge.connected = false;
      saveBridgeToStorage();
      updateExtensionIcon(false, savedLang || bridge.language);
      return;
    }

    try {
      const response = await fetch(`${BRIDGE}/sync`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      bridge = {
        connected: true,
        ...data,
        themeAccent: data.themeAccent || null,
        themeBg: data.themeBg || null,
        language: data.language || savedLang || "pt-BR",
        allFileExts: (data.fileExts || []).map(normalizeExtension).filter(Boolean),
        fileExts: applyExtensionFilters(data.fileExts, disabledExtensionsState)
      };
      saveBridgeToStorage();
      updateExtensionIcon(true, bridge.language);
      updateContextMenu(bridge.language);
    } catch {
      bridge.connected = false;
      saveBridgeToStorage();
      updateExtensionIcon(false, savedLang || bridge.language);
    }
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

function launchProtocol(url) {
  return chrome.tabs.create({ url: `sfdownloader://download?url=${encodeURIComponent(url)}`, active: false })
    .then(tab => { if (tab.id) setTimeout(() => chrome.tabs.remove(tab.id).catch(() => undefined), 1200); });
}

function isExtensionExcluded(ext) {
  if (!ext) return false;
  const norm = normalizeExtension(ext);
  const disabled = (disabledExtensionsState || []).map(normalizeExtension);
  return disabled.includes(norm);
}

function shouldTakeOver(url, filename) {
  if (!bridge.connected || !validUrl(url)) return false;
  if (url.startsWith("magnet:")) return true;
  if (isBlockedHost(url)) return false;

  const target = (filename || url).toUpperCase();
  const cleanTarget = target.split("?")[0].split("#")[0];
  const ext = cleanTarget.includes(".") ? cleanTarget.substring(cleanTarget.lastIndexOf(".") + 1) : "";
  if (!ext) return false;

  // Block web asset extensions
  if (BLOCKED_ASSET_EXTENSIONS.has(ext)) return false;

  // Check user exclusion list
  if (isExtensionExcluded(ext)) return false;

  return true;
}

function shouldInterceptHeaders(info) {
  if (!bridge.connected) return null;

  // Block non-GET requests (same as XDM)
  if (info.method && info.method !== "GET") return null;

  // Only intercept successful responses
  if (info.statusCode && info.statusCode !== 200 && info.statusCode !== 206) return null;

  const url = info.url;
  if (!validUrl(url)) return null;
  if (isBlockedHost(url)) return null;

  // Parse response headers
  let filename = null;
  let fileSize = null;
  let mimeType = null;
  let isAttachment = false;

  for (const header of info.responseHeaders || []) {
    const name = header.name.toLowerCase();
    const value = header.value || "";
    if (name === "content-disposition") {
      // Extract filename from Content-Disposition
      const parts = value.split(";");
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.toLowerCase().startsWith("filename*=")) {
          const encoded = trimmed.substring(10).trim().replace(/^['"]|['"]$/g, "");
          const val = encoded.includes("''") ? encoded.split("''").slice(1).join("''") : encoded;
          try {
            filename = decodeURIComponent(val);
          } catch {
            filename = val;
          }
        } else if (trimmed.toLowerCase().startsWith("filename=")) {
          filename = trimmed.substring(9).replace(/['"]/g, "").trim();
        }
      }
      isAttachment = /attachment/i.test(value);
    }
    if (name === "content-type") {
      mimeType = value.split(";")[0].trim().toLowerCase();
    }
    if (name === "content-length") {
      fileSize = parseInt(value, 10) || null;
    }
  }

  // Block web content & font/asset MIME types
  if (mimeType && BLOCKED_MIME_LIST.some(blocked => mimeType.includes(blocked) || mimeType.startsWith(blocked))) {
    return null;
  }

  // Extract extension from filename or URL path
  let ext = "";
  if (filename && filename.includes(".")) {
    ext = filename.substring(filename.lastIndexOf(".") + 1).toUpperCase();
  } else {
    try {
      const parsed = new URL(url);
      const pathFile = parsed.pathname.split("/").pop()?.split("?")[0] || "";
      if (pathFile.includes(".")) {
        ext = pathFile.substring(pathFile.lastIndexOf(".") + 1).toUpperCase();
      }
    } catch {}
  }

  if (ext) {
    ext = ext.split("?")[0].split("#")[0].trim();
  }

  // Never intercept blocked web assets (fonts, icons, stylesheets, scripts, pages)
  if (ext && BLOCKED_ASSET_EXTENSIONS.has(ext)) {
    return null;
  }

  // Check user exclusion list
  if (ext && isExtensionExcluded(ext)) {
    return null;
  }

  // CRITICAL RULE (from XDM / IDM):
  // In onHeadersReceived, normal page assets (font, script, stylesheet, image, xmlhttprequest, ping, other)
  // must NEVER be intercepted unless the server explicitly declared 'Content-Disposition: attachment'.
  const isTopNavigation = info.type === "main_frame";

  if (isAttachment) {
    // Explicit server attachment download
    return { filename, fileSize, mimeType };
  }

  if (isTopNavigation) {
    // Direct top-level navigation to a downloadable file
    if (ext && !BLOCKED_ASSET_EXTENSIONS.has(ext) && !isExtensionExcluded(ext)) {
      return { filename, fileSize, mimeType };
    }
  }

  // All other subresource requests (fonts, scripts, css, images, background fetches) are ignored!
  return null;
}

function cookiesFor(url) {
  return new Promise(resolve => {
    chrome.cookies.getAll({ url }, cookies => {
      void chrome.runtime.lastError;
      const list = (cookies || []).map(cookie => `${cookie.name}=${cookie.value}`);
      resolve(list.join("; "));
    });
  });
}

async function sendToApp(download) {
  const url = download.finalUrl || download.url;
  if (!validUrl(url) || (!url.startsWith("magnet:") && isBlockedHost(url))) {
    throw new Error("Unsafe download URL");
  }

  const observed = recentHeaders.get(url) || {};
  if (observed.reproducible === false) {
    throw new Error("This download request cannot be safely reproduced");
  }
  const referrer = download.referrer || observed.referrer || null;
  const cookie = await cookiesFor(url);
  const payload = {
    token: bridge.token,
    url,
    filename: download.filename || observed.filename || null,
    fileSize: download.fileSize > 0 ? download.fileSize : observed.fileSize || null,
    mimeType: download.mime || observed.mimeType || null,
    referrer,
    cookie: cookie || null,
    requestHeaders: observed.requestHeaders || download.requestHeaders || { "User-Agent": [navigator.userAgent] }
  };
  try {
    const response = await fetch(`${BRIDGE}/download`, { method: "POST", body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return "bridge";
  } catch (error) {
    if (download.allowProtocolFallback === false) throw error;
    await launchProtocol(url);
    return "protocol";
  }
}

function eraseDownload(id) {
  chrome.downloads.cancel(id, () => {
    void chrome.runtime.lastError;
    chrome.downloads.erase({ id }, () => {
      void chrome.runtime.lastError;
      setTimeout(() => {
        chrome.downloads.erase({ id }, () => void chrome.runtime.lastError);
      }, 100);
      setTimeout(() => {
        chrome.downloads.erase({ id }, () => void chrome.runtime.lastError);
      }, 500);
    });
  });
}

function onDeterminingFilename(download, suggest) {
  const url = download.finalUrl || download.url;
  syncBridge().then(() => {
    if (!captureEnabledState || intercepted.has(download.id) || wasInterceptedUrl(url) || !shouldTakeOver(url, download.filename)) {
      suggest();
      return;
    }
    intercepted.add(download.id);
    sendToApp({ ...download, allowProtocolFallback: false })
      .then(delivery => {
        if (delivery === "bridge") {
          markInterceptedUrl(url);
          eraseDownload(download.id);
        }
      })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => intercepted.delete(download.id), 5000);
        suggest();
      });
  }).catch(() => {
    suggest();
  });
  return true;
}

try {
  chrome.webRequest.onSendHeaders.addListener(info => {
    const headers = {};
    if (info.method === "GET") {
      for (const header of info.requestHeaders || []) {
        if (!header.value) continue;
        (headers[header.name] ||= []).push(header.value);
      }
    }
    rememberRequest(info.requestId, { url: info.url, requestHeaders: headers, referrer: info.initiator || null, reproducible: info.method === "GET" });
  }, { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]);
} catch {
  chrome.webRequest.onSendHeaders.addListener(info => {
    const headers = {};
    if (info.method === "GET") {
      for (const header of info.requestHeaders || []) {
        if (!header.value) continue;
        (headers[header.name] ||= []).push(header.value);
      }
    }
    rememberRequest(info.requestId, { url: info.url, requestHeaders: headers, referrer: info.initiator || null, reproducible: info.method === "GET" });
  }, { urls: ["<all_urls>"] }, ["requestHeaders"]);
}

function rememberResponse(info) {
  const request = requests.get(info.requestId) || {};
  requests.delete(info.requestId);
  const details = shouldInterceptHeaders(info);
  let fileSize = details?.fileSize || null;
  let mimeType = details?.mimeType || null;
  for (const header of info.responseHeaders || []) {
    const name = header.name.toLowerCase();
    if (name === "content-length" && !fileSize) fileSize = Number(header.value) || null;
    if (name === "content-type" && !mimeType) mimeType = header.value || null;
  }
  rememberHeaders(info.url, {
    ...request,
    filename: details?.filename || request.filename || null,
    fileSize,
    mimeType,
  });
}

try {
  chrome.webRequest.onHeadersReceived.addListener(rememberResponse, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]);
} catch {
  chrome.webRequest.onHeadersReceived.addListener(rememberResponse, { urls: ["<all_urls>"] }, ["responseHeaders"]);
}

chrome.webRequest.onErrorOccurred.addListener(info => requests.delete(info.requestId), { urls: ["<all_urls>"] });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: MENU_ID, title: "Baixar com SF Downloader", contexts: ["link", "video", "audio", "image"] }));
  chrome.storage.local.get(["captureEnabled", "disabledExtensions"], result => {
    if (result.captureEnabled === undefined) {
      captureEnabledState = true;
      chrome.storage.local.set({ captureEnabled: true });
    } else {
      captureEnabledState = result.captureEnabled;
    }
    if (!Array.isArray(result.disabledExtensions)) {
      disabledExtensionsState = [...DEFAULT_DISABLED_EXTENSIONS];
      chrome.storage.local.set({ disabledExtensions: disabledExtensionsState });
    }
  });
  void syncBridge();
});

chrome.runtime.onStartup.addListener(() => void syncBridge());
chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.captureEnabled) {
    captureEnabledState = changes.captureEnabled.newValue !== false;
  }
  if (changes.disabledExtensions) {
    disabledExtensionsState = changes.disabledExtensions.newValue || [];
    bridge.fileExts = applyExtensionFilters(bridge.allFileExts || bridge.fileExts, disabledExtensionsState);
  }
});
chrome.alarms.create("sf-bridge-sync", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "sf-bridge-sync") void syncBridge(); });
setInterval(() => void syncBridge(), 5000);

const determiningFilename = chrome.downloads?.["onDeterminingFilename"];
if (determiningFilename) {
  determiningFilename.addListener(onDeterminingFilename);
} else if (chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener(download => {
    const url = download.finalUrl || download.url;
    syncBridge().then(() => {
      if (!captureEnabledState || intercepted.has(download.id) || !shouldTakeOver(url, download.filename)) return;
      intercepted.add(download.id);
      eraseDownload(download.id);
      void sendToApp(download).finally(() => setTimeout(() => intercepted.delete(download.id), 5000));
    }).catch(() => {});
  });
}

if (chrome.downloads && chrome.downloads.onChanged) {
  chrome.downloads.onChanged.addListener(delta => {
    if (delta.state && (delta.state.current === "interrupted" || delta.state.current === "complete")) {
      if (intercepted.has(delta.id)) {
        chrome.downloads.erase({ id: delta.id }, () => void chrome.runtime.lastError);
      }
    }
  });
}

chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId !== MENU_ID) return;
  const url = info.linkUrl || info.srcUrl || info.pageUrl;
  if (!validUrl(url)) return;
  if (bridge.connected) void sendToApp({ url, finalUrl: url, filename: null, fileSize: -1, mime: null, referrer: info.pageUrl }).catch(() => {});
  else void launchProtocol(url);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "intercept-link") {
    syncBridge().then(() => {
      const handled = captureEnabledState && shouldTakeOver(message.url, message.filename);
      if (!handled) {
        sendResponse({ handled: false });
        return;
      }
      sendToApp({
        url: message.url,
        finalUrl: message.url,
        filename: message.filename || null,
        fileSize: -1,
        mime: null,
        referrer: message.referrer || null,
        allowProtocolFallback: false,
      }).then(() => sendResponse({ handled: true }))
        .catch(() => sendResponse({ handled: false }));
    }).catch(() => {
      sendResponse({ handled: false });
    });
    return true;
  }
  if (message?.type === "capture-toggled") {
    captureEnabledState = message.enabled !== false;
    void syncBridge().finally(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "extension-filters-updated") {
    disabledExtensionsState = message.disabledExtensions || [];
    chrome.storage.local.set({ disabledExtensions: disabledExtensionsState });
    bridge.fileExts = applyExtensionFilters(bridge.allFileExts || bridge.fileExts, disabledExtensionsState);
    saveBridgeToStorage();
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "bridge-status") {
    chrome.storage.local.get("captureEnabled", ({ captureEnabled = true }) => {
      if (!captureEnabled) {
        sendResponse({ connected: false });
      } else {
        void syncBridge().finally(() => sendResponse({ connected: bridge.connected }));
      }
    });
    return true;
  }
  if (message?.type !== "send-to-app") return;
  const task = bridge.connected
    ? sendToApp({ url: message.url, finalUrl: message.url, filename: null, fileSize: -1, mime: null, referrer: null })
    : launchProtocol(message.url);
  task.then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});

void syncBridge();
