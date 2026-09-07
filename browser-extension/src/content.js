const bypassedLinks = new WeakSet();
let fileExts = [];
let captureEnabled = true;
let connected = false;
let blockedHosts = [];

// Carrega as configurações inicialmente
chrome.storage.local.get(["fileExts", "captureEnabled", "connected", "blockedHosts"], result => {
  fileExts = result.fileExts || [];
  captureEnabled = result.captureEnabled !== false;
  connected = result.connected || false;
  blockedHosts = result.blockedHosts || [];
});

// Ouve atualizações em tempo real
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.fileExts) fileExts = changes.fileExts.newValue || [];
  if (changes.captureEnabled) captureEnabled = changes.captureEnabled.newValue !== false;
  if (changes.connected) connected = changes.connected.newValue || false;
  if (changes.blockedHosts) blockedHosts = changes.blockedHosts.newValue || [];
});

function resumeNavigation(anchor) {
  bypassedLinks.add(anchor);
  anchor.click();
  queueMicrotask(() => bypassedLinks.delete(anchor));
}

document.addEventListener("click", event => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (!captureEnabled || !connected) return;

  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor || bypassedLinks.has(anchor)) return;
  
  const url = anchor.href;
  if (url.startsWith("magnet:")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    chrome.runtime.sendMessage({
      type: "intercept-link",
      url,
      filename: null,
      referrer: location.href
    }).then(response => {
      if (!response?.handled) resumeNavigation(anchor);
    }).catch(() => resumeNavigation(anchor));
    return;
  }
  if (!/^https?:\/\//i.test(url)) return;

  // Ignora se o domínio do link estiver na lista de bloqueio
  try {
    const parsed = new URL(url);
    if (blockedHosts.some(host => parsed.host.includes(host))) return;
  } catch {
    return;
  }

  // Uma URL que termina em .rar/.zip pode ser apenas uma página intermediária
  // do provedor. Só interrompemos o clique quando a própria página declara o
  // link como download; o restante será capturado depois, pelo evento nativo
  // de download do navegador, quando a resposta real estiver disponível.
  if (!anchor.hasAttribute("download")) return;

  const filename = anchor.getAttribute("download") || null;
  let target = "";
  try {
    const parsedUrl = new URL(url);
    target = (filename || parsedUrl.pathname).toUpperCase();
  } catch {
    target = (filename || url).toUpperCase();
  }

  const shouldIntercept = fileExts.some(ext => target.endsWith(ext.toUpperCase()));

  // Se não corresponder a uma extensão monitorada, deixa o navegador tratar
  // o clique normalmente.
  if (!shouldIntercept) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  chrome.runtime.sendMessage({
    type: "intercept-link",
    url,
    filename,
    referrer: location.href
  }).then(response => {
    if (!response?.handled) resumeNavigation(anchor);
  }).catch(() => resumeNavigation(anchor));
}, true);
