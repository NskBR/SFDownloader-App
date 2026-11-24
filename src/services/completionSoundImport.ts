import {invoke} from "@tauri-apps/api/core";
export async function importCompletionMp3(file:File):Promise<string>{
 if(!/\.mp3$/i.test(file.name)||file.size>5*1024*1024)throw new Error('Escolha um MP3 de até 5 segundos e 5 MB.');
 const data=await file.arrayBuffer(),header=new Uint8Array(data);
 if(!((header[0]===73&&header[1]===68&&header[2]===51)||(header[0]===255&&(header[1]&224)===224)))throw new Error('O arquivo não parece ser um MP3 válido.');
 const context=new AudioContext();
 try{
  const decoded=await context.decodeAudioData(data);
  if(!Number.isFinite(decoded.duration)||decoded.duration<=0||decoded.duration>5)throw new Error('O MP3 deve ter no máximo 5 segundos.');
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const rendered=await offline.startRendering(),samples=rendered.getChannelData(0);
  const wav=new ArrayBuffer(44+samples.length*2),view=new DataView(wav);
  const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+samples.length*2,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++)view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),true);
  let binary='';for(const byte of new Uint8Array(wav))binary+=String.fromCharCode(byte);
  return await invoke<string>('import_completion_sound',{data:btoa(binary)});
 }finally{await context.close();}
}
