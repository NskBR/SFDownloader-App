import {BrowserConnectionsList} from "./BrowserConnectionsList";
import type {BrowserInstance} from "../services/downloadService";
import {readBrowserConnections} from "../services/extensionVersionCheck";
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
  const [xpiState,setXpiState]=useState<"loading"|"ready"|"pending"|"error">("loading");
  const [packageError,setPackageError]=useState("");
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const [instances,setInstances]=useState<BrowserInstance[]>([]);
  const [refreshing,setRefreshing]=useState(false);
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
    let active=true;setError('');setPackageError('');setFolder('');setXpi('');setXpiState('loading');
    if(step!==1)return()=>{active=false;};
    if(browser==='chromium')void invoke<string>('get_extension_dir',{browser}).then(value=>{if(active)setFolder(value);}).catch(e=>{if(active)setError(String(e));});
    else void invoke<string>('get_firefox_xpi_path').then(value=>{if(active){setXpi(value);setXpiState('ready');}}).catch(e=>{if(active){const message=String(e);setPackageError(message);setXpiState(/aguarda o XPI assinado/i.test(message)?'pending':'error');}});
    return()=>{active=false;};
  },[browser,step]);
  const showConnections=(status:service.BrowserBridgeDiagnostics)=>{setInstances(status.instances??[]);};
  useEffect(()=>{
    let active=true,revision=0;
    const refresh=async()=>{const current=++revision;try{const snapshot=await readBrowserConnections();if(active&&current===revision)showConnections(snapshot);}catch{/* Retain the last report during transient failures. */}};
    void refresh();const timer=window.setInterval(()=>void refresh(),2000);
    return()=>{active=false;window.clearInterval(timer);};
  },[]);
  const refreshConnections=async()=>{if(refreshing)return;setRefreshing(true);setError('');try{showConnections(await readBrowserConnections(true));}catch(e){setError(String(e));}finally{setRefreshing(false);}};
  const openInstanceInstall=(peer:BrowserInstance)=>{setBrowser(peer.browserName==='Firefox'?'firefox':'chromium');setStep(1);setError('');};
  const run=(action:()=>Promise<unknown>)=>{setError('');void action().catch(e=>setError(String(e)));};
  const copy=()=>run(async()=>{await navigator.clipboard.writeText('chrome://extensions');setCopied(true);});
  const headings=['Escolha seu navegador',browser==='chromium'?'Adicione a extensão':'Instale no Firefox'];
  return createPortal(<div className="integration-wizard-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section ref={dialog} className="integration-wizard" role="dialog" aria-modal="true" aria-labelledby="integration-wizard-title" tabIndex={-1}>
      <header><span className="integration-wizard-brand"><Puzzle size={20}/>Integração com o navegador</span><button type="button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header>
      <div className="integration-wizard-progress"><span>Etapa {step+1} de 2</span><progress max={2} value={step+1} aria-label="Progresso da instalação"/></div>
      <div className="integration-wizard-body"><div className="integration-wizard-heading"><h2 id="integration-wizard-title" ref={title} tabIndex={-1}>{headings[step]}</h2></div>
      {step===0 && <><BrowserConnectionsList instances={instances} onInstall={openInstanceInstall} onRefresh={()=>void refreshConnections()} refreshing={refreshing}/><p>Vamos configurar a extensão em poucos passos.</p><div className="integration-wizard-browsers">{(['chromium','firefox'] as const).map(value=><button type="button" key={value} aria-pressed={browser===value} onClick={()=>setBrowser(value)}>{value==='chromium'?<Chrome size={28}/>:<Flame size={28}/>}<strong>{value==='chromium'?'Chrome e derivados':'Firefox'}</strong><small>{value==='chromium'?'Chrome, Edge, Brave e outros':'Instalação com XPI assinado'}</small></button>)}</div></>}
      {step===1 && (browser==='chromium'?<><p>Cole o endereço abaixo no navegador e ative o <strong>Modo do desenvolvedor</strong>. Depois arraste a extensão para essa página.</p><button type="button" className="integration-wizard-address" aria-label="Copiar endereço" onClick={copy} title="Copiar endereço"><code>chrome://extensions</code>{copied?<Check size={17}/>:<Copy size={17}/>}</button><button type="button" className="integration-wizard-drag" disabled={!folder} onMouseDown={e=>{if(e.button===0 && folder){e.preventDefault();run(()=>invoke('start_drag_folder',{path:folder}));}}}><ExtensionDragDemo/><strong>Arrastar extensão para o navegador</strong></button></>:<><p>Abra o pacote assinado e confirme “Adicionar” no Firefox. Depois abra a extensão e ative a captura automática.</p><button type="button" disabled={!xpi} onClick={()=>run(()=>service.openFile(xpi))}><Flame size={18}/>Instalar no Firefox</button>{xpiState==='loading'&&<p className="integration-wizard-package-note" role="status">Preparando o pacote do Firefox…</p>}{xpiState==='pending'&&<p className="integration-wizard-package-note" role="status">O pacote do Firefox aguarda assinatura. A instalação será liberada quando ele estiver disponível.</p>}{xpiState==='error'&&<details className="integration-wizard-package-error"><summary>Não foi possível preparar o pacote. Ver detalhes</summary><p>{packageError}</p></details>}</>)}
      {error && <p className="integration-wizard-error" role="alert">{error}</p>}</div>
      <footer><div>{step===1&&<button type="button" onClick={()=>{setStep(0);setError('');void refreshConnections();}}><ArrowLeft size={16}/>Voltar às conexões</button>}</div><button type="button" className="integration-wizard-next" onClick={()=>step===1?onClose():setStep(1)}>{step===1?'Concluir':'Continuar'}{step===1?<Check size={16}/>:<ArrowRight size={16}/>}</button></footer>
    </section>
  </div>,document.body);
}
