import {useTranslation} from "../i18n";
export function updateBytes(value:number):string {
 const amount=Math.max(0,Number.isFinite(value)?value:0);
 if(amount<1024)return `${Math.round(amount)} B`;
 if(amount<1024**2)return `${(amount/1024).toFixed(1)} KB`;
 if(amount<1024**3)return `${(amount/1024**2).toFixed(1)} MB`;
 return `${(amount/1024**3).toFixed(2)} GB`;
}
export function updateTime(seconds:number):string {
 const total=Math.ceil(Math.max(0,seconds));
 if(total<60)return `${total}s`;
 if(total<3600)return `${Math.floor(total/60)}min ${total%60}s`;
 return `${Math.floor(total/3600)}h ${Math.floor(total%3600/60)}min`;
}
export function UpdateDownloadStats({downloaded,total,speed}:{downloaded:number;total:number|null;speed:number}){
 const {t}=useTranslation();const known=total!==null&&total>0;
 const remaining=known&&speed>0&&Number.isFinite(speed)?Math.max(0,total-downloaded)/speed:null;
 return <div className="update-download-stats">
  <div className="update-download-size"><span>{t.titlebar.updateDownloaded}</span><strong>{updateBytes(downloaded)} / {known?updateBytes(total):"—"}</strong></div>
  <div><span>{t.titlebar.updateAverageSpeed}</span><strong>{speed>0&&Number.isFinite(speed)?`${updateBytes(speed)}/s`:"—"}</strong></div>
  <div><span>{t.titlebar.updateRemainingTime}</span><strong>{remaining===null?"—":updateTime(remaining)}</strong></div>
 </div>;
}
