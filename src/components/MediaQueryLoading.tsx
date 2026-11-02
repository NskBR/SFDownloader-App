import {Clock3,Music2,Video} from "lucide-react";

interface Props { pt:boolean; wait:{reason:string;seconds:number}|null }
export function MediaQueryLoading({pt,wait}:Props) {
 const text=(br:string,en:string)=>pt?br:en;
 return <div className={`media-query ${wait?"is-waiting":""}`} role="status" aria-live="polite">
  <div className="media-query-art" aria-hidden="true">
   <span className="media-query-orbit"/>
   <span className="media-query-symbol">{wait?<Clock3 size={25}/>:<Video size={25}/>}</span>
   <span className="media-query-audio"><Music2 size={13}/></span>
  </div>
  <div className="media-query-copy">
   <strong>{wait?wait.reason==="queue"?text("Aguardando outra consulta…","Waiting for another query…"):`${text("Nova consulta em","Next query in")} ${wait.seconds}s`:text("Preparando suas opções","Preparing your options")}</strong>
   <p>{wait?wait.reason==="rate-limit"?text("A plataforma pediu uma pausa. A consulta continua automaticamente.","The platform requested a pause. The query resumes automatically."):text("Aguardando o intervalo entre consultas.","Waiting for the interval between queries."):text("Consultando título, duração e qualidades disponíveis na plataforma.","Checking the title, duration and available qualities on the platform.")}</p>
  </div>
  <div className="media-query-preview" aria-hidden="true">
   <div className="media-query-cover"><Music2 size={19}/></div>
   <div className="media-query-lines"><i/><i/><i/></div>
   <div className="media-query-wave">{Array.from({length:5},(_,index)=><i key={index} style={{animationDelay:`${index*-.16}s`}}/>)}</div>
  </div>
  <small>{text("Você escolhe o formato antes de baixar.","You choose the format before downloading.")}</small>
 </div>;
}
