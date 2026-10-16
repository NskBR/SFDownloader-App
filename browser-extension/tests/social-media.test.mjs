import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {JSDOM} from 'jsdom';

const helper = await readFile(new URL('../src/youtube-url.js',import.meta.url),'utf8');
const script = await readFile(new URL('../src/social-media.js',import.meta.url),'utf8');
const instagram = 'https://www.instagram.com/reel/ABC_123/';
const tiktok = 'https://www.tiktok.com/@user.test/video/1234567890123456789';
const card = url => `<article><video></video><a href="${url}">video</a><section><button aria-label="Share"><svg aria-label="Compartilhar"></svg></button></section></article>`;
function fixture(url,html,prefs={}) {
  const dom = new JSDOM(html,{url,runScripts:'outside-only'});
  const {window} = dom; const frames=[]; const messages=[]; const shadows=[]; let change;
  const original = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function(options) { const shadow=original.call(this,options); shadows.push(shadow); return shadow; };
  window.requestAnimationFrame = callback => frames.push(callback);
  window.chrome = {runtime:{sendMessage:async message => { messages.push(message); return {ok:true,delivery:'bridge'}; }},storage:{local:{get(_keys,callback){callback(prefs);}},onChanged:{addListener(callback){change=callback;}}}};
  window.eval(helper); window.eval(script);
  const flush = async () => {
    for (let i=0;i<8;i++) { await new Promise(resolve => setImmediate(resolve)); const pending=frames.splice(0); pending.forEach(callback => callback()); }
    assert.equal(frames.length,0,'reconciliation must settle instead of observing its own mutations forever');
  };
  return {window,shadows,messages,flush,close:()=>window.close(),change:changes=>change(changes,'local')};
}
test('validates social URL structure, strips tracking and refuses unsupported content', async () => {
  const f=fixture(instagram,card(instagram));
  try {
    await f.flush(); const parse=f.window.sfSocialMediaSource;
    assert.equal(parse(instagram+'?igsh=tracking'),instagram);
    assert.equal(parse('https://www.instagram.com/instagram/reel/ABC_123/'),instagram);
    assert.equal(parse(tiktok+'?list=not-a-playlist'),tiktok);
    assert.equal(parse('https://vm.tiktok.com/Short123/?tracking=1'),'https://vm.tiktok.com/Short123/');
    for(const url of ['https://instagram.com.evil.test/reel/a/','https://user@instagram.com/reel/a/','https://instagram.com:1234/reel/a/','http://instagram.com/reel/a/','https://instagram.com/stories/user/123/','https://instagram.com/user/','https://tiktok.com/@user/live','https://tiktok.com/@user/photo/1234567890123456789']) assert.equal(parse(url),null);
  } finally {f.close();}
});
test('each Instagram feed card sends its own video and reused cards use the current permalink', async () => {
  const second='https://www.instagram.com/reel/Second/';
  const f=fixture('https://www.instagram.com/',card(instagram)+card(second));
  try {
    await f.flush(); assert.equal(f.shadows.length,2);
    f.shadows[1].querySelector('button').click(); await f.flush(); assert.equal(f.messages[0].url,second);
    f.window.document.querySelectorAll('article a')[1].href='https://www.instagram.com/reel/Third/';
    await f.flush(); f.shadows[1].querySelector('button').click(); await f.flush();
    assert.equal(f.messages[1].url,'https://www.instagram.com/reel/Third/');
    f.window.eval(script); await f.flush(); assert.equal(f.window.document.querySelectorAll('[data-sf-social-action]').length,2);
    f.change({captureEnabled:{newValue:false}}); await f.flush(); assert.equal(f.window.document.querySelectorAll('[data-sf-social-action]').length,0);
    f.change({captureEnabled:{newValue:true},language:{newValue:'en-US'}}); await f.flush(); assert.equal(f.window.document.querySelectorAll('[data-sf-social-action]').length,2);
    assert.equal(f.shadows.at(-1).querySelector('button').textContent,'Download');
  } finally {f.close();}
});
test('TikTok inserts beside share and restores itself after the action column is replaced',async()=>{
  const html=`<article data-e2e="recommend-list-item-container"><video></video><a href="${tiktok}">Video</a><aside><button data-e2e="share-icon">Share</button></aside></article>`;
  const f=fixture(tiktok,html);
  try {
    await f.flush(); assert.equal(f.window.document.querySelector('[data-sf-social-action]').parentElement.tagName,'ASIDE');
    f.shadows[0].querySelector('button').click(); await f.flush(); assert.equal(f.messages[0].url,tiktok);
    f.window.document.body.innerHTML=html; await f.flush(); assert.equal(f.window.document.querySelectorAll('[data-sf-social-action]').length,1);
  }finally{f.close();}
});
test('Instagram does not add controls to image-only posts',async()=>{
  const photo='https://www.instagram.com/p/PHOTO123/';
  const f=fixture(photo,card(photo).replace('<video></video>','<img alt="photo">'));
  try{await f.flush();assert.equal(f.window.document.querySelector('[data-sf-social-action]'),null);}finally{f.close();}
});
test('Instagram supports desktop Reel actions without an article wrapper',async()=>{
  const html='<main><div><video></video><section><div><div role="button"><svg aria-label="Compartilhar"></svg></div></div></section></div></main>';
  const f=fixture(instagram,html);
  try {await f.flush();assert.equal(f.window.document.querySelectorAll('[data-sf-social-action]').length,1);f.shadows[0].querySelector('button').click();await f.flush();assert.equal(f.messages[0].url,instagram);} finally {f.close();}
});
test('Reel download is a separate icon action and never widens the share row',async()=>{
  const html=`<article><video></video><a href="${instagram}">Video</a><aside style="display:flex;flex-direction:column;align-items:center"><div id="like"><button><svg aria-label="Curtir"></svg></button></div><div id="share"><button><svg aria-label="Compartilhar"></svg></button></div><div id="save"><button><svg aria-label="Salvar"></svg></button></div></aside></article>`;
  const f=fixture(instagram,html);
  try {
    await f.flush();
    const host=f.window.document.querySelector('[data-sf-social-action]');
    assert.equal(host.parentElement.tagName,'ASIDE');
    assert.equal(host.previousElementSibling.id,'share');
    assert.equal(host.nextElementSibling.id,'save');
    assert.equal(f.window.document.querySelector('#share').children.length,1);
    assert.equal(f.shadows[0].querySelector('button').title,'SFDownloader · Escolher MP4 ou MP3');
    assert.match(f.shadows[0].querySelector('style').textContent,/\.label\s*\{\s*display:none/);
  } finally {f.close();}
});
