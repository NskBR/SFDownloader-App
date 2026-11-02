import {invoke} from "@tauri-apps/api/core";
import type {TestThemeSettings,ThemeAppearance} from "../domain/settings";
export interface LocalVariant {name:string;image:string;preview:string;medium?:string;compact?:string;preset:"custom"|"botanical";appearance:ThemeAppearance;darkness:number;panelOpacity:number;position:"center"|"left"|"right"}
export interface LocalTheme {id:string;name:string;author:string;variants:LocalVariant[]}
let cache:Promise<LocalTheme[]>|undefined;
export function localThemes(){return cache??=invoke<LocalTheme[]>("list_local_themes").then(value=>value??[]).catch(error=>{cache=undefined;throw error;});}
export function invalidateLocalThemes(){cache=undefined;}
export async function resolveLocalTheme(selection:string):Promise<TestThemeSettings>{
 const [id,index]=selection.split(":");let theme=(await localThemes()).find(item=>item.id===id);
 if(!theme){invalidateLocalThemes();theme=(await localThemes()).find(item=>item.id===id);}
 const variant=theme?.variants[Number(index)];
 if(!variant)throw new Error("Tema local não encontrado / Local theme not found");
 const main=document.documentElement.classList.contains("window-type-main");
 const large=document.documentElement.classList.contains("window-type-confirmation")||window.innerWidth>600;
 return {enabled:true,preset:variant.preset==="custom"?"local":variant.preset,appearance:variant.appearance,css:"",imageId:main?variant.image:large?variant.medium??variant.image:variant.compact??variant.image,darkness:variant.darkness,panelOpacity:variant.panelOpacity,position:variant.position};
}
