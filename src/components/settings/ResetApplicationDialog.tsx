import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {RotateCcw,X,AlertTriangle} from "../icons";
import "../../styles/reset-application.css";

const HOLD_MS=3000;
export function ResetApplicationDialog({onClose,onConfirm}:{onClose:()=>void;onConfirm:()=>Promise<void>}) {
  const [progress,setProgress]=useState(0);
  const [busy,setBusy]=useState(false);
  const [holding,setHolding]=useState(false);
  const [error,setError]=useState('');
  const timer=useRef<ReturnType<typeof setInterval>|null>(null);
  const submitting=useRef(false);
  const dialog=useRef<HTMLElement>(null);
  const cancelButton=useRef<HTMLButtonElement>(null);
  const stop=()=>{if(timer.current!==null)clearInterval(timer.current);timer.current=null;setHolding(false);if(!submitting.current)setProgress(0);};
  const begin=()=>{
    if(timer.current!==null || submitting.current)return;
    setHolding(true);setError('');const started=Date.now();
    timer.current=setInterval(()=>{
      const elapsed=Date.now()-started;setProgress(Math.min(1,elapsed/HOLD_MS));
      if(elapsed<HOLD_MS)return;
      submitting.current=true;stop();setProgress(1);setBusy(true);
      void onConfirm().catch(cause=>{setError(String(cause));submitting.current=false;setBusy(false);setProgress(0);});
    },25);
  };
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;cancelButton.current?.focus();
    const cancelHold=()=>stop();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape' && !submitting.current){stop();onClose();}
      if(event.key!=='Tab')return;
      const controls=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled)')];
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    };
    window.addEventListener('blur',cancelHold);document.addEventListener('visibilitychange',cancelHold);document.addEventListener('keydown',key);
    return()=>{if(timer.current!==null)clearInterval(timer.current);window.removeEventListener('blur',cancelHold);document.removeEventListener('visibilitychange',cancelHold);document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  return createPortal(<div className="reset-app-overlay" onMouseDown={event=>{if(event.target===event.currentTarget && !busy){stop();onClose();}}}>
    <section className="reset-app-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="reset-app-title" aria-describedby="reset-app-description">
      <header><span><AlertTriangle size={20}/><h2 id="reset-app-title">Redefinir aplicativo?</h2></span><button disabled={busy} type="button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header>
      <div className="reset-app-body"><p id="reset-app-description">As configurações voltarão ao padrão e todas as métricas serão zeradas. Esta ação não pode ser desfeita.</p><ul><li>Preferências, pastas configuradas e categorias personalizadas.</li><li>Temas selecionados, perfis de cores, layout e ícones.</li><li>Inicialização com o Windows e agendamento global.</li><li>Estatísticas acumuladas de uso e downloads.</li></ul><p className="reset-app-preserved">Os arquivos baixados, o histórico de downloads e os temas instalados serão mantidos.</p><p className="reset-app-hint">Segure o botão por 3 segundos para confirmar. Soltar antes cancela a confirmação.</p>{error && <p className="reset-app-error" role="alert">{error}</p>}</div>
      <footer><button type="button" ref={cancelButton} disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="reset-app-hold" data-holding={holding} disabled={busy} onPointerDown={event=>{if(event.button===0){event.preventDefault();event.currentTarget.focus();begin();}}} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onBlur={stop} onKeyDown={event=>{if((event.key===' '||event.key==='Enter')&&!event.repeat){event.preventDefault();begin();}}} onKeyUp={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();stop();}}} aria-label="Segure por 3 segundos para redefinir aplicativo" aria-busy={busy}><i aria-hidden="true" style={{width:`${progress*100}%`}}/><span><RotateCcw size={16}/>{busy?'Redefinindo…':progress>0?'Continue segurando…':'Segurar para redefinir'}</span></button></footer>
    </section>
  </div>,document.body);
}
