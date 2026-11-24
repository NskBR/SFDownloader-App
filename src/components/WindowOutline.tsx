import {roundedOutlinePath} from "../domain/windowOutlineGeometry";
import {rgbFrame} from "../domain/rgbTheme";
import {useEffect,useRef,useState} from "react";
import {normalizeWindowBorder} from "../domain/windowBorder";
export function WindowOutline(){
 const ref=useRef<SVGSVGElement>(null);
 const [geometry,setGeometry]=useState({width:1,height:1,path:'',radius:0,polygon:false});
 const [mode,setMode]=useState('');
 const [rgb,setRgb]=useState(normalizeWindowBorder(undefined).rgb);
 useEffect(()=>{
  const frame=ref.current?.parentElement;if(!frame)return;
  const refresh=()=>{
   const style=getComputedStyle(frame),rect=frame.getBoundingClientRect();
   const clip=style.clipPath;const points=clip.startsWith('polygon(')?clip.slice(8,-1).split(','):[];
   const coordinate=(raw:string,size:number)=>{const v=raw.trim();if(v.startsWith('calc(')){const m=/([\d.]+)%\s*([-+])\s*([\d.]+)px/.exec(v);if(m)return size*Number(m[1])/100+(m[2]==='-'?-1:1)*Number(m[3]);}return v.endsWith('%')?size*parseFloat(v)/100:parseFloat(v)||0;};
   const path=points.map((point,i)=>{const values=point.trim().match(/calc\([^)]*\)|[^\s]+/g)||[];return `${i?'L':'M'}${coordinate(values[0]||'0',rect.width)} ${coordinate(values[1]||'0',rect.height)}`;}).join(' ')+' Z';
   const readRadius=(raw:string)=>{const parts=raw.trim().split(/\s+/);const resolve=(part:string,size:number)=>part.endsWith('%')?parseFloat(part)*size/100:parseFloat(part)||0;return [resolve(parts[0],rect.width),resolve(parts[1]||parts[0],rect.height)];};
   let radii=[style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomRightRadius,style.borderBottomLeftRadius].map(readRadius);
   const round=/round\s+([^)]*)/.exec(clip);
   if(round){const entries=round[1].trim().split(/\s+/);const values=entries.length===1?[entries[0],entries[0],entries[0],entries[0]]:entries.length===2?[entries[0],entries[1],entries[0],entries[1]]:entries.length===3?[entries[0],entries[1],entries[2],entries[1]]:entries;radii=values.slice(0,4).map(readRadius);}
   const outline=points.length?path:roundedOutlinePath(rect.width,rect.height,radii);
   setGeometry({width:rect.width,height:rect.height,path:outline,radius:0,polygon:true});
   const root=document.documentElement;
   setMode(`${root.dataset.windowBorder}-${root.dataset.interfaceMotion}`);
   try {const next=JSON.parse(root.dataset.windowBorderRgb||'{}');setRgb(current=>JSON.stringify(current)===JSON.stringify(next)?current:next);}catch{}
  };
  refresh();const resize=new ResizeObserver(refresh);resize.observe(frame);
  const changes=new MutationObserver(refresh);changes.observe(document.documentElement,{attributes:true});changes.observe(frame,{attributes:true,attributeFilter:['class','style']});
  return()=>{resize.disconnect();changes.disconnect();};
 },[]);
 const config=normalizeWindowBorder({rgb}).rgb;
 useEffect(()=>{
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let id=0;
  const paint=(time:number)=>{
   const root=document.documentElement;
   if(root.dataset.windowBorder!=='rgb')return;
   const moving=root.dataset.interfaceMotion!=='false'&&!reduced?.matches;
   ref.current?.querySelectorAll('stop').forEach((stop,index)=>{
    stop.setAttribute('stop-color',rgbFrame(config,(moving?time:0)+index*config.duration*1000/config.colors.length).stop1);
   });
   if(moving)id=requestAnimationFrame(paint);
  };
  paint(0);return()=>cancelAnimationFrame(id);
 },[rgb,mode]);
 return <svg ref={ref} className="app-window-outline" viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true"><defs><linearGradient id="window-outline-spectrum" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform={`rotate(${config.angle},.5,.5)`}>{config.colors.map((color,i)=><stop key={i} offset={`${i/(config.colors.length-1)*100}%`} stopColor={color}/>)}</linearGradient></defs>{geometry.polygon?<path d={geometry.path}/>:<rect x="0" y="0" width={geometry.width} height={geometry.height} rx={geometry.radius}/>}</svg>;
}
