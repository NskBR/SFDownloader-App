import {checkForUpdates,UPDATE_CHECKED_EVENT,type UpdateCheckResult} from "./downloadService";
export function watchUpdates(onResult:(result:UpdateCheckResult|null)=>void):()=>void {
 let disposed=false;
 const received=(event:Event)=>{if(!disposed){const result=(event as CustomEvent<UpdateCheckResult>).detail;onResult(result.available?result:null);}};
 const check=()=>{void checkForUpdates().catch(error=>console.log("[UPDATER]",error));};
 window.addEventListener(UPDATE_CHECKED_EVENT,received);check();
 const timer=window.setInterval(check,60_000);
 return()=>{disposed=true;window.clearInterval(timer);window.removeEventListener(UPDATE_CHECKED_EVENT,received);};
}
