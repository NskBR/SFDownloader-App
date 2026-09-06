import { useEffect, useState } from "react";
import type { AppSettings } from "../domain/settings";
import {
  SETTINGS_CHANGED_EVENT,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  saveSettings,
} from "../services/settingsStorage";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2400);
    return () => window.clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    const refresh = () => setSettings(loadSettings());
    const onStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY) refresh();
    };
    const onSettingsChanged = (event: Event) => {
      const incoming = (event as CustomEvent<AppSettings>).detail;
      setSettings(incoming ?? loadSettings());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
    };
  }, []);

  const persist = (next: AppSettings) => {
    const normalized = saveSettings(next);
    setSettings(normalized);
    setSaved(true);
  };

  return { settings, setSettings, persist, saved };
}
