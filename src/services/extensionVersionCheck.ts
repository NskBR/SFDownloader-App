import {invoke} from "@tauri-apps/api/core";
import {version as appVersion} from "../../package.json";
import type {BrowserBridgeDiagnostics} from "./downloadService";
export const EXTENSION_VERSION_CHECK_KEY="sf-downloader.extension-version-check.v1";
export interface ExtensionVersionCheck {appVersion:string;installedVersion:string;availableVersion:string;outdated:boolean}
let pending:Promise<ExtensionVersionCheck|null>|null=null;
let completed:ExtensionVersionCheck|null=null;
const validVersion=(value:unknown):value is string=>typeof value==="string"&&/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value);
function savedCheck():ExtensionVersionCheck|null {
 if(completed)return completed;
 try {
  const value=JSON.parse(localStorage.getItem(EXTENSION_VERSION_CHECK_KEY)??'null');
  if(value?.appVersion===appVersion&&validVersion(value.installedVersion)&&validVersion(value.availableVersion)&&typeof value.outdated==="boolean")return completed=value;
 }catch{/* Missing or corrupt cache leaves the check pending. */}
 return null;
}
/** One successful check per app update. Missing reports remain pending; manual checks may replace the result. */
export function checkExtensionVersion(force=false):Promise<ExtensionVersionCheck|null> {
 if(pending)return pending;
 const saved=savedCheck();if(saved&&!force)return Promise.resolve(saved);
 pending=invoke<BrowserBridgeDiagnostics>('browser_extension_diagnostics').then(status=>{
  if(!status.connected||!validVersion(status.installedVersion)||!validVersion(status.availableVersion))return saved;
  const result={appVersion,installedVersion:status.installedVersion,availableVersion:status.availableVersion,outdated:status.outdated===true};
  completed=result;
  try{localStorage.setItem(EXTENSION_VERSION_CHECK_KEY,JSON.stringify(result));}catch{/* Keep the result for this process if storage is unavailable. */}
  return result;
 }).finally(()=>{pending=null;});
 return pending;
}
