import {useLayoutEffect,useRef,useState,type ReactNode} from "react";

/** Mount only viewport rows plus a small buffer; measure actual theme/card heights. */
export function VirtualDownloadList<T extends {id:string}>({items,view,renderItem}:{items:T[];view:'list'|'grid';renderItem:(item:T)=>ReactNode}) {
 const viewport=useRef<HTMLDivElement>(null);
 const measurements=useRef(new Map<string,number>());
 const [size,setSize]=useState({width:600,height:600});
 const [scroll,setScroll]=useState(0);
 const [,refresh]=useState(0);
 const signature=useRef('');
 const columns=view==='grid'?Math.max(1,Math.floor((size.width+10)/210)):1;
 const gap=view==='grid'?10:8;
 const rows:Array<{key:string;items:T[];top:number;height:number}>=[];
 let total=0;
 for(let i=0;i<items.length;i+=columns){
  const group=items.slice(i,i+columns),key=group.map(item=>item.id).join('|');
  const height=measurements.current.get(`${view}:${columns}:${key}`)??(view==='grid'?100:104);
  rows.push({key,items:group,top:total,height});total+=height+gap;
 }
 total=Math.max(0,total-gap);
 const buffer=300;
 const mounted=rows.filter(row=>row.top+row.height>=scroll-buffer&&row.top<=scroll+size.height+buffer);
 useLayoutEffect(()=>{
  const element=viewport.current;if(!element)return;
  const observe=new ResizeObserver(()=>{const width=element.clientWidth-parseFloat(getComputedStyle(element).paddingRight||'0');setSize(previous=>{
   if(previous.width===width&&previous.height===element.clientHeight)return previous;
   if(previous.width!==width)measurements.current.clear();
   return {width,height:element.clientHeight};
  });});observe.observe(element);return()=>observe.disconnect();
 },[]);
 useLayoutEffect(()=>{
  const next=`${view}:${columns}:${items.map(item=>item.id).join(',')}`;
  if(signature.current!==next){signature.current=next;if(viewport.current)viewport.current.scrollTop=0;setScroll(0);}
 },[items,view,columns]);
 useLayoutEffect(()=>{
  const element=viewport.current;if(!element)return;
  const observer=new ResizeObserver(entries=>{
   let changed=false;
   for(const entry of entries){const key=(entry.target as HTMLElement).dataset.rowKey!;const height=entry.target.getBoundingClientRect().height;
    if(height>0&&Math.abs((measurements.current.get(key)??0)-height)>.5){measurements.current.set(key,height);changed=true;}
   }
   if(changed)refresh(value=>value+1);
  });
  element.querySelectorAll('[data-row-key]').forEach(row=>observer.observe(row));return()=>observer.disconnect();
 },[mounted.map(row=>row.key).join(','),columns,view]);
 return <div ref={viewport} className={`cards-scroll-container view-${view} virtual-downloads`} onScroll={event=>setScroll(event.currentTarget.scrollTop)}>
  <div className="virtual-downloads-canvas" style={{height:total,position:'relative',flexShrink:0}}>
   {mounted.map(row=><div key={row.key} data-row-key={`${view}:${columns}:${row.key}`} className="virtual-downloads-row" style={{position:'absolute',top:row.top,left:0,right:0,display:'grid',gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gap}}>{row.items.map(renderItem)}</div>)}
  </div>
 </div>;
}
