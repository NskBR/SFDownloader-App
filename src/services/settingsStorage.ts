import { defaultSettings, type AppSettings } from "../domain/settings";
import { emit } from "@tauri-apps/api/event";

export const SETTINGS_SCHEMA_VERSION = 2;
export const SETTINGS_STORAGE_KEY = "sf-downloader.settings.v2";
export const LEGACY_SETTINGS_STORAGE_KEY = "sf-downloader.settings.v1";
export const SETTINGS_CHANGED_EVENT = "sf-settings-changed";

type SettingsEnvelope = { version: typeof SETTINGS_SCHEMA_VERSION; revision: string; savedAt: string; settings: unknown };
export type SettingsBackup = { kind: "sf-downloader-settings"; version: typeof SETTINGS_SCHEMA_VERSION; exportedAt: string; settings: AppSettings };

import { invoke } from "@tauri-apps/api/core";

type UnknownRecord = Record<string, unknown>;

const themes = ["system", "midnight", "graphite", "light"] as const;
const languages = ["pt-BR", "en-US"] as const;
const accents = ["cyan", "emerald", "amber", "red", "blue", "violet", "pink", "coral", "gradient_sunset", "gradient_cyberpunk", "gradient_ocean", "gradient_aurora", "gradient_flow", "ember", "green"] as const;
const appColors = ["slate", "graphite", "obsidian", "mint", "ocean", "rose"] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const valueFrom = <T>(value: unknown, accepted: readonly T[], fallback: T): T =>
  accepted.includes(value as T) ? (value as T) : fallback;

const numberFrom = (value: unknown, fallback: number, min: number, max: number, integer = false) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  return integer ? Math.round(clamped) : clamped;
};

const booleanFrom = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const stringFrom = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const isSettingsEnvelope = (value: unknown): value is SettingsEnvelope =>
  isRecord(value) && value.version === SETTINGS_SCHEMA_VERSION && "settings" in value;

const defaultLanguage = (): AppSettings["language"] => {
  const navLang = (navigator.language || (navigator.languages && navigator.languages[0]) || "").toLowerCase();
  return navLang.startsWith("pt") ? "pt-BR" : "en-US";
};

const revision = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

const envelopeFor = (settings: AppSettings): SettingsEnvelope => ({
  version: SETTINGS_SCHEMA_VERSION,
  revision: revision(),
  savedAt: new Date().toISOString(),
  settings,
});

const writeEnvelope = (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(envelopeFor(settings)));
};

const dispatchSettingsChanged = (settings: AppSettings) => {
  try {
    window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_CHANGED_EVENT, { detail: settings }));
  } catch {}
};
function freshDefaults(language: AppSettings["language"]): AppSettings {
  return {
    ...defaultSettings,
    language,
    interfaceGradient: {
      ...defaultSettings.interfaceGradient,
      stops: defaultSettings.interfaceGradient.stops.map((stop) => ({ ...stop })),
    },
    customCategories: defaultSettings.customCategories.map((category) => ({
      ...category,
      extensions: [...category.extensions],
    })),
  };
}

