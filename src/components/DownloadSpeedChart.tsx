import {useEffect,useMemo,useState} from "react";
import type {DownloadTask} from "../domain/download";
import {readSpeedMonth,listSpeedMonths,speedMonth,averageSpeedSamples,type SpeedSample,type SpeedSeries} from "../services/speedHistory";
import {ChevronLeft,ChevronRight} from "./icons";
const speed=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MB/s`:`${Math.round(n/1024)} KB/s`;
const color=(i:number)=>`hsl(${(i*137.5+180)%360} 65% 65%)`;
const label=(month:string)=>new Date(Number(month.slice(0,4)),Number(month.slice(5))-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});
export function DownloadSpeedChart({tasks}:{tasks:DownloadTask[]}){
 const [month,setMonth]=useState(speedMonth),[months,setMonths]=useState<string[]>([]),[rows,setRows]=useState<SpeedSeries[]>([]),[hidden,setHidden]=useState<string[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;setLoading(true);setError('');setHidden([]);
  const refresh=async()=>{try{const [data,available]=await Promise.all([readSpeedMonth(month),listSpeedMonths()]);if(active){setRows(data);setMonths([...new Set([speedMonth(),...available])].sort().reverse());setError('');}}catch{if(active)setError('Não foi possível carregar o histórico mensal de velocidade.');}finally{if(active)setLoading(false);}};
  void refresh();const timer=month===speedMonth()?setInterval(()=>void refresh(),10000):undefined;
  return()=>{active=false;if(timer)clearInterval(timer);};
 },[month]);
 const start=new Date(Number(month.slice(0,4)),Number(month.slice(5))-1,1).getTime(),end=new Date(Number(month.slice(0,4)),Number(month.slice(5)),1).getTime();
 const average=useMemo(()=>averageSpeedSamples(rows),[rows]);
 const max=useMemo(()=>rows.reduce((m,row)=>row.points.reduce((v,p)=>Math.max(v,p.speed),m),1024),[rows]);
 const x=(time:number)=>45+(time-start)/(end-start)*735;
 const y=(value:number)=>180-value/max*155;
 // Preserve gaps and extrema, but avoid emitting several SVG vertices at the same horizontal pixel.
 const path=(points:SpeedSample[])=>{
  let result='',last=-Infinity,bucket=-1,pending:SpeedSample[]=[];
  const commit=()=>{if(!pending.length)return;const low=pending.reduce((a,b)=>a.speed<b.speed?a:b),high=pending.reduce((a,b)=>a.speed>b.speed?a:b);const chosen=[pending[0],low,high,pending[pending.length-1]].filter((p,i,a)=>a.indexOf(p)===i).sort((a,b)=>a.time-b.time);for(const p of chosen){result+=`${p.time-last>6000?'M':'L'}${x(p.time).toFixed(1)},${y(p.speed).toFixed(1)} `;last=p.time;}pending=[];};
  for(const p of points){const col=Math.floor(x(p.time));if(col!==bucket||(pending.length&&p.time-pending[pending.length-1].time>6000)){commit();bucket=col;}pending.push(p);}commit();return result;
 };
 const options=[...new Set([month,speedMonth(),...months])].sort().reverse();const selected=options.indexOf(month);
 const names=useMemo(()=>new Map(tasks.map(t=>[t.id,t.fileName])),[tasks]);
 return <article className="insight-speed"><header><div><h3>Velocidade dos downloads</h3><p>{rows.length} downloads com amostras neste mês · cada curva mantém sua própria identidade</p></div><div className="speed-month-controls"><button type="button" aria-label="Mês anterior com registros" disabled={selected>=options.length-1} onClick={()=>setMonth(options[selected+1])}><ChevronLeft size={15}/></button><select aria-label="Mês do gráfico de velocidade" value={month} onChange={e=>setMonth(e.target.value)}>{options.map(m=><option key={m} value={m}>{label(m)}</option>)}</select><button type="button" aria-label="Mês seguinte com registros" disabled={selected<=0} onClick={()=>setMonth(options[selected-1])}><ChevronRight size={15}/></button></div></header>
 <div className="speed-month-caption"><span className="speed-average-label"><i/>Média geral do mês</span><span>Todos os downloads com medições · sem limite de curvas</span></div>
 {loading?<p role="status">Carregando velocidades do mês…</p>:error?<p role="alert">{error}</p>:rows.length?<><svg viewBox="0 0 800 205" role="img" aria-label="Todas as curvas do mês e média em dourado">{[0,.5,1].map(n=><g key={n}><line x1="45" x2="780" y1={y(n*max)} y2={y(n*max)} stroke="var(--line)"/><text x="0" y={y(n*max)-5} fill="var(--text-2)" fontSize="10">{speed(n*max)}</text></g>)}{rows.map((row,i)=>hidden.includes(row.id)?null:<g key={row.id}><title>{names.get(row.id)??`Download ${row.id.slice(0,8)}`}</title><path d={path(row.points)} fill="none" stroke={color(i)} strokeWidth="1.5" opacity=".65"/><circle cx={x(row.points[row.points.length-1].time)} cy={y(row.points[row.points.length-1].speed)} r="1.5" fill={color(i)}/></g>)}<path d={path(average)} fill="none" stroke="#d8ad52" strokeWidth="2.8"/><text x="45" y="202" fill="var(--text-2)" fontSize="10">01</text><text x="761" y="202" fill="var(--text-2)" fontSize="10">{new Date(end-1).getDate()}</text></svg><details className="speed-series-details"><summary>Downloads do mês ({rows.length}) · mostrar ou ocultar curvas</summary><div className="speed-series-legend">{rows.map((row,i)=>{const name=names.get(row.id)??`Download ${row.id.slice(0,8)}`;return <button key={row.id} title={name} aria-pressed={!hidden.includes(row.id)} onClick={()=>setHidden(v=>v.includes(row.id)?v.filter(id=>id!==row.id):[...v,row.id])}><i style={{background:color(i)}}/><span>{name}</span></button>;})}</div></details></>:<div className="speed-chart-empty"><strong>Nenhuma amostra salva neste mês.</strong><p>As medições começam nesta versão. Downloads antigos não têm curvas reconstruídas.</p></div>}
 <p className="speed-chart-note">O eixo horizontal representa os dias do mês. A linha dourada é a média das velocidades medidas em cada instante, não a soma. Pausas e intervalos sem amostras ficam em aberto. O histórico mensal é salvo neste dispositivo e pode ser apagado em Redefinir métricas.</p></article>;
}
