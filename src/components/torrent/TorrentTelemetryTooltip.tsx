import {useEffect,useId,useLayoutEffect,useRef,useState,Children,type ReactNode} from "react";
import {createPortal} from "react-dom";
export function TorrentTelemetryTooltip({label,title,rows,note,children,className=""}:{label:string;title:string;rows:[string,string|number][];note?:string;children:ReactNode;className?:string}){
 const timer=useRef<ReturnType<typeof setTimeout>>();const overTrigger=useRef(false),overTip=useRef(false),focused=useRef(false);
 const cancelClose=()=>{if(timer.current!==undefined){clearTimeout(timer.current);timer.current=undefined;}};
 const show=()=>{cancelClose();window.dispatchEvent(new CustomEvent("sf-torrent-tooltip-open",{detail:id}));setOpen(true);};
 const close=()=>{cancelClose();overTip.current=false;setOpen(false);};
 const scheduleClose=()=>{cancelClose();timer.current=setTimeout(()=>{if(!overTrigger.current&&!overTip.current&&!focused.current)setOpen(false);},180);};
 useEffect(()=>()=>cancelClose(),[]);
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),tip=useRef<HTMLDivElement>(null);const [open,setOpen]=useState(false);
 useEffect(()=>{const opened=(event:Event)=>{if((event as CustomEvent).detail!==id)close();};window.addEventListener("sf-torrent-tooltip-open",opened);return()=>window.removeEventListener("sf-torrent-tooltip-open",opened);},[id]);
 useLayoutEffect(()=>{if(!open||!trigger.current||!tip.current)return;const r=trigger.current.getBoundingClientRect(),box=tip.current.getBoundingClientRect();tip.current.style.left=`${Math.max(8,Math.min(r.left,window.innerWidth-box.width-8))}px`;tip.current.style.top=`${Math.max(8,Math.min(r.top-box.height-7,window.innerHeight-box.height-8))}px`;},[open]);
 useEffect(()=>{if(!open)return;const close=()=>setOpen(false);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};},[open]);
 const [icon,...values]=Children.toArray(children);
 return <><span className={`dw-meta-item torrent-telemetry-trigger ${className}`}><button ref={trigger} type="button" className="torrent-tooltip-icon" aria-label={label} aria-describedby={open?id:undefined} onMouseEnter={()=>{overTrigger.current=true;show();}} onMouseLeave={()=>{overTrigger.current=false;scheduleClose();}} onFocus={()=>{focused.current=true;show();}} onBlur={()=>{focused.current=false;scheduleClose();}} onKeyDown={e=>{if(e.key==='Escape')close();}}>{icon}</button>{values}</span>{open&&createPortal(<div ref={tip} id={id} role="tooltip" className="torrent-peer-tooltip" onMouseEnter={()=>{overTip.current=true;cancelClose();}} onMouseLeave={()=>{overTip.current=false;scheduleClose();}}><strong>{title}</strong>{rows.map(([name,value])=><span key={name}>{name}<b>{value}</b></span>)}{note&&<p className="torrent-telemetry-note">{note}</p>}</div>,document.body)}</>;
}
