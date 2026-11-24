import {it,expect,vi,afterEach} from 'vitest';
import {importCompletionMp3} from './completionSoundImport';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn()}));
afterEach(()=>vi.unstubAllGlobals());
it('rejects oversized or non-MP3 files before decoding',async()=>{
 await expect(importCompletionMp3({name:'file.wav',size:100} as File)).rejects.toThrow('MP3');
 await expect(importCompletionMp3({name:'file.mp3',size:6*1024*1024} as File)).rejects.toThrow('5 MB');
});
it('checks decoded duration rather than trusting the name and closes the decoder',async()=>{
 const close=vi.fn(async()=>{});vi.stubGlobal('AudioContext',class {decodeAudioData=async()=>({duration:5.01});close=close;});
 const file={name:'short.mp3',size:100,arrayBuffer:async()=>new Uint8Array([73,68,51,0]).buffer} as File;
 await expect(importCompletionMp3(file)).rejects.toThrow('5 segundos');expect(close).toHaveBeenCalledOnce();
});
