import type { GradientConfig } from "./settings";

export interface SettingsThemePreset {
  id: string;
  name: string;
  bg: string;
  accent: string;
  isGradient: boolean;
  stops: [string, string] | null;
}

export const settingsThemePresets: SettingsThemePreset[] = [
  { id: "slate", name: "Padrão", bg: "linear-gradient(135deg, #12151b, #181c24)", accent: "#06b6d4", isGradient: false, stops: null },
  { id: "midnight-sapphire", name: "Azul neon", bg: "linear-gradient(135deg, #0b1638, #040714)", accent: "#3b82f6", isGradient: true, stops: ["#0b1638", "#040714"] },
  { id: "cyberpunk-violet", name: "Roxo gradiente", bg: "linear-gradient(135deg, #320938, #050a1e)", accent: "#8b5cf6", isGradient: true, stops: ["#320938", "#050a1e"] },
  { id: "high-contrast", name: "Alto contraste", bg: "linear-gradient(135deg, #0a0c10, #040507)", accent: "#eab308", isGradient: true, stops: ["#0a0c10", "#040507"] },
  { id: "crimson-void", name: "Carmim Obscuro", bg: "linear-gradient(135deg, #41010d, #080204)", accent: "#ef4444", isGradient: true, stops: ["#41010d", "#080204"] },
  { id: "emerald-dusk", name: "Crepúsculo Esmeralda", bg: "linear-gradient(135deg, #0a2818, #040d08)", accent: "#10b981", isGradient: true, stops: ["#0a2818", "#040d08"] },
];

export function selectedSettingsThemeId(gradient: GradientConfig): string {
  if (!gradient.enabled) return "slate";
  const firstStop = gradient.stops[0]?.color.toLowerCase() ?? "";
  return settingsThemePresets.find((theme) => theme.stops?.[0] === firstStop)?.id ?? "custom";
}
