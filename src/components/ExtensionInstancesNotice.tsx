import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {AlertTriangle,X,Chrome,Flame,ArrowRight,Check,Puzzle} from "./icons";
const key="sf-downloader.browser-instances-notice.2.0.4";
function NoticeDialog({onClose,onDismiss}:{onClose:()=>void;onDismiss:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return createPortal(<dialog ref={ref} className="extension-instance-dialog" onDoubleClick={event=>event.stopPropagation()} aria-labelledby="extension-instance-notice-title" aria-describedby="extension-instance-notice-description" onCancel={event=>{event.preventDefault();onClose();}}>
   <button type="button" className="instance-notice-close" aria-label="Fechar aviso" onClick={onClose}><X size={18}/></button>
   <div className="instance-notice-art" aria-hidden="true"><div className="instance-notice-hub"><Puzzle size={26}/></div><div className="instance-notice-wire"/><div className="instance-notice-peers"><span><Chrome size={20}/><i><Check size={9}/></i></span><span><Flame size={20}/><i><Check size={9}/></i></span></div><p>Cada navegador.<br/>Sua própria conexão.</p></div>
   <div className="instance-notice-copy"><span className="instance-notice-version">Extensão 0.4.1</span><h2 id="extension-instance-notice-title">Seus navegadores,<br/>agora separados.</h2><p id="extension-instance-notice-description">Veja qual navegador está conectado e qual extensão precisa de atualização. Cada instalação e perfil passa a ter sua própria identificação.</p><p className="instance-notice-recommendation">Recomendamos instalar a nova extensão em <strong>todos os navegadores</strong> que você usa.</p><div className="instance-notice-actions"><button type="button" className="instance-notice-primary" onClick={()=>{onClose();window.dispatchEvent(new Event('sf-open-integration'));}}>Atualizar extensão<ArrowRight size={16}/></button><button type="button" className="instance-notice-dismiss" onClick={onDismiss}>Remover aviso</button></div></div>
 </dialog>,document.body);

}
export function ExtensionInstancesNotice(){
 const [visible,setVisible]=useState(()=>{try{return localStorage.getItem(key)!=="dismissed";}catch{return true;}});
 const [open,setOpen]=useState(false);
 if(!visible)return null;
 const dismiss=()=>{try{localStorage.setItem(key,'dismissed');}catch{}setOpen(false);setVisible(false);};
 return <><button type="button" className="nodrag titlebar-theme-btn extension-instance-alert" title="Atualização recomendada da extensão" aria-label="Aviso sobre a atualização da extensão" onDoubleClick={event=>event.stopPropagation()} onClick={()=>setOpen(true)}><AlertTriangle size={18}/></button>{open&&<NoticeDialog onClose={()=>setOpen(false)} onDismiss={dismiss}/>}</>;
}
