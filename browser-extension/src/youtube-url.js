// Shared by the background worker and the isolated YouTube content script.
// Never accept lookalike domains or arbitrary media URLs.
globalThis.sfIsYouTubePage = function (value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(url.hostname);
  } catch { return false; }
};
globalThis.sfYouTubeSource = function (value) {
  try {
    if (!globalThis.sfIsYouTubePage(value)) return null;
    const url = new URL(value);
    if (url.pathname === "/playlist" || (url.searchParams.has("list") && (url.pathname === "/watch" || (url.hostname === "youtu.be" && /^\/[a-zA-Z0-9_-]{11}$/.test(url.pathname))))) {
      const list = url.searchParams.get("list") || "";
      if (!/^[a-zA-Z0-9_-]{10,150}$/.test(list) && list !== "RDMM") return null;
      if (/^(RD|UL)/.test(list)) {
        const seed = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v");
        if (seed != null) {
          if (!/^[a-zA-Z0-9_-]{11}$/.test(seed)) return null;
          return `https://www.youtube.com/watch?v=${seed}&list=${list}`;
        }
      }
      return `https://www.youtube.com/playlist?list=${list}`;
    }
    let id;
    if (url.hostname === "youtu.be") id = url.pathname.slice(1);
    else if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/shorts\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    if (!/^[a-zA-Z0-9_-]{11}$/.test(id || "")) return null;
    const host = url.hostname === "music.youtube.com" ? "music.youtube.com" : "www.youtube.com";
    return `https://${host}/watch?v=${id}`;
  } catch { return null; }
};

globalThis.sfMediaPlatform = function (value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (["instagram.com", "www.instagram.com"].includes(url.hostname)) return "instagram";
    if (["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"].includes(url.hostname)) return "facebook";
    if (["reddit.com", "www.reddit.com", "old.reddit.com", "sh.reddit.com", "redd.it", "v.redd.it"].includes(url.hostname)) return "reddit";
    if (["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname)) return "tiktok";
    if (["x.com","www.x.com","twitter.com","www.twitter.com","mobile.twitter.com"].includes(url.hostname)) return "twitter";
    return globalThis.sfIsYouTubePage(value) ? "youtube" : null;
  } catch { return null; }
};

globalThis.sfSocialMediaSource = function (value) {
  try {
    const platform = globalThis.sfMediaPlatform(value);
    const url = new URL(value);
    const path = url.pathname;
    if (platform === 'twitter') {
      const match=/^\/(?:[A-Za-z0-9_]{1,15}\/status|i\/web\/status)\/(\d{5,25})(?:\/(?:video|photo)\/\d+)?\/?$/.exec(path);
      return match ? `https://x.com/i/web/status/${match[1]}` : null;
    }
    if(platform === 'facebook') {
      const reel=/^\/reel\/(\d{5,30})\/?$/.exec(path);
      const watch=/^\/(?:watch\/?|video\.php)$/.test(path) && url.searchParams.get('v');
      const id=reel?.[1] || watch;
      return /^\d{5,30}$/.test(id || '') ? `https://www.facebook.com/reel/${id}/` : null;
    }
    if (platform === "reddit") {
      if (url.hostname === 'v.redd.it') {
        const video = /^\/([a-z0-9]{1,32})(?:\/(?:DASHPlaylist\.mpd|HLSPlaylist\.m3u8|(?:CMAF|DASH)_\d+\.mp4))?\/?$/i.exec(path);
        return video ? `https://v.redd.it/${video[1]}/DASHPlaylist.mpd` : null;
      }
      const match = /^(?:\/r\/[A-Za-z0-9_]+)?\/comments\/([a-z0-9]+)(?:\/[^/]+)?\/?$/i.exec(path);
      const short = url.hostname === "redd.it" && /^\/([a-z0-9]+)\/?$/i.exec(path);
      const id = match?.[1] || short?.[1];
      return id ? `https://www.reddit.com/comments/${id.toLowerCase()}/` : null;
    }
    if (platform === "instagram") {
      const match = /^\/(?:[A-Za-z0-9_.]{1,128}\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{1,128})\/?$/.exec(path);
      return match ? `https://www.instagram.com/${match[1] === "reels" ? "reel" : match[1]}/${match[2]}/` : null;
    }
    if (platform === "tiktok") {
      const video = /^\/@([A-Za-z0-9_.-]{1,128})\/video\/(\d{10,25})\/?$/.exec(path);
      if (video && !["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname)) return `https://www.tiktok.com/@${video[1]}/video/${video[2]}`;
      const short = ["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname)
        ? /^\/([A-Za-z0-9_-]{1,128})\/?$/.exec(path) : /^\/t\/([A-Za-z0-9_-]{1,128})\/?$/.exec(path);
      if (short) return `https://${["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname) ? url.hostname : "www.tiktok.com/t"}/${short[1]}/`;
    }
    return null;
  } catch { return null; }
};
