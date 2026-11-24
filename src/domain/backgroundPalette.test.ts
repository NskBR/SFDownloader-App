import {it,expect} from 'vitest';
import {backgroundIsLight} from './backgroundPalette';
import {defaultSettings} from './settings';
const config=(colors:string[])=>({...defaultSettings.interfaceGradient,enabled:true,stops:colors.map((color,i)=>({color,position:colors.length===1?0:i*100/(colors.length-1)}))});
it('classifies custom white and pastel backgrounds without depending on preset IDs',()=>{
 for(const colors of [['#ffffff'],['#ffffff','#f0f0f0'],['#fff1dc','#fafafa'],['#ebf7ef','#eff4ff']])expect(backgroundIsLight(config(colors))).toBe(true);
});
it('keeps dark RGB and dark custom backgrounds in the dark palette',()=>{
 for(const colors of [['#000000'],['#161125','#080e16'],['#320938','#050a1e']])expect(backgroundIsLight(config(colors))).toBe(false);
 expect(backgroundIsLight({...config(['#ffffff']),enabled:false})).toBe(false);
});
it('accounts for stop positions instead of counting colors',()=>{
 const gradient=config(['#ffffff','#ffffff','#000000']);gradient.stops[1].position=90;
 expect(backgroundIsLight(gradient)).toBe(true);
});