/** Normaliza dados persistidos sem descartar preferências válidas de versões anteriores. */
export function normalizeSettings(value: unknown, fallbackLanguage: AppSettings["language"]): AppSettings {
  const base = freshDefaults(fallbackLanguage);
  if (!isRecord(value)) return base;

  const gradient = isRecord(value.interfaceGradient) ? value.interfaceGradient : {};
  const stops = Array.isArray(gradient.stops)
    ? gradient.stops
        .filter(isRecord)
        .map((stop) => ({
          color: stringFrom(stop.color, ""),
          position: numberFrom(stop.position, -1, 0, 100),
        }))
        .filter((stop) => stop.color.length > 0 && stop.position >= 0)
        .slice(0, 8)
    : base.interfaceGradient.stops;
  const categories = Array.isArray(value.customCategories)
    ? value.customCategories
        .filter(isRecord)
        .map((category) => ({
          id: stringFrom(category.id, ""),
          name: stringFrom(category.name, "").trim(),
          extensions: Array.isArray(category.extensions)
            ? category.extensions.filter((extension): extension is string => typeof extension === "string").map((extension) => extension.trim().toLowerCase()).filter(Boolean).slice(0, 100)
            : [],
        }))
        .filter((category) => category.id && category.name)
        .slice(0, 100)
    : base.customCategories;

  return {
    ...base,
    rootDownloadFolder: stringFrom(value.rootDownloadFolder, base.rootDownloadFolder),
    secondaryDownloadFolder: stringFrom(value.secondaryDownloadFolder, base.secondaryDownloadFolder ?? ""),
    secondaryFolderEnabled: booleanFrom(value.secondaryFolderEnabled, base.secondaryFolderEnabled ?? false),
    autoOrganizeEnabled: booleanFrom(value.autoOrganizeEnabled, base.autoOrganizeEnabled),
    deleteArchiveAfterExtract: booleanFrom(value.deleteArchiveAfterExtract, base.deleteArchiveAfterExtract),
    defaultSpeedValue: numberFrom(value.defaultSpeedValue, base.defaultSpeedValue, 0, 16_384),
    defaultSpeedUnit: valueFrom(value.defaultSpeedUnit, ["Mbps", "MB/s"], base.defaultSpeedUnit),
    maxConnectionsPerDownload: numberFrom(value.maxConnectionsPerDownload, base.maxConnectionsPerDownload, 2, 32, true),
    maxParallelDownloads: numberFrom(value.maxParallelDownloads, base.maxParallelDownloads, 1, 50, true),
    speedLimitDownloadMbps: numberFrom(value.speedLimitDownloadMbps, base.speedLimitDownloadMbps, 0, 16_384),
    theme: valueFrom(value.theme, themes, base.theme),
    uiScale: numberFrom(value.uiScale, base.uiScale, 0.8, 1.5),
    startInTrayMode: booleanFrom(value.startInTrayMode, base.startInTrayMode),
    launchOnStartup: booleanFrom(value.launchOnStartup, base.launchOnStartup),
    language: valueFrom(value.language, languages, base.language),
    accentColor: valueFrom(value.accentColor, accents, base.accentColor),
    appColor: valueFrom(value.appColor, appColors, base.appColor),
    interfaceGradient: {
      enabled: booleanFrom(gradient.enabled, base.interfaceGradient.enabled),
      type: valueFrom(gradient.type, ["linear", "radial"], base.interfaceGradient.type),
      angle: numberFrom(gradient.angle, base.interfaceGradient.angle, 0, 360),
      intensity: numberFrom(gradient.intensity, base.interfaceGradient.intensity, 0, 100),
      stops: stops.length >= 2 ? stops : base.interfaceGradient.stops,
    },
    sidebarAnimation: booleanFrom(value.sidebarAnimation, base.sidebarAnimation),
    customCategories: categories,
    autoStartDownloads: booleanFrom(value.autoStartDownloads, base.autoStartDownloads ?? true),
    openFolderOnComplete: booleanFrom(value.openFolderOnComplete, base.openFolderOnComplete ?? false),
    autoRenameDuplicates: booleanFrom(value.autoRenameDuplicates, base.autoRenameDuplicates ?? false),
    downloadPriority: stringFrom(value.downloadPriority, base.downloadPriority ?? "Alta"),
    speedLimitText: stringFrom(value.speedLimitText, base.speedLimitText ?? "Sem limite"),
    showAiAssistant: booleanFrom(value.showAiAssistant, base.showAiAssistant ?? true),
  };
}

