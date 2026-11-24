import {invoke} from "@tauri-apps/api/core";
import {defaultSettings,type AppSettings} from "../domain/settings";
import {normalizeSettings,saveSettings} from "./settingsStorage";

/** Reset preferences and counters; keep task history, files and in-flight confirmation payloads. */
export async function resetApplication():Promise<AppSettings> {
  const previousAutostart=await invoke<boolean>('is_autostart_enabled');
  await invoke('set_autostart',{enabled:false});
  try { await invoke('reset_application_data'); }
  catch(error) {
    await invoke('set_autostart',{enabled:previousAutostart}).catch(()=>{});
    throw error;
  }
  for(const key of ['sf_sidebar_width','sf-downloader.sort_preference','sf-downloader.view_preference','sf-downloader.last-save-folder','sf-downloader.last-page'])localStorage.removeItem(key);
  const next=normalizeSettings(JSON.parse(JSON.stringify(defaultSettings)),'pt-BR');
  return saveSettings(next);
}
