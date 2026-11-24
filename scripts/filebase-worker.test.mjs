import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import worker from './filebase-worker.mjs';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const env={FILEBASE_ACCESS_KEY_ID:'test-key',FILEBASE_SECRET_ACCESS_KEY:'test-secret',FILEBASE_BUCKET:'sfs'};
test('serves version-scoped patch notes through the signed origin',async()=>{
 let origin;
 globalThis.fetch=async(url,options)=>{origin=String(url);assert.ok(options.headers.get('authorization').startsWith('AWS4-HMAC-SHA256'));return new Response('notes',{headers:{'content-type':'text/plain; charset=utf-8'}});};
 const response=await worker.fetch(new Request('https://updates.example/sfdownloader/desktop/releases/2.0.2/patch-notes.txt'),env);
 assert.equal(response.status,200);assert.equal(await response.text(),'notes');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(origin,'https://sfs.s3.filebase.io/sfdownloader-updates/releases/2.0.2/patch-notes.txt');
});
test('refuses arbitrary files, root notes, query strings and write requests',async()=>{
 globalThis.fetch=()=>{throw new Error('Origin must not be contacted');};
 for(const path of ['patch-notes.txt','releases/2.0.2/private.txt','releases/2.0.2/patch-notes.txt?x=1'])assert.equal((await worker.fetch(new Request('https://updates.example/sfdownloader/desktop/'+path),env)).status,404);
 assert.equal((await worker.fetch(new Request('https://updates.example/sfdownloader/desktop/latest.json',{method:'POST'}),env)).status,405);
});
test('keeps installer and manifest routes available',async()=>{
 globalThis.fetch=async()=>new Response('ok');
 for(const path of ['latest.json','releases/2.0.2/SFDownloader-Windows-x64-setup.exe'])assert.equal((await worker.fetch(new Request('https://updates.example/sfdownloader/desktop/'+path),env)).status,200);
});
