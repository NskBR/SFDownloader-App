const capture = document.querySelector("#capture");
const status = document.querySelector("#status");
const connection = document.querySelector("#connection");
const disabledInput = document.querySelector("#disabled-extensions-input");
const btnResetDefault = document.querySelector("#btn-reset-default");
const versionBadge = document.querySelector("#version-badge");
const updateButton = document.querySelector("#update-extension");
const updateResult = document.querySelector("#update-result");

// Extensões ignoradas por padrão (formatos que o navegador lida melhor nativamente)
const DEFAULT_DISABLED_EXTENSIONS = [
  ".JPG",
  ".JPEG",
  ".PNG",
  ".WEBP",
  ".GIF",
  ".TXT",
];

const i18n = {
  "pt-BR": {
    appTitle: "SF Downloader",
    updateExtension: "Atualizar extensão",
    updatingExtension: "Verificando no aplicativo…",
    updateCurrent: "A extensão já está atualizada.",
    updateAppOlder: "Atualize o aplicativo primeiro: ele contém uma extensão mais antiga.",
    updateManual: "Confirme a instalação do XPI no Firefox.",
    updateDone: "Extensão atualizada. Recarregue as páginas abertas.",
    updateFolder: "A extensão usa outra pasta. Carregue a pasta atualizada: ",
    updateUnavailable: "Abra o SFDownloader atualizado e tente novamente.",
    updateOldApp: "Atualize o SFDownloader para usar este botão.",
    autoCaptureTitle: "Captura automática",
    autoCaptureDesc: "Intercepta downloads do navegador",
    ignoredExtsTitle: "Extensões ignoradas",
    restoreDefault: "Restaurar padrão",
    ignoredPlaceholder: "Ex: JPG PNG GIF TXT",
    ignoredHint: "Separar por espaço. Esses formatos serão baixados pelo navegador.",
    statusChecking: "Verificando conexão...",
    statusDisabled: "Ative a captura automática para conectar",
    statusConnected: "SF Downloader conectado e ativo",
    statusDisconnected: "Abra o SF Downloader para conectar",
    titleDisabled: "Integração desativada pelo usuário",
    titleConnected: "SF Downloader conectado e ativo",
    titleDisconnected: "SF Downloader desconectado",
  },
  "en-US": {
    appTitle: "SF Downloader",
    updateExtension: "Update extension",
    updatingExtension: "Checking the app…",
    updateCurrent: "The extension is already up to date.",
    updateAppOlder: "Update the app first: it contains an older extension.",
    updateManual: "Confirm the XPI installation in Firefox.",
    updateDone: "Extension updated. Reload your open pages.",
    updateFolder: "The extension uses a different folder. Load the updated folder: ",
    updateUnavailable: "Open the updated SFDownloader app and try again.",
    updateOldApp: "Update SFDownloader to use this button.",
    autoCaptureTitle: "Automatic capture",
    autoCaptureDesc: "Intercepts browser downloads",
    ignoredExtsTitle: "Ignored extensions",
    restoreDefault: "Restore defaults",
    ignoredPlaceholder: "Ex: JPG PNG GIF TXT",
    ignoredHint: "Separate with space. These formats will be downloaded by the browser.",
    statusChecking: "Checking connection...",
    statusDisabled: "Enable automatic capture to connect",
    statusConnected: "SF Downloader connected and active",
    statusDisconnected: "Open SF Downloader to connect",
    titleDisabled: "Integration disabled by user",
    titleConnected: "SF Downloader connected and active",
    titleDisconnected: "SF Downloader disconnected",
  }
};

let currentLanguage = "pt-BR";

function applyLanguage(lang) {
  currentLanguage = (lang && String(lang).toLowerCase().startsWith("en")) ? "en-US" : "pt-BR";
  const dict = i18n[currentLanguage];
  if (updateButton && !updateButton.disabled) updateButton.textContent = dict.updateExtension;

  const elAutoCaptureTitle = document.querySelector("#auto-capture-title");
  if (elAutoCaptureTitle) elAutoCaptureTitle.textContent = dict.autoCaptureTitle;

  const elAutoCaptureDesc = document.querySelector("#auto-capture-desc");
  if (elAutoCaptureDesc) elAutoCaptureDesc.textContent = dict.autoCaptureDesc;

  const elIgnoredExtsTitle = document.querySelector("#ignored-exts-title");
  if (elIgnoredExtsTitle) elIgnoredExtsTitle.textContent = dict.ignoredExtsTitle;

  if (btnResetDefault) btnResetDefault.textContent = dict.restoreDefault;

  if (disabledInput) disabledInput.placeholder = dict.ignoredPlaceholder;

  const elIgnoredHint = document.querySelector("#exclusion-hint");
  if (elIgnoredHint) elIgnoredHint.textContent = dict.ignoredHint;

  return dict;
}

