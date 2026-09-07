import type { AppSettings, GradientConfig, GradientStop } from "../domain/settings";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  const delta = max - min;
  if (delta !== 0) {
    sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r: hue = ((g - b) / delta) % 6; break;
      case g: hue = (b - r) / delta + 2; break;
      default: hue = (r - g) / delta + 4; break;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, sat, light];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0; let g = 0; let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function applyIntensity(color: string, intensity: number): string {
  const [h, s, l] = hexToHsl(color);
  const factor = 0.45 + (clamp(intensity, 0, 100) / 100) * 0.85;
  return hslToHex(h, clamp(s * factor, 0, 1), l);
}

export function buildGradient(config: GradientConfig): string {
  if (!config || !config.stops || config.stops.length === 0) {
    return "var(--bg)";
  }
  if (config.stops.length === 1) {
    return config.stops[0].color || "#12151b";
  }
  const stopsStr = config.stops
    .map((stop) => `${stop.color || "#12151b"} ${Math.round(stop.position ?? 0)}%`)
    .join(", ");
  const angle = config.angle ?? 135;
  return config.type === "radial"
    ? `radial-gradient(circle at 40% 30%, ${stopsStr})`
    : `linear-gradient(${angle}deg, ${stopsStr})`;
}

const accentColors: Record<string, { base: string; solid: string; stop1: string; stop2: string; strong: string; soft: string }> = {
  // Cores Sólidas Únicas
  cyan:    { base: "#06b6d4", solid: "#06b6d4", stop1: "#06b6d4", stop2: "#22d3ee", strong: "#22d3ee", soft: "rgba(6, 182, 212, 0.16)" },
  emerald: { base: "#10b981", solid: "#10b981", stop1: "#10b981", stop2: "#34d399", strong: "#34d399", soft: "rgba(16, 185, 129, 0.16)" },
  amber:   { base: "#f59e0b", solid: "#f59e0b", stop1: "#f59e0b", stop2: "#fbbf24", strong: "#fbbf24", soft: "rgba(245, 158, 11, 0.16)" },
  red:     { base: "#ef4444", solid: "#ef4444", stop1: "#ef4444", stop2: "#f87171", strong: "#f87171", soft: "rgba(239, 68, 68, 0.16)" },
  blue:    { base: "#3b82f6", solid: "#3b82f6", stop1: "#3b82f6", stop2: "#60a5fa", strong: "#60a5fa", soft: "rgba(59, 130, 246, 0.16)" },
  violet:  { base: "#8b5cf6", solid: "#8b5cf6", stop1: "#8b5cf6", stop2: "#a78bfa", strong: "#a78bfa", soft: "rgba(139, 92, 246, 0.16)" },
  pink:    { base: "#ec4899", solid: "#ec4899", stop1: "#ec4899", stop2: "#f472b6", strong: "#f472b6", soft: "rgba(236, 72, 153, 0.16)" },
  coral:   { base: "#f97316", solid: "#f97316", stop1: "#f97316", stop2: "#fb923c", strong: "#fb923c", soft: "rgba(249, 115, 22, 0.16)" },

  // Gradientes de Destaque Futuristas
  gradient_sunset:    { base: "linear-gradient(135deg, #ff4500, #ff8c00)", solid: "#ff4500", stop1: "#ff4500", stop2: "#ff8c00", strong: "linear-gradient(135deg, #ff5722, #ffa000)", soft: "rgba(255, 69, 0, 0.18)" },
  gradient_cyberpunk: { base: "linear-gradient(135deg, #ec4899, #8b5cf6)", solid: "#ec4899", stop1: "#ec4899", stop2: "#8b5cf6", strong: "linear-gradient(135deg, #f472b6, #a78bfa)", soft: "rgba(236, 72, 153, 0.18)" },
  gradient_ocean:     { base: "linear-gradient(135deg, #06b6d4, #3b82f6)", solid: "#06b6d4", stop1: "#06b6d4", stop2: "#3b82f6", strong: "linear-gradient(135deg, #22d3ee, #60a5fa)", soft: "rgba(6, 182, 212, 0.18)" },
  gradient_aurora:    { base: "linear-gradient(135deg, #10b981, #06b6d4)", solid: "#10b981", stop1: "#10b981", stop2: "#06b6d4", strong: "linear-gradient(135deg, #34d399, #22d3ee)", soft: "rgba(16, 185, 129, 0.18)" },
  gradient_flow:      { base: "linear-gradient(135deg, #00f2fe, #7928ca, #ff007a, #00f2fe)", solid: "#7928ca", stop1: "#00f2fe", stop2: "#ff007a", strong: "linear-gradient(135deg, #00f2fe, #9333ea, #ff007a)", soft: "rgba(121, 40, 202, 0.25)" },

  // Compatibilidade legada
  ember:   { base: "#06b6d4", solid: "#06b6d4", stop1: "#06b6d4", stop2: "#22d3ee", strong: "#22d3ee", soft: "rgba(6, 182, 212, 0.16)" },
  green:   { base: "#10b981", solid: "#10b981", stop1: "#10b981", stop2: "#34d399", strong: "#34d399", soft: "rgba(16, 185, 129, 0.16)" },
};

