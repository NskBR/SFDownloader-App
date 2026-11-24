import {normalizeRgbConfig,normalizeRgbProfiles,defaultRgbConfig,type RgbConfig,type RgbProfile} from "./rgbTheme";
export type WindowBorder = {shape:'theme'|'rounded'|'square'|'cut'|'diagonal'|'bottom-cut';rgb:RgbConfig;profiles:RgbProfile[];radius:number;enabled:boolean;width:number;color:string;effect:'solid'|'neon'|'rgb';speed:number;glow:number};
export const defaultWindowBorder:WindowBorder={shape:'theme',rgb:defaultRgbConfig,profiles:[],radius:12,enabled:false,width:2,color:'#06b6d4',effect:'solid',speed:8,glow:12};
export function normalizeWindowBorder(value:unknown):WindowBorder {
 const v=(value && typeof value==='object'?value:{}) as Partial<WindowBorder>;
 const clamp=(value:unknown,fallback:number,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
 return {shape:['rounded','square','cut','diagonal','bottom-cut'].includes(v.shape??'')?v.shape!:'theme',rgb:normalizeRgbConfig(v.rgb),profiles:normalizeRgbProfiles(v.profiles),radius:clamp(v.radius,12,0,28),enabled:v.enabled===true,width:clamp(v.width,2,1,6),color:typeof v.color==='string'&&/^#[0-9a-f]{6}$/i.test(v.color)?v.color:'#06b6d4',effect:v.effect==='neon'||v.effect==='rgb'?v.effect:'solid',speed:clamp(v.speed,8,2,20),glow:clamp(v.glow,12,0,24)};
}
export function applyWindowBorder(value:unknown) {
 const border=normalizeWindowBorder(value),root=document.documentElement;
 root.dataset.windowShape=border.shape;
 root.dataset.windowBorderRgb=JSON.stringify(border.rgb);
 root.style.setProperty("--custom-border-speed",`${border.rgb.duration}s`);
 root.style.setProperty("--custom-border-direction",border.rgb.reverse?"reverse":"normal");
 root.dataset.windowBorder=border.enabled?border.effect:'off';
 root.style.setProperty('--custom-window-radius',`${border.radius}px`);
 root.style.setProperty('--custom-border-width',`${border.width}px`);
 root.style.setProperty('--custom-border-color',border.color);

 root.style.setProperty('--custom-border-glow',`${border.glow}px`);
}

let borderPreview:WindowBorder|null=null;
export function previewWindowBorder(value:unknown){borderPreview=normalizeWindowBorder(value);applyWindowBorder(borderPreview);}
export function clearWindowBorderPreview(value:unknown){borderPreview=null;applyWindowBorder(value);}
export function applySavedWindowBorder(value:unknown){applyWindowBorder(borderPreview??value);}
