import { Bot, Bug, Clock, Download, Globe, Settings2, Upload } from "lucide-react";
import { useRef } from "react";
import type { Translations } from "../../i18n";
import { Toggle } from "../ui/Toggle";

interface SettingsAdvancedTabProps {
  t: Translations;
  launchOnStartup: boolean;
  showAiAssistant: boolean;
  onLaunchOnStartupChange: (value: boolean) => void;
  onShowAiAssistantChange: (value: boolean) => void;
  onOpenBrowserIntegration: () => void;
  onOpenDebugWindow: () => void;
  onExportPreferences: () => void;
  onImportPreferences: (file: File) => void;
  onConfigureGlobalSchedule: () => void;
}

export function SettingsAdvancedTab({
  t,
  launchOnStartup,
  showAiAssistant,
  onLaunchOnStartupChange,
  onShowAiAssistantChange,
  onOpenBrowserIntegration,
  onOpenDebugWindow,
  onExportPreferences,
  onImportPreferences,
  onConfigureGlobalSchedule,
}: SettingsAdvancedTabProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="cfg-tab-view">
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

          <div className="cfg-item-row">
            <div className="cfg-item-left">
              <Bot size={18} className="cfg-item-icon" />
              <div>
                <strong className="cfg-item-label">{t.settings.advancedTab.floatingAiLabel}</strong>
                <span className="cfg-item-desc">{t.settings.advancedTab.floatingAiDesc}</span>
              </div>
            </div>
            <div className="cfg-item-right">
              <Toggle checked={showAiAssistant} onChange={onShowAiAssistantChange} />
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
