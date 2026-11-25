import type {DownloadTask} from "./download";
export function downloadInsights(tasks:DownloadTask[],days:number,now=new Date()) {
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const key=(d:Date)=>`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
 const daily=Array.from({length:days},(_,i)=>{const date=new Date(today);date.setDate(date.getDate()-days+1+i);return {date,count:0,bytes:0};});
 const index=new Map(daily.map(row=>[key(row.date),row]));
 const types=new Map<string,number>(),hosts=new Map<string,number>();
 let completed=0,active=0,paused=0,failed=0,cancelled=0,queued=0;
 for(const task of tasks){
  if(task.status==='completed'){
   completed++;const date=task.completedAt?new Date(task.completedAt):null;
   if(date&&Number.isFinite(date.getTime())){const row=index.get(key(date));if(row){row.count++;row.bytes+=Math.max(0,task.totalDownloaded||0);}}
   const ext=(task.extension||task.fileName.split('.').pop()||'Sem extensão').replace(/^\./,'').toUpperCase();types.set(ext,(types.get(ext)||0)+1);
   let host='Outras origens';try{const url=new URL(task.originalUrl);host=url.protocol==='magnet:'?'BitTorrent':url.hostname.replace(/^www\./,'')||host;}catch{}
   hosts.set(host,(hosts.get(host)||0)+1);
  }else if(task.status==='paused')paused++;else if(task.status==='failed')failed++;else if(task.status==='cancelled')cancelled++;else if(task.status==='pending')queued++;else active++;
 }
 const ranked=(map:Map<string,number>)=>[...map].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 return {daily,types:ranked(types),hosts:ranked(hosts),completed,active,paused,failed,cancelled,queued};
}
