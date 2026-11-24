import {currentThemeManifest} from "../services/gameThemeManifest";
import {gta6Wallpapers} from "./themeCollections/gta6";
import {gameThemeIds} from "./settings";
import type {GameTheme,ThemeVisualPreset,ThemeAppearance} from "./settings";
import {cyberpunkWallpapers} from "./themeCollections/cyberpunk";
import {sanAndreasWallpapers} from "./themeCollections/sanAndreas";
import {onePunchManWallpapers} from "./themeCollections/onePunchMan";
import {narutoWallpapers} from "./themeCollections/naruto";
export interface ThemeWallpaper {id:string;image:string;name:string;appearance?:ThemeAppearance&{preset:ThemeVisualPreset;css?:string;darkness?:number;panelOpacity?:number;position?:"center"|"left"|"right"}}
export const extraThemeWallpapers:Record<string,ThemeWallpaper[]>={
 "gta-6":gta6Wallpapers,
 "cyberpunk":cyberpunkWallpapers,
 "saitama":onePunchManWallpapers,
 "gta-san-andreas":sanAndreasWallpapers,
 "naruto":narutoWallpapers,
};
export function themeWallpapers(id:Exclude<GameTheme,"none">,preview=""):ThemeWallpaper[]{
 const remote=id.startsWith("catalog:");
 const collection=remote?id.slice(8):id;
 const variants:ThemeWallpaper[]=[...(extraThemeWallpapers[id]??(remote?[]:[{id,image:preview,name:"Original"}]))];
 for(const entry of currentThemeManifest()){
  if(entry.collection!==collection||!entry.name||!entry.preview||entry.id.endsWith('-compact')||entry.id.endsWith('-medium'))continue;
  const existing=variants.findIndex(variant=>variant.id===entry.id);
  const variant:ThemeWallpaper={...(existing>=0?variants[existing]:{}),id:entry.id,name:entry.name,image:entry.preview};
  if(remote)variant.appearance={preset:gameThemeIds.includes(entry.preset as typeof gameThemeIds[number])?entry.preset as ThemeVisualPreset:"cs2"};
  if(existing>=0)variants[existing]=variant;else variants.push(variant);
 }
 return variants.length?variants:[{id,image:preview,name:"Original",appearance:{preset:"cs2"}}];
}
export function selectedWallpaper(id:Exclude<GameTheme,"none">,saved?:string,preview=""):ThemeWallpaper {
 const variants=themeWallpapers(id,preview);return variants.find(item=>item.id===saved)??variants[0];
}

/** New remote collections reuse trusted, bundled visual styles. Remote CSS is never executed. */
export function remoteThemePresets(){
 const seen=new Set<string>();
 return currentThemeManifest().flatMap(entry=>{
  if(!entry.collection||gameThemeIds.includes(entry.collection as typeof gameThemeIds[number])||seen.has(entry.collection)||!entry.name||!entry.preview||entry.id.endsWith('-medium')||entry.id.endsWith('-compact'))return [];
  seen.add(entry.collection);
  const name=entry.collectionName??entry.collection;
  return [{id:`catalog:${entry.collection}` as const,name,image:entry.preview,pt:name,en:name}];
 });
}
