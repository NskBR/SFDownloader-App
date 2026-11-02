import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, gameThemeIds } from "../domain/settings";

it.each(["naruto-baryon","hinata"])("migrates the previous %s theme into the Naruto collection",old=>{
 const settings=normalizeSettings({gameTheme:old},"pt-BR");
 expect(settings.gameTheme).toBe("naruto");expect(settings.themeWallpapers.naruto).toBe(old);
 const backup=importSettingsBackup(exportSettingsBackup(settings));expect(backup.themeWallpapers.naruto).toBe(old);
});

it("preserves wallpaper choice per theme and rejects unregistered wallpaper IDs",()=>{
 const settings=normalizeSettings({gameTheme:"cyberpunk",themeWallpapers:{"cyberpunk":"cyberpunk--v-sunset",unknown:"../../file"}},"pt-BR");
 expect(importSettingsBackup(exportSettingsBackup(settings)).themeWallpapers).toEqual({"cyberpunk":"cyberpunk--v-sunset"});
 expect(normalizeSettings({themeWallpapers:{"cyberpunk":"../../file"}},"pt-BR").themeWallpapers["cyberpunk"]).toBe("cyberpunk");
});


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
  it("keeps the text font in backups and window synchronization, with a safe default for older settings", () => {
    const settings = { ...defaultSettings, fontFamily: "verdana" as const };
    saveSettings(settings);
    expect(loadSettings().fontFamily).toBe("verdana");
    expect(importSettingsBackup(exportSettingsBackup(settings)).fontFamily).toBe("verdana");
    expect(applyExternalSettings(settings).fontFamily).toBe("verdana");
    expect(normalizeSettings({}, "pt-BR").fontFamily).toBe("default");
    expect(normalizeSettings({ fontFamily: "unknown font" }, "pt-BR").fontFamily).toBe("default");
    const custom = { ...defaultSettings, fontFamily: `custom:${"a".repeat(64)}` as const };
    expect(importSettingsBackup(exportSettingsBackup(custom)).fontFamily).toBe(custom.fontFamily);
    expect(applyExternalSettings(custom).fontFamily).toBe(custom.fontFamily);
    expect(normalizeSettings({ fontFamily: "custom:../../file" }, "pt-BR").fontFamily).toBe("default");
  });
  it("preserves on-demand folders across saving and backups, defaulting off for older settings", () => {
    const settings = { ...defaultSettings, autoOrganizeEnabled: false, organizeFoldersOnDemand: true };
    saveSettings(settings);
    expect(loadSettings().organizeFoldersOnDemand).toBe(true);
    expect(importSettingsBackup(exportSettingsBackup(settings)).organizeFoldersOnDemand).toBe(true);
    expect(normalizeSettings({ autoOrganizeEnabled: true }, "pt-BR").organizeFoldersOnDemand).toBe(false);
  });

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

  it("preserves the disabled completion sound in storage and backups", () => {
    const settings = { ...defaultSettings, playSoundOnComplete: false };
    saveSettings(settings);
    expect(loadSettings().playSoundOnComplete).toBe(false);
    expect(importSettingsBackup(exportSettingsBackup(settings)).playSoundOnComplete).toBe(false);
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

it("normalizes experimental theme input and preserves legacy defaults", () => {
  const legacy=normalizeSettings({},"pt-BR");expect(legacy.testTheme.enabled).toBe(false);
  const settings=normalizeSettings({testTheme:{enabled:true,imageId:"file:///private",css:".sidebar{color:red}",darkness:-1,panelOpacity:200,position:"url(evil)"}},"pt-BR");
  expect(settings.testTheme).toEqual({preset:"custom",enabled:true,imageId:null,css:".sidebar{color:red}",darkness:30,panelOpacity:100,position:"center"});
  const restored=importSettingsBackup(exportSettingsBackup({...defaultSettings,testTheme:{...defaultSettings.testTheme,enabled:true,imageId:"a".repeat(64)}}));
  expect(restored.testTheme.imageId).toBe("a".repeat(64));
});

it("restores built-in themes without depending on locally imported files",()=>{
 const restored=normalizeSettings({testTheme:{enabled:true,preset:"cyberpunk",imageId:"builtin:cyberpunk"}},"pt-BR");
 expect(restored.testTheme.imageId).toBe("builtin:cyberpunk");
 expect(restored.testTheme.preset).toBe("cyberpunk");
});

it("migrates the previous Cyberpunk preset into Game themes and preserves custom CSS",()=>{
 const legacy=normalizeSettings({testTheme:{enabled:true,preset:"cyberpunk",imageId:"builtin:cyberpunk",css:".sidebar{color:red}"}},"pt-BR");
 expect(legacy.gameTheme).toBe("cyberpunk");expect(legacy.testTheme.enabled).toBe(false);expect(legacy.testTheme.css).toContain("color:red");
 const current=normalizeSettings({...defaultSettings,gameTheme:"cs2"},"pt-BR");expect(current.gameTheme).toBe("cs2");
 expect(importSettingsBackup(exportSettingsBackup(current)).gameTheme).toBe("cs2");
});

it.each(gameThemeIds.filter(id=>id!=="cyberpunk"))("persists and backs up %s",id=>{
 const settings={...defaultSettings,gameTheme:id};saveSettings(settings);
 expect(loadSettings().gameTheme).toBe(id);
 expect(importSettingsBackup(exportSettingsBackup(settings)).gameTheme).toBe(id);
 const custom=normalizeSettings({testTheme:{enabled:true,preset:id,imageId:`builtin:${id}`}},"pt-BR");
 expect(custom.testTheme.preset).toBe(id);expect(custom.testTheme.imageId).toBe(`builtin:${id}`);
});

it("preserves an installed local package reference and retires the former official Sarah selection",()=>{
 const id="a".repeat(64)+":0";
 expect(normalizeSettings({localThemeId:id},"pt-BR").localThemeId).toBe(id);
 expect(normalizeSettings({localThemeId:"../../outside"},"pt-BR").localThemeId).toBeUndefined();
 expect(normalizeSettings({gameTheme:"sarah-house"},"pt-BR").gameTheme).toBe("none");
});
