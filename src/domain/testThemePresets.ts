import hinataWallpaper from "../assets/themes/hinata/preview.jpg";
import {selectedWallpaper} from "./themeWallpapers";
import narutoWallpaper from "../assets/themes/naruto-baryon-preview.jpg";
import saitamaWallpaper from "../assets/themes/saitama-preview.jpg";
import valorantWallpaper from "../assets/themes/valorant-preview.jpg";
import leagueOfLegendsWallpaper from "../assets/themes/league-of-legends-preview.jpg";
import overwatchWallpaper from "../assets/themes/overwatch-preview.jpg";
import amongUsWallpaper from "../assets/themes/among-us-preview.jpg";
import gta6Wallpaper from "../assets/themes/gta-6-preview.jpg";
import sanAndreasWallpaper from "../assets/themes/gta-san-andreas-preview.jpg";
import lastOfUsWallpaper from "../assets/themes/the-last-of-us-2-preview.jpg";
import rdr2Wallpaper from "../assets/themes/red-dead-redemption-2-preview.jpg";
import minecraftWallpaper from "../assets/themes/minecraft-preview.jpg";
import type { TestThemeSettings, GameTheme } from "./settings";
import cyberpunkWallpaper from "../assets/themes/cyberpunk-preview.jpg";
import cs2Wallpaper from "../assets/themes/cs2-preview.jpg";
import starCitizenWallpaper from "../assets/themes/star-citizen-preview.jpg";
import ragnarokWallpaper from "../assets/themes/god-of-war-ragnarok-preview.jpg";
export { cyberpunkWallpaper, cs2Wallpaper };
export const builtinThemePreviews: Record<string,string> = {"builtin:cyberpunk":cyberpunkWallpaper,"builtin:cs2":cs2Wallpaper,"builtin:star-citizen":starCitizenWallpaper,"builtin:god-of-war-ragnarok":ragnarokWallpaper};
Object.assign(builtinThemePreviews, {"builtin:hinata":hinataWallpaper,"builtin:naruto-baryon":narutoWallpaper,"builtin:saitama":saitamaWallpaper,"builtin:valorant":valorantWallpaper,"builtin:league-of-legends":leagueOfLegendsWallpaper,"builtin:overwatch":overwatchWallpaper,"builtin:among-us":amongUsWallpaper,"builtin:gta-6":gta6Wallpaper,"builtin:gta-san-andreas":sanAndreasWallpaper,"builtin:the-last-of-us-2":lastOfUsWallpaper,"builtin:red-dead-redemption-2":rdr2Wallpaper,"builtin:minecraft":minecraftWallpaper});
/** Cosmetic preset only; no dimensions, positioning or interaction overrides. */
export const cyberpunkTestCss = `
.sidebar {
  background-color: transparent;
}
.navigation__item {
  background-color: var(--surface);
  border-color: var(--line);
  border-radius: 4px 14px 4px 14px;
  color: #f6eef5;
}
.navigation__item--active {
  background-color: var(--ember-soft);
  border-color: var(--ember-solid);
  color: #f6eef5;
  box-shadow: 0 0 12px var(--ember-soft);
}
.navigation__icon { color: var(--ember-solid); }
.navigation__item--active .navigation__icon { color: var(--ember-solid); }
.counter-badge { background-color: var(--surface-2); color: #f6eef5; }
.download-card {
  background-color: var(--surface);
  border-color: var(--line);
  border-radius: 4px 16px 4px 16px;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.22);
  color: #f1f4f6;
}
.download-card:hover { border-color: var(--line); background-color: var(--surface-2); }
.flux-footer { background-color: var(--surface); border-color: var(--ember-solid); border-radius: 4px 14px 4px 14px; }
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
  {id:"cyberpunk",name:"Cyberpunk",image:cyberpunkWallpaper,pt:"Phantom Liberty · vermelho neon · Rajdhani",en:"Phantom Liberty · neon red · Rajdhani"},
  {id:"cs2",name:"Counter-Strike 2",image:cs2Wallpaper,pt:"Laranja tático · vidro fosco · Segoe UI",en:"Tactical orange · frosted glass · Segoe UI"},
  {id:"star-citizen",name:"Star Citizen",image:starCitizenWallpaper,pt:"Azul espacial · vidro fosco",en:"Space blue · frosted glass"},
  {id:"god-of-war-ragnarok",name:"God of War Ragnarök",image:ragnarokWallpaper,pt:"Azul-gelo · vidro fosco",en:"Ice blue · frosted glass"},
  {id:"valorant",name:"Valorant",image:valorantWallpaper,pt:"Recortes taticos e vermelho coral",en:"Tactical cuts and coral red"},
  {id:"league-of-legends",name:"League of Legends",image:leagueOfLegendsWallpaper,pt:"Molduras douradas e azul profundo",en:"Gold frames and deep blue"},
  {id:"overwatch",name:"Overwatch",image:overwatchWallpaper,pt:"Laranja esportivo e cantos assimetricos",en:"Sport orange and asymmetric corners"},
  {id:"among-us",name:"Among Us",image:amongUsWallpaper,pt:"Capsulas e azul espacial",en:"Capsules and space blue"},
  {id:"gta-6",name:"GTA VI",image:gta6Wallpaper,pt:"Rosa neon e curvas de Vice City",en:"Neon pink and Vice City curves"},
  {id:"gta-san-andreas",name:"GTA San Andreas",image:sanAndreasWallpaper,pt:"Verde Grove Street e linhas retas",en:"Grove Street green and straight edges"},
  {id:"the-last-of-us-2",name:"The Last of Us Part II",image:lastOfUsWallpaper,pt:"Verde musgo e detalhes discretos",en:"Moss green and restrained details"},
  {id:"red-dead-redemption-2",name:"Red Dead Redemption 2",image:rdr2Wallpaper,pt:"Cobre do velho oeste e costuras",en:"Western copper and stitched edges"},
  {id:"minecraft",name:"Minecraft",image:minecraftWallpaper,pt:"Verde pixelado e contornos em degraus",en:"Pixel green and stepped outlines"},
  {id:"saitama",name:"OnePunchMan",image:saitamaWallpaper,pt:"One Punch Man - amarelo e vermelho",en:"One Punch Man - yellow and red"},
  {id:"naruto",name:"Naruto",image:narutoWallpaper,pt:"Bárion e Hinata · visuais por variação",en:"Baryon and Hinata · distinct variant styles"},
] as const;
export function createGameTheme(id: Exclude<GameTheme,"none">,wallpaperId?:string): TestThemeSettings {
  const wallpaper=selectedWallpaper(id,wallpaperId);
  const appearance=wallpaper.appearance;
  const preset=appearance?.preset??id;
  if (preset in additionalThemes) {
    const visual = additionalThemes[preset as keyof typeof additionalThemes];
    return {preset,appearance,enabled:true,imageId:`builtin:${wallpaper.id}`,css:appearance?.css??visual.css,darkness:appearance?.darkness??40,panelOpacity:appearance?.panelOpacity??80,position:appearance?.position??"center"};
  }
  const base=preset==="cs2"?createCS2Theme():preset==="cyberpunk"?createCyberpunkTheme():createScenicTheme(preset as "star-citizen" | "god-of-war-ragnarok");
  return {...base,preset,appearance,imageId:`builtin:${wallpaper.id}`,css:appearance?.css??base.css,darkness:appearance?.darkness??base.darkness,panelOpacity:appearance?.panelOpacity??base.panelOpacity,position:appearance?.position??base.position};
}

const additionalThemes = {
  "hinata": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(24,24,43,.92); border-radius: 12px 5px 12px 5px; color: #f2efff; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #c6b9f0; }
.download-card { background-color: rgba(24,24,43,.92); border-radius: 12px 5px 12px 5px; color: #f2efff; }
.download-card:hover { background-color: rgba(43,40,65,.95); }
.flux-footer { background-color: rgba(24,24,43,.92); border-radius: 12px 5px; }
.titlebar { background-color: transparent; }`},
  "naruto-baryon": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(31,21,18,.92); border-radius: 4px 16px 4px 16px; color: #fff1df; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #ffae55; }
