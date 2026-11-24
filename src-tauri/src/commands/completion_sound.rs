// Each notification owns a waveOut handle. Windows mixes simultaneous handles;
// PlaySound's process-wide playback and the old mutex serialized notifications.
#[cfg(windows)]
pub(super) fn play(sound:Vec<u8>) -> Result<(), String> {
    use std::{mem::size_of, ptr, time::{Duration, Instant}};
    use windows_sys::Win32::Media::Audio::*;
    let mut format = None;
    let mut samples = None;
    let mut offset = 12usize;
    while offset + 8 <= sound.len() {
        let len = u32::from_le_bytes(sound[offset+4..offset+8].try_into().unwrap()) as usize;
        let start = offset + 8;
        let end = start.checked_add(len).filter(|end| *end <= sound.len()).ok_or("Som de conclusão inválido.")?;
        let chunk = &sound[start..end];
        if &sound[offset..offset+4] == b"fmt " && len >= 16 {
            format = Some(WAVEFORMATEX {
                wFormatTag:u16::from_le_bytes(chunk[0..2].try_into().unwrap()),
                nChannels:u16::from_le_bytes(chunk[2..4].try_into().unwrap()),
                nSamplesPerSec:u32::from_le_bytes(chunk[4..8].try_into().unwrap()),
                nAvgBytesPerSec:u32::from_le_bytes(chunk[8..12].try_into().unwrap()),
                nBlockAlign:u16::from_le_bytes(chunk[12..14].try_into().unwrap()),
                wBitsPerSample:u16::from_le_bytes(chunk[14..16].try_into().unwrap()),cbSize:0,
            });
        } else if &sound[offset..offset+4] == b"data" { samples=Some(chunk.to_vec()); }
        offset=end+(len&1);
    }
    let format=format.ok_or("Formato do som indisponível.")?;
    if format.wFormatTag != 1 { return Err("O som de conclusão precisa estar em PCM.".into()); }
    let mut samples=samples.ok_or("Áudio de conclusão indisponível.")?;
    let mut handle=ptr::null_mut();
    let mut header=Box::new(WAVEHDR {lpData:samples.as_mut_ptr(),dwBufferLength:samples.len() as u32,..unsafe {std::mem::zeroed()}});
    let header_size=size_of::<WAVEHDR>() as u32;
    // All pointers stay alive on this blocking task until the driver returns
    // the buffer. No handle, header, or buffer is shared with another playback.
    unsafe {
        if waveOutOpen(&mut handle,WAVE_MAPPER,&format,0,0,CALLBACK_NULL)!=0 {
            return Err("Não foi possível abrir a saída de áudio.".into());
        }
        if waveOutPrepareHeader(handle,&mut *header,header_size)!=0 {
            waveOutClose(handle);
            return Err("Não foi possível preparar o som de conclusão.".into());
        }
        let written=waveOutWrite(handle,&mut *header,header_size);
        let deadline=Instant::now()+Duration::from_secs(6);
        while written==0 && ptr::read_volatile(ptr::addr_of!(header.dwFlags)) & WHDR_DONE == 0 && Instant::now()<deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        let completed=written==0 && ptr::read_volatile(ptr::addr_of!(header.dwFlags)) & WHDR_DONE != 0;
        // Reset returns any pending buffers before their memory is released.
        waveOutReset(handle);
        waveOutUnprepareHeader(handle,&mut *header,header_size);
        waveOutClose(handle);
        if completed {Ok(())} else {Err("Não foi possível reproduzir o som de conclusão.".into())}
    }
}

