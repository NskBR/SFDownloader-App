import {Users} from "lucide-react";
import {TorrentTelemetryTooltip} from "./TorrentTelemetryTooltip";
export function TorrentPeerStatus({peers,trackers,totalUploaded}:{peers:number;trackers:number;totalUploaded?:string}) {
 return <TorrentTelemetryTooltip className="torrent-peer-count" label={`${peers} peers transferindo, ${trackers} trackers configurados`} title="Conexões do torrent" rows={[["Peers transferindo",peers],["Trackers configurados",trackers],...(totalUploaded!==undefined?[["Total enviado",totalUploaded] as [string,string]]:[])]}><Users aria-hidden="true"/><span className="torrent-stat-value">{peers}</span></TorrentTelemetryTooltip>;
}
