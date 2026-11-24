import {CompletionSoundDialog} from "../components/settings/CompletionSoundDialog";
import {PersonalizationPanel} from "../components/settings/PersonalizationPanel";
import {ScrollbarPicker} from "../components/settings/ScrollbarPicker";
import {WindowControlsPicker} from "../components/settings/WindowControlsPicker";
import {resetPersonalization} from "../domain/resetPersonalization";
import {clearWindowBorderPreview} from "../domain/windowBorder";
import {WindowBorderEditor} from "../components/settings/WindowBorderEditor";
import {ResetApplicationDialog} from "../components/settings/ResetApplicationDialog";
import {resetApplication} from "../services/resetApplication";
import {Settings as FilledIconPreview,Folder as FilledFolderPreview} from "kineticons";
import {Settings as NormalIconPreview,Folder as NormalFolderPreview} from "lucide-react";
import {LocalThemes} from "../components/settings/LocalThemes";
import {RgbThemeDialog} from "../components/settings/RgbThemeDialog";
import {applyThemeSettings} from "../services/theme";
import {
  Plus,
  Tags,
  Trash2,
  Globe,
  Palette,
  Download,
  Folder,
  Volume2,
  Settings2,
  Gauge,
  Sliders,
  Play,
  Package,
  FileText,
  Info,
  CheckCircle,
  Pencil,
  Check,
  Sparkles,
  Dices,
  HardDrive,
  Type,
  Upload,
  ChevronDown,
  Mouse,
} from "../components/icons";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SettingsTabNavigation, type SettingsTab, type TabIndicator, type TabItem } from "../components/settings/SettingsTabNavigation";
import { GameThemesCard } from "../components/settings/GameThemesCard";
import { TestThemesCard } from "../components/settings/TestThemesCard";
import { SettingsHeader } from "../components/settings/SettingsHeader";
import { SettingsAdvancedTab } from "../components/settings/SettingsAdvancedTab";
import { SettingsUpdatesTab } from "../components/settings/SettingsUpdatesTab";
import { invoke } from "@tauri-apps/api/core";
import { defaultSettings, defaultTestTheme } from "../domain/settings";
import type { AppLanguage, AppSettings, AccentColor, AppColor } from "../domain/settings";
import { parseSpeedLimitMebibytesPerSecond } from "../domain/speedLimit";
import { ipcErrorMessage } from "../domain/ipcErrors";
import { selectedSettingsThemeId, settingsThemePresets } from "../domain/settingsThemes";
import { downloadCategories } from "../domain/categories";
import { appFonts, loadImportedFont, type AppFont, type ImportedFont } from "../domain/appFonts";
import { open } from "@tauri-apps/plugin-dialog";
import { normalizedCategoryExtensions, validCustomCategoryName } from "../domain/customCategories";
import { exportSettingsBackup, importSettingsBackup } from "../services/settingsStorage";
import {
  chooseDownloadFolder,
} from "../services/folderService";
import { getGlobalDownloadSchedule, isLaunchOnStartup, setLaunchOnStartup, updateGlobalDownloadSchedule } from "../services/downloadService";
import { Toggle } from "../components/ui/Toggle";
import { CustomSelect } from "../components/ui/CustomSelect";
import { ThemeCustomizerModal } from "../components/ui/DiscordThemeCustomizer";
import { useTranslation } from "../i18n";

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  saved: boolean;
  onBack: () => void;
}

