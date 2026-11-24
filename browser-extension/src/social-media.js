(() => {
  if (window.top !== window || globalThis.sfSocialButtonsMounted) return;
  globalThis.sfSocialButtonsMounted = true;
  const platform = globalThis.sfMediaPlatform(location.href);
  if (!['instagram', 'tiktok', 'reddit', 'facebook', 'twitter'].includes(platform)) return;
  document.querySelectorAll('[data-sf-social-action]').forEach(node => node.remove());
  const actions = new Map();
  const observedRoots = new WeakSet();
  let enabled = true;
  let language = document.documentElement.lang || 'pt-BR';
  let scheduled = false;
  const english = () => language.toLowerCase().startsWith('en');
  const facebookVideo = () => {
    const videos=[...document.querySelectorAll('video')].filter(video=>!video.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(video).display!=='none' && getComputedStyle(video).visibility!=='hidden');
    const visible=videos.map(video=>{const r=video.getBoundingClientRect();return {video,area:Math.max(0,Math.min(r.right,innerWidth)-Math.max(0,r.left))*Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(0,r.top))};}).filter(item=>item.area>0).sort((a,b)=>b.area-a.area);
    return visible[0]?.video || (videos.length===1?videos[0]:null);
  };
  const sourceFor = scope => {
    if(platform === 'facebook') {
      const direct=/^\/reel\/\d+\/?$/.test(location.pathname) && globalThis.sfSocialMediaSource(location.href);
      const active=facebookVideo();
      if(direct && active && scope.contains(active))return direct;
      const candidates=[...scope.querySelectorAll('a[href]')].map(a=>a.href).map(globalThis.sfSocialMediaSource).filter(Boolean);
      if(candidates.length)return candidates[0];
      const visible=[...document.querySelectorAll('video')].filter(video=>!video.closest('[hidden],[aria-hidden="true"]'));
      return visible.length===1 && scope.contains(visible[0]) ? globalThis.sfSocialMediaSource(location.href) : null;
    }
    if (platform === 'reddit') {
      const mediaLinks = [scope.getAttribute('content-href'),
        ...[...scope.querySelectorAll('shreddit-player,video,source')].flatMap(node => [node.getAttribute('src'),node.getAttribute('src-url')])];
      for (const candidate of mediaLinks.filter(Boolean)) {
        const direct = globalThis.sfSocialMediaSource(candidate);
        if (direct && new URL(direct).hostname === 'v.redd.it') return direct;
      }
      const permalink = scope.getAttribute('permalink');
      const links = [permalink && new URL(permalink, location.origin).href,
        ...[...scope.querySelectorAll('a[href*="/comments/"]')].map(a => a.href)].filter(Boolean);
      return links.map(globalThis.sfSocialMediaSource).find(Boolean) || null;
    }
    // A feed contains several posts. Never use the page URL for a different card.
    if (scope === document.body) return globalThis.sfSocialMediaSource(location.href);
    if (platform === 'twitter') {
      const links=[...scope.querySelectorAll('a[href]')].filter(a=>a.querySelector('time'));
      return [...links,...scope.querySelectorAll('a[href*="/status/"]')].map(a=>globalThis.sfSocialMediaSource(a.href)).find(Boolean) || null;
    }
    const candidates = [...scope.querySelectorAll('a[href]')].map(a => a.href);
    if (scope.matches('[role="dialog"]') || !scope.closest('article') || document.querySelectorAll('article').length === 1) candidates.push(location.href);
    return candidates.map(globalThis.sfSocialMediaSource).find(Boolean) || null;
  };
  function matchActionLayout(action, target, after) {
    if (platform === 'reddit') {
      const reference = after || target.querySelector('shreddit-post-share-button,button,a');
      const height = reference?.getBoundingClientRect().height;
      const desired = {verticalAlign:'top', lineHeight:'0', height:height > 0 ? `${height}px` : '32px'};
      for (const [key,value] of Object.entries(desired)) {
        if (action.host.style[key] !== value) action.host.style[key] = value;
      }
      return;
    }
    if (!['instagram','facebook'].includes(platform) || !after || after.parentElement !== target) return;
    const vertical = getComputedStyle(target).flexDirection === 'column';
    const style = getComputedStyle(after);
    const rect = after.getBoundingClientRect();
    const desired = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      boxSizing: 'border-box', flexShrink: '0', alignSelf: 'center',
      width: vertical && rect.width > 0 ? `${rect.width}px` : '',
      height: vertical && rect.height > 0 ? `${rect.height}px` : '',
      marginTop: vertical ? style.marginTop : '0px',
      marginBottom: vertical ? style.marginBottom : '0px',
      paddingTop: vertical ? style.paddingTop : '0px',
      paddingBottom: vertical ? style.paddingBottom : '0px',
    };
    // Avoid observer loops: only write styles when layout actually changes.
    for (const [key,value] of Object.entries(desired)) {
      if (action.host.style[key] !== value) action.host.style[key] = value;
    }
  }
  function mount(target, scope, after = null) {
    let action = actions.get(target);
    if (action) { action.scope = scope; matchActionLayout(action,target,after); return; }
    const host = document.createElement('span');
    host.dataset.sfSocialAction = platform;
    host.style.cssText = platform === 'tiktok'
      ? 'display:flex;flex-direction:column;align-items:center;margin:8px 0;flex:none;'
      : 'display:inline-flex;align-items:center;justify-content:center;flex:none;margin:0;align-self:center;vertical-align:middle;';
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
      :host([data-sf-social-action="twitter"]) button { color:var(--color-text-secondary,rgb(113,118,123));padding:6px;border-radius:50%; }
      :host([data-sf-social-action="twitter"]) button:hover { color:rgb(29,155,240);background:rgba(29,155,240,.12); }
      :host([data-sf-social-action="twitter"]) svg { width:19px;height:19px; }
      :host([data-sf-social-action="reddit"]) .label { display:inline; }
      :host([data-sf-social-action="reddit"]) { vertical-align:top; line-height:0; }
      :host([data-sf-social-action="reddit"]) button { box-sizing:border-box; height:100%; font:600 12px/1 var(--font-sans,Arial,sans-serif); min-height:32px; padding:0 12px; gap:6px; border-radius:999px; color:var(--color-neutral-content-strong,inherit); background:var(--color-secondary-background,rgba(128,128,128,.16)); margin:0; }
      :host([data-sf-social-action="reddit"]) button:hover { background:var(--color-secondary-background-hover,rgba(128,128,128,.26)); }
      :host([data-sf-social-action="reddit"]) svg { width:20px; height:20px; }
      :host([data-sf-social-action="instagram"]) button { box-sizing:border-box; width:40px; height:40px; padding:8px; flex-shrink:0; }
      :host([data-sf-social-action="facebook"]) { color:#fff; opacity:1; }
      :host([data-sf-social-action="facebook"]) button { box-sizing:border-box; width:40px; height:40px; padding:9px; border-radius:50%; background:rgba(24,27,31,.85); color:#fff; border:1px solid rgba(255,255,255,.18); }
      :host([data-sf-social-action="facebook"]) button:hover { background:rgba(58,62,68,.95); }
      :host([data-sf-social-action="facebook"]) svg { color:#fff; stroke:#fff; }
      :host([data-sf-facebook-overlay]) { position:absolute !important; right:14px; bottom:58px; z-index:100; }
      :host([data-sf-facebook-overlay]) button { width:auto; height:36px; padding:0 12px; border-radius:20px; background:rgba(20,23,27,.85); color:white; box-shadow:0 2px 8px #0005; }
      :host([data-sf-facebook-overlay]) .label { display:inline; }
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
    matchActionLayout(action,target,after);
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
    if (enabled && platform === 'twitter') {
      for (const scope of document.querySelectorAll('article[data-testid="tweet"]')) {
        if (!scope.querySelector('video,[data-testid="videoPlayer"],[data-testid="videoComponent"]') || !sourceFor(scope)) continue;
        const target=scope.querySelector('[role="group"]');
        if (target) targets.set(target,{scope});
      }
    }
    if(enabled && platform==='facebook') {
      for(const share of document.querySelectorAll('button,[role="button"]')) {
        if(share.closest('[hidden],[aria-hidden="true"]'))continue;
        const label=(share.getAttribute('aria-label') || share.querySelector('[aria-label]')?.getAttribute('aria-label') || share.getAttribute('title') || share.textContent || '').trim();
        if(!/^(Compartilhar|Share|Del)(?:\b|$)/i.test(label))continue;
        let scope=share.parentElement;
        while(scope && scope!==document.body && !scope.querySelector('video'))scope=scope.parentElement;
        if(!scope || scope===document.body || !sourceFor(scope))continue;
        const target=share.parentElement;
        if(target)targets.set(target,{scope,after:share});
      }
      const active=facebookVideo();
      if(![...targets.values()].some(item=>active && item.scope.contains(active)) && /^\/reel\/\d+\/?$/.test(location.pathname)) {
        const video=active;const target=video?.parentElement;
        if(target && sourceFor(target))targets.set(target,{scope:target,overlay:true});
      }
    }
    if (enabled && platform === 'reddit') {
      for (const scope of document.querySelectorAll('shreddit-post, article, .thing.link')) {
        const roots = [scope];
        for (let index=0; index<roots.length; index++) {
          const root = roots[index];
          if (root.host && !observedRoots.has(root)) {
            new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
            observedRoots.add(root);
          }
          for (const node of [root, ...root.querySelectorAll('*')]) {
            if (node.shadowRoot && !roots.includes(node.shadowRoot)) roots.push(node.shadowRoot);
          }
        }
        if (scope.getAttribute('post-type') !== 'video' && !roots.some(root =>
          root.querySelector('video,shreddit-player,shreddit-async-loader[bundlename*="video"]'))) continue;
        if (!sourceFor(scope)) continue;
        let target, after;
        for (const root of roots) {
          const share = root.querySelector('shreddit-post-share-button, [slot="share-button"], button[aria-label="Share"], button[aria-label="Compartilhar"], button[data-post-click-location="share"]');
          target = share?.parentElement || root.querySelector('[slot="post-actions"], .flat-list.buttons, [part="post-actions"]');
          if (target) { after = share; break; }
        }
        if (!target) continue;
        targets.set(target, {scope,after});
      }
    }
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
      if (!target.isConnected || !targets.has(target)) { clearTimeout(action.timer); action.host.remove(); if(action.restorePosition!==undefined)target.style.position=action.restorePosition; actions.delete(target); }
    }
    for (const [target,{scope,after,overlay}] of targets) {
      mount(target,scope,after);const action=actions.get(target);
      if(overlay){
        if(!action.host.hasAttribute('data-sf-facebook-overlay'))action.host.setAttribute('data-sf-facebook-overlay','');
        if(getComputedStyle(target).position==='static' || getComputedStyle(target).position==='') {action.restorePosition=target.style.position;target.style.position='relative';}
      } else if(action.host.hasAttribute('data-sf-facebook-overlay')) {action.host.removeAttribute('data-sf-facebook-overlay');if(action.restorePosition!==undefined){target.style.position=action.restorePosition;delete action.restorePosition;}}
      refreshLabel(action);
    }
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
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['href','data-e2e','aria-label','permalink','post-type','content-href','src','src-url']});
  window.addEventListener('popstate',schedule);
  if(platform==='facebook') {
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule);
    document.addEventListener('loadedmetadata',schedule,true);
    document.addEventListener('play',schedule,true);
  }
  // pushState has no native event; polling only the URL also covers reused Reel cards.
  let previous = location.href;
  const timer = setInterval(() => { if (location.href !== previous) { previous = location.href; schedule(); } },500);
  window.addEventListener('pagehide',() => clearInterval(timer),{once:true});
  schedule();
})();
