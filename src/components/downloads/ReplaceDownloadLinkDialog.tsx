import {DialogVisualRail} from "../DialogVisualRail";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Link2} from 'lucide-react';
import {replaceDownloadUrl} from '../../services/downloadService';
import {ipcErrorMessage} from '../../domain/ipcErrors';
import type {DownloadTask} from '../../domain/download';

export function ReplaceDownloadLinkDialog({task,onClose,onSaved}:{task:DownloadTask;onClose:()=>void;onSaved:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [url,setUrl]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  const submit=async()=>{
    if(busy)return;
    let parsed:URL;try{parsed=new URL(url.trim());if(!['http:','https:'].includes(parsed.protocol))throw new Error();}catch{setError('Informe um link HTTP ou HTTPS válido.');return;}
    setBusy(true);setError('');
    try{await replaceDownloadUrl(task.id,parsed.href);onSaved();onClose();}
    catch(cause){setError(ipcErrorMessage(cause,'Não foi possível validar o novo link.'));}
    finally{setBusy(false);}
  };
  return createPortal(<dialog ref={dialog} className="rgb-dialog replace-link-dialog sf-dialog-split" aria-labelledby="replace-link-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
<DialogVisualRail kind="link"/>
    <header><div><h2 id="replace-link-title">Fornecer novo link</h2><p>{task.fileName}</p></div><button type="button" className="rgb-icon-button" disabled={busy} onClick={onClose} aria-label="Fechar"><X size={18}/></button></header>
    <form onSubmit={e=>{e.preventDefault();void submit();}}><div className="rgb-dialog-body"><p>Cole um novo link direto para o mesmo arquivo. O aplicativo valida o tamanho e compara os bytes iniciais disponíveis antes de substituir o endereço.</p><label>Novo link<input autoFocus type="url" placeholder="https://…" value={url} onChange={e=>setUrl(e.target.value)} disabled={busy} required/></label>{error && <p className="replace-link-error" role="alert">{error}</p>}</div>
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="rgb-apply" disabled={busy || !url.trim()}><Link2 size={14}/> {busy?'Validando…':'Salvar link e retomar'}</button></footer></form>
  </dialog>,document.body);
}
