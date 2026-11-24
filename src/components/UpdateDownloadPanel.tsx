import {UpdateTransferMotion} from "./UpdateTransferMotion";
import {UpdateDownloadStats} from "./UpdateDownloadStats";
import {Download,X} from "./icons";
export function UpdateDownloadPanel({percentage,downloaded,total,speed,preview=false,onCancel}:{percentage:number|null;downloaded:number;total:number|null;speed:number;preview?:boolean;onCancel:()=>void}) {
 return <section className="update-dialog update-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="update-transfer-title">
  <header className="update-transfer-heading"><span><Download size={16}/>Atualização do aplicativo</span>{preview&&<span className="update-preview-label">Prévia</span>}</header>
  <div className="update-transfer-content"><UpdateTransferMotion/><h2 id="update-transfer-title">Preparando sua próxima versão</h2><p role="status">{preview?'Demonstração visual do download.':'Baixando a atualização. Você pode acompanhar o progresso abaixo.'}</p>
  <div className="update-transfer-progress-label"><span>Baixando atualização</span><strong>{percentage===null?'Calculando…':`${percentage}%`}</strong></div>
  <progress max={100} value={percentage??undefined} aria-label="Progresso da atualização"/>
  <UpdateDownloadStats downloaded={downloaded} total={total} speed={speed}/></div>
  <footer className="update-transfer-footer"><span>{preview?'Nenhum arquivo está sendo baixado.':'A instalação começará ao concluir.'}</span><button type="button" onClick={onCancel}><X size={14}/>{preview?'Fechar prévia':'Cancelar'}</button></footer>
 </section>;
}