const version = chrome.runtime.getManifest().version;
if (versionBadge) {
  versionBadge.textContent = `v${version}`;
}

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise(resolve => chrome.storage.local.set(values, resolve));
}

function renderCapture(enabled) {
  capture.setAttribute("aria-checked", String(enabled));
}

// Parse the textarea content into a normalized array of extensions
function parseExclusionInput(text) {
  return text
    .split(/[\s,;]+/)
    .map(v => v.trim().toUpperCase())
    .filter(v => v.length > 0)
    .map(v => (v.startsWith(".") ? v : `.${v}`));
}

// Format the array back to display text (without dots, space-separated)
function formatExclusions(arr) {
  return arr
    .map(v => v.replace(/^\./, "").toUpperCase())
    .join(" ");
}

async function updateDisabledExtensions(disabledArray) {
  const value = [...new Set(disabledArray)].sort();
  await storageSet({ disabledExtensions: value });
  chrome.runtime.sendMessage({
    type: "extension-filters-updated",
    disabledExtensions: value,
  });
}

// Debounce to avoid saving on every keystroke
let saveTimeout = null;
function onInputChange() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const parsed = parseExclusionInput(disabledInput.value);
    void updateDisabledExtensions(parsed);
  }, 400);
}

if (disabledInput) {
  disabledInput.addEventListener("input", onInputChange);
}

if (btnResetDefault) {
  btnResetDefault.addEventListener("click", (e) => {
    e.stopPropagation();
    const defaults = [...DEFAULT_DISABLED_EXTENSIONS];
    if (disabledInput) {
      disabledInput.value = formatExclusions(defaults);
    }
    void updateDisabledExtensions(defaults);
  });
}

function applyTheme(themeAccent, themeBg) {
  if (themeAccent) {
    document.documentElement.style.setProperty("--ember", themeAccent);
    document.documentElement.style.setProperty("--ember-solid", themeAccent);
    document.documentElement.style.setProperty("--accent-cyan", themeAccent);
    document.documentElement.style.setProperty("--st-connected", themeAccent);
    let soft = themeAccent + "26";
    if (themeAccent.startsWith("rgb")) {
      soft = themeAccent.replace("rgb", "rgba").replace(")", ", 0.15)");
    }
    document.documentElement.style.setProperty("--ember-soft", soft);
  }
  if (themeBg) {
    document.documentElement.style.setProperty("--bg-fill", themeBg);
  }
}

function updateThemeAndLangFromStorage() {
  chrome.storage.local.get(["themeAccent", "themeBg", "language"], ({ themeAccent, themeBg, language }) => {
    applyTheme(themeAccent, themeBg);
    if (language) applyLanguage(language);
  });
}

function checkConnection() {
  updateThemeAndLangFromStorage();
  const dict = i18n[currentLanguage];
  chrome.storage.local.get("captureEnabled", ({ captureEnabled = false }) => {
    if (!captureEnabled) {
      connection.classList.remove("connected");
      connection.title = dict.titleDisabled;
      status.textContent = dict.statusDisabled;
      status.classList.remove("connected");
      return;
    }
    chrome.runtime.sendMessage({ type: "bridge-status" }, response => {
      const connected = !chrome.runtime.lastError && response?.connected;
      connection.classList.toggle("connected", Boolean(connected));
      connection.title = connected ? dict.titleConnected : dict.titleDisconnected;
      status.textContent = connected ? dict.statusConnected : dict.statusDisconnected;
      status.classList.toggle("connected", Boolean(connected));
      if (response?.themeAccent || response?.themeBg) {
        applyTheme(response.themeAccent, response.themeBg);
      }
      if (response?.language) {
        applyLanguage(response.language);
      }
    });
  });
}

storageGet({ captureEnabled: false, disabledExtensions: null, themeAccent: null, themeBg: null, language: "pt-BR" }).then(
  ({ captureEnabled = false, disabledExtensions, themeAccent, themeBg, language }) => {
    applyTheme(themeAccent, themeBg);
    applyLanguage(language);
    const disabled = Array.isArray(disabledExtensions)
      ? disabledExtensions
      : [...DEFAULT_DISABLED_EXTENSIONS];
    if (!Array.isArray(disabledExtensions)) {
      storageSet({ disabledExtensions: disabled });
    }
    renderCapture(captureEnabled);
    if (disabledInput) {
      disabledInput.value = formatExclusions(disabled);
    }
  },
);

capture.addEventListener("click", () => {
  const next = capture.getAttribute("aria-checked") !== "true";
  renderCapture(next);
  chrome.storage.local.set({ captureEnabled: next }, () => {
    checkConnection();
    chrome.runtime.sendMessage({ type: "capture-toggled", enabled: next });
  });
});

