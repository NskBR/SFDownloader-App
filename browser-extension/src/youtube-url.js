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