fn wav(samples:&[i16])->Vec<u8>{
    let len=(samples.len()*2) as u32;
    let mut bytes=Vec::with_capacity(44+len as usize);
    bytes.extend_from_slice(b"RIFF");bytes.extend_from_slice(&(36+len).to_le_bytes());bytes.extend_from_slice(b"WAVEfmt ");bytes.extend_from_slice(&16u32.to_le_bytes());bytes.extend_from_slice(&1u16.to_le_bytes());bytes.extend_from_slice(&1u16.to_le_bytes());bytes.extend_from_slice(&16000u32.to_le_bytes());bytes.extend_from_slice(&32000u32.to_le_bytes());bytes.extend_from_slice(&2u16.to_le_bytes());bytes.extend_from_slice(&16u16.to_le_bytes());bytes.extend_from_slice(b"data");bytes.extend_from_slice(&len.to_le_bytes());
    for sample in samples{bytes.extend_from_slice(&sample.to_le_bytes());}bytes
}
fn validate_import(bytes:&[u8])->Result<(),String>{
    if bytes.len()<46 || bytes.len()>160044 || &bytes[..4]!=b"RIFF" || &bytes[8..16]!=b"WAVEfmt " || bytes[16..20]!=16u32.to_le_bytes() || bytes[20..22]!=1u16.to_le_bytes() || bytes[22..24]!=1u16.to_le_bytes() || bytes[24..28]!=16000u32.to_le_bytes() || bytes[28..32]!=32000u32.to_le_bytes() || bytes[32..34]!=2u16.to_le_bytes() || bytes[34..36]!=16u16.to_le_bytes() || &bytes[36..40]!=b"data" || u32::from_le_bytes(bytes[40..44].try_into().unwrap()) as usize!=bytes.len()-44 || (bytes.len()-44)%2!=0 {
        return Err("Escolha um MP3 valido com no maximo 5 segundos.".into());
    }
    Ok(())
}
pub(super) fn import(app:&tauri::AppHandle,data:String)->Result<String,String>{
    use tauri::Manager;use base64::Engine;use sha2::{Digest,Sha256};
    if data.len()>214000{return Err("Audio excede o limite de 5 segundos.".into());}
    let bytes=base64::engine::general_purpose::STANDARD.decode(data).map_err(|_|"Audio invalido.")?;validate_import(&bytes)?;
    let id=format!("{:x}",Sha256::digest(&bytes));
    let folder=app.path().app_data_dir().map_err(|e|e.to_string())?.join("sounds");std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    std::fs::write(folder.join(format!("{id}.wav")),bytes).map_err(|e|e.to_string())?;Ok(format!("custom:{id}"))
}
pub(super) fn load(app:&tauri::AppHandle,id:&str)->Result<Vec<u8>,String>{
    use tauri::Manager;
    if let Some(hash)=id.strip_prefix("custom:"){
        if hash.len()!=64 || !hash.bytes().all(|c|c.is_ascii_digit() || (b'a'..=b'f').contains(&c)){return Err("Som personalizado invalido.".into());}
        let path=app.path().app_data_dir().map_err(|e|e.to_string())?.join("sounds").join(format!("{hash}.wav"));
        let file=std::fs::File::open(path).map_err(|_|"Som personalizado indisponivel. Importe o MP3 novamente.")?;
        use std::io::Read;let mut bytes=Vec::new();file.take(160045).read_to_end(&mut bytes).map_err(|e|e.to_string())?;validate_import(&bytes)?;return Ok(bytes);
    }
    if id=="default"{return Ok(include_bytes!("../../assets/download-complete.wav").to_vec());}
    let notes:&[f32]=match id{"soft"=>&[523.25,659.25],"bright"=>&[659.25,830.61,987.77],"arcade"=>&[440.,554.37,659.25,880.],"bell"=>&[880.],_=>return Err("Som de conclusao desconhecido.".into())};
    let mut samples=Vec::new();
    for &frequency in notes{for i in 0..4800{let t=i as f32/16000.;let envelope=(t/0.012).min(1.)*(-t*14.).exp();let phase=std::f32::consts::TAU*frequency*t;let tone=phase.sin()+if id=="bell"{0.2*(phase*2.76).sin()}else{0.};samples.push((tone*envelope*6500.) as i16);}}
    Ok(wav(&samples))
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn accepts_only_bounded_pcm(){assert!(validate_import(&wav(&vec![0;80000])).is_ok());assert!(validate_import(&wav(&vec![0;80001])).is_err());assert!(validate_import(b"not audio").is_err());}
}
