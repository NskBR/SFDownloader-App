import {localThemes} from "./localThemes";
import {invoke} from "@tauri-apps/api/core";
import {gameThemePresets} from "../domain/testThemePresets";
import type {GameTheme} from "../domain/settings";
import {loadThemeImage} from "./testThemes";
import {themeWallpapers,selectedWallpaper} from "../domain/themeWallpapers";
let installed:string[]|null=null;
let pending:Promise<string[]>|null=null;
let preparation:Promise<void>|null=null;
// Keep decoded thumbnails alive for this window, never full inactive wallpapers.
const thumbnails=new Map<string,HTMLImageElement>();
export const cachedThemeCatalog=()=>installed;
export function loadThemeCatalog():Promise<string[]>{
 if(installed!==null)return Promise.resolve(installed);
 if(!pending)pending=invoke<string[]>("installed_game_themes").then(value=>{installed=value;return value;}).catch(error=>{pending=null;throw error;});
 return pending;
}
export function markThemeDownloaded(id:string,downloaded:boolean){
 installed=downloaded?[...new Set([...(installed??[]),id])]:(installed??[]).filter(value=>value!==id);
}
export function prepareThemeCatalog(active:GameTheme="none",wallpaperId?:string):Promise<void>{
 if(preparation)return preparation;
 preparation=(async()=>{
  let index=0;
  const previews=gameThemePresets.flatMap(preset=>themeWallpapers(preset.id,preset.image));
  const worker=async()=>{
   while(index<previews.length){
    const preset=previews[index++];
    const image=new Image();image.decoding="async";image.src=preset.image;
    try{await image.decode();thumbnails.set(preset.id,image);}catch{/* Missing preview must not block startup. */}
   }
  };
  await Promise.all([
   loadThemeCatalog().catch(()=>{}),localThemes().catch(()=>{}),worker(),worker(),
   active!=="none"?loadThemeImage(`builtin:${selectedWallpaper(active,wallpaperId).id}`).catch(()=>{}):Promise.resolve(),
   document.fonts?.ready,
  ]);
 })();
 return preparation;
}
