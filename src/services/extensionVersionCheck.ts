import {invoke} from "@tauri-apps/api/core";
import {version as appVersion} from "../../package.json";
import type {BrowserBridgeDiagnostics,BrowserInstance} from "./downloadService";
export const EXTENSION_VERSION_CHECK_KEY="sf-downloader.extension-instances.v1";
interface Check {installedVersion:string;availableVersion:string;outdated:boolean}
const validVersion=(v:unknown):v is string=>typeof v==="string"&&/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(v);
let checks:Record<string,Check>={};
try {const saved=JSON.parse(localStorage.getItem(EXTENSION_VERSION_CHECK_KEY)??'null');if(saved?.appVersion===appVersion&&saved.checks&&typeof saved.checks==='object'&&!Array.isArray(saved.checks))for(const [id,value] of Object.entries(saved.checks).slice(0,128)){const c=value as Check;if(c&&validVersion(c.installedVersion)&&validVersion(c.availableVersion)&&typeof c.outdated==='boolean')checks[id]=c;}}catch{}
let pending:Promise<BrowserBridgeDiagnostics>|null=null;
function older(installed:string,available:string){const a=installed.split('.').map(Number),b=available.split('.').map(Number);for(let i=0;i<4;i++){if((a[i]??0)!==(b[i]??0))return (a[i]??0)<(b[i]??0);}return false;}
/** Poll connection metadata; compare versions once per app/instance/reported-version pair. */
export function readBrowserConnections(force=false):Promise<BrowserBridgeDiagnostics> {
 if(pending)return pending;
 pending=invoke<BrowserBridgeDiagnostics>('browser_extension_diagnostics').then(status=>{
  const peers:BrowserInstance[]=status.instances??(status.connected?[{id:'legacy',browserName:'Navegador',version:status.installedVersion??null,connected:true,legacy:true,outdated:false}]:[]);
  let changed=false;
  const instances=peers.map(peer=>{
   if(!validVersion(peer.version)||!validVersion(status.availableVersion))return {...peer,outdated:false};
   let checked=checks[peer.id];
   if(force||!checked||checked.installedVersion!==peer.version||checked.availableVersion!==status.availableVersion){checked={installedVersion:peer.version,availableVersion:status.availableVersion,outdated:older(peer.version,status.availableVersion)};checks[peer.id]=checked;changed=true;}
   return {...peer,outdated:peer.connected&&checked.outdated};
  });
  if(changed){checks=Object.fromEntries(Object.entries(checks).slice(-128));try{localStorage.setItem(EXTENSION_VERSION_CHECK_KEY,JSON.stringify({appVersion,checks}));}catch{}}
  return {...status,instances,outdated:instances.some(p=>p.connected&&p.outdated)};
 }).finally(()=>{pending=null;});
 return pending;
}
export function browserConnectionWarning(instances:BrowserInstance[]=[]){
 const active=instances.filter(p=>p.connected);const outdated=active.filter(p=>p.outdated).length;const unknown=active.filter(p=>!p.version).length;
 return [outdated?`${outdated} ${outdated===1?"extensão desatualizada":"extensões desatualizadas"}`:null,unknown?`${unknown} ${unknown===1?"conexão com versão não verificada":"conexões com versão não verificada"}`:null].filter(Boolean).join('. ');
}
