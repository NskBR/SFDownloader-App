import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../domain/settings";

const invoke = vi.fn(() => Promise.resolve());
const emit = vi.fn(() => Promise.resolve());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emit }));

const {
  LEGACY_SETTINGS_STORAGE_KEY,
  SETTINGS_CHANGED_EVENT,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  applyExternalSettings,
  exportSettingsBackup,
  importSettingsBackup,
  loadSettings,
  normalizeSettings,
  saveSettings,
} = await import("./settingsStorage");

const persistedEnvelope = () => JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}");

describe("settings storage", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockClear();
    emit.mockClear();
  });

  it("migra preferências v1 para o envelope versionado sem perder valores válidos", () => {
    localStorage.setItem(LEGACY_SETTINGS_STORAGE_KEY, JSON.stringify({ theme: "light", uiScale: 1.25 }));
    const loaded = loadSettings();

    expect(loaded.theme).toBe("light");
    expect(loaded.uiScale).toBe(1.25);
    expect(loaded.maxParallelDownloads).toBe(defaultSettings.maxParallelDownloads);
    expect(localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(persistedEnvelope()).toMatchObject({ version: SETTINGS_SCHEMA_VERSION, settings: { theme: "light", uiScale: 1.25 } });
  });

  it("falls back to defaults when persisted settings are invalid", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, "not-json");
    const fallback = loadSettings();
    expect({ ...fallback, language: defaultSettings.language }).toEqual(defaultSettings);
  });

  it("normalizes unsafe persisted values without discarding valid preferences", () => {
    const normalized = normalizeSettings({
      theme: "light", maxConnectionsPerDownload: 900, maxParallelDownloads: -4, uiScale: 5,
      interfaceGradient: { enabled: true, type: "radial", angle: 900, stops: [{ color: "#111", position: 20 }] },
      customCategories: [{ id: "safe", name: " Safe ", extensions: [" MP4 ", 7] }, { id: 8, name: "bad" }],
    }, "pt-BR");

    expect(normalized.theme).toBe("light");
    expect(normalized.maxConnectionsPerDownload).toBe(32);
    expect(normalized.maxParallelDownloads).toBe(1);
    expect(normalized.uiScale).toBe(1.5);
    expect(normalized.interfaceGradient.stops).toEqual([{ color: "#111", position: 20 }]);
    expect(normalized.customCategories).toEqual([{ id: "safe", name: "Safe", extensions: ["mp4"] }]);
  });

  it("persists settings, emits one native event and notifies the current window", () => {
    const listener = vi.fn();
    window.addEventListener(SETTINGS_CHANGED_EVENT, listener);
    const settings = { ...defaultSettings, rootDownloadFolder: "C:/Downloads" };
    const saved = saveSettings(settings);

    expect(saved).toEqual(settings);
    expect(persistedEnvelope()).toMatchObject({ version: SETTINGS_SCHEMA_VERSION, settings });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("settings-changed", settings);
    expect(invoke).toHaveBeenCalledWith("update_extension_theme", expect.any(Object));
  });

  it("applies a remote update without emitting another native event", () => {
    const external = { ...defaultSettings, language: "en-US" as const, uiScale: 1.25 };
    expect(applyExternalSettings(external)).toEqual(external);
    expect(emit).not.toHaveBeenCalled();
    expect(persistedEnvelope().settings).toMatchObject({ language: "en-US", uiScale: 1.25 });
  });

  it("exports and imports only compatible preference backups", () => {
    const settings = { ...defaultSettings, rootDownloadFolder: "D:/SFDownloader" };
    const backup = exportSettingsBackup(settings);
    expect(importSettingsBackup(backup)).toEqual(settings);
    expect(() => importSettingsBackup(JSON.stringify({ settings }))).toThrow("inválido");
  });
});
