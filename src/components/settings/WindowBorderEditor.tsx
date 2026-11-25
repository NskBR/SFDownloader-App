import {useDialogDismissGuard} from "../ui/useDialogDismissGuard";
import {createPortal} from "react-dom";
import {RgbThemeDialog} from "./RgbThemeDialog";
import {ColorPicker} from "../ui/DiscordThemeCustomizer";
import {useEffect,useRef,useState} from "react";
import {normalizeWindowBorder,previewWindowBorder,clearWindowBorderPreview,type WindowBorder} from "../../domain/windowBorder";
import {X,ChevronRight,Settings2,Palette} from "../icons";
const shapes=[{id:'theme',name:'Seguir o tema'},{id:'rounded',name:'Arredondado'},{id:'square',name:'Reto'},{id:'cut',name:'Cantos recortados'},{id:'diagonal',name:'Diagonal'},{id:'bottom-cut',name:'Recorte inferior'}] as const;
export function WindowBorderEditor({value,onApply}:{value:WindowBorder|undefined;onApply:(value:WindowBorder)=>void}) {
 const [draft,setDraft]=useState(()=>normalizeWindowBorder(value));
 const [panel,setPanel]=useState<'shape'|'outline'|null>(null);
 const [rgbOpen,setRgbOpen]=useState(false),[colorOpen,setColorOpen]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 const saved=useRef(value);saved.current=value;
 useEffect(()=>()=>clearWindowBorderPreview(saved.current),[]);
 useEffect(()=>{if(panel)dialog.current?.showModal();},[panel]);
 const open=(mode:'shape'|'outline')=>{setDraft(normalizeWindowBorder(value));setPanel(mode);};
 const close=()=>{clearWindowBorderPreview(saved.current);setPanel(null);setColorOpen(false);};
 const update=<K extends keyof WindowBorder>(key:K,value:WindowBorder[K])=>{const next={...draft,[key]:value};setDraft(next);previewWindowBorder(next);};
 const slider=(key:'radius'|'width'|'glow',label:string,min:number,max:number,unit:string)=><label className="border-range"><span>{label}<b>{draft[key]}{unit}</b></span><input aria-label={label} type="range" min={min} max={max} value={draft[key]} onChange={e=>update(key,Number(e.target.value))}/></label>;
 const warning=useDialogDismissGuard(dialog,JSON.stringify(draft)!==JSON.stringify(normalizeWindowBorder(value)),close,!!panel);
 const current=normalizeWindowBorder(value);
 return <section className="border-editor border-settings"><div><h3>Bordas e contorno</h3><p>Personalize o formato da janela e o acabamento do contorno.</p></div>
 <div className="border-setting-options"><button type="button" className="border-settings-row" onClick={()=>open('shape')}><span className={`border-setting-preview shape-preview ${current.shape}`} aria-hidden="true"><i/><b/></span><span className="border-setting-copy"><strong>Formato da janela</strong><small>{shapes.find(s=>s.id===current.shape)?.name}</small></span><ChevronRight size={16}/></button>
 <button type="button" className="border-settings-row" onClick={()=>open('outline')}><span className={`border-setting-preview outline-preview ${current.enabled?current.effect:'disabled'}`} style={{'--sample-color':current.color} as React.CSSProperties} aria-hidden="true"><i/><b/></span><span className="border-setting-copy"><strong>Contorno da janela</strong><small>{current.enabled?({solid:'Sólido',neon:'Neon',rgb:'RGB'}[current.effect]):'Sem contorno'}</small></span><ChevronRight size={16}/></button></div>
 {panel&&createPortal(<dialog ref={dialog} className="border-custom-dialog" onCancel={e=>{e.preventDefault();close();}} aria-labelledby="border-custom-title"><header><div><h2 id="border-custom-title">{panel==='shape'?'Formato da janela':'Contorno da janela'}</h2><p>Prévia ao vivo. Aplique para manter suas alterações.</p></div><button type="button" onClick={close} aria-label="Fechar"><X size={18}/></button></header>
 <div className="border-custom-body">{panel==='shape'?<><div className="border-shape-grid">{shapes.map(shape=><button type="button" key={shape.id} aria-pressed={draft.shape===shape.id} onClick={()=>update('shape',shape.id)}><span className={`border-shape-sample ${shape.id}`}><i/><b/></span><strong>{shape.name}</strong></button>)}</div>{draft.shape==='rounded'&&slider('radius','Arredondamento',0,28,' px')}</>:<><div className="border-effects"><button type="button" aria-pressed={!draft.enabled} onClick={()=>update('enabled',false)}><i className="none"/><span>Sem contorno</span></button>{(['solid','neon','rgb'] as const).map(effect=><button type="button" key={effect} aria-pressed={draft.enabled&&draft.effect===effect} onClick={()=>{const next={...draft,enabled:true,effect};setDraft(next);previewWindowBorder(next);}}><i className={effect} style={{'--sample-color':draft.color} as React.CSSProperties}/><span>{{solid:'Sólido',neon:'Neon',rgb:'RGB'}[effect]}</span></button>)}</div>
 {draft.enabled&&<>{slider('width','Espessura',1,6,' px')}
 {draft.effect==='rgb'?<button className="border-rgb-config" type="button" onClick={()=>setRgbOpen(true)}><i style={{background:`linear-gradient(90deg,${draft.rgb.colors.join(',')})`}}/><span>Personalizar RGB<small>Cores, direção, velocidade e perfis</small></span><Settings2 size={18}/></button>:<div className="border-color-section"><span>Cor do contorno</span><div className="border-color-swatches">{['#06b6d4','#10b981','#3b82f6','#8b5cf6','#ec4899','#ef4444','#f59e0b','#ffffff'].map(color=><button type="button" key={color} aria-label={color} aria-pressed={draft.color===color} style={{background:color}} onClick={()=>update('color',color)}/>)}<button type="button" className="border-custom-color" aria-label="Cor personalizada" onClick={()=>setColorOpen(!colorOpen)}><Palette size={18}/></button></div>{colorOpen&&<ColorPicker color={draft.color} onChange={color=>update('color',color)} onClose={()=>setColorOpen(false)}/>}</div>}
 {draft.effect==='neon'&&slider('glow','Intensidade do brilho',0,24,'')}</>}
 </>}</div>{warning}<footer><button type="button" onClick={close}>Cancelar</button><button type="button" onClick={()=>{clearWindowBorderPreview(draft);onApply(draft);setPanel(null);}}>Aplicar</button></footer></dialog>,document.body)}
 {rgbOpen&&<RgbThemeDialog title="RGB do contorno" config={draft.rgb} profiles={draft.profiles} onClose={()=>setRgbOpen(false)} onPreview={rgb=>previewWindowBorder({...draft,rgb})} onCancelPreview={()=>previewWindowBorder(draft)} onApply={(rgb,profiles)=>{const next={...draft,rgb,profiles};setDraft(next);clearWindowBorderPreview(next);onApply(next);setPanel(null);}}/>}
 </section>;
}
