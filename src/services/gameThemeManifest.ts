import bundled from "../../themes/manifest.json";
import {invoke} from "@tauri-apps/api/core";
export interface ThemeManifestEntry {id:string;file:string;sha256:string;bytes:number;collection?:string;collectionName?:string;preset?:string;name?:string;preview?:string}
const cacheKey="sf-downloader.theme-catalog.v1";
let entries:ThemeManifestEntry[]=bundled;
// Metadata is available before settings normalization, even without a network connection.
try {const saved=localStorage.getItem(cacheKey);if(saved&&saved.length<=2*1024*1024){const parsed:unknown=JSON.parse(saved);if(Array.isArray(parsed)&&parsed.length<=1500&&parsed.every(e=>e&&typeof e.id==="string"&&/^[a-z0-9-]{1,120}$/.test(e.id)&&typeof e.sha256==="string"&&/^[a-f0-9]{64}$/.test(e.sha256)&&(!e.preview||typeof e.preview==="string"&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(e.preview))&&(!e.collection||typeof e.collection==="string"&&/^[a-z0-9-]{1,80}$/.test(e.collection))&&[e.name,e.collectionName,e.preset].every(v=>v===undefined||typeof v==="string"&&v.length<=160)))entries=parsed;}}catch{/* Bundled catalog remains available. */}
export const currentThemeManifest=()=>entries;
export function setThemeManifest(value:ThemeManifestEntry[]){if(!Array.isArray(value))throw new Error("Catálogo de temas inválido.");entries=value;try{localStorage.setItem(cacheKey,JSON.stringify(value));}catch{/* Backend also stores the catalog. */}}
let request:Promise<ThemeManifestEntry[]>|null=null;
export function readThemeManifest(){return request??=invoke<ThemeManifestEntry[]>('game_theme_manifest').then(value=>{setThemeManifest(value);return value;}).catch(()=>entries);}
export async function refreshThemeManifest(){const value=await invoke<ThemeManifestEntry[]>('refresh_game_theme_catalog');setThemeManifest(value);request=Promise.resolve(value);return value;}
