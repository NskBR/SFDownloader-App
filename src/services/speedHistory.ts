import type {DownloadProgress} from "../domain/download";
export interface SpeedSample {time:number;speed:number}
export interface SpeedSeries {id:string;points:SpeedSample[]}
interface StoredSeries extends SpeedSeries {key:string;month:string}
let queued=new Map<string,StoredSeries>();
const lastSample=new Map<string,number>();
let database:Promise<IDBDatabase>|null=null;
let writing:Promise<void>|null=null;
export const speedMonth=(time=Date.now())=>{const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(new Error('Armazenamento mensal indisponível.'));return;}
 const request=indexedDB.open('sf-downloader-speed-monthly',1);
 request.onupgradeneeded=()=>{const store=request.result.createObjectStore('series',{keyPath:'key'});store.createIndex('month','month');};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
}).catch(error=>{database=null;throw error;});}
function requestValue<T>(request:IDBRequest<T>){return new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export function recordSpeed(progress:DownloadProgress,now=Date.now()){
 if(progress.status!=='downloading'||!Number.isFinite(progress.speed)||progress.speed<0)return;
 const time=Math.floor(now/2000)*2000;
 if(lastSample.get(progress.id)===time)return;lastSample.set(progress.id,time);
 const month=speedMonth(now),key=`${month}:${progress.id}`;
 let row=queued.get(key);if(!row){row={key,month,id:progress.id,points:[]};queued.set(key,row);}
 row.points.push({time,speed:progress.speed});
}
/** Only unsaved points stay in memory. IndexedDB keeps every month's series without a curve cap. */
export function readSpeedHistory(){return [...queued.values()];}
export function flushSpeedHistory():Promise<void>{
 if(writing)return writing;
 if(!queued.size)return Promise.resolve();
 writing=(async()=>{
  const connection=await db();const batch=queued;queued=new Map();
  try{await new Promise<void>((resolve,reject)=>{
   const transaction=connection.transaction('series','readwrite'),store=transaction.objectStore('series');
   for(const row of batch.values()){
    const request=store.get(row.key);
    request.onsuccess=()=>{const old=request.result as StoredSeries|undefined;const points=new Map<number,SpeedSample>();for(const p of [...(old?.points??[]),...row.points])points.set(p.time,p);store.put({...row,points:[...points.values()].sort((a,b)=>a.time-b.time)});};
   }
   transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
  });}catch(error){for(const [key,row] of batch){const newer=queued.get(key);queued.set(key,{...row,points:[...row.points,...(newer?.points??[])]});}throw error;}
 })().finally(()=>{writing=null;});return writing;
}
export async function listSpeedMonths(){await flushSpeedHistory();const connection=await db();const keys=await requestValue(connection.transaction('series').objectStore('series').index('month').getAllKeys());return [...new Set(keys.map(key=>String(key).slice(0,7)))].sort().reverse();}
export async function readSpeedMonth(month:string):Promise<SpeedSeries[]>{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Mês inválido.');
 await flushSpeedHistory();const connection=await db();return requestValue<StoredSeries[]>(connection.transaction('series').objectStore('series').index('month').getAll(month));
}
export async function clearSpeedHistory(){
 queued.clear();lastSample.clear();try{await writing;}catch{}queued.clear();
 if(typeof indexedDB!=='undefined'){const connection=await db();await new Promise<void>((resolve,reject)=>{const t=connection.transaction('series','readwrite');t.objectStore('series').clear();t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}
 try{localStorage.removeItem('sf-downloader.speed-history.v1');}catch{}
}
export function averageSpeedSamples(rows:SpeedSeries[]):SpeedSample[]{
 const times=new Map<number,{sum:number;count:number}>();
 for(const row of rows)for(const p of row.points){const value=times.get(p.time)??{sum:0,count:0};value.sum+=p.speed;value.count++;times.set(p.time,value);}
 return [...times].sort(([a],[b])=>a-b).map(([time,v])=>({time,speed:v.sum/v.count}));
}
