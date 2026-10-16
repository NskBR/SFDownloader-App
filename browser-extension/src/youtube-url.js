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
    if (["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname)) return "tiktok";
    return globalThis.sfIsYouTubePage(value) ? "youtube" : null;
  } catch { return null; }
};

globalThis.sfSocialMediaSource = function (value) {
  try {
    const platform = globalThis.sfMediaPlatform(value);
    const url = new URL(value);
    const path = url.pathname;
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
