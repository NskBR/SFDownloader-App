import type {GradientConfig} from './settings';
/** Linear-light luminance, weighted by the visible span of each color stop. */
export function backgroundIsLight(config:GradientConfig):boolean {
 if(!config.enabled || !config.stops.length)return false;
 const luminance=(hex:string)=>{
  if(!/^#[a-f0-9]{6}$/i.test(hex))return 0;
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 };
 const stops=config.stops.map(s=>({color:s.color,position:Math.max(0,Math.min(100,Number.isFinite(s.position)?s.position:0))})).sort((a,b)=>a.position-b.position);
 let light=luminance(stops[0].color)*stops[0].position;
 for(let i=1;i<stops.length;i++)light+=(luminance(stops[i-1].color)+luminance(stops[i].color))*.5*(stops[i].position-stops[i-1].position);
 light+=luminance(stops[stops.length-1].color)*(100-stops[stops.length-1].position);
 return light/100>=.4;
}