export function syncExtensionTheme(settings: AppSettings): void {
  try {
    const accentMap: Record<string, string> = {
      cyan: "#06b6d4",
      emerald: "#10b981",
      amber: "#f59e0b",
      red: "#ef4444",
      blue: "#3b82f6",
      violet: "#8b5cf6",
      pink: "#ec4899",
      coral: "#f97316",
      ember: "#00b884",
      green: "#10b981",
      gradient_sunset: "#ff4500",
      gradient_cyberpunk: "#ec4899",
      gradient_ocean: "#06b6d4",
      gradient_aurora: "#10b981",
      gradient_flow: "#7928ca",
    };

    let accent = accentMap[settings.accentColor] || "#00b884";
    let bg = "linear-gradient(135deg, #12151b, #0b0d10)";

    if (settings.interfaceGradient?.enabled && settings.interfaceGradient.stops?.length) {
      const firstStop = settings.interfaceGradient.stops[0]?.color.toLowerCase() || "";
      if (firstStop === "#0b1638") {
        accent = "#3b82f6";
        bg = "linear-gradient(135deg, #0b1638, #040714)";
      } else if (firstStop === "#320938") {
        accent = "#8b5cf6";
        bg = "linear-gradient(135deg, #320938, #050a1e)";
      } else if (firstStop === "#0a0c10") {
        accent = "#eab308";
        bg = "linear-gradient(135deg, #0a0c10, #040507)";
      } else if (firstStop === "#41010d") {
        accent = "#ef4444";
        bg = "linear-gradient(135deg, #41010d, #080204)";
      } else if (firstStop === "#0a2818") {
        accent = "#10b981";
        bg = "linear-gradient(135deg, #0a2818, #040d08)";
      } else {
        const stops = settings.interfaceGradient.stops;
        if (stops.length >= 2) {
          bg = `linear-gradient(135deg, ${stops[0].color}, ${stops[1].color})`;
        }
      }
    }

    void invoke("update_extension_theme", { accent, bg, language: settings.language }).catch(() => {});
  } catch {}
}

/** Lê a fonte de verdade atual e migra de modo idempotente a chave v1 quando necessário. */
export function loadSettings(): AppSettings {
  const fallbackLanguage = defaultLanguage();
  try {
    const rawCurrent = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (rawCurrent) {
      const parsed = JSON.parse(rawCurrent);
      if (isSettingsEnvelope(parsed)) {
        const settings = normalizeSettings(parsed.settings, fallbackLanguage);
        syncExtensionTheme(settings);
        return settings;
      }
    }

    const rawLegacy = localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (rawLegacy) {
      const migrated = normalizeSettings(JSON.parse(rawLegacy), fallbackLanguage);
      writeEnvelope(migrated);
      localStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
      syncExtensionTheme(migrated);
      return migrated;
    }
  } catch {}

  const fallback = freshDefaults(fallbackLanguage);
  syncExtensionTheme(fallback);
  return fallback;
}

/** Persiste uma alteração local e a propaga uma única vez para as demais janelas. */
export function saveSettings(settings: AppSettings): AppSettings {
  const normalized = normalizeSettings(settings, settings.language);
  writeEnvelope(normalized);
  localStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
  dispatchSettingsChanged(normalized);
  syncExtensionTheme(normalized);
  void emit("settings-changed", normalized).catch(() => {});
  return normalized;
}

/** Aplica evento de outra janela sem reemitir, evitando loops de sincronização. */
export function applyExternalSettings(settings: unknown): AppSettings {
  const fallbackLanguage = defaultLanguage();
  const normalized = normalizeSettings(settings, fallbackLanguage);
  writeEnvelope(normalized);
  localStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
  dispatchSettingsChanged(normalized);
  syncExtensionTheme(normalized);
  return normalized;
}

export function exportSettingsBackup(settings = loadSettings()): string {
  const normalized = normalizeSettings(settings, settings.language);
  const backup: SettingsBackup = {
    kind: "sf-downloader-settings",
    version: SETTINGS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: normalized,
  };
  return JSON.stringify(backup, null, 2);
}

/** Aceita somente backup versionado; a validação por campo preserva compatibilidade futura. */
export function importSettingsBackup(value: string, fallbackLanguage = defaultLanguage()): AppSettings {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || parsed.kind !== "sf-downloader-settings" || parsed.version !== SETTINGS_SCHEMA_VERSION || !("settings" in parsed)) {
    throw new Error("Arquivo de preferências inválido ou incompatível.");
  }
  return normalizeSettings(parsed.settings, fallbackLanguage);
}
