import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {defaultSettings,type AppSettings} from '../domain/settings';
import {applyThemeSettings} from './theme';
vi.mock('./testThemes',()=>({applyTestTheme:vi.fn()}));
vi.mock('./localThemes',()=>({resolveLocalTheme:vi.fn()}));
vi.mock('../domain/appFonts',()=>({applyFontSettings:vi.fn()}));
const frames=new Map<number,FrameRequestCallback>();let sequence=0;
beforeEach(()=>{
  frames.clear();document.documentElement.removeAttribute('style');
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++sequence,cb);return sequence;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
});
afterEach(()=>{applyThemeSettings(defaultSettings);vi.unstubAllGlobals();});
const tick=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(1000));};
const rgbSettings=(accentColor:AppSettings['accentColor']):AppSettings=>({...defaultSettings,accentColor,interfaceGradient:{...defaultSettings.interfaceGradient,enabled:true,rgb:true,stops:[{color:'#161125',position:0},{color:'#080e16',position:100}]}});
it('animates the RGB background without changing a solid accent',()=>{
  applyThemeSettings(rgbSettings('red'));
  const root=document.documentElement;
  const previous=root.style.getPropertyValue('--rgb-bg');tick();
  expect(root.style.getPropertyValue('--rgb-bg')).not.toBe(previous);
  expect(root.style.getPropertyValue('--ember-solid')).toBe('#ef4444');
  expect(root.dataset.accent).toBe('red');
});
it('allows RGB accent independently of the background and restores a solid accent immediately',()=>{
  applyThemeSettings({...defaultSettings,accentColor:'gradient_flow'});tick();
  expect(document.documentElement.style.getPropertyValue('--bg-fill')).toBe('#161A1E');
  expect(document.documentElement.style.getPropertyValue('--ember-solid')).toMatch(/^rgb/);
  applyThemeSettings(rgbSettings('blue'));tick();
  expect(document.documentElement.style.getPropertyValue('--ember-solid')).toBe('#3b82f6');
});
