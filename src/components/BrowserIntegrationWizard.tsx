import {ExtensionDragDemo} from "./ExtensionDragDemo";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {invoke} from "@tauri-apps/api/core";
import {Chrome,Flame,ArrowLeft,ArrowRight,X,Check,Copy,Puzzle} from "./icons";
import * as service from "../services/downloadService";
import "../styles/integration-wizard.css";

export function BrowserIntegrationWizard({onClose}:{onClose:()=>void}) {
  const [browser,setBrowser]=useState<"chromium"|"firefox">("chromium");
  const [step,setStep]=useState(0);
  const [folder,setFolder]=useState("");
  const [xpi,setXpi]=useState("");
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const [connected,setConnected]=useState(false);
  const [versionNotice,setVersionNotice]=useState("");
  const dialog=useRef<HTMLElement>(null);
  const title=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape")onClose();
      if(event.key!=="Tab")return;
      const controls=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')];
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[onClose]);
  useEffect(()=>{title.current?.focus();},[step]);
  useEffect(()=>{
    let active=true;setError('');setFolder('');setXpi('');
    void invoke<string>('get_extension_dir',{browser}).then(value=>{if(active)setFolder(value);}).catch(e=>{if(active)setError(String(e));});
    if(browser==='firefox')void invoke<string>('get_firefox_xpi_path').then(value=>{if(active)setXpi(value);}).catch(e=>{if(active)setError(String(e));});
    return()=>{active=false;};
  },[browser]);
  useEffect(()=>{
    let active=true;
    const refresh=()=>void service.browserExtensionDiagnostics().then(status=>{if(!active)return;setConnected(status.connected);setVersionNotice(status.connected?(status.outdated?`Extensão ${status.installedVersion} desatualizada. Instale a versão ${status.availableVersion} pelos passos abaixo.`:!status.installedVersion?'A extensão conectada não informou a versão. Reinstale pelo assistente para garantir a versão atual.':''):'');}).catch(()=>{if(active)setConnected(false);});
    refresh();const timer=window.setInterval(refresh,2000);
    return()=>{active=false;clearInterval(timer);};
  },[]);
  const run=(action:()=>Promise<unknown>)=>{setError('');void action().catch(e=>setError(String(e)));};
  const copy=()=>run(async()=>{await navigator.clipboard.writeText('chrome://extensions');setCopied(true);});
  const headings=['Escolha seu navegador',browser==='chromium'?'Adicione a extensão':'Instale no Firefox','Confira a conexão'];
  return createPortal(<div className="integration-wizard-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section ref={dialog} className="integration-wizard" role="dialog" aria-modal="true" aria-labelledby="integration-wizard-title" tabIndex={-1}>
      <header><span className="integration-wizard-brand"><Puzzle size={20}/>Integração com o navegador</span><button type="button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header>
      <div className="integration-wizard-progress"><span>Etapa {step+1} de 3</span><progress max={3} value={step+1} aria-label="Progresso da instalação"/></div>
      <div className="integration-wizard-body">{versionNotice&&<p className="integration-version-notice" role="status">{versionNotice}</p>}<h2 id="integration-wizard-title" ref={title} tabIndex={-1}>{headings[step]}</h2>
      {step===0 && <><p>Vamos configurar a extensão em poucos passos.</p><div className="integration-wizard-browsers">{(['chromium','firefox'] as const).map(value=><button type="button" key={value} aria-pressed={browser===value} onClick={()=>setBrowser(value)}>{value==='chromium'?<Chrome size={28}/>:<Flame size={28}/>}<strong>{value==='chromium'?'Chrome e derivados':'Firefox'}</strong><small>{value==='chromium'?'Chrome, Edge, Brave e outros':'Instalação com XPI assinado'}</small></button>)}</div></>}
      {step===1 && (browser==='chromium'?<><p>Cole o endereço abaixo no navegador e ative o <strong>Modo do desenvolvedor</strong>. Depois arraste a extensão para essa página.</p><button type="button" className="integration-wizard-address" aria-label="Copiar endereço" onClick={copy} title="Copiar endereço"><code>chrome://extensions</code>{copied?<Check size={17}/>:<Copy size={17}/>}</button><button type="button" className="integration-wizard-drag" disabled={!folder} onMouseDown={e=>{if(e.button===0 && folder){e.preventDefault();run(()=>invoke('start_drag_folder',{path:folder}));}}}><ExtensionDragDemo/><strong>Arrastar extensão para o navegador</strong></button></>:<><p>Abra o pacote assinado e confirme “Adicionar” no Firefox. Depois abra a extensão e ative a captura automática.</p><button type="button" disabled={!xpi} onClick={()=>run(()=>service.openFile(xpi))}><Flame size={18}/>Instalar no Firefox</button>{!xpi && <p className="integration-wizard-hint">Esta versão aguarda o XPI assinado. O pacote antigo não será instalado.</p>}</>)}
      {step===2 && <div className="integration-wizard-connection" role="status"><Puzzle size={32}/><h3>{connected?'Extensão conectada':'Aguardando a extensão'}</h3><p>{connected?'O navegador já pode enviar downloads ao SFDownloader.':'Abra a extensão no navegador e ative a captura automática. Mantenha o aplicativo aberto.'}</p></div>}
      {error && <p className="integration-wizard-error" role="alert">{error}</p>}</div>
      <footer><button type="button" disabled={step===0} onClick={()=>{setStep(step-1);setError('');}}><ArrowLeft size={16}/>Voltar</button><button type="button" className="integration-wizard-next" onClick={()=>step===2?onClose():setStep(step+1)}>{step===2?'Concluir':'Continuar'}{step===2?<Check size={16}/>:<ArrowRight size={16}/>}</button></footer>
    </section>
  </div>,document.body);
}