checkConnection();
setInterval(checkConnection, 2000);

updateButton?.addEventListener("click", () => {
  if (updateButton.disabled) return;
  updateButton.disabled = true;
  updateButton.textContent = i18n[currentLanguage].updatingExtension;
  if (updateResult) updateResult.textContent = "";
  chrome.runtime.sendMessage({type:"update-extension"}, async response => {
    const dict=i18n[currentLanguage];
    const error=chrome.runtime.lastError;
    if (response?.ok && response.mode === "reload") {
      // Check the loaded manifest next time: an unpacked copy might be installed
      // from Downloads instead of the app-managed extension directory.
      await storageSet({pendingExtensionUpdate:{version:response.version,path:response.path}});
      chrome.runtime.reload();
      return;
    }
    if (updateResult) updateResult.textContent = error || !response?.ok
      ? response?.error === "app-too-old" ? dict.updateOldApp : response?.error && !["Failed to fetch","fetch failed","app-unavailable"].includes(response.error) ? response.error : dict.updateUnavailable
      : response.mode === "manual" ? dict.updateManual : response.mode === "app-older" ? dict.updateAppOlder : dict.updateCurrent;
    updateButton.disabled = false;
    updateButton.textContent = dict.updateExtension;
  });
});
void storageGet(["pendingExtensionUpdate","language"]).then(({pendingExtensionUpdate:pending,language}) => {
  if (!pending || !updateResult) return;
  const dict=i18n[language?.toLowerCase().startsWith("en") ? "en-US" : "pt-BR"];
  updateResult.textContent = version === pending.version ? dict.updateDone : dict.updateFolder + pending.path;
  chrome.storage.local.remove("pendingExtensionUpdate");
});

// Manual fallback uses the active tab, without relying on injected page controls.
const downloadPageButton=document.querySelector('#download-page');
const downloadPageHint=document.querySelector('#download-page-hint');
let pageDownloadBusy=false;
const pageText=(pt,en)=>currentLanguage==='en-US'?en:pt;
const activeMediaTab=()=>new Promise(resolve=>{
  if(!chrome.tabs?.query){resolve(null);return;}
  chrome.tabs.query({active:true,currentWindow:true},tabs=>{
    if(chrome.runtime.lastError){resolve(null);return;}
    const tab=tabs?.[0];
    const url=tab?.url && (globalThis.sfYouTubeSource(tab.url) || globalThis.sfSocialMediaSource(tab.url));
    resolve(url?{url,platform:globalThis.sfMediaPlatform(url)}:null);
  });
});
async function refreshDownloadPage(){
  const media=await activeMediaTab();
  downloadPageButton.textContent=pageText('Baixar desta página','Download from this page');
  downloadPageButton.disabled=!media;
  downloadPageHint.textContent=media
    ?pageText('Vídeo detectado em ','Video detected on ')+({youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok',reddit:'Reddit',facebook:'Facebook'}[media.platform] || '')
    :pageText('Abra um vídeo ou Reel do YouTube, Instagram, TikTok, Reddit ou Facebook.','Open a video or Reel on YouTube, Instagram, TikTok, Reddit or Facebook.');
}
downloadPageButton?.addEventListener('click',async()=>{
  if(pageDownloadBusy)return;
  pageDownloadBusy=true;downloadPageButton.disabled=true;
  downloadPageButton.textContent=pageText('Abrindo…','Opening…');
  try{
    // Query again on click: never reuse a URL cached before tab navigation.
    const media=await activeMediaTab();
    if(!media){await refreshDownloadPage();return;}
    const result=await new Promise(resolve=>chrome.runtime.sendMessage({type:'popup-download-media',url:media.url},response=>resolve(chrome.runtime.lastError?null:response)));
    downloadPageHint.textContent=result?.ok
      ?result.delivery==='protocol'?pageText('Confirme a abertura do SFDownloader no navegador.','Confirm opening SFDownloader in your browser.'):pageText('Escolha vídeo ou áudio no SFDownloader.','Choose video or audio in SFDownloader.')
      :pageText('Não foi possível abrir. Inicie o SFDownloader e tente novamente.','Could not open. Start SFDownloader and try again.');
  }catch{downloadPageHint.textContent=pageText('Não foi possível consultar a aba atual.','Could not check the current tab.');}
  finally{pageDownloadBusy=false;downloadPageButton.disabled=!(await activeMediaTab());downloadPageButton.textContent=pageText('Baixar desta página','Download from this page');}
});
if(downloadPageButton)void storageGet(['language']).then(({language})=>{applyLanguage(language);return refreshDownloadPage();});