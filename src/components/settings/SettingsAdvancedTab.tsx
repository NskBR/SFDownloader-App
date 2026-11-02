import {checkForUpdates} from "../../services/downloadService";
import { Bug, Clock, Download, Globe, Settings2, Upload } from "../icons";
import { useRef, useState } from "react";
import type { Translations } from "../../i18n";
import { Toggle } from "../ui/Toggle";

interface SettingsAdvancedTabProps {
  t: Translations;
  cssThemesEnabled: boolean;
  onCssThemesEnabledChange: (value:boolean)=>void;
  launchOnStartup: boolean;
  onLaunchOnStartupChange: (value: boolean) => void;
  onOpenBrowserIntegration: () => void;
  onOpenDebugWindow: () => void;
  onExportPreferences: () => void;
  onImportPreferences: (file: File) => void;
  onConfigureGlobalSchedule: () => void;
}

export function SettingsAdvancedTab({
  t,
  cssThemesEnabled,
  onCssThemesEnabledChange,
  launchOnStartup,
  onLaunchOnStartupChange,
  onOpenBrowserIntegration,
  onOpenDebugWindow,
  onExportPreferences,
  onImportPreferences,
  onConfigureGlobalSchedule,
}: SettingsAdvancedTabProps) {
  const [checking,setChecking]=useState(false);
  const [updateMessage,setUpdateMessage]=useState("");
  const [checkFailed,setCheckFailed]=useState(false);
  const checkUpdates=async()=>{
    if(checking)return;setChecking(true);setUpdateMessage("");setCheckFailed(false);
    try{const result=await checkForUpdates();setUpdateMessage(result.available?t.settings.advancedTab.updateAvailable.replace("{version}",result.latest_version):t.settings.advancedTab.upToDate);}
    catch{setCheckFailed(true);setUpdateMessage(t.settings.advancedTab.updateCheckFailed);}
    finally{setChecking(false);}
  };
  const importInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="cfg-tab-view">
      <section className="cfg-card"><div className="cfg-card-header"><div className="cfg-card-icon-box"><Download size={20}/></div><div><h3 className="cfg-card-title">{t.settings.advancedTab.updatesTitle}</h3><p className="cfg-card-subtitle">{t.settings.advancedTab.updatesDescription}</p></div></div><div className="cfg-card-content"><button type="button" className="cfg-btn-alterar" disabled={checking} onClick={()=>void checkUpdates()}>{checking?t.settings.advancedTab.checkingUpdates:t.settings.advancedTab.checkUpdates}</button>{updateMessage&&<p className="cfg-update-result" role={checkFailed?"alert":"status"}>{updateMessage}</p>}</div></section>
      <div className="cfg-card"><div className="cfg-card-content cfg-item-row"><div><strong className="cfg-item-label">{t.settings.advancedTab.cssThemesTitle}</strong><span className="cfg-item-desc">{t.settings.advancedTab.cssThemesDescription}</span></div><Toggle checked={cssThemesEnabled} onChange={onCssThemesEnabledChange}/></div></div>
      <div className="cfg-card">
        <div className="cfg-card-header">
          <div className="cfg-card-icon-box">
            <Settings2 className="cfg-card-icon" size={20} />
          </div>
          <div>
            <h3 className="cfg-card-title">{t.settings.advancedTab.startupTrayTitle}</h3>
            <p className="cfg-card-subtitle">{t.settings.advancedTab.startupTraySubtitle}</p>
          </div>
        </div>
        <div className="cfg-card-content cfg-list-items">
          <div className="cfg-item-row">
            <div className="cfg-item-left">
              <Settings2 size={18} className="cfg-item-icon" />
              <div>
                <strong className="cfg-item-label">{t.settings.advancedTab.launchOnStartupLabel}</strong>
                <span className="cfg-item-desc">{t.settings.advancedTab.launchOnStartupDesc}</span>
              </div>
            </div>
            <div className="cfg-item-right">
              <Toggle checked={launchOnStartup} onChange={onLaunchOnStartupChange} />
            </div>
          </div>

        </div>
      </div>

      <div className="cfg-card">
        <div className="cfg-card-header" style={{ justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="cfg-card-icon-box">
              <Globe className="cfg-card-icon" size={20} />
            </div>
            <div>
              <h3 className="cfg-card-title">{t.settings.advancedTab.browserIntegrationCardTitle}</h3>
              <p className="cfg-card-subtitle">{t.settings.advancedTab.browserIntegrationCardSubtitle}</p>
            </div>
          </div>
          <span className="cfg-autosave" style={{ fontSize: "11px", height: "fit-content" }}>
            {t.settings.advancedTab.extensionBadge}
          </span>
        </div>
        <div className="cfg-card-content">
          <p style={{ fontSize: "12.5px", color: "var(--text-2)", marginBottom: "12px" }}>
            {t.settings.advancedTab.extensionCardDesc}
          </p>
          <button type="button" className="cfg-btn-alterar" onClick={onOpenBrowserIntegration}>
            <Globe size={15} />
            <span>{t.settings.advancedTab.configureIntegrationBtn}</span>
          </button>
        </div>
      </div>

      <div className="cfg-card">
        <div className="cfg-card-header">
          <div className="cfg-card-icon-box"><Clock className="cfg-card-icon" size={20} /></div>
          <div>
            <h3 className="cfg-card-title">{t.settings.advancedTab.globalScheduleTitle}</h3>
            <p className="cfg-card-subtitle">{t.settings.advancedTab.globalScheduleSubtitle}</p>
          </div>
        </div>
        <div className="cfg-card-content">
          <p style={{ fontSize: "12.5px", color: "var(--text-2)", marginBottom: "12px" }}>
            {t.settings.advancedTab.globalScheduleDesc}
          </p>
          <button type="button" className="cfg-btn-alterar" onClick={onConfigureGlobalSchedule}>
            <Clock size={15} />
            <span>{t.settings.advancedTab.configureGlobalScheduleBtn}</span>
          </button>
        </div>
      </div>
      <div className="cfg-card">
        <div className="cfg-card-header">
          <div className="cfg-card-icon-box"><Download className="cfg-card-icon" size={20} /></div>
          <div>
            <h3 className="cfg-card-title">{t.settings.advancedTab.preferencesBackupTitle}</h3>
            <p className="cfg-card-subtitle">{t.settings.advancedTab.preferencesBackupSubtitle}</p>
          </div>
        </div>
        <div className="cfg-card-content" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="cfg-btn-alterar" onClick={onExportPreferences}><Download size={15} /><span>{t.settings.advancedTab.exportPreferencesBtn}</span></button>
          <button type="button" className="cfg-btn-alterar" onClick={() => importInputRef.current?.click()}><Upload size={15} /><span>{t.settings.advancedTab.importPreferencesBtn}</span></button>
          <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onImportPreferences(file); event.currentTarget.value = ""; }} />
        </div>
      </div>
      <div className="cfg-card">
        <div className="cfg-card-header" style={{ justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="cfg-card-icon-box">
              <Bug className="cfg-card-icon" size={20} />
            </div>
            <div>
              <h3 className="cfg-card-title">{t.settings.advancedTab.debugMenuTitle}</h3>
              <p className="cfg-card-subtitle">{t.settings.advancedTab.debugMenuSubtitle}</p>
            </div>
          </div>
        </div>
        <div className="cfg-card-content">
          <p style={{ fontSize: "12.5px", color: "var(--text-2)", marginBottom: "12px" }}>
            {t.settings.advancedTab.debugMenuDesc}
          </p>
          <button type="button" className="cfg-btn-alterar" onClick={onOpenDebugWindow}>
            <Bug size={15} />
            <span>{t.settings.advancedTab.openDebugMenuBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
