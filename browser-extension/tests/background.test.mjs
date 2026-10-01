import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

function event() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    first() {
      return listeners[0];
    },
  };
}

async function loadBackground(
  storageState = { captureEnabled: true, disabledExtensions: [], language: "en-US" },
  testOptions = {},
) {
  const listeners = {
    message: event(),
    installed: event(),
    startup: event(),
    sendHeaders: event(),
    headersReceived: event(),
    error: event(),
    alarm: event(),
    determiningFilename: event(),
    created: event(),
    changed: event(),
    storageChanged: event(),
    contextClicked: event(),
  };
  const cookieUrls = [];
  const posted = [];
  const createdTabs = [];
  const iconCalls = [];
  const cancelledDownloads = [];
  const erasedDownloads = [];
  const actionApi = {
    setIcon(data) { iconCalls.push(data); return Promise.resolve(); },
    setTitle: () => Promise.resolve(),
  };

  const chrome = {
    alarms: { create() {}, onAlarm: listeners.alarm },
    ...(testOptions.firefox ? { browserAction: actionApi } : { action: actionApi }),
    contextMenus: {
      update(_id, _data, callback) { callback?.(); },
      removeAll(callback) { callback?.(); },
      create(_data, callback) { callback?.(); },
      onClicked: listeners.contextClicked,
    },
    cookies: {
      getAll({ url }, callback) {
        cookieUrls.push(url);
        callback([{ name: "session", value: "target-only" }]);
      },
    },
    downloads: {
      onDeterminingFilename: listeners.determiningFilename,
      onCreated: listeners.created,
      onChanged: listeners.changed,
      cancel(id, callback) { cancelledDownloads.push(id); callback?.(); },
      erase(query, callback) { erasedDownloads.push(query.id); callback?.(); },
    },
    runtime: {
      lastError: null,
      onInstalled: listeners.installed,
      onStartup: listeners.startup,
      onMessage: listeners.message,
    },
    storage: {
      local: {
        get(_keys, callback) {
          callback(storageState);
        },
        set(values) { Object.assign(storageState, values); },
      },
      onChanged: listeners.storageChanged,
    },
    tabs: {
      create(data) { createdTabs.push(data); return Promise.resolve({ id: 1 }); },
      remove: () => Promise.resolve(),
    },
    webRequest: {
      onSendHeaders: listeners.sendHeaders,
      onHeadersReceived: listeners.headersReceived,
      onErrorOccurred: listeners.error,
    },
  };
  const fetch = async (url, options = {}) => {
    if (url.endsWith("/sync")) {
      if (testOptions.failSync) throw new Error("App closed");
      return {
        ok: true,
        json: async () => ({ token: "token", fileExts: testOptions.fileExts || [".ZIP"], blockedHosts: [] }),
      };
    }
    if (testOptions.failDownload && url.endsWith("/download")) return { ok: false, status: 503 };
    posted.push({ url, options });
    return { ok: true };
  };
  const source = await readFile(new URL("../src/background.js", import.meta.url), "utf8");
  const youtubeSource = await readFile(new URL("../src/youtube-url.js", import.meta.url), "utf8");
  vm.runInNewContext(`${youtubeSource}\n${source}`, {
    URL,
    chrome,
    console,
    fetch,
    navigator: { userAgent: "test-agent" },
    setInterval() { return 0; },
    setTimeout() { return 0; },
  });
  await sendMessage(listeners.message.first(), { type: "bridge-status" });
  return { cookieUrls, listeners, posted, storageState, createdTabs, iconCalls, cancelledDownloads, erasedDownloads };
}

function sendMessage(listener, message, sender = {}) {
  return new Promise((resolve) => {
    const keepChannelOpen = listener(message, sender, resolve);
    assert.equal(keepChannelOpen, true);
  });
}

