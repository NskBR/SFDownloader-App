import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../src/popup.html',import.meta.url),'utf8');
const script=await readFile(new URL('../src/popup.js',import.meta.url),'utf8');
const helper=await readFile(new URL('../src/youtube-url.js',import.meta.url),'utf8');
function fixture(response,initial={}) {
  const dom=new JSDOM(html,{url:'https://extension.test/popup.html',runScripts:'outside-only'});
  const {window}=dom; const state={captureEnabled:false,language:'pt-BR',disabledExtensions:[],...initial}; const messages=[];let reloads=0;
  window.setInterval=()=>0;
  window.chrome={runtime:{lastError:null,getManifest:()=>({version:'0.3.8'}),reload:()=>reloads++,sendMessage:(message,callback)=>{messages.push(message);callback?.(response);}},storage:{local:{get:(keys,callback)=>callback({...(!Array.isArray(keys)&&typeof keys==='object'?keys:{}),...state}),set:(values,callback)=>{Object.assign(state,values);callback?.();},remove:key=>delete state[key]}}};
  window.chrome.tabs={query:(_query,callback)=>callback([{url:state.tabUrl}])};
  window.eval(helper);window.eval(script);
  return {window,state,messages,reloads:()=>reloads,flush:()=>new Promise(resolve=>setImmediate(resolve)),close:()=>window.close()};
}
test('manual popup fallback detects Facebook with capture disabled and rechecks the tab on click',async()=>{
  const f=fixture({ok:true,delivery:'bridge'},{tabUrl:'https://www.facebook.com/reel/1368202691917922?locale=nb_NO'});
  try{await f.flush();const button=f.window.document.querySelector('#download-page');assert.equal(button.disabled,false);assert.match(f.window.document.querySelector('#download-page-hint').textContent,/Facebook/);
    f.state.tabUrl='https://www.youtube.com/watch?v=jNQXAC9IVRw';button.click();await f.flush();
    assert.deepEqual(JSON.parse(JSON.stringify(f.messages.find(m=>m.type==='popup-download-media'))),{type:'popup-download-media',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'});
    assert.equal(f.state.captureEnabled,false);assert.match(f.window.document.querySelector('#download-page-hint').textContent,/Escolha vídeo ou áudio/);
  }finally{f.close();}
});
test('manual fallback is unavailable for unsupported pages and social profiles',async()=>{
  for(const tabUrl of ['https://example.com/','https://facebook.com.evil.test/reel/1368202691917922/','https://www.instagram.com/user/']){
    const f=fixture(null,{tabUrl});try{await f.flush();assert.equal(f.window.document.querySelector('#download-page').disabled,true);}finally{f.close();}
  }
});
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


test('popup switches the whole palette between light and dark backgrounds',async()=>{
  const f=fixture(null,{themeAccent:'#10b981',themeBg:'linear-gradient(135deg, #edf8f2, #dceee6)'});
  try {
    await f.flush();const root=f.window.document.documentElement;
    assert.equal(root.dataset.theme,'light');
    assert.equal(root.style.getPropertyValue('--st-connected'),'#087649');
    assert.match(root.style.getPropertyValue('--ember'),/color-mix/);
    f.window.applyTheme('#10b981','linear-gradient(135deg, #12151b, #0b0d10)');
    assert.equal(root.dataset.theme,'dark');
    assert.equal(root.style.getPropertyValue('--ember'),'#10b981');
  }finally{f.close();}
});
