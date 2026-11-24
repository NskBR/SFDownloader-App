// Each notification owns a waveOut handle. Windows mixes simultaneous handles;
// PlaySound's process-wide playback and the old mutex serialized notifications.
#[cfg(windows)]
pub(super) fn play() -> Result<(), String> {
    use std::{mem::size_of, ptr, time::{Duration, Instant}};
    use windows_sys::Win32::Media::Audio::*;
    let sound = include_bytes!("../../assets/download-complete.wav");
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
        let deadline=Instant::now()+Duration::from_secs(5);
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