test("forwards only cookies belonging to the download host", async () => {
  const { cookieUrls, listeners, posted } = await loadBackground();
  const response = await sendMessage(listeners.message.first(), {
    type: "send-to-app",
    url: "https://files.example/archive.zip",
  });

  assert.equal(response.ok, true);
  assert.deepEqual(cookieUrls, ["https://files.example/archive.zip"]);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].url, "http://127.0.0.1:17831/download");
});

test("refuses local URLs before they reach the desktop bridge", async () => {
  const { cookieUrls, listeners, posted } = await loadBackground();
  const response = await sendMessage(listeners.message.first(), {
    type: "send-to-app",
    url: "http://127.0.0.1/private.zip",
  });

  assert.equal(response.ok, false);
  assert.deepEqual(cookieUrls, []);
  assert.deepEqual(posted, []);
});


test("refuses unsupported protocols before they reach the bridge", async () => {
  const { cookieUrls, listeners, posted } = await loadBackground();
  const response = await sendMessage(listeners.message.first(), {
    type: "send-to-app",
    url: "ftp://files.example/archive.zip",
  });

  assert.equal(response.ok, false);
  assert.deepEqual(cookieUrls, []);
  assert.deepEqual(posted, []);
});
test("captures an attachment only after the desktop bridge accepts it", async () => {
  const { listeners, posted, cancelledDownloads } = await loadBackground();
  listeners.sendHeaders.first()({
    requestId: "utf8-file",
    method: "GET",
    url: "https://files.example/download",
    requestHeaders: [],
  });
  const handler = listeners.headersReceived.first();
  const result = handler({
    requestId: "utf8-file",
    method: "GET",
    statusCode: 200,
    type: "xmlhttprequest",
    url: "https://files.example/download",
    responseHeaders: [
      { name: "Content-Disposition", value: "attachment; filename*=UTF-8''relat%C3%B3rio.zip" },
      { name: "Content-Type", value: "application/zip" },
      { name: "Content-Length", value: "42" },
    ],
  });

  assert.equal(result, undefined);
  await new Promise((resolve) => {
    listeners.determiningFilename.first()({
      id: 17,
      url: "https://files.example/download",
      finalUrl: "https://files.example/download",
      filename: "relatório.zip",
      fileSize: 42,
      mime: "application/zip",
    }, resolve);
  });
  const payload = JSON.parse(posted.at(-1).options.body);
  assert.equal(payload.filename, "relatório.zip");
  assert.equal(payload.fileSize, 42);
  assert.deepEqual(cancelledDownloads, [17]);
});

test("does not intercept web assets returned without an attachment header", async () => {
  const { listeners } = await loadBackground();
  const result = listeners.headersReceived.first()({
    requestId: "web-asset",
    method: "GET",
    statusCode: 200,
    type: "script",
    url: "https://cdn.example/app.js",
    responseHeaders: [{ name: "Content-Type", value: "application/javascript" }],
  });

  assert.equal(result, undefined);
});

test("respects an extension exclusion configured by the user", async () => {
  const { listeners } = await loadBackground();
  await sendMessage(listeners.message.first(), {
    type: "extension-filters-updated",
    disabledExtensions: ["zip"],
  });
  const response = await sendMessage(listeners.message.first(), {
    type: "intercept-link",
    url: "https://files.example/archive.zip",
    filename: "archive.zip",
  });

  assert.equal(response.handled, false);
});

test("disconnects the bridge after capture is disabled", async () => {
  const { listeners, posted, storageState } = await loadBackground();
  storageState.captureEnabled = false;
  await sendMessage(listeners.message.first(), { type: "capture-toggled", enabled: false });

  assert.equal(posted.at(-1).url, "http://127.0.0.1:17831/disconnect");
});

test("falls back to the application deep link when the local bridge rejects a download", async () => {
  const { createdTabs, listeners } = await loadBackground(undefined, { failDownload: true });
  const response = await sendMessage(listeners.message.first(), {
    type: "send-to-app",
    url: "https://files.example/archive.zip",
  });

  assert.equal(response.ok, true);
  assert.equal(createdTabs.length, 1);
  assert.equal(
    createdTabs[0].url,
    "sfdownloader://download?url=https%3A%2F%2Ffiles.example%2Farchive.zip",
  );
});

