export interface RgbConfig { colors:string[]; duration:number; angle:number; reverse:boolean }
export interface RgbProfile { name:string; config:RgbConfig }
export const defaultRgbConfig:RgbConfig = {colors:["#ff3355","#ffb020","#33d17a","#00c8ff","#7c5cff","#ff40bc"],duration:18,angle:135,reverse:false};
export const rgbSpeeds = [{label:'Lento',duration:36},{label:'Médio',duration:18},{label:'Rápido',duration:6}] as const;
export function rgbFrame(config:RgbConfig,time:number) {
  const phase=(time/(config.duration*1000))%1;
  const progress=config.reverse?(1-phase)%1:phase;
  const sample=(offset:number)=>{
    const scaled=((progress+offset)%1)*config.colors.length;
    const index=Math.floor(scaled),fraction=scaled-index;
    const channels=(color:string)=>[1,3,5].map(start=>parseInt(color.slice(start,start+2),16));
    const a=channels(config.colors[index]),b=channels(config.colors[(index+1)%config.colors.length]);
    return a.map((value,i)=>Math.round(value+(b[i]-value)*fraction));
  };
  const first=sample(0),second=sample(.38);
  const color=(channels:number[])=>`rgb(${channels.join(',')})`;
  const dark=(channels:number[])=>color(channels.map(c=>Math.round(c*.13)));
  return {first,stop1:color(first),stop2:color(second),gradient:`linear-gradient(${config.angle}deg,${color(first)},${color(second)})`,background:`linear-gradient(${config.angle}deg,${dark(first)},${dark(second)})`};
}
export function normalizeRgbConfig(value:unknown):RgbConfig {
  const raw=(value && typeof value==='object' ? value : {}) as Partial<RgbConfig>;
  const colors=Array.isArray(raw.colors) ? raw.colors.filter((c):c is string=>typeof c==='string' && /^#[a-f0-9]{6}$/i.test(c)).slice(0,8) : [];
  const number=(n:unknown,fallback:number,min:number,max:number)=>typeof n==='number' && Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
  return {colors:colors.length>=2?colors:[...defaultRgbConfig.colors], duration:number(raw.duration,18,4,60),angle:number(raw.angle,135,0,360),reverse:raw.reverse===true};
}
export function normalizeRgbProfiles(value:unknown):RgbProfile[] {
  if(!Array.isArray(value))return [];
  return value.filter(p=>p && typeof p.name==='string' && p.name.trim()).slice(0,12).map(p=>({name:p.name.trim().slice(0,32),config:normalizeRgbConfig(p.config)}));
}
