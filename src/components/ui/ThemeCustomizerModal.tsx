import {backgroundIsLight} from "../../domain/backgroundPalette";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Plus,Trash2,Dices,RotateCcw,Pipette} from '../icons';
import {defaultSettings,type GradientConfig} from '../../domain/settings';
import {buildGradient} from '../../services/theme';
import {normalizeThemeProfiles,type ThemeProfile} from '../../domain/themeProfiles';

export function ThemeCustomizerModal({config,onChangeGradient,onClose,onPreview,onCancelPreview,profiles=[]}:{config:GradientConfig;profiles?:ThemeProfile[];onChangeGradient:(value:GradientConfig,profiles?:ThemeProfile[])=>void;onClose:()=>void;onPreview?:(value:GradientConfig)=>void;onCancelPreview?:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  const applied=useRef(false);
  const previewCallback=useRef(onPreview),cancelCallback=useRef(onCancelPreview);
  previewCallback.current=onPreview;cancelCallback.current=onCancelPreview;
  const [draft,setDraft]=useState(()=>({...config,stops:config.stops.map(stop=>({...stop}))}));
  const [selected,setSelected]=useState(0);
  const [hex,setHex]=useState(draft.stops[0].color);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(()=>normalizeThemeProfiles(profiles));
  const [profileName,setProfileName]=useState('');
  const [profileMessage,setProfileMessage]=useState('');
  useEffect(()=>{ref.current?.showModal();},[]);
  useEffect(()=>{previewCallback.current?.(draft);},[draft]);
  useEffect(()=>()=>{if(!applied.current)cancelCallback.current?.();},[]);
  useEffect(()=>{setHex(draft.stops[selected]?.color??draft.stops[0].color);setError('');},[draft.stops,selected]);
  const update=(patch:Partial<GradientConfig>)=>setDraft(current=>({...current,...patch,enabled:true}));
  const color=(value:string)=>{update({stops:draft.stops.map((stop,i)=>i===selected?{...stop,color:value}:stop)});};
  const redistribute=(colors:string[])=>{update({stops:colors.map((color,index)=>({color,position:colors.length===1?0:index*100/(colors.length-1)}))});};
  const randomize=()=>{const hue=Math.floor(Math.random()*360);const colors=[hue,(hue+35)%360].map(h=>{
    const a=.65*Math.min(.12,1-.12);const channel=(n:number)=>{const k=(n+h/30)%12;return Math.round((.12-a*Math.max(-1,Math.min(k-3,9-k,1)))*255).toString(16).padStart(2,'0');};return `#${channel(0)}${channel(8)}${channel(4)}`;
  });setSelected(0);redistribute(colors);};
  const eyedropper=async()=>{try{const picker=window as unknown as {EyeDropper:new()=>{open:()=>Promise<{sRGBHex:string}>}};const result=await new picker.EyeDropper().open();color(result.sRGBHex);}catch{/* User cancelled the system picker. */}};
  return createPortal(<dialog ref={ref} className="rgb-dialog theme-editor-dialog" onCancel={e=>{e.preventDefault();onClose();}} aria-labelledby="theme-editor-title">
    <header><div><h2 id="theme-editor-title">Personalizar tema</h2><p>Combine cores e ajuste o fundo do aplicativo.</p></div><button type="button" className="rgb-icon-button" aria-label="Fechar" onClick={onClose}><X size={18}/></button></header>
    <div className="rgb-dialog-body">
      <div className="theme-editor-preview" data-light={backgroundIsLight(draft)} style={{background:draft.enabled?buildGradient(draft):'#161a1e'}}><div style={{background:backgroundIsLight(draft)?"transparent":`rgba(0,0,0,${.7-draft.intensity*.0055})`}}/><section><strong>Seu espaço, suas cores</strong><span>Uma prévia do fundo com texto e superfícies.</span><i/></section></div>
      <fieldset><legend>Cores do fundo <small>{draft.stops.length}/4 cores</small></legend><div className="rgb-color-editor"><div className="rgb-color-strip" style={{background:buildGradient({...draft,type:'linear',angle:90})}}>{draft.stops.map((stop,index)=><input key={index} type="color" aria-label={`Cor do fundo ${index+1}`} title={`Editar cor ${index+1}`} value={stop.color} onFocus={()=>setSelected(index)} onClick={()=>setSelected(index)} onChange={e=>{setSelected(index);update({stops:draft.stops.map((s,i)=>i===index?{...s,color:e.target.value}:s)});}}/>)}</div><button type="button" className="rgb-icon-button rgb-add-color" aria-label="Adicionar cor" disabled={draft.stops.length>=4} onClick={()=>{setSelected(draft.stops.length);redistribute([...draft.stops.map(s=>s.color),'#10131f']);}}><Plus size={18}/></button></div>
      <div className="theme-editor-color-tools"><label>Cor {selected+1}<input aria-label="Código hexadecimal" value={hex} maxLength={7} onChange={e=>{setHex(e.target.value);setError('');}} onBlur={()=>{if(/^#[a-f0-9]{6}$/i.test(hex))color(hex);else setError('Use uma cor no formato #RRGGBB.');}}/></label>{'EyeDropper' in window && <button type="button" className="rgb-icon-button" title="Capturar cor da tela" aria-label="Capturar cor da tela" onClick={()=>void eyedropper()}><Pipette size={16}/></button>}<button type="button" className="rgb-icon-button" aria-label="Remover cor selecionada" disabled={draft.stops.length<=1} onClick={()=>{redistribute(draft.stops.filter((_,i)=>i!==selected).map(s=>s.color));setSelected(0);}}><Trash2 size={16}/></button></div>{error && <p role="alert">{error}</p>}</fieldset>
      <fieldset><legend>Formato do fundo</legend><div className="rgb-speed-options" role="group" aria-label="Formato do fundo"><button type="button" aria-pressed={draft.type==='linear'} onClick={()=>update({type:'linear'})}>Linear</button><button type="button" aria-pressed={draft.type==='radial'} onClick={()=>update({type:'radial'})}>Radial</button></div></fieldset>
      {draft.type==='linear' && <label>Direção <output>{draft.angle}°</output><input className="rgb-direction-slider" type="range" min="0" max="360" step="15" value={draft.angle} style={{background:`linear-gradient(90deg,#af8aff ${draft.angle/3.6}%,#383640 ${draft.angle/3.6}%)`}} onChange={e=>update({angle:Number(e.target.value)})}/></label>}
      <label>Intensidade de cor <output>{draft.intensity}%</output><input className="rgb-direction-slider" type="range" min="10" max="100" value={draft.intensity} style={{background:`linear-gradient(90deg,#af8aff ${(draft.intensity-10)/.9}%,#383640 ${(draft.intensity-10)/.9}%)`}} onChange={e=>update({intensity:Number(e.target.value)})}/></label>
      <div className="theme-editor-actions"><button type="button" onClick={randomize}><Dices size={15}/> Surpreenda-me</button><button type="button" onClick={()=>{setDraft({...defaultSettings.interfaceGradient,stops:defaultSettings.interfaceGradient.stops.map(s=>({...s}))});setSelected(0);}}><RotateCcw size={15}/> Redefinir</button></div>
      <fieldset><legend>Meus perfis</legend><div className="rgb-profile-save"><input aria-label="Nome do perfil do tema" placeholder="Nome do perfil" maxLength={32} value={profileName} onChange={e=>setProfileName(e.target.value)}/><button type="button" disabled={!profileName.trim() || !!error} onClick={()=>{
        const name=profileName.trim();
        if(saved.length>=12 && !saved.some(p=>p.name===name)){setProfileMessage('Limite de 12 perfis. Exclua um para criar outro.');return;}
        setSaved(current=>normalizeThemeProfiles([...current.filter(p=>p.name!==name),{name,config:draft}]));setProfileMessage('Perfil preparado. Aplique o tema para salvar.');
      }}>Salvar perfil</button></div><div className="rgb-profile-list">{saved.map(profile=><div key={profile.name}><button type="button" onClick={()=>{setSelected(0);setDraft({...profile.config,stops:profile.config.stops.map(s=>({...s}))});setProfileName(profile.name);}}>{profile.name}<span aria-hidden="true" style={{background:buildGradient(profile.config)}}/></button><button type="button" className="rgb-icon-button" aria-label={`Excluir perfil ${profile.name}`} onClick={()=>setSaved(current=>current.filter(p=>p.name!==profile.name))}><Trash2 size={14}/></button></div>)}</div><p role="status">{profileMessage || 'Até 12 perfis. Cancelar descarta as alterações.'}</p></fieldset>
    </div><footer><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="rgb-apply" disabled={!!error} onClick={()=>{if(!/^#[a-f0-9]{6}$/i.test(hex)){setError('Use uma cor no formato #RRGGBB.');return;}applied.current=true;onChangeGradient({...draft,stops:draft.stops.map((s,i)=>i===selected?{...s,color:hex}:s)},saved);onClose();}}>Aplicar tema</button></footer>
  </dialog>,document.body);
}
