import {it,expect} from 'vitest';
import {normalizeWindowBorder,applyWindowBorder} from './windowBorder';
it('clamps outline values and rejects injected colors and invalid effects',()=>{
 const value=normalizeWindowBorder({radius:100,width:50,speed:0,glow:99,color:'red;display:none',effect:'unknown',enabled:true});
 expect(value).toMatchObject({radius:28,width:6,speed:2,glow:24,color:'#06b6d4',effect:'solid',enabled:true});
});
it('applies independent outline properties and can disable the effect',()=>{
 applyWindowBorder({enabled:true,effect:'rgb',color:'#ff0000',width:3});
 expect(document.documentElement.dataset.windowBorder).toBe('rgb');
 expect(document.documentElement.style.getPropertyValue('--custom-border-width')).toBe('3px');
 applyWindowBorder(undefined);expect(document.documentElement.dataset.windowBorder).toBe('off');
});
