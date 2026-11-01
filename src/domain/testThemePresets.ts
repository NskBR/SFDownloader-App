import type { TestThemeSettings, GameTheme } from "./settings";
import cyberpunkWallpaper from "../assets/themes/cyberpunk-preview.jpg";
import cs2Wallpaper from "../assets/themes/cs2-preview.jpg";
import starCitizenWallpaper from "../assets/themes/star-citizen-preview.jpg";
import ragnarokWallpaper from "../assets/themes/god-of-war-ragnarok-preview.jpg";
export { cyberpunkWallpaper, cs2Wallpaper };
export const builtinThemePreviews: Record<string,string> = {"builtin:cyberpunk":cyberpunkWallpaper,"builtin:cs2":cs2Wallpaper,"builtin:star-citizen":starCitizenWallpaper,"builtin:god-of-war-ragnarok":ragnarokWallpaper};
/** Cosmetic preset only; no dimensions, positioning or interaction overrides. */
export const cyberpunkTestCss = `
.sidebar {
  background-color: transparent;
}
.navigation__item {
  background-color: rgba(8, 15, 20, 0.94);
  border-color: #66713a;
  border-radius: 4px 14px 4px 14px;
  color: #f3f6ec;
}
.navigation__item--active {
  background-color: #e6df00;
  border-color: #fff500;
  color: #f3f6ec;
  box-shadow: 0 0 12px rgba(255, 232, 0, 0.18);
}
.navigation__icon { color: #f2e500; }
.navigation__item--active .navigation__icon { color: #f2e500; }
.counter-badge { background-color: rgba(44, 53, 49, 0.95); color: #f4f4dc; }
.download-card {
  background-color: rgba(7, 14, 18, 0.84);
  border-color: var(--line);
  border-radius: 4px 16px 4px 16px;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.22);
  color: #f1f4f6;
}
.download-card:hover { border-color: var(--line); background-color: rgba(13, 24, 29, 0.92); }
.flux-footer { background-color: rgba(6, 12, 18, 0.9); border-color: #dfd600; border-radius: 4px 14px 4px 14px; }
.titlebar { background-color: transparent; }
`;

export function createCyberpunkTheme(): TestThemeSettings {
  return {preset:"cyberpunk",enabled:true,imageId:"builtin:cyberpunk",css:cyberpunkTestCss,darkness:40,panelOpacity:80,position:"center"};
}

export const cs2ThemeCss = `
.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(12, 20, 29, .85); border-radius: 6px; color: #e8edf3; }
.navigation__item--active { color: #ffac45; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #ec9639; }
.counter-badge { background-color: rgba(29, 40, 51, .85); color: #e8edf3; }
.download-card { background-color: rgba(9, 16, 25, .78); border-radius: 6px; color: #e8edf3; }
.download-card:hover { background-color: rgba(16, 28, 40, .88); }
.flux-footer { background-color: rgba(9, 16, 25, .8); border-radius: 6px; }
.titlebar { background-color: transparent; }
`;
export function createCS2Theme(): TestThemeSettings {
  return {preset:"cs2",enabled:true,imageId:"builtin:cs2",css:cs2ThemeCss,darkness:30,panelOpacity:80,position:"center"};
}
function createScenicTheme(preset: "star-citizen" | "god-of-war-ragnarok"): TestThemeSettings {
  return {preset,enabled:true,imageId:`builtin:${preset}`,css:cs2ThemeCss.replace(/#ffac45|#ec9639/g,"var(--ember-solid)"),darkness:30,panelOpacity:80,position:"center"};
}
export const gameThemePresets = [
  {id:"cyberpunk",name:"Cyberpunk",image:cyberpunkWallpaper,pt:"Night City · vidro fosco · Rajdhani",en:"Night City · frosted glass · Rajdhani"},
  {id:"cs2",name:"Counter-Strike 2",image:cs2Wallpaper,pt:"Laranja tático · vidro fosco · Segoe UI",en:"Tactical orange · frosted glass · Segoe UI"},
  {id:"star-citizen",name:"Star Citizen",image:starCitizenWallpaper,pt:"Azul espacial · vidro fosco",en:"Space blue · frosted glass"},
  {id:"god-of-war-ragnarok",name:"God of War Ragnarök",image:ragnarokWallpaper,pt:"Azul-gelo · vidro fosco",en:"Ice blue · frosted glass"},
] as const;
export function createGameTheme(id: Exclude<GameTheme,"none">): TestThemeSettings {
  return id==="cs2"?createCS2Theme():id==="cyberpunk"?createCyberpunkTheme():createScenicTheme(id);
}
