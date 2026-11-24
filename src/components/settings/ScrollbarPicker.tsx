import type {AppSettings} from "../../domain/settings";
import "../../styles/scrollbar-presets.css";
const variants=[{id:'default',name:'Padrão'},{id:'thin',name:'Fina'},{id:'rounded',name:'Arredondada'},{id:'accent',name:'Destaque'},{id:'glow',name:'Neon'},{id:'hidden',name:'Oculta'}] as const;
export function ScrollbarPicker({value,onChange}:{value:AppSettings['scrollbarStyle'];onChange:(value:AppSettings['scrollbarStyle'])=>void}){
 return <section className="scrollbar-picker"><h3>Barra de rolagem</h3><p>Escolha o acabamento da barra. A opção Oculta mantém a rolagem pelo mouse e teclado.</p><div className="scrollbar-options">{variants.map(variant=><button type="button" key={variant.id} aria-pressed={(value??'default')===variant.id} onClick={()=>onChange(variant.id)}><span className={`scrollbar-preview ${variant.id}`} aria-hidden="true"><i/><i/><i/><b><em/></b></span><strong>{variant.name}</strong></button>)}</div></section>;
}