test("keeps the native browser download when the bridge rejects automatic takeover", async () => {
  const { listeners, cancelledDownloads, createdTabs } = await loadBackground(undefined, { failDownload: true });
  await new Promise((resolve) => {
    listeners.determiningFilename.first()({
      id: 23,
      url: "https://files.example/archive.zip",
      finalUrl: "https://files.example/archive.zip",
      filename: "archive.zip",
      fileSize: 10,
      mime: "application/zip",
    }, resolve);
  });

  assert.deepEqual(cancelledDownloads, []);
  assert.deepEqual(createdTabs, []);
});

test("does not reproduce a POST download as an unsafe GET request", async () => {
  const { listeners, posted, cancelledDownloads } = await loadBackground();
  listeners.sendHeaders.first()({
    requestId: "post-download",
    method: "POST",
    url: "https://files.example/generated.zip",
    requestHeaders: [],
  });
  listeners.headersReceived.first()({
    requestId: "post-download",
    method: "POST",
    statusCode: 200,
    type: "main_frame",
    url: "https://files.example/generated.zip",
    responseHeaders: [{ name: "Content-Disposition", value: "attachment; filename=generated.zip" }],
  });
  await new Promise((resolve) => {
    listeners.determiningFilename.first()({
      id: 29,
      url: "https://files.example/generated.zip",
      finalUrl: "https://files.example/generated.zip",
      filename: "generated.zip",
      fileSize: 10,
      mime: "application/zip",
    }, resolve);
  });

  assert.deepEqual(posted.filter(item => item.url.endsWith("/download")), []);
  assert.deepEqual(cancelledDownloads, []);
});

test("captures media URLs supported by the synchronized extension list", async () => {
  const { listeners, posted } = await loadBackground(undefined, { fileExts: [".MP4"] });
  const response = await sendMessage(listeners.message.first(), {
    type: "intercept-link",
    url: "https://media.example/video.mp4",
    filename: "video.mp4",
    referrer: "https://media.example/watch",
  });
  assert.equal(response.handled, true);
  assert.equal(JSON.parse(posted.at(-1).options.body).referrer, "https://media.example/watch");
});

test("independent browser profiles can synchronize and submit downloads", async () => {
  const first = await loadBackground();
  const second = await loadBackground();
  for (const profile of [first, second]) {
    const response = await sendMessage(profile.listeners.message.first(), {
      type: "send-to-app",
      url: "https://files.example/archive.zip",
    });
    assert.equal(response.ok, true);
    assert.equal(JSON.parse(profile.posted.at(-1).options.body).token, "token");
  }
});

test("uses the Firefox browserAction API when Chrome action is unavailable", async () => {
  const { iconCalls, storageState } = await loadBackground(undefined, { firefox: true });

  assert.equal(storageState.connected, true);
  assert.ok(iconCalls.length > 0);
});

test("YouTube button sends a canonical video URL without cookies or observed credentials", async () => {
  const { listeners, cookieUrls, posted } = await loadBackground();
  const response = await sendMessage(listeners.message.first(), {
    type: "youtube-download", url: "https://www.youtube.com/watch?v=NgA_JGCbEWE&t=30",
  }, { url: "https://www.youtube.com/", frameId: 0 });
  assert.equal(response.ok, true);
  assert.equal(response.delivery, "bridge");
  assert.deepEqual(cookieUrls, []);
  assert.deepEqual(JSON.parse(posted.at(-1).options.body), {
    token: "token", url: "https://www.youtube.com/watch?v=NgA_JGCbEWE", requestHeaders: {},
  });
});

