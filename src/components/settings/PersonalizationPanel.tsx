import {useEffect,useRef,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {X} from "../icons";
import "../../styles/personalization-panels.css";
export function PersonalizationPanel({title,description,onClose,onApply,children}:{title:string;description:string;onClose:()=>void;onApply:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return createPortal(<dialog ref={ref} className="personalization-panel" aria-labelledby="personalization-panel-title" onCancel={event=>{event.preventDefault();onClose();}}><header><div><h2 id="personalization-panel-title">{title}</h2><p>{description}</p></div><button type="button" aria-label="Fechar" onClick={onClose}><X size={18}/></button></header><div className="personalization-panel-body">{children}</div><footer><span>Prévia ao vivo. Salve ao aplicar.</span><div className="personalization-panel-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="button" onClick={onApply}>Aplicar</button></div></footer></dialog>,document.body);
}
