import {useEffect,useMemo,useState} from "react";
import type {DownloadTask} from "../domain/download";
import {readSpeedMonth,listSpeedMonths,speedMonth,comparisonSpeedSamples,averageProgressSpeeds,type ProgressSpeedPoint,type SpeedSeries} from "../services/speedHistory";
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
 const curves=useMemo(()=>rows.map(row=>({...row,points:comparisonSpeedSamples(row.points)})).filter(row=>row.points.length),[rows]);
 const average=useMemo(()=>averageProgressSpeeds(curves.map(row=>row.points)),[curves]);
 const max=useMemo(()=>curves.reduce((m,row)=>row.points.reduce((v,p)=>Math.max(v,p.speed),m),1024),[curves]);
 const x=(progress:number)=>45+progress/100*735;
 const y=(value:number)=>180-value/max*155;
 // Quadratic midpoint smoothing stays inside the measured extrema and keeps gaps open.
 const path=(points:ProgressSpeedPoint[])=>{
  let result='';let segment:ProgressSpeedPoint[]=[];
  const flush=()=>{if(!segment.length)return;result+=`M${x(segment[0].progress)},${y(segment[0].speed)} `;for(let i=1;i<segment.length;i++){const previous=segment[i-1],current=segment[i];result+=`Q${x(previous.progress)},${y(previous.speed)} ${(x(previous.progress)+x(current.progress))/2},${(y(previous.speed)+y(current.speed))/2} `;}const last=segment[segment.length-1];result+=`L${x(last.progress)},${y(last.speed)} `;segment=[];};
  for(const p of points){if(segment.length&&p.segment!==segment[segment.length-1].segment)flush();segment.push(p);}flush();return result;
 };
 const options=[...new Set([month,speedMonth(),...months])].sort().reverse();const selected=options.indexOf(month);
 const names=useMemo(()=>new Map(tasks.map(t=>[t.id,t.fileName])),[tasks]);
 return <article className="insight-speed"><header><div><h3>Velocidade dos downloads</h3><p>{curves.length} downloads comparáveis neste mês · curvas alinhadas pelo progresso</p></div><div className="speed-month-controls"><button type="button" aria-label="Mês anterior com registros" disabled={selected>=options.length-1} onClick={()=>setMonth(options[selected+1])}><ChevronLeft size={15}/></button><select aria-label="Mês do gráfico de velocidade" value={month} onChange={e=>setMonth(e.target.value)}>{options.map(m=><option key={m} value={m}>{label(m)}</option>)}</select><button type="button" aria-label="Mês seguinte com registros" disabled={selected<=0} onClick={()=>setMonth(options[selected-1])}><ChevronRight size={15}/></button></div></header>
 <div className="speed-month-caption"><span className="speed-average-label"><i/>Média geral do mês</span><span>Todos os downloads com medições · sem limite de curvas</span></div>
 {loading?<p role="status">Carregando velocidades do mês…</p>:error?<p role="alert">{error}</p>:curves.length?<><svg viewBox="0 0 800 205" role="img" aria-label="Velocidade por progresso de 0 a 100 por cento, com média em dourado">{[0,.5,1].map(n=><g key={n}><line x1="45" x2="780" y1={y(n*max)} y2={y(n*max)} stroke="var(--line)"/><text x="0" y={y(n*max)-5} fill="var(--text-2)" fontSize="10">{speed(n*max)}</text></g>)}{curves.map((row,i)=>hidden.includes(row.id)?null:<g key={row.id}><title>{names.get(row.id)??`Download ${row.id.slice(0,8)}`}</title><path d={path(row.points)} fill="none" stroke={color(i)} strokeWidth="1.5" opacity=".65"/><circle cx={x(row.points[row.points.length-1].progress)} cy={y(row.points[row.points.length-1].speed)} r="1.5" fill={color(i)}/></g>)}<path d={path(average)} fill="none" stroke="#d8ad52" strokeWidth="2.8"/>{[0,25,50,75,100].map(percent=><text key={percent} x={x(percent)} y="202" textAnchor="middle" fill="var(--text-2)" fontSize="10">{percent}%</text>)}</svg><details className="speed-series-details"><summary>Downloads do mês ({curves.length}) · mostrar ou ocultar curvas</summary><div className="speed-series-legend">{curves.map((row,i)=>{const name=names.get(row.id)??`Download ${row.id.slice(0,8)}`;return <button key={row.id} title={name} aria-pressed={!hidden.includes(row.id)} onClick={()=>setHidden(v=>v.includes(row.id)?v.filter(id=>id!==row.id):[...v,row.id])}><i style={{background:color(i)}}/><span>{name}</span></button>;})}</div></details></>:<div className="speed-chart-empty"><strong>Nenhuma amostra com progresso salva neste mês.</strong><p>A comparação precisa de velocidade e percentual medidos juntos. Registros antigos sem percentual são preservados, mas não geram curvas artificiais.</p></div>}
 {curves.length>0&&rows.length>curves.length&&<p className="speed-chart-note">{rows.length-curves.length} registros sem percentual medido permanecem no histórico e não entram nesta comparação.</p>}
 <p className="speed-chart-note">O eixo horizontal representa o progresso de cada download, de 0 a 100%. O mês seleciona os registros comparados. A linha dourada é a média das velocidades medidas na mesma faixa de progresso, com peso igual por download. Pausas e intervalos sem amostras ficam em aberto. O histórico mensal é salvo neste dispositivo e pode ser apagado em Redefinir métricas.</p></article>;
}