.download-card { background-color: rgba(31,21,18,.92); border-radius: 5px 20px 5px 20px; color: #fff1df; }
.download-card:hover { background-color: rgba(58,35,25,.95); }
.flux-footer { background-color: rgba(31,21,18,.92); border-radius: 5px 18px; }
.titlebar { background-color: transparent; }`},
  "saitama": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: var(--surface); border-radius: 13px 4px 13px 4px; color: var(--text); }
.navigation__icon, .navigation__item--active .navigation__icon { color: var(--ember-solid); }
.download-card { background-color: var(--surface); border-radius: 16px 5px 16px 5px; color: var(--text); }
.download-card:hover { background-color: var(--surface-2); }
.flux-footer { background-color: var(--surface); border-radius: 13px 4px; }
.titlebar { background-color: transparent; }`},
  "valorant": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(10,17,23,.82); border-radius: 2px; color: #edf2f5; }
.navigation__item--active { color: #ff6070; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #ff6070; }
.counter-badge { background-color: rgba(25,34,41,.86); color: #edf2f5; }
.download-card { background-color: rgba(8,15,21,.84); border-radius: 2px; color: #edf2f5; }
.download-card:hover { background-color: rgba(14,23,30,.92); }
.flux-footer { background-color: rgba(8,15,21,.82); border-radius: 2px; }
.titlebar { background-color: transparent; }`},
  "league-of-legends": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(10,17,23,.82); border-radius: 3px; color: #edf2f5; }
.navigation__item--active { color: #d5b675; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #d5b675; }
.counter-badge { background-color: rgba(25,34,41,.86); color: #edf2f5; }
.download-card { background-color: rgba(8,15,21,.84); border-radius: 3px 10px; color: #edf2f5; }
.download-card:hover { background-color: rgba(14,23,30,.92); }
.flux-footer { background-color: rgba(8,15,21,.82); border-radius: 3px; }
.titlebar { background-color: transparent; }`},
  "overwatch": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(10,17,23,.82); border-radius: 8px 3px; color: #edf2f5; }
.navigation__item--active { color: #ffb54d; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #ffb54d; }
.counter-badge { background-color: rgba(25,34,41,.86); color: #edf2f5; }
.download-card { background-color: rgba(8,15,21,.84); border-radius: 10px 3px; color: #edf2f5; }
.download-card:hover { background-color: rgba(14,23,30,.92); }
.flux-footer { background-color: rgba(8,15,21,.82); border-radius: 8px 3px; }
.titlebar { background-color: transparent; }`},
  "among-us": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(10,17,23,.82); border-radius: 18px; color: #edf2f5; }
.navigation__item--active { color: #82e5ff; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #82e5ff; }
.counter-badge { background-color: rgba(25,34,41,.86); color: #edf2f5; }
.download-card { background-color: rgba(8,15,21,.84); border-radius: 20px; color: #edf2f5; }
.download-card:hover { background-color: rgba(14,23,30,.92); }
.flux-footer { background-color: rgba(8,15,21,.82); border-radius: 18px; }
.titlebar { background-color: transparent; }`},
  "gta-6": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(10,17,23,.82); border-radius: 12px 5px; color: #edf2f5; }
.navigation__item--active { color: #ff9cce; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #ff9cce; }
.counter-badge { background-color: rgba(25,34,41,.86); color: #edf2f5; }
.download-card { background-color: rgba(8,15,21,.84); border-radius: 14px 5px; color: #edf2f5; }
.download-card:hover { background-color: rgba(14,23,30,.92); }
.flux-footer { background-color: rgba(8,15,21,.82); border-radius: 12px 5px; }
.titlebar { background-color: transparent; }`},
  "gta-san-andreas": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: var(--surface); border-radius: 2px 8px; color: #edf2f5; }
.navigation__item--active { color: var(--ember-solid); }
.navigation__icon, .navigation__item--active .navigation__icon { color: var(--ember-solid); }
.counter-badge { background-color: var(--surface-2); color: #edf2f5; }
.download-card { background-color: rgba(8,15,21,.84); border-radius: 2px; color: #edf2f5; }
.download-card:hover { background-color: rgba(14,23,30,.92); }
.flux-footer { background-color: rgba(8,15,21,.82); border-radius: 2px 8px; }
.titlebar { background-color: transparent; }`},
  "the-last-of-us-2": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(10,17,23,.82); border-radius: 3px 9px 3px 3px; color: #edf2f5; }
.navigation__item--active { color: #a9bfab; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #a9bfab; }
.counter-badge { background-color: rgba(25,34,41,.86); color: #edf2f5; }
.download-card { background-color: rgba(8,15,21,.84); border-radius: 4px 12px 4px 4px; color: #edf2f5; }
.download-card:hover { background-color: rgba(14,23,30,.92); }
.flux-footer { background-color: rgba(8,15,21,.82); border-radius: 3px 9px 3px 3px; }
.titlebar { background-color: transparent; }`},
  "red-dead-redemption-2": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(10,17,23,.82); border-radius: 3px 3px 8px 3px; color: #edf2f5; }
.navigation__item--active { color: #ed9a76; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #ed9a76; }
.counter-badge { background-color: rgba(25,34,41,.86); color: #edf2f5; }
.download-card { background-color: rgba(8,15,21,.84); border-radius: 3px 3px 10px 3px; color: #edf2f5; }
.download-card:hover { background-color: rgba(14,23,30,.92); }
.flux-footer { background-color: rgba(8,15,21,.82); border-radius: 3px 3px 8px 3px; }
.titlebar { background-color: transparent; }`},
  "minecraft": {css: `.sidebar { background-color: transparent; }
.navigation__item { background-color: rgba(10,17,23,.82); border-radius: 0; color: #edf2f5; }
.navigation__item--active { color: #a6d87a; }
.navigation__icon, .navigation__item--active .navigation__icon { color: #a6d87a; }
.counter-badge { background-color: rgba(25,34,41,.86); color: #edf2f5; }
.download-card { background-color: rgba(8,15,21,.84); border-radius: 0; color: #edf2f5; }
.download-card:hover { background-color: rgba(14,23,30,.92); }
.flux-footer { background-color: rgba(8,15,21,.82); border-radius: 0; }
.titlebar { background-color: transparent; }`},
} as const;
