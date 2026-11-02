import type {GameTheme,ThemeVisualPreset,ThemeAppearance} from "./settings";
import {cyberpunkWallpapers} from "./themeCollections/cyberpunk";
import {sanAndreasWallpapers} from "./themeCollections/sanAndreas";
import {onePunchManWallpapers} from "./themeCollections/onePunchMan";
import {narutoWallpapers} from "./themeCollections/naruto";
export interface ThemeWallpaper {id:string;image:string;name:string;appearance?:ThemeAppearance&{preset:ThemeVisualPreset;css?:string;darkness?:number;panelOpacity?:number;position?:"center"|"left"|"right"}}
export const extraThemeWallpapers:Record<string,ThemeWallpaper[]>={
 "cyberpunk":cyberpunkWallpapers,
 "saitama":onePunchManWallpapers,
 "gta-san-andreas":sanAndreasWallpapers,
 "naruto":narutoWallpapers,
};
export function themeWallpapers(id:Exclude<GameTheme,"none">,preview=""):ThemeWallpaper[]{return extraThemeWallpapers[id]??[{id,image:preview,name:"Original"}];}
export function selectedWallpaper(id:Exclude<GameTheme,"none">,saved?:string,preview=""):ThemeWallpaper {
 const variants=themeWallpapers(id,preview);return variants.find(item=>item.id===saved)??variants[0];
}
