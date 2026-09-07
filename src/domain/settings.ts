export type SpeedUnit = "Mbps" | "MB/s";
export type AppTheme = "system" | "midnight" | "graphite" | "light";
export type AppLanguage = "pt-BR" | "en-US";
export type AccentColor =
  | "cyan"
  | "emerald"
  | "amber"
  | "red"
  | "blue"
  | "violet"
  | "pink"
  | "coral"
  | "gradient_sunset"
  | "gradient_cyberpunk"
  | "gradient_ocean"
  | "gradient_aurora"
  | "gradient_flow"
  | "ember"
  | "green";
export type AppColor = "slate" | "graphite" | "obsidian" | "mint" | "ocean" | "rose";

export interface GradientStop {
  color: string;
  position: number;
}

export interface GradientConfig {
  enabled: boolean;
  type: "linear" | "radial";
  angle: number;
  intensity: number;
  stops: GradientStop[];
}

export interface CustomCategory {
  id: string;
  name: string;
  extensions: string[];
}

export interface AppSettings {
  rootDownloadFolder: string;
  autoOrganizeEnabled: boolean;
  deleteArchiveAfterExtract: boolean;
  defaultSpeedValue: number;
  defaultSpeedUnit: SpeedUnit;
  maxConnectionsPerDownload: number;
  maxParallelDownloads: number;
  speedLimitDownloadMbps: number;
  theme: AppTheme;
  uiScale: number;
  startInTrayMode: boolean;
  launchOnStartup: boolean;
  language: AppLanguage;
  accentColor: AccentColor;
  appColor: AppColor;
  interfaceGradient: GradientConfig;
  sidebarAnimation: boolean;
  customCategories: CustomCategory[];
  autoStartDownloads?: boolean;
  openFolderOnComplete?: boolean;
  autoRenameDuplicates?: boolean;
  downloadPriority?: string;
  speedLimitText?: string;
  secondaryDownloadFolder?: string;
  secondaryFolderEnabled?: boolean;
  showAiAssistant?: boolean;
}

export const defaultSettings: AppSettings = {
  rootDownloadFolder: "",
  secondaryDownloadFolder: "",
  secondaryFolderEnabled: false,
  autoOrganizeEnabled: false,
  deleteArchiveAfterExtract: false,
  defaultSpeedValue: 100,
  defaultSpeedUnit: "Mbps",
  maxConnectionsPerDownload: 8,
  maxParallelDownloads: 3,
  speedLimitDownloadMbps: 0,
  theme: "midnight",
  uiScale: 1.1,
  startInTrayMode: false,
  launchOnStartup: false,
  language: "pt-BR",
  accentColor: "ember",
  appColor: "slate",
  interfaceGradient: {
    enabled: false,
    type: "linear",
    angle: 160,
    intensity: 40,
    stops: [
      { color: "#16171a", position: 0 },
      { color: "#1f2024", position: 100 },
    ],
  },
  sidebarAnimation: true,
  showAiAssistant: false,
  customCategories: [
    { id: "cat-jogos", name: "Jogos", extensions: ["iso", "rom", "pkg"] },
    { id: "cat-series", name: "Séries", extensions: ["mkv", "mp4"] },
    { id: "cat-docs", name: "Documentos", extensions: ["pdf", "docx"] },
  ],
  autoStartDownloads: true,
  openFolderOnComplete: false,
  autoRenameDuplicates: false,
  downloadPriority: "Alta",
  speedLimitText: "Sem limite",
};
