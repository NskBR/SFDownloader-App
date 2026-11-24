import {renderHook,act,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {useScrollInertia} from './useScrollInertia';
afterEach(()=>{cleanup();document.body.innerHTML='';vi.unstubAllGlobals();});
it('smooths wheel movement and removes interception when disabled',()=>{
 const callbacks:FrameRequestCallback[]=[];
 vi.stubGlobal('requestAnimationFrame',vi.fn(callback=>{callbacks.push(callback);return callbacks.length;}));vi.stubGlobal('cancelAnimationFrame',vi.fn());
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 const area=document.createElement('div');area.style.overflowY='auto';document.body.append(area);Object.defineProperties(area,{scrollHeight:{value:1000},clientHeight:{value:200}});
 const view=renderHook(({enabled})=>useScrollInertia(enabled),{initialProps:{enabled:true}});
 const event=new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true});act(()=>area.dispatchEvent(event));expect(event.defaultPrevented).toBe(true);
 act(()=>callbacks.shift()!(16));expect(area.scrollTop).toBeGreaterThan(0);expect(area.scrollTop).toBeLessThan(100);
 view.rerender({enabled:false});const native=new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true});area.dispatchEvent(native);expect(native.defaultPrevented).toBe(false);
});

it('reaches exactly zero even when the webview rounds scroll positions',()=>{
 const callbacks:FrameRequestCallback[]=[];vi.stubGlobal('requestAnimationFrame',vi.fn(callback=>{callbacks.push(callback);return callbacks.length;}));vi.stubGlobal('cancelAnimationFrame',vi.fn());
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 const area=document.createElement('div');area.style.overflowY='auto';document.body.append(area);let position=103;
 Object.defineProperties(area,{scrollHeight:{value:1000},clientHeight:{value:200},scrollTop:{get:()=>position,set:value=>{position=Math.max(0,Math.round(value));}}});
 renderHook(()=>useScrollInertia(true,'strong'));
 act(()=>area.dispatchEvent(new WheelEvent('wheel',{deltaY:-200,bubbles:true,cancelable:true})));
 act(()=>{for(let i=1;i<200&&callbacks.length;i++)callbacks.shift()!(i*16);});
 expect(area.scrollTop).toBe(0);expect(callbacks).toHaveLength(0);
});
