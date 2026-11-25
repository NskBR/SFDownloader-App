import {DownloadSpeedChart} from "./DownloadSpeedChart";
import {useMemo,useState} from "react";
import type {DownloadTask} from "../domain/download";
import {downloadInsights} from "../domain/downloadInsights";
import {Activity,Globe,Files,Inbox} from "./icons";
export function MetricsInsights({tasks,loading,error,formatBytes}:{tasks:DownloadTask[];loading:boolean;error:boolean;formatBytes:(n:number)=>string}){
 const [days,setDays]=useState(14),[unit,setUnit]=useState<'count'|'bytes'>('count'),[selected,setSelected]=useState<number|null>(null);
 const data=useMemo(()=>downloadInsights(tasks,days),[tasks,days]);
 const max=Math.max(1,...data.daily.map(d=>unit==='count'?d.count:d.bytes));
 const periodCount=data.daily.reduce((n,d)=>n+d.count,0),periodBytes=data.daily.reduce((n,d)=>n+d.bytes,0);
 const dateText=(date:Date)=>date.toLocaleDateString(undefined,{day:'2-digit',month:'2-digit'});
 const rank=(values:{name:string;count:number}[],label:string)=><div className="insight-rank">{values.length?values.slice(0,5).map(row=><div key={row.name}><span title={row.name}>{row.name}</span><b>{row.count}</b><i style={{width:`${row.count/Math.max(1,values[0].count)*100}%`}}/></div>):<p className="insight-empty">Sem {label} no histórico concluído.</p>}</div>;
 return <section className="metrics-history-insights" aria-label="Análise do histórico"><div className="insights-source"><h2>Seu histórico em perspectiva</h2><p>Os gráficos usam os downloads ainda salvos. São independentes dos contadores acumulados e da importação de métricas.</p></div>
 {loading?<p role="status">Consultando histórico…</p>:error?<p role="alert">Não foi possível consultar o histórico. Os contadores acumulados continuam disponíveis.</p>:<>
 <DownloadSpeedChart tasks={tasks}/>
 <article className="insight-activity"><header><div><Activity size={17}/><h3>Atividade recente</h3></div><div className="insight-switch" role="group" aria-label="Período do gráfico">{[14,30].map(n=><button key={n} aria-pressed={days===n} onClick={()=>{setDays(n);setSelected(null);}}>{n} dias</button>)}</div></header><div className="insight-activity-summary"><strong>{periodCount}<span>concluídos no período</span></strong><b>{formatBytes(periodBytes)}</b><div className="insight-switch" role="group" aria-label="Medida do gráfico"><button aria-pressed={unit==='count'} onClick={()=>setUnit('count')}>Downloads</button><button aria-pressed={unit==='bytes'} onClick={()=>setUnit('bytes')}>Volume</button></div></div>
 <div className="insight-bars" role="group" aria-label="Downloads concluídos por dia">{data.daily.map((day,i)=>{const value=unit==='count'?day.count:day.bytes;const label=`${dateText(day.date)}: ${day.count} downloads, ${formatBytes(day.bytes)}`;return <button key={i} title={label} aria-label={label} aria-pressed={selected===i} onClick={()=>setSelected(i)}><i style={{height:`${Math.max(value?3:0,value/max*100)}%`}}/></button>;})}</div><div className="insight-axis"><span>{dateText(data.daily[0].date)}</span><p aria-live="polite">{selected===null?'Selecione um dia para ver os detalhes.':`${dateText(data.daily[selected].date)} · ${data.daily[selected].count} concluídos · ${formatBytes(data.daily[selected].bytes)}`}</p><span>Hoje</span></div>
 </article>
 <div className="insight-breakdowns"><article><header><div><Files size={17}/><h3>Tipos mais baixados</h3></div><small>Por quantidade concluída</small></header>{rank(data.types,'tipos de arquivo')}</article><article><header><div><Globe size={17}/><h3>Principais origens</h3></div><small>Por quantidade concluída</small></header>{rank(data.hosts,'origens')}</article></div>
 <article className="insight-queue"><header><div><Inbox size={17}/><h3>Downloads salvos</h3></div><small>{tasks.length} registros</small></header><div>{[{label:'Concluídos',value:data.completed},{label:'Em andamento',value:data.active},{label:'Na fila',value:data.queued},{label:'Pausados',value:data.paused},{label:'Falhos',value:data.failed},{label:'Cancelados',value:data.cancelled}].map(item=><span key={item.label}><b>{item.value}</b>{item.label}</span>)}</div></article>
 </>}
 </section>;
}