let cosmicAnimationId: number | null = null;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

const COSMIC_PALETTE: [number, number, number][] = [
  hexToRgb("#00f2fe"), // Ciano
  hexToRgb("#7928ca"), // Roxo / Violeta
  hexToRgb("#ff007a"), // Fúcsia / Rosa
];

function startCosmicFlow(root: HTMLElement) {
  if (cosmicAnimationId !== null) {
    cancelAnimationFrame(cosmicAnimationId);
    cosmicAnimationId = null;
  }

  const duration = 5000; // 5 segundos por ciclo completo
  let lastUpdate = 0;

  const frame = (time: number) => {
    if (time - lastUpdate > 16) {
      lastUpdate = time;
      const progress = (time % duration) / duration; // 0 a 1
      const totalStops = COSMIC_PALETTE.length;
      
      const scaled1 = progress * totalStops;
      const idx1 = Math.floor(scaled1);
      const nextIdx1 = (idx1 + 1) % totalStops;
      const t1 = scaled1 - idx1;
      const rgb1 = lerpColor(COSMIC_PALETTE[idx1], COSMIC_PALETTE[nextIdx1], t1);
      const stop1 = `rgb(${rgb1[0]}, ${rgb1[1]}, ${rgb1[2]})`;

      const scaled2 = ((progress + 0.38) % 1) * totalStops;
      const idx2 = Math.floor(scaled2);
      const nextIdx2 = (idx2 + 1) % totalStops;
      const t2 = scaled2 - idx2;
      const rgb2 = lerpColor(COSMIC_PALETTE[idx2], COSMIC_PALETTE[nextIdx2], t2);
      const stop2 = `rgb(${rgb2[0]}, ${rgb2[1]}, ${rgb2[2]})`;

      const grad = `linear-gradient(135deg, ${stop1}, ${stop2})`;
      const soft = `rgba(${rgb1[0]}, ${rgb1[1]}, ${rgb1[2]}, 0.22)`;

      root.style.setProperty("--ember", grad);
      root.style.setProperty("--ember-solid", stop1);
      root.style.setProperty("--ember-stop-1", stop1);
      root.style.setProperty("--ember-stop-2", stop2);
      root.style.setProperty("--ember-strong", grad);
      root.style.setProperty("--ember-soft", soft);
      root.style.setProperty("--st-downloading", stop1);
    }
    cosmicAnimationId = requestAnimationFrame(frame);
  };

  cosmicAnimationId = requestAnimationFrame(frame);
}

function stopCosmicFlow() {
  if (cosmicAnimationId !== null) {
    cancelAnimationFrame(cosmicAnimationId);
    cosmicAnimationId = null;
  }
}

export function applyThemeSettings(settings: AppSettings): void {
  const root = document.documentElement;
  root.dataset.appColor = settings.appColor;
  root.dataset.theme = "midnight";
  root.dataset.accent = settings.accentColor;
  root.style.setProperty("--ui-scale", `${settings.uiScale}`);

  if (settings.accentColor === "gradient_flow" && settings.sidebarAnimation !== false) {
    startCosmicFlow(root);
  } else {
    stopCosmicFlow();
    const a = accentColors[settings.accentColor] ?? accentColors.ember;
    root.style.setProperty("--ember", a.base);
    root.style.setProperty("--ember-solid", a.solid);
    root.style.setProperty("--ember-stop-1", a.stop1);
    root.style.setProperty("--ember-stop-2", a.stop2);
    root.style.setProperty("--ember-strong", a.strong);
    root.style.setProperty("--ember-soft", a.soft);
    root.style.setProperty("--st-downloading", a.solid);
  }

  root.style.setProperty("--st-completed", "#00b884");
  root.style.setProperty("--st-failed", "#ef4444");
  root.style.setProperty("--st-cancelled", "#ef4444");
  root.style.setProperty("--st-paused", "#f59e0b");

  if (settings.interfaceGradient && settings.interfaceGradient.enabled) {
    root.dataset.gradient = "true";
    const gradStr = buildGradient(settings.interfaceGradient);
    root.style.setProperty("--bg-fill", gradStr);
    const intensity = clamp(settings.interfaceGradient.intensity ?? 80, 0, 100) / 100;
    const overlayDarkness = (0.7 - intensity * 0.55).toFixed(2);
    root.style.setProperty("--gradient-overlay", `rgba(0, 0, 0, ${overlayDarkness})`);
  } else {
    root.dataset.gradient = "false";
    root.style.setProperty("--bg-fill", "var(--bg)");
    root.style.setProperty("--gradient-overlay", "transparent");
  }
}
