import { expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
import { applyFontSettings } from "./appFonts";

it("a slow imported font cannot overwrite a newer choice, and default restores built-in fonts", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(document, "fonts");
  const add = vi.fn();
  Object.defineProperty(document, "fonts", { configurable: true, value: { add } });
  let finish!: () => void;
  class FakeFontFace {
    load() { return new Promise<FakeFontFace>(resolve => { finish = () => resolve(this); }); }
  }
  vi.stubGlobal("FontFace", FakeFontFace);
  invoke.mockResolvedValue("data:font/ttf;base64,AA==");
  const id = "a".repeat(64);
  try {
    applyFontSettings(`custom:${id}`);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    applyFontSettings("arial");
    finish();
    await vi.waitFor(() => expect(add).toHaveBeenCalledOnce());
    expect(document.documentElement.style.getPropertyValue("--font")).toContain("Arial");
    applyFontSettings(`custom:${id}`);
    await vi.waitFor(() => expect(document.documentElement.style.getPropertyValue("--font")).toContain(`SFImported-${id}`));
    expect(invoke).toHaveBeenCalledOnce();
    applyFontSettings("default");
    expect(document.documentElement.style.getPropertyValue("--font")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--window-font")).toBe("");
  } finally {
    applyFontSettings("default");
    vi.unstubAllGlobals();
    if (descriptor) Object.defineProperty(document, "fonts", descriptor);
    else Reflect.deleteProperty(document, "fonts");
  }
});
