import {useEffect,useState,type RefObject} from "react";

/** A backdrop click may dismiss a clean editor, but must never discard its draft. */
export function useDialogDismissGuard(ref:RefObject<HTMLDialogElement|null>,dirty:boolean,onClose:()=>void,active=true) {
 const [warn,setWarn]=useState(false);
 useEffect(()=>{if(!dirty)setWarn(false);},[dirty]);
 useEffect(()=>{
  const dialog=ref.current;if(!dialog||!active)return;
  let startedOutside=false;
  const outside=(event:MouseEvent)=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
  const alert=()=>{setWarn(true);if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)dialog.animate?.([{translate:'0'},{translate:'-5px'},{translate:'5px'},{translate:'-3px'},{translate:'0'}],{duration:260});};
  const down=(event:PointerEvent)=>{startedOutside=outside(event);};
  const click=(event:MouseEvent)=>{const dismiss=startedOutside&&outside(event);startedOutside=false;if(!dismiss)return;event.preventDefault();event.stopImmediatePropagation();if(dirty)alert();else onClose();};
  const cancel=(event:Event)=>{if(!dirty)return;event.preventDefault();event.stopImmediatePropagation();alert();};
  dialog.addEventListener('pointerdown',down);dialog.addEventListener('click',click,true);dialog.addEventListener('cancel',cancel,true);
  return()=>{dialog.removeEventListener('pointerdown',down);dialog.removeEventListener('click',click,true);dialog.removeEventListener('cancel',cancel,true);};
 },[ref,dirty,onClose,active]);
 return warn?<p className="dialog-unsaved-warning" role="alert">Alterações não salvas. Aplique ou cancele para sair.</p>:null;
}
