import {useEffect} from "react";
/** Smooth discrete mouse wheels; preserve trackpad gestures, zoom and native keyboard scrolling. */
export function useScrollInertia(enabled:boolean,strength:"soft"|"strong"="soft"){
 useEffect(()=>{
  if(!enabled)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,last=0,target:HTMLElement|null=null,destination=0;
  const stop=()=>{cancelAnimationFrame(frame);frame=0;target=null;last=0;};
  const tick=(time:number)=>{
   if(!target?.isConnected){stop();return;}
   const dt=last?Math.min(40,time-last):16;last=time;
   destination=Math.min(Math.max(destination,0),target.scrollHeight-target.clientHeight);
   const difference=destination-target.scrollTop;
   if(Math.abs(difference)<=1){target.scrollTop=destination;stop();return;}
   // WebView may round scrollTop to device pixels; never stall below a pixel.
   const movement=difference*(1-Math.exp(-dt/(strength==="strong"?145:65)));
   target.scrollTop+=Math.sign(difference)*Math.min(Math.abs(difference),Math.max(1,Math.abs(movement)));
   frame=requestAnimationFrame(tick);
  };
  const wheel=(event:WheelEvent)=>{
   if(reduced.matches||event.ctrlKey||event.metaKey||event.shiftKey||event.defaultPrevented||!event.cancelable||Math.abs(event.deltaX)>Math.abs(event.deltaY)||event.deltaY===0)return;
   // Fine-grained pixel events are generally trackpads with their own momentum.
   if(event.deltaMode===0&&Math.abs(event.deltaY)<40){stop();return;}
   let node=event.target instanceof Element?event.target:null;
   if(node?.closest('input,textarea,select,[contenteditable="true"]'))return;
   const direction=Math.sign(event.deltaY);
   while(node){
    if(node instanceof HTMLElement){
     const css=getComputedStyle(node),max=node.scrollHeight-node.clientHeight;
     if(/auto|scroll/.test(css.overflowY)&&max>1&&((direction>0&&node.scrollTop<max)||(direction<0&&node.scrollTop>0)))break;
    }
    node=node.parentElement;
   }
   if(!(node instanceof HTMLElement)){stop();return;}
   const amount=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?node.clientHeight:1);
   if(target!==node){stop();target=node;destination=node.scrollTop;}
   if(Math.sign(destination-node.scrollTop)!==direction)destination=node.scrollTop;
   destination=Math.min(node.scrollHeight-node.clientHeight,Math.max(0,destination+amount));
   event.preventDefault();if(!frame)frame=requestAnimationFrame(tick);
  };
  const visibility=()=>{if(document.hidden)stop();};
  document.addEventListener('wheel',wheel,{passive:false});document.addEventListener('pointerdown',stop,true);document.addEventListener('keydown',stop,true);document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',stop);
  return()=>{stop();document.removeEventListener('wheel',wheel);document.removeEventListener('pointerdown',stop,true);document.removeEventListener('keydown',stop,true);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',stop);};
 },[enabled,strength]);
}
