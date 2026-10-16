(() => {
  if (window.top !== window || globalThis.sfSocialButtonsMounted) return;
  globalThis.sfSocialButtonsMounted = true;
  const platform = globalThis.sfMediaPlatform(location.href);
  if (!['instagram', 'tiktok'].includes(platform)) return;
  document.querySelectorAll('[data-sf-social-action]').forEach(node => node.remove());
  const actions = new Map();
  let enabled = true;
  let language = document.documentElement.lang || 'pt-BR';
  let scheduled = false;
  const english = () => language.toLowerCase().startsWith('en');
  const sourceFor = scope => {
    // A feed contains several posts. Never use the page URL for a different card.
    if (scope === document.body) return globalThis.sfSocialMediaSource(location.href);
    const candidates = [...scope.querySelectorAll('a[href]')].map(a => a.href);
    if (scope.matches('[role="dialog"]') || !scope.closest('article') || document.querySelectorAll('article').length === 1) candidates.push(location.href);
    return candidates.map(globalThis.sfSocialMediaSource).find(Boolean) || null;
  };
  function mount(target, scope, after = null) {
    let action = actions.get(target);
    if (action) { action.scope = scope; return; }
    const host = document.createElement('span');
    host.dataset.sfSocialAction = platform;
    host.style.cssText = platform === 'tiktok'
      ? 'display:flex;flex-direction:column;align-items:center;margin:8px 0;flex:none;'
      : 'display:inline-flex;align-items:center;justify-content:center;flex:none;margin:0;vertical-align:middle;';
    const shadow = host.attachShadow({mode:'closed'});
    const style = document.createElement('style');
    style.textContent = `
      :host { color:inherit; font:inherit; }
      button { font:600 12px/1.2 Arial,sans-serif; color:inherit; display:inline-flex; align-items:center;
        justify-content:center; gap:6px; border:0; background:transparent; cursor:pointer; padding:8px;
        border-radius:8px; transition:background .15s; }
      button:hover { background:rgba(128,128,128,.16); }
      button:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
      button:disabled { opacity:.55; cursor:wait; }
      svg { width:23px; height:23px; flex:none; }
      .label { display:none; }
      :host([data-sf-social-action="instagram"]) button { width:40px; height:40px; padding:8px; }
      :host([data-sf-social-action="tiktok"]) button { flex-direction:column; gap:6px; border-radius:24px; padding:8px 6px; }
      :host([data-sf-social-action="tiktok"]) svg { box-sizing:content-box; width:24px; height:24px; padding:12px; border-radius:50%; background:rgba(128,128,128,.18); }
      output { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:2147483647;
        max-width:min(400px,calc(100vw - 48px)); background:#262626; color:#fff; border-radius:8px;
        padding:12px 16px; font:400 13px/1.5 Arial,sans-serif; pointer-events:none; }
      output:empty { display:none; }
      @media(prefers-reduced-motion:reduce) { button { transition:none; } }
    `;
    const button = document.createElement('button'); button.type = 'button';
    // Static extension-owned markup; no page-provided HTML enters the shadow tree.
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('fill','none'); icon.setAttribute('stroke','currentColor');
    icon.setAttribute('stroke-width','1.8'); icon.setAttribute('stroke-linecap','round'); icon.setAttribute('stroke-linejoin','round');
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5'); icon.append(path);
    const label = document.createElement('span'); label.className = 'label'; const status = document.createElement('output');
    status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
    button.append(icon,label); shadow.append(style,button,status);
    if (after?.parentElement === target) after.after(host); else target.append(host);
    action = {host,button,label,scope,busy:false,timer:null}; actions.set(target,action);
    button.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation();
      if (!enabled || action.busy || !action.host.isConnected) return;
      const url = sourceFor(action.scope);
      if (!url) return;
      action.busy = true; refreshLabel(action);
      try {
        const response = await chrome.runtime.sendMessage({type:'social-download',url});
        if (!response?.ok) throw new Error('unavailable');
        status.textContent = response.delivery === 'protocol'
          ? (english() ? 'Confirm opening SFDownloader in your browser.' : 'Confirme a abertura do SFDownloader no navegador.')
          : (english() ? 'Choose MP4 or MP3 in SFDownloader.' : 'Escolha MP4 ou MP3 no SFDownloader.');
      } catch {
        status.textContent = english() ? 'Open SFDownloader and reload the extension.' : 'Abra o SFDownloader e recarregue a extensão.';
      } finally {
        action.busy = false; refreshLabel(action); clearTimeout(action.timer);
        action.timer = setTimeout(() => { status.textContent = ''; },5000);
      }
    });
    refreshLabel(action);
  }
  function refreshLabel(action) {
    const text = action.busy ? (english() ? 'Opening…' : 'Abrindo…') : (english() ? 'Download' : 'Baixar');
    if (action.label.textContent !== text) action.label.textContent = text;
    action.button.disabled = action.busy;
    action.button.title = english() ? 'SFDownloader · Choose MP4 or MP3' : 'SFDownloader · Escolher MP4 ou MP3';
    const ariaLabel = english() ? 'Download with SFDownloader' : 'Baixar com SFDownloader';
    if (action.button.getAttribute('aria-label') !== ariaLabel) action.button.setAttribute('aria-label',ariaLabel);
  }
  function reconcile() {
    scheduled = false;
    const targets = new Map();
    if (enabled && platform === 'tiktok') {
      for (const share of document.querySelectorAll('[data-e2e="share-icon"], [data-e2e="browse-share"], [data-e2e="share-button"]')) {
        const target = share.closest('button')?.parentElement || share.parentElement;
        const scope = share.closest('[data-e2e="recommend-list-item-container"], [data-e2e="browse-video"], article, [role="dialog"]')
          || (globalThis.sfSocialMediaSource(location.href) ? document.body : null);
        if (target && scope && sourceFor(scope)) targets.set(target,{scope});
      }
    }
    if (enabled && platform === 'instagram') {
      for (const share of document.querySelectorAll('svg[aria-label]')) {
        if (!/^(Share|Compartilhar|Send|Enviar|Share Post|Compartilhar publicação)$/i.test(share.getAttribute('aria-label'))) continue;
        let scope = share.closest('article, [role="dialog"]');
        if (!scope) {
          // New desktop layouts no longer use <article>. Find the nearest media card.
          for (let parent=share.parentElement;parent && parent !== document.body;parent=parent.parentElement) {
            if (parent.querySelector('video')) { scope=parent; break; }
          }
        }
        const directReel = /\/reels?\//.test(location.pathname) && globalThis.sfSocialMediaSource(location.href);
        if (!scope && directReel) scope = share.closest('section')?.parentElement;
        if (!scope || (!scope.querySelector('video') && !directReel) || !sourceFor(scope)) continue;
        const nativeButton = share.closest('button, [role="button"]');
        let target = nativeButton?.parentElement || share.closest('section');
        let after = nativeButton;
        // Reel actions form a vertical toolbar. Add a separate sibling action,
        // rather than widening the Share row and shifting its icon sideways.
        for (let group=nativeButton;group?.parentElement && group !== scope;group=group.parentElement) {
          const parent=group.parentElement;
          const actions=[...parent.children].filter(child => !child.hasAttribute('data-sf-social-action') &&
            (child.matches('button,[role="button"]') || child.querySelector('button,[role="button"],svg[aria-label]')));
          if (getComputedStyle(parent).flexDirection === 'column' && actions.length >= 3) {
            target=parent; after=group; break;
          }
        }
        if (target) targets.set(target,{scope,after});
      }
    }
    for (const [target,action] of actions) {
      if (!target.isConnected || !targets.has(target)) { clearTimeout(action.timer); action.host.remove(); actions.delete(target); }
    }
    for (const [target,{scope,after}] of targets) { mount(target,scope,after); refreshLabel(actions.get(target)); }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true; requestAnimationFrame(reconcile);
  }
  chrome.storage.local.get(['captureEnabled','language'], prefs => {
    enabled = prefs.captureEnabled !== false; language = prefs.language || language; schedule();
  });
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area !== 'local') return;
    if (changes.captureEnabled) enabled = changes.captureEnabled.newValue !== false;
    if (changes.language) language = changes.language.newValue || document.documentElement.lang || 'pt-BR';
    schedule();
  });
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['href','data-e2e','aria-label']});
  window.addEventListener('popstate',schedule);
  // pushState has no native event; polling only the URL also covers reused Reel cards.
  let previous = location.href;
  const timer = setInterval(() => { if (location.href !== previous) { previous = location.href; schedule(); } },500);
  window.addEventListener('pagehide',() => clearInterval(timer),{once:true});
  schedule();
})();
