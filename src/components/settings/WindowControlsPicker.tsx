import {WindowControlSymbols} from "../ui/WindowControlSymbols";
import {Minus,Square,X,Maximize} from "../icons";
import type {AppSettings} from "../../domain/settings";
import "../../styles/window-controls.css";
const variants=[{id:'default',name:'Padrão'},{id:'rounded',name:'Arredondado'},{id:'outlined',name:'Contornado'},{id:'traffic',name:'Semáforo'},{id:'compact',name:'Compacto'},{id:'minimal',name:'Minimalista'},{id:'xbox',name:'Xbox'},{id:'playstation',name:'PlayStation'},{id:'nintendo',name:'Nintendo'},{id:'apple',name:'Apple'}] as const;
export function WindowControlsPicker({value,onChange}:{value:AppSettings['windowControlsStyle'];onChange:(value:AppSettings['windowControlsStyle'])=>void}){
 return <section className="window-controls-picker"><h3>Botões da janela</h3><p>Escolha o estilo de minimizar, maximizar e fechar.</p><div className="window-controls-options">{variants.map(variant=><button type="button" key={variant.id} aria-pressed={(value??'default')===variant.id} onClick={()=>onChange(variant.id)}><span className={`window-controls-sample ${variant.id}`} aria-hidden="true">{([0,1,2] as const).map(index=><i key={index}>{variant.id==='xbox'||variant.id==='playstation'||variant.id==='nintendo'?<WindowControlSymbols index={index}/>:index===0?<Minus size={13}/>:index===1?variant.id==='minimal'?<Maximize size={11}/>:<Square size={11}/>:<X size={14}/>}</i>)}</span><strong>{variant.name}</strong></button>)}</div></section>;
}