test("YouTube button preserves Music URLs and does not use file extension filters", async () => {
  const { listeners, posted } = await loadBackground({ captureEnabled: true, disabledExtensions: [".MP3", ".MP4"] });
  const response = await sendMessage(listeners.message.first(), {
    type: "youtube-download", url: "https://music.youtube.com/watch?v=NgA_JGCbEWE&t=2",
  }, { url: "https://music.youtube.com/watch?v=NgA_JGCbEWE" });
  assert.equal(response.ok, true);
  assert.equal(JSON.parse(posted.at(-1).options.body).url, "https://music.youtube.com/watch?v=NgA_JGCbEWE");
});

test("playlist action sends only the canonical public playlist without credentials", async () => {
  const { listeners, cookieUrls, posted } = await loadBackground();
  const response = await sendMessage(listeners.message.first(), {type:"youtube-download", url:"https://www.youtube.com/playlist?list=PL0123456789_test&index=5"}, {url:"https://www.youtube.com/playlist?list=PL0123456789_test", frameId:0});
  assert.equal(response.ok, true);
  assert.deepEqual(cookieUrls, []);
  assert.deepEqual(JSON.parse(posted.at(-1).options.body), {token:"token",url:"https://www.youtube.com/playlist?list=PL0123456789_test",requestHeaders:{}});
});

test("Mix action preserves its seed video and list while dropping tracking and credentials", async () => {
  const { listeners, cookieUrls, posted } = await loadBackground();
  const source = "https://www.youtube.com/watch?v=NgA_JGCbEWE&list=RDMM&index=5&t=30";
  const response = await sendMessage(listeners.message.first(), {type:"youtube-download",url:source}, {url:source,frameId:0});
  assert.equal(response.ok,true);
  assert.deepEqual(cookieUrls,[]);
  assert.deepEqual(JSON.parse(posted.at(-1).options.body), {token:"token",url:"https://www.youtube.com/watch?v=NgA_JGCbEWE&list=RDMM",requestHeaders:{}});
});

test("YouTube button rejects lookalike hosts, unsupported pages and untrusted frames", async () => {
  const { listeners, posted, createdTabs, cookieUrls } = await loadBackground();
  const url = "https://www.youtube.com/watch?v=NgA_JGCbEWE";
  for (const [target, sender] of [
    ["https://www.youtube.com.evil.test/watch?v=NgA_JGCbEWE", { url }],
    ["https://www.youtube.com/playlist?list=PL_TEST", { url }],
    [url, { url: "https://evil.test/" }], [url, { url, frameId: 1 }], [url, {}],
  ]) {
    assert.equal((await sendMessage(listeners.message.first(), { type: "youtube-download", url: target }, sender)).ok, false);
  }
  assert.deepEqual(posted, []);
  assert.deepEqual(createdTabs, []);
  assert.deepEqual(cookieUrls, []);
});

test("YouTube button launches the installed app when the bridge is unavailable", async () => {
  for (const options of [{ failSync: true }, { failDownload: true }]) {
    const { listeners, createdTabs } = await loadBackground(undefined, options);
    const url = "https://www.youtube.com/watch?v=NgA_JGCbEWE";
    const response = await sendMessage(listeners.message.first(), { type: "youtube-download", url }, { url });
    assert.equal(response.delivery, "protocol");
    assert.equal(createdTabs[0].url, `sfdownloader://download?url=${encodeURIComponent(url)}`);
  }
});

test("disabled capture prevents manual media dispatch", async () => {
  const { listeners, posted, createdTabs, storageState } = await loadBackground();
  storageState.captureEnabled = false;
  await sendMessage(listeners.message.first(), { type: "capture-toggled", enabled: false });
  const url = "https://www.youtube.com/watch?v=NgA_JGCbEWE";
  assert.equal((await sendMessage(listeners.message.first(), { type: "youtube-download", url }, { url })).ok, false);
  assert.equal(posted.filter(p => p.url.endsWith("/download")).length, 0);
  assert.deepEqual(createdTabs, []);
});
