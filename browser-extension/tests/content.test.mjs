import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadContentScript() {
  let clickListener;
  const messages = [];

  class Element {}
  class Anchor extends Element {
    constructor(href, attributes = {}) {
      super();
      this.href = href;
      this.attributes = attributes;
    }
    closest(selector) { return selector === "a[href]" ? this : null; }
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
    getAttribute(name) { return this.attributes[name] ?? null; }
  }

  const source = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    Element,
    document: { addEventListener(type, listener) { if (type === "click") clickListener = listener; } },
    location: { href: "https://example.test/page" },
    chrome: {
      storage: {
        local: { get(_keys, callback) { callback({ fileExts: [".RAR"], captureEnabled: true, connected: true, blockedHosts: [] }); } },
        onChanged: { addListener() {} },
      },
      runtime: { sendMessage(message) { messages.push(message); return Promise.resolve({ handled: true }); } },
    },
    queueMicrotask,
  });
  return { Anchor, clickListener, messages };
}

test("does not block an intermediary page whose URL only looks like a file", async () => {
  const { Anchor, clickListener, messages } = await loadContentScript();
  const link = new Anchor("https://datanodes.example/file/archive.rar");
  let prevented = false;
  let stopped = false;

  clickListener({
    defaultPrevented: false,
    button: 0,
    target: link,
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; },
  });

  assert.equal(prevented, false);
  assert.equal(stopped, false);
  assert.deepEqual(messages, []);
});
