import {useDialogDismissGuard} from "../ui/useDialogDismissGuard";
import {useEffect,useRef,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {X,SlidersHorizontal,Mouse,Shapes} from "../icons";
import "../../styles/personalization-panels.css";
export function PersonalizationPanel({title,description,onClose,onApply,children,dirty=false}:{title:string;description:string;onClose:()=>void;onApply:()=>void;children:ReactNode;dirty?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 const warning=useDialogDismissGuard(ref,dirty,onClose);
 return createPortal(<dialog ref={ref} className="personalization-panel" aria-labelledby="personalization-panel-title" onCancel={event=>{event.preventDefault();onClose();}}><header><div className="sf-editor-heading"><span className="sf-editor-mark" aria-hidden="true">{title.includes("rolagem")?<Mouse size={21}/>:title.includes("Layout")?<Shapes size={21}/>:<SlidersHorizontal size={21}/>}</span><div><h2 id="personalization-panel-title">{title}</h2><p>{description}</p></div></div><button type="button" aria-label="Fechar" onClick={onClose}><X size={18}/></button></header><div className="personalization-panel-body">{children}</div>{warning}<footer><span>Prévia ao vivo. Salve ao aplicar.</span><div className="personalization-panel-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="button" onClick={onApply}>Aplicar</button></div></footer></dialog>,document.body);
}
