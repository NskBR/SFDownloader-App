import {useState} from "react";
export interface PeerDetail {
 client_name:string|null;conn_kind:unknown;state:string;progress_percent?:number|null;encrypted?:boolean|null;
 downloadRate?:number;uploadRate?:number;
 counters:{fetched_bytes:number;uploaded_bytes:number;errors:number;connections:number;incoming_connections:number};
}
export interface ConnectionDetails {active:boolean;peers:Record<string,PeerDetail>}
type Sort="address"|"download"|"upload"|"progress"|"received"|"sent";
export function peerRatio(received:number,sent:number){return received>0?(sent/received).toFixed(2):sent>0?"∞":"—";}
export function sortPeerDetails(peers:Record<string,PeerDetail>,sort:Sort){
 const value=(peer:PeerDetail)=>sort==="download"?peer.downloadRate??-1:sort==="upload"?peer.uploadRate??-1:sort==="progress"?peer.progress_percent??-1:sort==="received"?peer.counters.fetched_bytes:peer.counters.uploaded_bytes;
 return Object.entries(peers).sort(([a,left],[b,right])=>sort==="address"?a.localeCompare(b):value(right)-value(left)||a.localeCompare(b));
}
export function TorrentPeerDetails({details,error,formatBytes}:{details:ConnectionDetails|null;error:boolean;formatBytes:(value:number)=>string}){
 const [sort,setSort]=useState<Sort>("download");
 return <>
  <div className="torrent-peers-heading"><strong>Peers conectados{details?` (${Object.keys(details.peers).length})`:""}</strong><label>Ordenar <select aria-label="Ordenar peers" value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="download">Download/s</option><option value="upload">Upload/s</option><option value="progress">Progresso</option><option value="received">Recebido</option><option value="sent">Enviado</option><option value="address">IP e porta</option></select></label></div>
  {error?<p role="status">Não foi possível consultar as conexões.</p>:!details?<p>Consultando conexões…</p>:Object.keys(details.peers).length===0?<p>{details.active?"Nenhum peer conectado neste momento.":"Torrent sem conexão ativa."}</p>:sortPeerDetails(details.peers,sort).map(([address,peer])=>{
   const progress=peer.progress_percent;
   const kind=progress==null?"Não identificado":progress>=100?"Seeder":"Leecher";
   return <div className="torrent-peer-detail" key={address}>
    <div className="torrent-peer-title"><strong>{address}</strong><span className="torrent-peer-kind">{kind}</span></div>
    <span>{peer.client_name || "Cliente não identificado"}</span>
    <div className="torrent-peer-facts"><span title="Disponibilidade anunciada pelo peer; não é uma verificação local dos arquivos dele.">Progresso: <b>{progress==null?"—":`${progress.toFixed(1)}%`}</b></span><span>Ratio: <b>{peerRatio(peer.counters.fetched_bytes,peer.counters.uploaded_bytes)}</b></span><span>Download: <b>{peer.downloadRate==null?"—":`${formatBytes(peer.downloadRate)}/s`}</b></span><span>Upload: <b>{peer.uploadRate==null?"—":`${formatBytes(peer.uploadRate)}/s`}</b></span><span>Recebido: <b>{formatBytes(peer.counters.fetched_bytes)}</b></span><span>Enviado: <b>{formatBytes(peer.counters.uploaded_bytes)}</b></span><span>Transporte: <b>{typeof peer.conn_kind==="string"?peer.conn_kind.toUpperCase():"—"}</b></span><span title="O motor atual não informa criptografia da conexão.">Criptografia: <b>{peer.encrypted==null?"Não disponível":peer.encrypted?"Sim":"Não"}</b></span></div>
    <div>{peer.counters.incoming_connections>0?"Conexão recebida":"Conexão estabelecida"} · Erros: {peer.counters.errors}</div>
   </div>;
  })}
 </>;
}
