import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../src/popup.html',import.meta.url),'utf8');
const script=await readFile(new URL('../src/popup.js',import.meta.url),'utf8');
function fixture(response,initial={}) {
  const dom=new JSDOM(html,{url:'https://extension.test/popup.html',runScripts:'outside-only'});
  const {window}=dom; const state={captureEnabled:false,language:'pt-BR',disabledExtensions:[],...initial}; const messages=[];let reloads=0;
  window.setInterval=()=>0;
  window.chrome={runtime:{lastError:null,getManifest:()=>({version:'0.3.7'}),reload:()=>reloads++,sendMessage:(message,callback)=>{messages.push(message);callback?.(response);}},storage:{local:{get:(keys,callback)=>callback({...(!Array.isArray(keys)&&typeof keys==='object'?keys:{}),...state}),set:(values,callback)=>{Object.assign(state,values);callback?.();},remove:key=>delete state[key]}}};
  window.eval(script);
  return {window,state,messages,reloads:()=>reloads,flush:()=>new Promise(resolve=>setImmediate(resolve)),close:()=>window.close()};
}
test('update records the expected version before reloading the unpacked extension',async()=>{
  const f=fixture({ok:true,mode:'reload',version:'0.3.9',path:'C:/App/extension/chromium'});
  try {await f.flush();f.window.document.querySelector('#update-extension').click();await f.flush();assert.equal(f.reloads(),1);assert.equal(f.state.pendingExtensionUpdate.version,'0.3.9');assert.equal(f.state.captureEnabled,false);assert.ok(f.messages.some(m=>m.type==='update-extension'));}finally{f.close();}
});
test('Firefox confirmation and older app results never reload the extension',async()=>{
  for(const [mode,text] of [['manual','Confirme a instalação'],['app-older','Atualize o aplicativo primeiro']]){
    const f=fixture({ok:true,mode});try{await f.flush();f.window.document.querySelector('#update-extension').click();await f.flush();assert.equal(f.reloads(),0);assert.match(f.window.document.querySelector('#update-result').textContent,new RegExp(text));assert.equal(f.window.document.querySelector('#update-extension').disabled,false);}finally{f.close();}
  }
});
test('detects an unpacked copy loaded from a different directory after reload',async()=>{
  const f=fixture(null,{pendingExtensionUpdate:{version:'0.3.9',path:'C:/App/extension/chromium'}});
  try{await f.flush();assert.match(f.window.document.querySelector('#update-result').textContent,/outra pasta.*C:\/App\/extension\/chromium/);assert.equal(f.reloads(),0);}finally{f.close();}
});