export function SettingsPage({ settings, onSave, saved }: Props) {
  const { t, setLanguage } = useTranslation();
  const [draft, setDraft] = useState(settings);
  const [resetDialogOpen,setResetDialogOpen]=useState(false);
  const [soundDialogOpen,setSoundDialogOpen]=useState(false);
  const [personalizationPanel,setPersonalizationPanel]=useState<"navigation"|"window"|"motion"|null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("downloads");
  const [error, setError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");

  const navTabsRef = useRef<HTMLElement | null>(null);
  const [tabsIndicator, setTabsIndicator] = useState<TabIndicator>({
    left: 0,
    width: 0,
    height: 0,
    visible: false,
  });

  useLayoutEffect(() => {
    const nav = navTabsRef.current;
    if (!nav) return;

    const updateIndicator = () => {
      const activeBtn = nav.querySelector<HTMLElement>(".cfg-tab-btn.is-active");
      if (!activeBtn) {
        setTabsIndicator((prev) => ({ ...prev, visible: false }));
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setTabsIndicator({
        left: btnRect.left - navRect.left,
        width: btnRect.width,
        height: btnRect.height,
        visible: true,
      });
    };

    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    const ro = new ResizeObserver(updateIndicator);
    ro.observe(nav);

    return () => {
      window.removeEventListener("resize", updateIndicator);
      ro.disconnect();
    };
  }, [activeTab]);
  const [categoryExtensions, setCategoryExtensions] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editExts, setEditExts] = useState("");
  const [customizerModalOpen, setCustomizerModalOpen] = useState(false);
  const [themesExpanded, setThemesExpanded] = useState(false);
  const [rgbDialogOpen,setRgbDialogOpen] = useState(false);
  const [accentRgbDialogOpen,setAccentRgbDialogOpen] = useState(false);
  const [customFonts, setCustomFonts] = useState<ImportedFont[]>([]);
  const [importingFont, setImportingFont] = useState(false);
  useEffect(() => { void invoke<ImportedFont[]>("list_custom_fonts").then(setCustomFonts).catch(console.error); }, []);

  const importFont = async () => {
    if (importingFont) return;
    setImportingFont(true);
    setError(null);
    try {
      const path = await open({ multiple: false, directory: false, filters: [{ name: "Fontes / Fonts", extensions: ["ttf", "otf"] }] });
      if (typeof path !== "string") return;
      const font = await invoke<ImportedFont>("import_custom_font", { path });
      await loadImportedFont(font.id);
      setCustomFonts(current => [...current.filter(item => item.id !== font.id), font]);
      const next = { ...draft, fontFamily: `custom:${font.id}` as AppFont };
      setDraft(next);
      await save(next);
    } catch (cause) {
      setError(ipcErrorMessage(cause, t.settings.personalization.fontImportError));
    } finally { setImportingFont(false); }
  };

  const savedPersonalization=useRef(settings);savedPersonalization.current=settings;
  const previewPersonalization=(next:AppSettings)=>{applyThemeSettings(next);window.dispatchEvent(new CustomEvent('sf-personalization-preview',{detail:next}));};
  const cancelPersonalization=()=>{const original=savedPersonalization.current;clearWindowBorderPreview(original.windowBorder);setDraft(original);previewPersonalization(original);window.dispatchEvent(new Event('sf-personalization-preview-end'));setPersonalizationPanel(null);};
  const applyPersonalization=()=>{clearWindowBorderPreview(draft.windowBorder);onSave(draft);window.dispatchEvent(new Event('sf-personalization-preview-end'));setPersonalizationPanel(null);};
  useEffect(()=>()=>{clearWindowBorderPreview(savedPersonalization.current.windowBorder);applyThemeSettings(savedPersonalization.current);window.dispatchEvent(new Event('sf-personalization-preview-end'));},[]);
  const selectedThemeId = selectedSettingsThemeId(draft.interfaceGradient);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = {
      ...draft, [key]: value,
      ...(key === "gameTheme" || key === "testTheme" ? {localThemeId:undefined}:{}),
      ...(key === "testTheme" && (value as AppSettings["testTheme"]).enabled ? { gameTheme: "none" as const } : {}),
      ...(key === "autoOrganizeEnabled" && value === true ? { organizeFoldersOnDemand: false } : {}),
      ...(key === "organizeFoldersOnDemand" && value === true ? { autoOrganizeEnabled: false } : {}),
    };
    setDraft(next);
    if(personalizationPanel){previewPersonalization(next);return;}
    if (next.rootDownloadFolder.trim()) void save(next);
    else setError("Escolha a pasta principal de downloads.");
  };

  const updateSpeedLimitText = (value: string) => {
    const parsed = parseSpeedLimitMebibytesPerSecond(value);
    const next = {
      ...draft,
      speedLimitText: value,
      ...(parsed === null ? {} : { speedLimitDownloadMbps: parsed }),
    };
    setDraft(next);
    if (next.rootDownloadFolder.trim()) void save(next);
    else setError("Escolha a pasta principal de downloads.");
  };

  useEffect(() => {
    void isLaunchOnStartup()
      .then((enabled) => setDraft((current) => ({ ...current, launchOnStartup: enabled })))
      .catch(() => {});
  }, []);

  const save = async (next: AppSettings) => {
    setError(null);
    try {
      onSave(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar as configurações.",
      );
    }
  };

  const configureGlobalSchedule = async () => {
    try {
      const current = await getGlobalDownloadSchedule();
      const format = (minute: number | null) =>
        minute === null
          ? ""
          : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      const initial =
        current.dailyStartMinute === null || current.dailyEndMinute === null
          ? ""
          : `${format(current.dailyStartMinute)}-${format(current.dailyEndMinute)}`;
      const value = window.prompt(
        t.settings.advancedTab.globalSchedulePrompt,
        initial,
      );
      if (value === null) return;
      if (!value.trim()) {
        await updateGlobalDownloadSchedule({
          dailyStartMinute: null,
          dailyEndMinute: null,
          weekdays: 127,
          pauseOutsideSchedule: false,
        });
        return;
      }
      const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(value.trim());
      if (!match) {
        setError(t.settings.advancedTab.globalScheduleInvalid);
        return;
      }
      const [, startHour, startMinute, endHour, endMinute] = match;
      const start = Number(startHour) * 60 + Number(startMinute);
      const end = Number(endHour) * 60 + Number(endMinute);
      if (start >= 1_440 || end >= 1_440) {
        setError(t.settings.advancedTab.globalScheduleInvalid);
        return;
      }
      const pauseOutsideSchedule = window.confirm(
        t.settings.advancedTab.globalSchedulePauseConfirm,
      );
      await updateGlobalDownloadSchedule({
        dailyStartMinute: start,
        dailyEndMinute: end,
        weekdays: 127,
        pauseOutsideSchedule,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t.settings.advancedTab.globalScheduleInvalid,
      );
    }
  };
  const exportPreferences = () => {
    const blob = new Blob([exportSettingsBackup(draft)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sfdownloader-preferences-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importPreferences = async (file: File) => {
    try {
      const imported = importSettingsBackup(await file.text(), draft.language);
      setDraft(imported);
      await save(imported);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível importar as preferências.");
    }
  };
  const openBrowserIntegration = () => {
    window.dispatchEvent(new Event("sf-open-integration"));
  };

  const openDebugWindow = () => {
    void invoke("open_debug_window").catch(console.error);
  };

  const selectFolder = async () => {
    setError(null);
    try {
      const folder = await chooseDownloadFolder();
      if (folder) update("rootDownloadFolder", folder);
    } catch {
      setError("Não foi possível abrir o seletor de pastas.");
    }
  };

  const selectSecondaryFolder = async () => {
    setError(null);
    try {
      const folder = await chooseDownloadFolder();
      if (folder) {
        const next = {
          ...draft,
          secondaryDownloadFolder: folder,
          secondaryFolderEnabled: true,
        };
        setDraft(next);
        void save(next);
      }
    } catch {
      setError("Não foi possível abrir o seletor de pastas.");
    }
  };

  const addCategory = () => {
    const name = categoryName.trim();
    if (!validCustomCategoryName(name)) {
      setError("Informe um nome de categoria válido, sem caracteres de caminho.");
      return;
    }
    const names = [
      ...downloadCategories.map((category) => category.name),
      ...draft.customCategories.map((category) => category.name),
    ];
    if (names.some((current) => current.toLowerCase() === name.toLowerCase())) {
      setError("Já existe uma categoria com esse nome.");
      return;
    }
    const extensions = normalizedCategoryExtensions(categoryExtensions);
    update("customCategories", [
      ...draft.customCategories,
      { id: crypto.randomUUID(), name, extensions },
    ]);
    setCategoryName("");
    setCategoryExtensions("");
    setError(null);
  };

  const removeCategory = (id: string) => {
    if (!window.confirm(t.settings.filesTab.deleteCategoryConfirm)) return;
    update(
      "customCategories",
      draft.customCategories.filter((category) => category.id !== id),
    );
  };

  const startEditCategory = (cat: { id: string; name: string; extensions: string[] }) => {
    setEditingCatId(cat.id);
    setEditName(cat.name);
    setEditExts(Array.isArray(cat.extensions) ? cat.extensions.join(", ") : "");
  };

  const saveEditCategory = (id: string) => {
    const name = editName.trim();
    if (!name) return;
    const extensions = normalizedCategoryExtensions(editExts);
    const next = draft.customCategories.map((c) =>
      c.id === id ? { ...c, name, extensions } : c,
    );
    update("customCategories", next);
    setEditingCatId(null);
  };

  const tabs: TabItem[] = [
    { id: "downloads", label: t.settings.tabs.downloads, icon: <Download size={16} /> },
    { id: "personalizacao", label: t.settings.tabs.personalization, icon: <Palette size={16} /> },
    { id: "arquivos", label: t.settings.tabs.files, icon: <Folder size={16} /> },
    { id: "idioma", label: t.settings.tabs.language, icon: <Globe size={16} /> },
    { id: "avancado", label: t.settings.tabs.advanced, icon: <Settings2 size={16} /> },
    { id: "atualizacao", label: settings.language === "pt-BR" ? "Atualização" : "Updates", icon: <Download size={16} /> },
  ];

  return (
    <section className="cfg-container">
      <SettingsHeader
        title={t.settings.title}
        subtitle={t.settings.subtitle}
        autoSavedLabel={t.settings.autoSaved}
        saved={saved}
      />

      {error && <div className="error-banner">{error}</div>}

      {/* Navegação por Abas Horizontais */}
      <SettingsTabNavigation
        tabs={tabs}
        activeTab={activeTab}
        onSelect={setActiveTab}
        navRef={navTabsRef}
        indicator={tabsIndicator}
        animationsEnabled={draft.sidebarAnimation !== false}
      />

      {/* Conteúdo da Aba Ativa */}
      <div className="cfg-tab-content">
        {/* ABA: DOWNLOADS */}
        {activeTab === "downloads" && (
          <div className="cfg-tab-view">
            <div className="cfg-grid-2col">
              {/* Coluna da Esquerda */}
              <div className="cfg-col">
                {/* 1. Local de download */}
                <div className="cfg-card">
                  <div className="cfg-card-header">
                    <div className="cfg-card-icon-box">
                      <Folder className="cfg-card-icon" size={20} />
                    </div>
                    <div>
                      <h3 className="cfg-card-title">{t.settings.downloadsTab.downloadLocationTitle}</h3>
                      <p className="cfg-card-subtitle">{t.settings.downloadsTab.downloadLocationSubtitle}</p>
                    </div>
                  </div>

                  <div className="cfg-card-content" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <span className="cfg-item-label" style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px", display: "block" }}>{t.settings.downloadsTab.mainDefaultFolder}</span>
                      <div className="cfg-path-input-row">
                        <div className="cfg-path-display" title={draft.rootDownloadFolder}>
                          {draft.rootDownloadFolder || t.settings.downloadsTab.selectFolderPlaceholder}
                        </div>
                        <button type="button" className="cfg-btn-alterar" onClick={selectFolder}>
                          <Folder size={15} />
                          <span>{t.settings.downloadsTab.changeFolder}</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="cfg-item-label" style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px", display: "block" }}>{t.settings.downloadsTab.secondaryDefaultFolder}</span>
                      <div className="cfg-path-input-row">
                        <div className="cfg-path-display" title={draft.secondaryDownloadFolder}>
                          {draft.secondaryDownloadFolder || t.settings.downloadsTab.noSecondaryFolder}
                        </div>
                        <button type="button" className="cfg-btn-alterar" onClick={selectSecondaryFolder}>
                          <HardDrive size={15} />
                          <span>{draft.secondaryDownloadFolder ? t.settings.downloadsTab.changeFolder : t.settings.downloadsTab.configureFolder}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Limite de velocidade */}
                <div className="cfg-card">
                  <div className="cfg-card-header">
                    <div className="cfg-card-icon-box">
                      <Gauge className="cfg-card-icon" size={20} />
                    </div>
                    <div>
                      <h3 className="cfg-card-title">{t.settings.downloadsTab.speedLimitTitle}</h3>
                      <p className="cfg-card-subtitle">{t.settings.downloadsTab.speedLimitSubtitle}</p>
                    </div>
                  </div>

                  <div className="cfg-card-content cfg-list-items">
                    <div className="cfg-item-row">
                      <div className="cfg-item-left">
                        <Gauge size={18} className="cfg-item-icon" />
                        <div>
                          <strong className="cfg-item-label">{t.settings.downloadsTab.presetLimitLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.downloadsTab.presetLimitDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right">
                        <CustomSelect
                          value={draft.speedLimitText || t.settings.downloadsTab.noLimit}
                          options={[
                            { value: t.settings.downloadsTab.noLimit, label: t.settings.downloadsTab.noLimit },
                            { value: "1 MB/s", label: "1 MB/s" },
                            { value: "5 MB/s", label: "5 MB/s" },
                            { value: "10 MB/s", label: "10 MB/s" },
                            { value: "25 MB/s", label: "25 MB/s" },
                            { value: "50 MB/s", label: "50 MB/s" },
                          ]}
                          onChange={updateSpeedLimitText}
                        />
                      </div>
                    </div>

                    <div className="cfg-item-row">
                      <div className="cfg-item-left">
                        <Sliders size={18} className="cfg-item-icon" />
                        <div>
                          <strong className="cfg-item-label">{t.settings.downloadsTab.customSpeedLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.downloadsTab.customSpeedDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right">
                        <input
                          type="text"
                          className="cfg-path-display"
                          style={{ width: "110px", height: "32px", textAlign: "center" }}
                          value={draft.speedLimitText || ""}
                          placeholder={t.settings.downloadsTab.customSpeedPlaceholder}
                          onChange={(e) => updateSpeedLimitText(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coluna da Direita */}
              <div className="cfg-col">
                {/* 3. Comportamento do download */}
                <div className="cfg-card">
                  <div className="cfg-card-header">
                    <div className="cfg-card-icon-box">
                      <Sliders className="cfg-card-icon" size={20} />
                    </div>
                    <div>
                      <h3 className="cfg-card-title">{t.settings.downloadsTab.downloadBehaviorTitle}</h3>
                      <p className="cfg-card-subtitle">{t.settings.downloadsTab.downloadBehaviorSubtitle}</p>
                    </div>
                  </div>

                  <div className="cfg-card-content cfg-list-items">
                    <div className="cfg-item-row">
                      <div className="cfg-item-left">
                        <Play size={18} className="cfg-item-icon" />
                        <div>
                          <strong className="cfg-item-label">{t.settings.downloadsTab.autoStartLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.downloadsTab.autoStartDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right">
                        <Toggle
                          checked={draft.autoStartDownloads ?? true}
                          onChange={(val) => update("autoStartDownloads", val)}
                        />
                      </div>
                    </div>

                    <div className="cfg-item-row">
                      <div className="cfg-item-left">
                        <Package size={18} className="cfg-item-icon" />
                        <div>
                          <strong className="cfg-item-label">{t.settings.downloadsTab.autoExtractLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.downloadsTab.autoExtractDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right">
                        <Toggle
                          checked={draft.deleteArchiveAfterExtract}
                          onChange={(val) => update("deleteArchiveAfterExtract", val)}
                        />
                      </div>
                    </div>

                    <div className="cfg-item-row">
                      <div className="cfg-item-left">
                        <Folder size={18} className="cfg-item-icon" />
                        <div>
                          <strong className="cfg-item-label">{t.settings.downloadsTab.openOnCompleteLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.downloadsTab.openOnCompleteDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right">
                        <Toggle
                          checked={draft.openFolderOnComplete ?? false}
                          onChange={(val) => update("openFolderOnComplete", val)}
                        />
                      </div>
                    </div>
                    <div className="cfg-item-row cfg-sound-row">
                      <div className="cfg-item-left">
                        <Volume2 size={18} className="cfg-item-icon" />
                        <div>
                          <strong className="cfg-item-label">{t.settings.downloadsTab.soundOnCompleteLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.downloadsTab.soundOnCompleteDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right cfg-sound-controls">
                        <button type="button" className="cfg-sound-preview" aria-label="Personalizar som de conclusão" title="Personalizar som" onClick={()=>setSoundDialogOpen(true)}><Settings2 size={16}/></button>
                        <button
                          type="button"
                          className="cfg-sound-preview"
                          onClick={() => void invoke("play_completion_sound",{soundId:draft.completionSound??"default"}).catch((cause) => setError(ipcErrorMessage(cause, t.settings.downloadsTab.soundTestFailed)))}
                        >
                          <Play size={12} aria-hidden="true" />
                          {t.settings.downloadsTab.testSound}
                        </button>
                        <Toggle
                          label={t.settings.downloadsTab.soundOnCompleteLabel}
                          checked={draft.playSoundOnComplete ?? true}
                          onChange={(val) => {
                            const next = { ...draft, playSoundOnComplete: val };
                            setDraft(next);
                            void save(next);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Banner Dica */}
                <div className="cfg-tip-banner">
                  <div className="cfg-tip-left">
                    <div className="cfg-tip-info-icon">
                      <Info size={24} />
                    </div>
                    <div>
                      <strong className="cfg-tip-title">{t.settings.downloadsTab.tipTitle}</strong>
                      <p className="cfg-tip-desc">
                        {t.settings.downloadsTab.tipDesc}
                      </p>
                    </div>
                  </div>
                  <div className="cfg-tip-badge">
                    <div className="cfg-tip-graphic">
                      <CheckCircle size={28} className="cfg-tip-check" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: PERSONALIZAÇÃO */}
        {activeTab === "personalizacao" && (
          <div className="cfg-tab-view">
            <div className="personalization-reset-bar"><span>Personalização do aplicativo</span><button type="button" className="cfg-btn-alterar" onClick={()=>{const next=resetPersonalization(draft);localStorage.removeItem('sf_sidebar_width');window.dispatchEvent(new Event('sf-reset-sidebar-width'));clearWindowBorderPreview(next.windowBorder);setDraft(next);onSave(next);applyThemeSettings(next);}}><Settings2 size={15}/>Restaurar personalização</button></div>
            <div className="personalization-categories">{([{id:'navigation',name:'Navegação e ícones',description:'Layout, categorias e ícones',icon:Sliders},{id:'window',name:'Janela e controles',description:'Botões, bordas e contorno',icon:Settings2},{id:'motion',name:'Movimento e rolagem',description:'Animações, inércia e scrollbar',icon:Mouse}] as const).map(category=><button type="button" key={category.id} onClick={()=>setPersonalizationPanel(category.id)}><category.icon size={20}/><span><strong>{category.name}</strong><small>{category.description}</small></span><ChevronDown size={15}/></button>)}</div>
            <div className="personalization-section-heading"><h3>Temas, cores e fontes</h3><p>Defina a aparência e o fundo do aplicativo.</p></div>
            {/* Galeria de temas do aplicativo */}
            <div className="cfg-card">
              <div className="cfg-card-header cfg-theme-header">
                <div>
                  <h3 className="cfg-card-title">{t.settings.personalization.appThemeTitle}</h3>
                  <p className="cfg-card-subtitle">{t.settings.personalization.appThemeSubtitle}</p>
                </div>

              </div>

              <div className="cfg-card-content">
                <div className="cfg-themes-grid" id="app-theme-gallery">
                  {settingsThemePresets.filter((theme, index) => themesExpanded || index < 6 || theme.id === selectedThemeId).map((theme) => {
                    const isSelected = !draft.localThemeId && draft.gameTheme === "none" && !draft.testTheme.enabled && selectedThemeId === theme.id;

                    return (
                      <div key={theme.id} className="cfg-theme-tile-wrapper"><button
                        type="button"
                        className={`cfg-theme-tile ${isSelected ? "is-selected" : ""}`}
                        onClick={() => {
                          if (theme.id === "slate") {
                            const next = {
                              ...draft,
                              appColor: "slate" as const,
                              accentColor: draft.defaultThemeInitialized ? draft.accentColor : "blue" as const,
                              defaultThemeInitialized: true,
                              gameTheme: "none" as const,
                              localThemeId:undefined, testTheme: { ...draft.testTheme, enabled: false },
                              interfaceGradient: { ...draft.interfaceGradient, enabled: false },
                            };
                            setDraft(next);
                            onSave(next);
                          } else if (theme.isGradient && theme.stops) {
                            const next = {
                              ...draft,
                              gameTheme: "none" as const,
                              localThemeId:undefined, testTheme: { ...draft.testTheme, enabled: false },
                              interfaceGradient: {
                                rgb: theme.id === 'rgb-spectrum',
                                enabled: true,
                                type: "linear" as const,
                                angle: 135,
                                intensity: 75,
                                stops: [
                                  { color: theme.stops[0], position: 0 },
                                  { color: theme.stops[1], position: 100 },
                                ],
                              },
                            };
                            setDraft(next);
                            onSave(next);
                          }
                        }}
                      >
                        {isSelected && (
                          <div className="cfg-theme-check-badge">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}

                        {/* Mini UI Mockup Graphic */}
                        <div
                          className={`cfg-theme-preview ${theme.id === "rgb-spectrum" ? "cfg-theme-preview-rgb" : ""}`}
                          style={{
                            background:
                              theme.bg,
                          }}
                        >
                          <>
                              <div className="cfg-mini-sidebar">
                                <div className="cfg-mini-logo" style={{ background: theme.accent }} />
                                <div className="cfg-mini-icon" />
                                <div className="cfg-mini-icon" />
                                <div className="cfg-mini-icon" />
                              </div>
                              <div className="cfg-mini-main">
                                <div className="cfg-mini-topbar" style={{ background: theme.accent }} />
                                <div className="cfg-mini-card">
                                  <div className="cfg-mini-line long" />
                                  <div className="cfg-mini-line short" />
                                </div>
                                <div className="cfg-mini-card">
                                  <div className="cfg-mini-line long" />
                                  <div className="cfg-mini-line short" />
                                </div>
                              </div>
                              <div className="cfg-mini-bottom-glow" style={{ background: theme.accent }} />
                          </>
                        </div>

                        <div className="cfg-theme-info">
                          <span className="cfg-theme-name">{theme.name}</span>
                          {isSelected && <span className="cfg-theme-status">{t.settings.personalization.customCurrent}</span>}
                        </div>
                      </button>{(theme.id==='rgb-spectrum' || theme.id==='slate') && <button type="button" className="cfg-rgb-gear" aria-label={theme.id==='slate'?'Personalizar tema padrão':'Configurar tema RGB'} title={theme.id==='slate'?'Personalizar tema padrão':'Configurar RGB'} onClick={()=>theme.id==='slate'?setCustomizerModalOpen(true):setRgbDialogOpen(true)}><Settings2 size={15}/></button>}</div>
                    );
                  })}
                </div>
                <button type="button" className="cfg-theme-gallery-toggle" aria-expanded={themesExpanded} aria-controls="app-theme-gallery" onClick={() => setThemesExpanded(expanded => !expanded)}>
                  <ChevronDown size={16} aria-hidden="true" />
                  {themesExpanded ? "Recolher temas" : `Ver todos os ${settingsThemePresets.length} temas`}
                </button>
              </div>
            </div>

            {/* Card 2: Cor de destaque (Intacto) */}
            <div className="cfg-card">
              <div className="cfg-card-header">
                <div className="cfg-card-icon-box">
                  <Palette className="cfg-card-icon" size={20} />
                </div>
                <div>
                  <h3 className="cfg-card-title">{t.settings.personalization.accentColorTitle}</h3>
                  <p className="cfg-card-subtitle">{t.settings.personalization.accentColorSubtitle}</p>
                </div>
              </div>
              <div className="cfg-card-content">
                <div className="accent-swatches">
                  {[
                    { id: "cyan", name: "Ciano Elétrico", bg: "#06b6d4" },
                    { id: "emerald", name: "Verde Esmeralda", bg: "#10b981" },
                    { id: "amber", name: "Âmbar Dourado", bg: "#f59e0b" },
                    { id: "red", name: "Carmim Obscuro", bg: "#ef4444" },
                    { id: "blue", name: "Azul Cobalto", bg: "#3b82f6" },
                    { id: "violet", name: "Violeta Ametista", bg: "#8b5cf6" },
                    { id: "pink", name: "Pink Neon", bg: "#ec4899" },
                    { id: "coral", name: "Coral Laranja", bg: "#f97316" },
                    { id: "lime", name: "Verde Lima", bg: "#a3e635" },
                    { id: "teal", name: "Turquesa", bg: "#2dd4bf" },
                    { id: "indigo", name: "Índigo", bg: "#6366f1" },
                    { id: "lavender", name: "Lavanda", bg: "#c084fc" },
                    { id: "rose", name: "Rosa Suave", bg: "#fb7185" },
                    { id: "silver", name: "Prata", bg: "#cbd5e1" },
                    { id: "gradient_sunset", name: "Gradiente Fogo Sunset", bg: "linear-gradient(135deg, #ff4500, #ff8c00)" },
                    { id: "gradient_cyberpunk", name: "Gradiente Cyberpunk Pink/Roxo", bg: "linear-gradient(135deg, #ec4899, #8b5cf6)" },
                    { id: "gradient_ocean", name: "Gradiente Oceano Ciano/Azul", bg: "linear-gradient(135deg, #06b6d4, #3b82f6)" },
                    { id: "gradient_aurora", name: "Gradiente Aurora Esmeralda/Ciano", bg: "linear-gradient(135deg, #10b981, #06b6d4)" },
                    { id: "gradient_flow", name: "✨ Cosmic Flow (Gradiente Animado)", bg: "linear-gradient(135deg, #00f2fe, #7928ca, #ff007a)" },
                  ].map((item) => (
                    <span key={item.id} className="accent-swatch-wrapper"><button
                      type="button"
                      className={`accent-swatch ${draft.accentColor === item.id ? "active" : ""}`}
                      style={{ background: "transparent" }}
                      onClick={() => update("accentColor", item.id as AccentColor)}
                      aria-label={item.name}
                      title={item.name}
                    ><span className="accent-swatch-fill" aria-hidden="true" style={{background:item.bg}}/></button>{item.id==='gradient_flow' && <button type="button" className="accent-rgb-gear" aria-label="Configurar destaque RGB" title="Configurar destaque RGB" onClick={()=>setAccentRgbDialogOpen(true)}><Settings2 size={11}/></button>}</span>
                  ))}
                </div>
              </div>
            </div>

            <GameThemesCard selected={draft.gameTheme} wallpapers={draft.themeWallpapers} onSelect={(gameTheme,wallpaperId) => {
              const next = { ...draft, localThemeId:undefined, gameTheme, themeWallpapers:wallpaperId?{...draft.themeWallpapers,[gameTheme]:wallpaperId}:draft.themeWallpapers, testTheme: { ...draft.testTheme, enabled: false } };
              setDraft(next); void save(next);
            }} />

            <LocalThemes selected={draft.localThemeId} onSelect={localThemeId=>{const next={...draft,localThemeId,gameTheme:"none" as const,testTheme:{...draft.testTheme,enabled:false}};setDraft(next);void save(next);}}/>

            <div className="cfg-card">
              <div className="cfg-card-header">
                <div className="cfg-card-icon-box"><Type className="cfg-card-icon" size={18} /></div>
                <div>
                  <h3 className="cfg-card-title">{t.settings.personalization.fontTitle}</h3>
                  <p className="cfg-card-subtitle">{t.settings.personalization.fontSubtitle}</p>
                </div>
              </div>
              <div className="cfg-card-content cfg-font-controls">
                <CustomSelect
                  ariaLabel={t.settings.personalization.fontTitle}
                  value={draft.fontFamily}
                  options={[
                    ...appFonts.map(font => ({ value: font.id as AppFont, label: font.label || t.settings.personalization.fontDefault })),
                    ...customFonts.map(font => ({ value: `custom:${font.id}` as AppFont, label: font.name })),
                    ...(draft.fontFamily.startsWith("custom:") && !customFonts.some(font => `custom:${font.id}` === draft.fontFamily)
                      ? [{ value: draft.fontFamily, label: t.settings.personalization.fontUnavailable, disabled: true }] : []),
                  ]}
                  onChange={value => update("fontFamily", value)}
                  disabled={importingFont}
                />
                <button type="button" className="cfg-btn-import-font" disabled={importingFont} onClick={() => void importFont()}>
                  <Upload size={15} />{importingFont ? t.settings.personalization.fontImporting : t.settings.personalization.fontImport}
                </button>
                <span className="cfg-font-hint">{t.settings.personalization.fontImportHint}</span>
              </div>
            </div>

            {draft.cssThemesEnabled && <details className="cfg-card css-theme-disclosure"><summary>Tema CSS</summary><TestThemesCard value={draft.testTheme} onChange={value => update("testTheme", value)} /></details>}

            {personalizationPanel==='navigation'&&<PersonalizationPanel title="Navegação e ícones" description="Posição das categorias, nomes e estilo dos ícones." onClose={cancelPersonalization} onApply={applyPersonalization}>            <div className="cfg-card"><div className="cfg-card-header"><div className="cfg-card-icon-box"><Sliders size={18}/></div><div><h3 className="cfg-card-title">Layout e ícones</h3><p className="cfg-card-subtitle">Escolha onde navegar e o estilo dos ícones.</p></div></div>
              <div className="layout-presets-grid">{([{id:'left',name:'Barra à esquerda'},{id:'right',name:'Barra à direita'},{id:'top',name:'Abas no topo'},{id:'bottom',name:'Abas no rodapé'},{id:'titlebar',name:'Ícones na titlebar'}] as const).map(layout=><button type="button" key={layout.id} className="layout-preset" aria-pressed={(draft.navigationPosition??'left')===layout.id} onClick={()=>update('navigationPosition',layout.id)}><span className={`layout-preset-preview ${layout.id}`} aria-hidden="true"><i/><b/></span>{layout.name}</button>)}</div>
              {(draft.navigationPosition === 'top' || draft.navigationPosition === 'bottom') && (<div className="layout-options"><label className="navigation-label-option"><span><strong>Mostrar nomes nas abas</strong><small>Aplica-se apenas aos layouts de abas no topo e no rodapé.</small></span><input className="navigation-label-switch" type="checkbox" role="switch" checked={draft.navigationLabels!==false} onChange={e=>update('navigationLabels',e.target.checked)}/></label></div>)}<fieldset className="icon-style-picker"><legend>Estilo dos ícones</legend><div className="icon-style-options"><button type="button" className="icon-style-option" aria-pressed={(draft.iconStyle??'filled')==='filled'} onClick={()=>update('iconStyle','filled')}><span className="icon-style-samples" aria-hidden="true"><FilledIconPreview variant="filled" size={23} css={false}/><FilledFolderPreview variant="filled" size={23} css={false}/></span><span><strong>Sólido</strong><small>Ícones preenchidos</small></span><span className="icon-style-radio" aria-hidden="true"/></button><button type="button" className="icon-style-option" aria-pressed={draft.iconStyle==='classic'} onClick={()=>update('iconStyle','classic')}><span className="icon-style-samples" aria-hidden="true"><NormalIconPreview size={23}/><NormalFolderPreview size={23}/></span><span><strong>Normal</strong><small>Ícones em contorno</small></span><span className="icon-style-radio" aria-hidden="true"/></button></div></fieldset>
            </div>

</PersonalizationPanel>}
            {personalizationPanel==='window'&&<PersonalizationPanel title="Janela e controles" description="Botões da barra de título, formato da janela e contorno." onClose={cancelPersonalization} onApply={applyPersonalization}><WindowControlsPicker value={draft.windowControlsStyle} onChange={value=>update('windowControlsStyle',value)}/><WindowBorderEditor value={draft.windowBorder} onApply={windowBorder=>{const next={...draft,windowBorder};setDraft(next);previewPersonalization(next);}}/></PersonalizationPanel>}
            {personalizationPanel==='motion'&&<PersonalizationPanel title="Movimento e rolagem" description="Animações, força da inércia e aparência da barra de rolagem." onClose={cancelPersonalization} onApply={applyPersonalization}>            {/* Card 3: Animações e Efeitos da Interface */}
            <div className="cfg-card">
              <div className="cfg-card-header" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="cfg-card-icon-box">
                    <Sparkles className="cfg-card-icon" size={18} />
                  </div>
                  <div>
                    <h3 className="cfg-card-title">{t.settings.personalization.interfaceAnimTitle}</h3>
                    <p className="cfg-card-subtitle">{t.settings.personalization.interfaceAnimSubtitle}</p>
                  </div>
                </div>
                <div className="cfg-item-right">
                  <Toggle
                    checked={draft.sidebarAnimation ?? true}
                    onChange={(value) => update("sidebarAnimation", value)}
                  />
                </div>
              </div>
            </div>

            <div className="cfg-card"><div className="cfg-card-header inertia-setting"><div className="inertia-setting-info"><div className="cfg-card-icon-box"><Mouse className="cfg-card-icon" size={18}/></div><div><h3 className="cfg-card-title">Inércia na rolagem</h3><p className="cfg-card-subtitle">Suaviza a rolagem do mouse com desaceleração gradual.</p></div></div><div className="inertia-setting-controls"><div className="inertia-strength" role="group" aria-label="Força da inércia">{([{id:'soft',label:'Suave'},{id:'strong',label:'Forte'}] as const).map(option=><button type="button" key={option.id} disabled={!draft.scrollInertia} aria-pressed={(draft.scrollInertiaStrength??'soft')===option.id} onClick={()=>update('scrollInertiaStrength',option.id)}>{option.label}</button>)}</div><Toggle label="Inércia na rolagem" checked={draft.scrollInertia===true} onChange={value=>update('scrollInertia',value)}/></div></div></div>
<ScrollbarPicker value={draft.scrollbarStyle} onChange={value=>update('scrollbarStyle',value)}/></PersonalizationPanel>}
            {/* Modal Drawer: Personalizar Tema (Do print do usuario) */}
            {customizerModalOpen && (
              <ThemeCustomizerModal
                config={draft.interfaceGradient}
                profiles={draft.customThemeProfiles??[]}
                onPreview={value=>applyThemeSettings({...draft,localThemeId:undefined,gameTheme:'none',testTheme:{...draft.testTheme,enabled:false},interfaceGradient:{...value,rgb:false}})}
                onCancelPreview={()=>applyThemeSettings(draft)}
                onChangeGradient={(val,customThemeProfiles) => {
                  const next = { ...draft, customThemeProfiles:customThemeProfiles??draft.customThemeProfiles,localThemeId:undefined,gameTheme:'none' as const,testTheme:{...draft.testTheme,enabled:false},interfaceGradient: {...val,rgb:false} };
                  setDraft(next);
                  onSave(next);
                }}
                onClose={() => setCustomizerModalOpen(false)}
              />
            )}
          </div>
        )}

        {/* ABA: ARQUIVOS */}
        {activeTab === "arquivos" && (
          <div className="cfg-tab-view">
            <div className="cfg-grid-2col cfg-files-grid">
              {/* Coluna Esquerda: Categorias Personalizadas & Sobre as categorias */}
              <div className="cfg-col">
                {/* Card 1: Categorias Personalizadas */}
                <div className="cfg-card">
                  <div className="cfg-card-header">
                    <div className="cfg-card-icon-box">
                      <Folder className="cfg-card-icon" size={18} />
                    </div>
                    <div>
                      <h3 className="cfg-card-title">{t.settings.filesTab.customCategoriesTitle}</h3>
                      <p className="cfg-card-subtitle">{t.settings.filesTab.customCategoriesSubtitle}</p>
                    </div>
                  </div>

                  <div className="cfg-card-content">
                    {/* Formulário de Criação de Categoria */}
                    <div className="cfg-cat-form-row">
                      <input
                        type="text"
                        className="cfg-cat-input"
                        placeholder={t.settings.filesTab.categoryNamePlaceholder}
                        value={categoryName}
                        onChange={(e) => setCategoryName(e.target.value)}
                        maxLength={60}
                      />
                      <input
                        type="text"
                        className="cfg-cat-input"
                        placeholder={t.settings.filesTab.categoryExtPlaceholder}
                        value={categoryExtensions}
                        onChange={(e) => setCategoryExtensions(e.target.value)}
                      />
                      <button
                        type="button"
                        className="cfg-btn-add-cat"
                        onClick={addCategory}
                        disabled={!categoryName.trim()}
                      >
                        <Plus size={14} />
                        <span>{t.settings.filesTab.addCategory}</span>
                      </button>
                    </div>

                    {/* Tabela de Categorias */}
                    <div className="cfg-cat-table-wrap">
                      <table className="cfg-cat-table">
                        <thead>
                          <tr>
                            <th>{t.settings.filesTab.tableColCategory}</th>
                            <th>{t.settings.filesTab.tableColExtensions}</th>
                            <th className="text-right">{t.settings.filesTab.tableColActions}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.customCategories.length === 0 ? (
                            <tr>
                              <td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>
                                {t.settings.filesTab.noCategories}
                              </td>
                            </tr>
                          ) : (
                            draft.customCategories.map((cat) => (
                              <tr key={cat.id}>
                                <td>
                                  {editingCatId === cat.id ? (
                                    <input
                                      type="text"
                                      className="cfg-cat-input"
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      style={{ padding: "2px 6px", fontSize: "12px", width: "90%" }}
                                    />
                                  ) : (
                                    <div className="cfg-cat-name-cell">
                                      <Folder size={15} className="cfg-cat-folder-icon" />
                                      <span>{cat.name}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="cfg-cat-ext-cell">
                                  {editingCatId === cat.id ? (
                                    <input
                                      type="text"
                                      className="cfg-cat-input"
                                      value={editExts}
                                      onChange={(e) => setEditExts(e.target.value)}
                                      placeholder="iso, rom, pkg"
                                      style={{ padding: "2px 6px", fontSize: "12px", width: "90%" }}
                                    />
                                  ) : (
                                    Array.isArray(cat.extensions) ? cat.extensions.join(", ") : ""
                                  )}
                                </td>
                                <td className="text-right">
                                  <div className="cfg-cat-actions">
                                    {editingCatId === cat.id ? (
                                      <button
                                        type="button"
                                        className="cfg-cat-action-btn edit"
                                        onClick={() => saveEditCategory(cat.id)}
                                        title={t.settings.filesTab.saveChangesTooltip}
                                        aria-label={t.settings.filesTab.saveChangesTooltip}
                                        style={{ color: "var(--ember, #22d3ee)" }}
                                      >
                                        <Check size={13} />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="cfg-cat-action-btn edit"
                                        onClick={() => startEditCategory(cat)}
                                        title={t.settings.filesTab.editCategoryTooltip}
                                        aria-label={t.settings.filesTab.editCategoryTooltip}
                                      >
                                        <Pencil size={13} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="cfg-cat-action-btn delete"
                                      onClick={() => removeCategory(cat.id)}
                                      title={t.settings.filesTab.deleteCategoryTooltip}
                                      aria-label={t.settings.filesTab.deleteCategoryTooltip}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Card 2: Sobre as categorias */}
                <div className="cfg-card cfg-info-card">
                  <div className="cfg-info-row">
                    <div className="cfg-info-icon-box">
                      <Info size={16} />
                    </div>
                    <div className="cfg-info-text-group">
                      <strong className="cfg-info-title">{t.settings.filesTab.aboutCategoriesTitle}</strong>
                      <p className="cfg-info-desc">
                        {t.settings.filesTab.aboutCategoriesDesc}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coluna Direita: Organização de Arquivos */}
              <div className="cfg-col">
                <div className="cfg-card">
                  <div className="cfg-card-header">
                    <div className="cfg-card-icon-box">
                      <Folder className="cfg-card-icon" size={18} />
                    </div>
                    <div>
                      <h3 className="cfg-card-title">{t.settings.filesTab.fileOrgTitle}</h3>
                      <p className="cfg-card-subtitle">{t.settings.filesTab.fileOrgSubtitle}</p>
                    </div>
                  </div>

                  <div className="cfg-card-content cfg-list-items">
                    <div className="cfg-item-row">
                      <div className="cfg-item-left">
                        <div>
                          <strong className="cfg-item-label">{t.settings.filesTab.createSubfoldersLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.filesTab.createSubfoldersDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right">
                        <Toggle
                          checked={draft.autoOrganizeEnabled}
                          onChange={(val) => update("autoOrganizeEnabled", val)}
                        />
                      </div>
                    </div>

                    <div className="cfg-item-row">
                      <div className="cfg-item-left">
                        <div>
                          <strong className="cfg-item-label">{t.settings.filesTab.onDemandFoldersLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.filesTab.onDemandFoldersDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right">
                        <Toggle
                          checked={draft.organizeFoldersOnDemand}
                          onChange={(val) => update("organizeFoldersOnDemand", val)}
                        />
                      </div>
                    </div>

                    <div className="cfg-item-row">
                      <div className="cfg-item-left">
                        <div>
                          <strong className="cfg-item-label">{t.settings.filesTab.autoRenameLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.filesTab.autoRenameDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right">
                        <Toggle
                          checked={draft.autoRenameDuplicates ?? false}
                          onChange={(val) => update("autoRenameDuplicates", val)}
                        />
                      </div>
                    </div>

                    <div className="cfg-item-row">
                      <div className="cfg-item-left">
                        <div>
                          <strong className="cfg-item-label">{t.settings.filesTab.preventDuplicatesLabel}</strong>
                          <span className="cfg-item-desc">{t.settings.filesTab.preventDuplicatesDesc}</span>
                        </div>
                      </div>
                      <div className="cfg-item-right">
                        <Toggle
                          checked={draft.autoRenameDuplicates ?? true}
                          onChange={(val) => update("autoRenameDuplicates", val)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: IDIOMA */}
        {activeTab === "idioma" && (
          <div className="cfg-tab-view">
            <div className="cfg-card">
              <div className="cfg-card-header" style={{ justifyContent: "space-between", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="cfg-card-icon-box">
                    <Globe className="cfg-card-icon" size={20} />
                  </div>
                  <div>
                    <h3 className="cfg-card-title">{t.settings.languageTab.title}</h3>
                    <p className="cfg-card-subtitle">{t.settings.languageTab.subtitle}</p>
                  </div>
                </div>
                <div className="cfg-item-right">
                  <CustomSelect
                    className="cfg-language-select"
                    value={draft.language}
                    options={[
                      { value: "pt-BR", label: t.settings.languageTab.ptBR },
                      { value: "en-US", label: t.settings.languageTab.enUS },
                    ]}
                    onChange={(val) => {
                      const newLang = val as AppLanguage;
                      setLanguage(newLang);
                      update("language", newLang);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: AVANÇADO */}
        {activeTab === "atualizacao" && <SettingsUpdatesTab t={t}/>}
        {activeTab === "avancado" && (
          <SettingsAdvancedTab
            t={t}
            cssThemesEnabled={draft.cssThemesEnabled}
            onCssThemesEnabledChange={value => {
              const next={...draft,cssThemesEnabled:value,testTheme:{...draft.testTheme,enabled:value && draft.testTheme.enabled}};
              setDraft(next);onSave(next);
            }}
            launchOnStartup={draft.launchOnStartup}
            onLaunchOnStartupChange={(value) => {
              update("launchOnStartup", value);
              void setLaunchOnStartup(value).catch(console.error);
            }}
            onOpenBrowserIntegration={openBrowserIntegration}
            onOpenDebugWindow={openDebugWindow}
            onExportPreferences={exportPreferences}
            onImportPreferences={importPreferences}
            onConfigureGlobalSchedule={() => void configureGlobalSchedule()}
            onResetApplication={()=>setResetDialogOpen(true)}
          />
        )}      </div>
      {soundDialogOpen&&<CompletionSoundDialog value={draft.completionSound??'default'} name={draft.completionSoundName??''} onClose={()=>setSoundDialogOpen(false)} onApply={(completionSound,completionSoundName)=>{const next={...draft,completionSound,completionSoundName};setDraft(next);onSave(next);setSoundDialogOpen(false);}}/>}
      {resetDialogOpen && <ResetApplicationDialog onClose={()=>setResetDialogOpen(false)} onConfirm={async()=>{const next=await resetApplication();setDraft(next);setLanguage(next.language);onSave(next);setResetDialogOpen(false);window.location.reload();}}/>}
      {rgbDialogOpen && <RgbThemeDialog config={draft.rgbConfig} profiles={draft.rgbProfiles??[]} onClose={()=>setRgbDialogOpen(false)}
      onPreview={rgbConfig=>applyThemeSettings({...draft,rgbConfig,gameTheme:'none',localThemeId:undefined,testTheme:{...draft.testTheme,enabled:false},interfaceGradient:{...draft.interfaceGradient,rgb:true,enabled:true,stops:[{color:'#161125',position:0},{color:'#080e16',position:100}]}})}
      onCancelPreview={()=>applyThemeSettings(draft)} onApply={(rgbConfig,rgbProfiles)=>{
        const next={...draft,rgbConfig,rgbProfiles,gameTheme:'none' as const,localThemeId:undefined,testTheme:{...draft.testTheme,enabled:false},interfaceGradient:{...draft.interfaceGradient,rgb:true,enabled:true,stops:[{color:'#161125',position:0},{color:'#080e16',position:100}]}};
        setDraft(next);onSave(next);
      }}/>}
      {accentRgbDialogOpen && <RgbThemeDialog title="Destaque RGB" config={draft.accentRgbConfig} profiles={draft.accentRgbProfiles??[]} onClose={()=>setAccentRgbDialogOpen(false)}
      onPreview={accentRgbConfig=>applyThemeSettings({...draft,accentRgbConfig,accentColor:'gradient_flow'})}
      onCancelPreview={()=>applyThemeSettings(draft)} onApply={(accentRgbConfig,accentRgbProfiles)=>{
        const next={...draft,accentRgbConfig,accentRgbProfiles,accentColor:'gradient_flow' as const};setDraft(next);onSave(next);
      }}/>}
    </section>
  );
}
