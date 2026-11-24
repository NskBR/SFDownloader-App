import type {GradientConfig} from './settings';
export interface ThemeProfile {name:string;config:GradientConfig}
export function normalizeThemeProfiles(value:unknown):ThemeProfile[] {
  if(!Array.isArray(value))return [];
  return value.filter(p=>p && typeof p.name==='string' && p.name.trim() && p.config && Array.isArray(p.config.stops)).slice(0,12).flatMap(p=>{
    const stops=p.config.stops.filter((s: {color?:unknown})=>s && typeof s.color==='string' && /^#[a-f0-9]{6}$/i.test(s.color)).slice(0,4).map((s:{color:string;position:number},i:number,list:unknown[])=>({color:s.color,position:list.length===1?0:i*100/(list.length-1)}));
    if(!stops.length)return [];
    const finite=(value:unknown,fallback:number,min:number,max:number)=>typeof value==='number' && Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
    return [{name:p.name.trim().slice(0,32),config:{enabled:p.config.enabled!==false,rgb:false,type:p.config.type==='radial'?'radial' as const:'linear' as const,angle:finite(p.config.angle,135,0,360),intensity:finite(p.config.intensity,75,10,100),stops}}];
  });
}
