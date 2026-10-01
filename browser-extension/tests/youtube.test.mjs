import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const helper = await readFile(new URL("../src/youtube-url.js", import.meta.url), "utf8");
const script = await readFile(new URL("../src/youtube.js", import.meta.url), "utf8");
const videoUrl = "https://www.youtube.com/watch?v=NgA_JGCbEWE";
const toolbar = '<ytd-watch-metadata><div id="top-level-buttons-computed"><button>Compartilhar</button></div></ytd-watch-metadata>';

function fixture({ url = videoUrl, html = toolbar, prefs = {}, send } = {}) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  const { window } = dom;
  const messages = [];
  const frames = [];
  let storageListener;
  let shadow;
  const original = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function (options) {
    shadow = original.call(this, options);
    return shadow;
  };
  window.requestAnimationFrame = callback => frames.push(callback);
  window.chrome = {
    runtime: {
      getURL: path => `moz-extension://sf-test/${path}`,
      sendMessage: async message => { messages.push(message); return send ? send(message) : { ok: true, delivery: "bridge" }; },
    },
    storage: {
      local: { get(_keys, callback) { callback(prefs); } },
      onChanged: { addListener(listener) { storageListener = listener; } },
    },
  };
  window.eval(helper);
  window.eval(script);
  async function flush() {
    await Promise.resolve();
    while (frames.length) frames.shift()();
    await new Promise(resolve => setImmediate(resolve));
  }
  return { window, messages, flush, shadow, close: () => window.close(), change: changes => storageListener(changes, "local") };
}

test("accepts individual videos without a list and recognizes a list on watch links", () => {
  const f = fixture();
  try {
    for (const url of [videoUrl + "&t=1", "https://youtu.be/NgA_JGCbEWE", "https://www.youtube.com/shorts/NgA_JGCbEWE"]) {
      assert.equal(f.window.sfYouTubeSource(url), videoUrl);
    }
    assert.equal(f.window.sfYouTubeSource("https://www.youtube.com/watch?v=9Vt4XguN2-A&list=PLQGx8UJi4WEwUFhQtbhJo3LXOP4CswNQS"), "https://www.youtube.com/playlist?list=PLQGx8UJi4WEwUFhQtbhJo3LXOP4CswNQS");
    assert.equal(f.window.sfYouTubeSource("https://music.youtube.com/watch?v=NgA_JGCbEWE"), "https://music.youtube.com/watch?v=NgA_JGCbEWE");
    for (const url of ["https://youtube.com.evil.test/watch?v=NgA_JGCbEWE", "https://youtube.com@evil.test/watch?v=NgA_JGCbEWE", "https://www.youtube.com/playlist?list=test", "https://www.youtube.com/watch?v=bad", "javascript:alert(1)", "https://www.youtube.com:123/watch?v=NgA_JGCbEWE", "http://www.youtube.com/watch?v=NgA_JGCbEWE"]) {
      assert.equal(f.window.sfYouTubeSource(url), null);
    }
  } finally { f.close(); }
});

test("inserts one isolated button and uses the current URL after SPA navigation", async () => {
  const f = fixture();
  try {
    await f.flush();
    const getHost = () => f.window.document.getElementById("sfdownloader-youtube-action");
    assert.equal(getHost().parentElement.id, "top-level-buttons-computed");
    assert.equal(f.shadow.querySelector("button").textContent, "Baixar");
    assert.equal(f.shadow.querySelector("button").getAttribute("aria-label"), "Baixar com SFDownloader");
    f.window.eval(script);
    f.window.document.dispatchEvent(new f.window.Event("yt-navigate-start"));
    assert.equal(getHost(), null);
    f.window.history.pushState({}, "", "/watch?v=abcdefghijk&list=PL0123456789");
    f.window.document.dispatchEvent(new f.window.Event("yt-navigate-finish"));
    await f.flush();
    assert.equal(f.window.document.querySelectorAll("#sfdownloader-youtube-action").length, 1);
    f.shadow.querySelector("button").click();
    await f.flush();
    assert.equal(f.messages[0].url, "https://www.youtube.com/playlist?list=PL0123456789");
    assert.match(f.shadow.querySelector('[role="status"]').textContent, /Escolha o formato/);
    f.window.history.pushState({}, "", "/");
    f.window.document.dispatchEvent(new f.window.Event("yt-navigate-finish"));
    await f.flush();
    assert.equal(getHost(), null);
  } finally { f.close(); }
});

