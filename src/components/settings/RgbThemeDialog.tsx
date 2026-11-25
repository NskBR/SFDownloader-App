import {useDialogDismissGuard} from "../ui/useDialogDismissGuard";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Plus,Trash2} from '../icons';
import {normalizeRgbConfig,rgbFrame,rgbSpeeds,type RgbConfig,type RgbProfile} from '../../domain/rgbTheme';

function RgbPreview({config}:{config:RgbConfig}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame=0,start:number|undefined;
    const paint=(time:number)=>{
      start??=time;
      const colors=rgbFrame(config,time-start);
      if(ref.current){ref.current.style.background=colors.background;ref.current.style.setProperty('--preview-accent',colors.gradient);}
      if(!reduced)frame=requestAnimationFrame(paint);
    };
    paint(0);
    return()=>cancelAnimationFrame(frame);
  },[config]);
  return <div ref={ref} className="rgb-live-preview" aria-label="Prévia das cores RGB"><div className="rgb-preview-window"><div className="rgb-preview-heading"><i/><span>Seu tema RGB</span><b>•••</b></div><div className="rgb-preview-content"><i/><div><span/><span/></div><button type="button" tabIndex={-1} disabled>Baixar</button></div><div className="rgb-preview-progress"/></div></div>;
}

export function RgbThemeDialog({config,profiles,onApply,onClose,onPreview,onCancelPreview,title='Espectro RGB'}:{title?:string;config:RgbConfig|undefined;profiles:RgbProfile[];onApply:(config:RgbConfig,profiles:RgbProfile[])=>void;onClose:()=>void;onPreview?:(config:RgbConfig)=>void;onCancelPreview?:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const applied=useRef(false);
  const initial=useRef(JSON.stringify([normalizeRgbConfig(config),profiles]));
  const previewCallback=useRef(onPreview),cancelCallback=useRef(onCancelPreview);
  previewCallback.current=onPreview;cancelCallback.current=onCancelPreview;
  const [draft,setDraft]=useState(()=>normalizeRgbConfig(config));
  const [saved,setSaved]=useState(profiles);
  const [name,setName]=useState('');
  const [selectedColor,setSelectedColor]=useState(0);
  const [message,setMessage]=useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{previewCallback.current?.(normalizeRgbConfig(draft));},[draft]);
  useEffect(()=>()=>{if(!applied.current)cancelCallback.current?.();},[]);
  const warning=useDialogDismissGuard(dialog,JSON.stringify([draft,saved])!==initial.current,onClose);
  const update=(patch:Partial<RgbConfig>)=>setDraft(current=>({...current,...patch}));
  const saveProfile=()=>{
    const label=name.trim(); if(!label)return;
    if(saved.length>=12 && !saved.some(profile=>profile.name===label)){setMessage('Limite de 12 perfis. Exclua um para salvar outro.');return;}
    setSaved(current=>[...current.filter(profile=>profile.name!==label),{name:label,config:normalizeRgbConfig(draft)}]);
    setMessage('Perfil preparado. Clique em Aplicar e salvar para confirmar.');
  };
  return createPortal(<dialog ref={dialog} className="rgb-dialog rgb-editor-dialog" onCancel={event=>{event.preventDefault();onClose();}} aria-labelledby="rgb-dialog-title">
    <header><div className="sf-editor-heading"><span className="sf-editor-mark sf-editor-mark--rgb" aria-hidden="true"/><div><h2 id="rgb-dialog-title">{title}</h2><p>Crie seu próprio ritmo de cores.</p></div></div><button type="button" className="rgb-icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header>
    <div className="rgb-dialog-body">
      <RgbPreview config={draft}/>
      <label>Direção <output>{draft.angle}°</output><input className="rgb-direction-slider" type="range" min="0" max="360" step="15" value={draft.angle} style={{background:`linear-gradient(90deg,#af8aff ${draft.angle/3.6}%,#383640 ${draft.angle/3.6}%)`}} onChange={e=>update({angle:Number(e.target.value)})}/></label>
      <fieldset><legend>Velocidade do RGB</legend><div className="rgb-speed-options" role="group" aria-label="Velocidade do RGB">{rgbSpeeds.map(speed=><button key={speed.label} type="button" aria-pressed={draft.duration>27?speed.label==='Lento':draft.duration>10?speed.label==='Médio':speed.label==='Rápido'} onClick={()=>update({duration:speed.duration})}>{speed.label}</button>)}</div></fieldset>
      <label className="rgb-reverse"><input type="checkbox" checked={draft.reverse} onChange={e=>update({reverse:e.target.checked})}/> Inverter sequência das cores</label>
      <fieldset><legend>Cores da sequência <small>2 a 8 cores</small></legend>
        <div className="rgb-color-editor">
          <div className="rgb-color-strip" style={{background:`linear-gradient(90deg,${draft.colors.join(',')})`}}>
            {draft.colors.map((color,index)=><input key={index} type="color" value={color} aria-label={`Cor ${index+1}`} title={`Editar cor ${index+1}`} onFocus={()=>setSelectedColor(index)} onClick={()=>setSelectedColor(index)} onChange={e=>update({colors:draft.colors.map((c,i)=>i===index?e.target.value:c)})}/>)}
          </div>
          <button type="button" className="rgb-icon-button rgb-add-color" disabled={draft.colors.length>=8} aria-label="Adicionar cor" onClick={()=>{setSelectedColor(draft.colors.length);update({colors:[...draft.colors,'#00c8ff']});}}><Plus size={18}/></button>
        </div>
        <div className="rgb-color-tools"><span>Cor {selectedColor+1} · {draft.colors[selectedColor].toUpperCase()}</span><button type="button" disabled={draft.colors.length<=2} onClick={()=>{update({colors:draft.colors.filter((_,i)=>i!==selectedColor)});setSelectedColor(Math.max(0,selectedColor-1));}}><Trash2 size={12}/> Remover cor</button></div>
      </fieldset>
      <fieldset><legend>Meus perfis</legend><div className="rgb-profile-save"><input maxLength={32} placeholder="Nome do perfil" aria-label="Nome do perfil RGB" value={name} onChange={e=>setName(e.target.value)}/><button type="button" disabled={!name.trim()} onClick={saveProfile}>Salvar perfil</button></div>
      <div className="rgb-profile-list">{saved.map(profile=><div key={profile.name}><button type="button" onClick={()=>{setDraft(normalizeRgbConfig(profile.config));setSelectedColor(0);setName(profile.name);setMessage('Perfil carregado na prévia.');}}>{profile.name}<span aria-hidden="true" style={{background:`linear-gradient(90deg,${profile.config.colors.join(',')})`}}/></button><button type="button" className="rgb-icon-button" aria-label={`Excluir perfil ${profile.name}`} onClick={()=>setSaved(current=>current.filter(p=>p.name!==profile.name))}><Trash2 size={14}/></button></div>)}</div>
      <p role="status">{message || 'Salve até 12 perfis. Usar o mesmo nome substitui o perfil.'}</p></fieldset>
      <p className="rgb-motion-note">O fundo permanece escuro para facilitar a leitura. A animação respeita a opção de animações do app e a preferência de movimento reduzido do sistema.</p>
    </div>{warning}<footer><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="rgb-apply" onClick={()=>{applied.current=true;onApply(normalizeRgbConfig(draft),saved);onClose();}}>Aplicar e salvar</button></footer>
  </dialog>,document.body);
}
