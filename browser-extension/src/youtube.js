(() => {
  if (window.top !== window || globalThis.sfYouTubeButtonMounted) return;
  globalThis.sfYouTubeButtonMounted = true;

  // A browser can invalidate a previous extension context while leaving its DOM behind.
  document.getElementById("sfdownloader-youtube-action")?.remove();

  const host = document.createElement("span");
  host.id = "sfdownloader-youtube-action";
  host.style.cssText = "display:inline-flex;flex:0 0 auto;margin:0 8px 0 0;vertical-align:middle;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { font-family: Roboto, Arial, sans-serif; color: var(--yt-spec-text-primary, #0f0f0f); }
    button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:36px;
      box-sizing:border-box; padding:0 14px; border:1px solid var(--yt-spec-10-percent-layer, #ddd);
      border-radius:18px; background:var(--yt-spec-badge-chip-background, #f2f2f2); color:inherit;
      font:500 14px/20px Roboto, Arial, sans-serif; white-space:nowrap; cursor:pointer;
      transition:background 150ms, border-color 150ms; }
    button:hover { background:var(--yt-spec-button-chip-background-hover, #e5e5e5); }
    button:focus-visible { outline:2px solid #02adfd; outline-offset:3px; }
    button:disabled { cursor:wait; opacity:.7; }
    img { width:20px; height:22px; object-fit:contain; flex:none; pointer-events:none; }
    .status { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:2147483647;
      max-width:min(420px,calc(100vw - 48px)); padding:12px 18px; border-radius:8px;
      background:#202020; color:#fff; font:400 14px/20px Roboto, Arial, sans-serif;
      box-shadow:0 4px 16px #0004; pointer-events:none; }
    .status:empty { display:none; }
    @media (prefers-reduced-motion:reduce) { button { transition:none; } }
  `;
  const button = document.createElement("button");
  button.type = "button";
  const logo = document.createElement("img");
  logo.src = chrome.runtime.getURL("icons/sf-logo.svg");
  logo.alt = "";
  logo.draggable = false;
  const label = document.createElement("span");
  const status = document.createElement("span");
  status.className = "status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  button.append(logo, label);
  shadow.append(style, button, status);

  let language = document.documentElement.lang || "pt-BR";
  let enabled = true;
  let inFlight = false;
  let statusTimer;
  let updateScheduled = false;
  let navigating = false;
  const english = () => language.toLowerCase().startsWith("en");
  function updateLabel() {
    label.textContent = inFlight
      ? (english() ? "Opening…" : "Abrindo…")
      : (english() ? "Download" : "Baixar");
    button.setAttribute("aria-label", english() ? "Download with SFDownloader" : "Baixar com SFDownloader");
    button.title = english() ? "SFDownloader · Choose MP4 or MP3" : "SFDownloader · Escolher MP4 ou MP3";
    button.disabled = inFlight;
  }
  function notify(message) {
    clearTimeout(statusTimer);
    status.textContent = message;
    statusTimer = setTimeout(() => { status.textContent = ""; }, 5000);
  }
  // Re-read the URL at click time: YouTube reuses the same document between videos.
  button.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (inFlight || !enabled || navigating) return;
    const url = globalThis.sfYouTubeSource(location.href);
    if (!url) return;
    inFlight = true;
    updateLabel();
    try {
      const response = await chrome.runtime.sendMessage({ type: "youtube-download", url });
      if (!response?.ok) throw new Error("delivery failed");
      notify(response.delivery === "protocol"
        ? (english() ? "Confirm opening SFDownloader in your browser." : "Confirme a abertura do SFDownloader no navegador.")
        : (english() ? "Choose the format in SFDownloader." : "Escolha o formato no SFDownloader."));
    } catch {
      notify(english()
        ? "Could not open SFDownloader. Open the app and reload the extension."
        : "Não foi possível abrir o SFDownloader. Abra o aplicativo e recarregue a extensão.");
    } finally {
      inFlight = false;
      updateLabel();
    }
  });

  function findContainer() {
    if (location.hostname === "music.youtube.com") {
      if (location.pathname === "/playlist") {
        return document.querySelector("ytmusic-detail-header-renderer .buttons, ytmusic-responsive-header-renderer .buttons");
      }
      return document.querySelector("ytmusic-player-bar #right-controls, ytmusic-player-bar .right-controls");
    }
    if (location.pathname.startsWith("/shorts/")) {
      return document.querySelector("ytd-reel-video-renderer[is-active] #actions");
    }
    if (location.pathname === "/playlist") {
      for (const selector of ["ytd-playlist-header-renderer #top-level-buttons-computed", "ytd-playlist-sidebar-primary-info-renderer #menu", "yt-page-header-renderer .yt-page-header-view-model__page-header-headline"]) {
        const target = Array.from(document.querySelectorAll(selector)).find(element => !element.closest("[hidden], [aria-hidden='true']"));
        if (target) return target;
      }
      return null;
    }
    // Scope to the watch page so unrelated buttons and hidden pages are untouched.
    for (const selector of ["ytd-watch-metadata #top-level-buttons-computed", "ytd-watch-metadata #actions-inner", "ytd-watch-flexy:not([hidden]) #menu #top-level-buttons-computed"]) {
      const target = Array.from(document.querySelectorAll(selector)).find(element => !element.closest("[hidden], [aria-hidden='true']"));
      if (target) return target;
    }
    return null;
  }
  function reconcile() {
    updateScheduled = false;
    const source = globalThis.sfYouTubeSource(location.href);
    const target = source && enabled && !navigating ? findContainer() : null;
    if (!target) { host.remove(); return; }
    if (host.parentElement !== target) target.prepend(host);
  }
  function scheduleUpdate() {
    if (updateScheduled) return;
    updateScheduled = true;
    requestAnimationFrame(reconcile);
  }
  chrome.storage.local.get(["captureEnabled", "language"], prefs => {
    enabled = prefs.captureEnabled !== false;
    language = prefs.language || language;
    updateLabel();
    scheduleUpdate();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.captureEnabled) enabled = changes.captureEnabled.newValue !== false;
    if (changes.language) language = changes.language.newValue || document.documentElement.lang || "pt-BR";
    updateLabel();
    scheduleUpdate();
  });
  document.addEventListener("yt-navigate-start", () => { navigating = true; host.remove(); });
  document.addEventListener("yt-navigate-finish", () => { navigating = false; status.textContent = ""; scheduleUpdate(); });
  document.addEventListener("yt-page-data-updated", scheduleUpdate);
  window.addEventListener("popstate", () => { navigating = false; scheduleUpdate(); });
  // Also restores the action when YouTube replaces the toolbar asynchronously.
  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["is-active", "hidden"] });
  updateLabel();
  scheduleUpdate();
})();