test("recognizes saved playlist links and sends the complete canonical playlist from its own header", async () => {
  const url = "https://www.youtube.com/playlist?list=PL0123456789_test&index=3";
  const f = fixture({url, html:'<ytd-playlist-header-renderer><div id="top-level-buttons-computed"></div></ytd-playlist-header-renderer>'});
  try {
    await f.flush();
    assert.ok(f.window.document.getElementById("sfdownloader-youtube-action"));
    assert.equal(f.window.sfYouTubeSource("https://music.youtube.com/playlist?list=PL0123456789_test"), "https://www.youtube.com/playlist?list=PL0123456789_test");
    assert.equal(f.window.sfYouTubeSource("https://youtube.com/playlist?list=RDabcdefghijk"), "https://www.youtube.com/playlist?list=RDabcdefghijk");
    assert.equal(f.window.sfYouTubeSource("https://youtube.com/watch?v=NgA_JGCbEWE&list=RDNgA_JGCbEWE"), "https://www.youtube.com/watch?v=NgA_JGCbEWE&list=RDNgA_JGCbEWE");
    assert.equal(f.window.sfYouTubeSource("https://youtu.be/NgA_JGCbEWE?list=RDMM"), "https://www.youtube.com/watch?v=NgA_JGCbEWE&list=RDMM");
    for (const source of ["https://evil.test/playlist?list=PL0123456789", "http://youtube.com/playlist?list=PL0123456789", "https://user@youtube.com/playlist?list=PL0123456789", "https://youtube.com:1234/playlist?list=PL0123456789"]) {
      assert.equal(f.window.sfYouTubeSource(source), null);
    }
    f.shadow.querySelector("button").click();
    await f.flush();
    assert.equal(f.messages[0].url, "https://www.youtube.com/playlist?list=PL0123456789_test");
  } finally { f.close(); }
});

test("restores button after toolbar replacement and follows capture and language preferences", async () => {
  const f = fixture();
  try {
    await f.flush();
    f.window.document.querySelector("ytd-watch-metadata").remove();
    await f.flush();
    f.window.document.body.insertAdjacentHTML("beforeend", toolbar);
    await f.flush();
    assert.equal(f.window.document.querySelectorAll("#sfdownloader-youtube-action").length, 1);
    f.change({ captureEnabled: { newValue: false } });
    await f.flush();
    assert.equal(f.window.document.getElementById("sfdownloader-youtube-action"), null);
    f.change({ captureEnabled: { newValue: true }, language: { newValue: "en-US" } });
    await f.flush();
    assert.equal(f.shadow.querySelector("button").textContent, "Download");
  } finally { f.close(); }
});

test("serializes rapid clicks, shows failure and permits retry", async () => {
  let deliver;
  const f = fixture({ send: () => new Promise(resolve => { deliver = resolve; }) });
  try {
    await f.flush();
    const button = f.shadow.querySelector("button");
    button.click(); button.click();
    assert.equal(f.messages.length, 1);
    assert.equal(button.disabled, true);
    deliver({ ok: false });
    await f.flush();
    assert.equal(button.disabled, false);
    assert.match(f.shadow.querySelector('[role="status"]').textContent, /Não foi possível/);
    button.click();
    deliver({ ok: true, delivery: "protocol" });
    await f.flush();
    assert.match(f.shadow.querySelector('[role="status"]').textContent, /Confirme a abertura/);
  } finally { f.close(); }
});

test("attaches to the active Short and YouTube Music player", async () => {
  for (const options of [
    { url: "https://www.youtube.com/shorts/NgA_JGCbEWE", html: '<ytd-reel-video-renderer><div id="actions"></div></ytd-reel-video-renderer><ytd-reel-video-renderer is-active><div id="actions"></div></ytd-reel-video-renderer>' },
    { url: "https://music.youtube.com/watch?v=NgA_JGCbEWE", html: '<ytmusic-player-bar><div id="right-controls"></div></ytmusic-player-bar>' },
  ]) {
    const f = fixture(options);
    try {
      await f.flush();
      assert.ok(f.window.document.getElementById("sfdownloader-youtube-action"));
      if (options.url.includes("/shorts/")) assert.ok(f.window.document.getElementById("sfdownloader-youtube-action").closest("[is-active]"));
    } finally { f.close(); }
  }
});

test("waits for asynchronous YouTube controls without touching ordinary websites", async () => {
  const f = fixture({ html: "" });
  try {
    await f.flush();
    assert.equal(f.window.document.getElementById("sfdownloader-youtube-action"), null);
    f.window.document.body.insertAdjacentHTML("beforeend", toolbar);
    await f.flush();
    assert.ok(f.window.document.getElementById("sfdownloader-youtube-action"));
  } finally { f.close(); }
  const other = fixture({ url: "https://example.test/" });
  try {
    await other.flush();
    assert.equal(other.window.document.getElementById("sfdownloader-youtube-action"), null);
    assert.deepEqual(other.messages, []);
  } finally { other.close(); }
});

test("ignores retained hidden watch controls and replaces an invalidated extension button", async () => {
  const f = fixture({ html: `<ytd-watch-flexy hidden>${toolbar}</ytd-watch-flexy><span id="sfdownloader-youtube-action">Old extension</span>${toolbar}` });
  try {
    await f.flush();
    const buttons = f.window.document.querySelectorAll("#sfdownloader-youtube-action");
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].closest("[hidden]"), null);
    assert.equal(buttons[0].textContent, "");
  } finally { f.close(); }
});
