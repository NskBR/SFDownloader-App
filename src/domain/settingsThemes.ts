import type { AccentColor, GradientConfig } from "./settings";

export interface SettingsThemePreset {
  id: string;
  name: string;
  bg: string;
  accent: string;
  isGradient: boolean;
  stops: [string, string] | null;
  accentColor?: AccentColor;
}

export const settingsThemePresets: SettingsThemePreset[] = [
  { id: "slate", name: "Padrão", bg: "#161A1E", accent: "#3b82f6", isGradient: false, stops: null },
  { id: "midnight-sapphire", name: "Azul neon", bg: "linear-gradient(135deg, #0b1638, #040714)", accent: "#3b82f6", isGradient: true, stops: ["#0b1638", "#040714"] },
  { id: "cyberpunk-violet", name: "Roxo gradiente", bg: "linear-gradient(135deg, #320938, #050a1e)", accent: "#8b5cf6", isGradient: true, stops: ["#320938", "#050a1e"] },
  { id: "high-contrast", name: "Alto contraste", bg: "linear-gradient(135deg, #0a0c10, #040507)", accent: "#eab308", isGradient: true, stops: ["#0a0c10", "#040507"] },
  { id: "crimson-void", name: "Carmim Obscuro", bg: "linear-gradient(135deg, #41010d, #080204)", accent: "#ef4444", isGradient: true, stops: ["#41010d", "#080204"] },
  { id: "emerald-dusk", name: "Crepúsculo Esmeralda", bg: "linear-gradient(135deg, #0a2818, #040d08)", accent: "#10b981", isGradient: true, stops: ["#0a2818", "#040d08"] },
  { id: "arctic", name: "Ártico", bg: "linear-gradient(135deg, #082b35, #060f18)", accent: "#06b6d4", accentColor: "cyan", isGradient: true, stops: ["#082b35", "#060f18"] },
  { id: "rose-quartz", name: "Quartzo Rosa", bg: "linear-gradient(135deg, #351328, #100810)", accent: "#ec4899", accentColor: "pink", isGradient: true, stops: ["#351328", "#100810"] },
  { id: "amber-night", name: "Âmbar Noturno", bg: "linear-gradient(135deg, #30200a, #100c06)", accent: "#f59e0b", accentColor: "amber", isGradient: true, stops: ["#30200a", "#100c06"] },
  { id: "volcanic", name: "Vulcânico", bg: "linear-gradient(135deg, #34170e, #110808)", accent: "#f97316", accentColor: "coral", isGradient: true, stops: ["#34170e", "#110808"] },
  { id: "deep-ocean", name: "Oceano Profundo", bg: "linear-gradient(135deg, #071e30, #031417)", accent: "linear-gradient(90deg,#0ea5e9,#14b8a6)", accentColor: "gradient_ocean", isGradient: true, stops: ["#071e30", "#031417"] },
  { id: "aurora", name: "Aurora Boreal", bg: "linear-gradient(135deg, #102a29, #160e2c)", accent: "linear-gradient(90deg,#10b981,#8b5cf6)", accentColor: "gradient_aurora", isGradient: true, stops: ["#102a29", "#160e2c"] },
  { id: "sunset", name: "Horizonte Solar", bg: "linear-gradient(135deg, #321426, #211009)", accent: "linear-gradient(90deg,#f97316,#ec4899)", accentColor: "gradient_sunset", isGradient: true, stops: ["#321426", "#211009"] },
  { id: "rgb-spectrum", name: "Espectro RGB", bg: "linear-gradient(135deg, #161125, #080e16)", accent: "linear-gradient(90deg,#ec4899,#8b5cf6,#06b6d4,#10b981,#ec4899)", accentColor: "gradient_flow", isGradient: true, stops: ["#161125", "#080e16"] },
];

export function selectedSettingsThemeId(gradient: GradientConfig): string {
  if (!gradient.enabled) return "slate";
  const firstStop = gradient.stops[0]?.color.toLowerCase() ?? "";
  if(firstStop === '#161125' && gradient.rgb === false) return 'custom';
  return settingsThemePresets.find((theme) => theme.stops?.[0] === firstStop)?.id ?? "custom";
}
