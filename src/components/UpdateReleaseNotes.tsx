import logo from "../assets/sf-logo.svg";
import {Download, X} from "./icons";
import {useEffect,useRef} from "react";
import {createPortal} from "react-dom";
import type {UpdateCheckResult} from "../services/downloadService";
interface Props {update:UpdateCheckResult;onCancel:()=>void;onConfirm:()=>void}
export function UpdateReleaseNotes({update,onCancel,onConfirm}:Props){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>{node?.close();};},[]);
 return createPortal(<dialog ref={dialog} className="update-notes-dialog" aria-labelledby="update-notes-title" onCancel={event=>{event.preventDefault();onCancel();}}>
  <header><div className="update-notes-heading"><img src={logo} alt="" draggable={false}/><div><h2 id="update-notes-title">Atualização disponível · v{update.latest_version}</h2><p>Confira as novidades antes de atualizar.</p></div><button type="button" className="update-notes-close" aria-label="Fechar" onClick={onCancel}><X size={18}/></button></div></header>
  <section className="update-release-notes" aria-label="Notas da versão">{update.release_notes?.trim() || "Esta versão não possui notas de atualização."}</section>
  <footer><button type="button" onClick={onCancel}>Agora não</button><button type="button" className="update-notes-confirm" onClick={onConfirm} autoFocus><Download size={16}/>Baixar e instalar</button></footer>
 </dialog>,document.body);
}
