//! Conservative, bounded inspection: only positive encryption evidence is reported.
fn u16_at(data:&[u8], at:usize)->Option<u16>{Some(u16::from_le_bytes(data.get(at..at+2)?.try_into().ok()?))}
fn u32_at(data:&[u8], at:usize)->Option<u32>{Some(u32::from_le_bytes(data.get(at..at+4)?.try_into().ok()?))}
fn vint(data:&[u8], at:&mut usize)->Option<usize>{
    let mut value=0u64;
    for shift in (0..63).step_by(7){let b=*data.get(*at)?;*at+=1;value|=((b&127) as u64)<<shift;if b&128==0{return usize::try_from(value).ok();}}
    None
}
pub fn encrypted_header(data:&[u8])->bool {
    if data.starts_with(b"PK\x03\x04") {
        let mut at=0;
        while data.get(at..at+4)==Some(b"PK\x03\x04") && at+30<=data.len(){
            let flags=u16_at(data,at+6).unwrap();
            if flags&1!=0{return true;}
            if flags&8!=0{return false;}
            let Some(size)=u32_at(data,at+18).filter(|s|*s!=u32::MAX) else{return false;};
            at=match at.checked_add(30+u16_at(data,at+26).unwrap() as usize+u16_at(data,at+28).unwrap() as usize).and_then(|v|v.checked_add(size as usize)){Some(v)=>v,None=>return false};
        }
    } else if data.starts_with(b"Rar!\x1a\x07\x00") {
        let mut at=7;
        while at+7<=data.len(){
            let kind=data[at+2];let flags=u16_at(data,at+3).unwrap();let size=u16_at(data,at+5).unwrap() as usize;
            if size<7 || at+size>data.len(){return false;}
            if kind==0x73 && size>=13 && flags&0x80!=0 || kind==0x74 && size>=32 && flags&4!=0{return true;}
            if kind==0x74 && flags&0x100!=0{return false;}
            let packed=if flags&0x8000!=0{match u32_at(data,at+7){Some(n) if size>=11=>n as usize,_=>return false}}else{0};
            at=match at.checked_add(size).and_then(|n|n.checked_add(packed)){Some(n)=>n,None=>return false};
        }
    } else if data.starts_with(b"Rar!\x1a\x07\x01\x00") {
        let mut at=8;
        while at+7<=data.len(){
            let mut p=at+4;
            let Some(size)=vint(data,&mut p) else{return false;};
            let Some(end)=p.checked_add(size).filter(|n|*n<=data.len()) else{return false;};
            let Some(kind)=vint(&data[..end],&mut p) else{return false;};
            let Some(flags)=vint(&data[..end],&mut p) else{return false;};
            let extra=if flags&1!=0{match vint(&data[..end],&mut p){Some(n)=>n,None=>return false}}else{0};
            let packed=if flags&2!=0{match vint(&data[..end],&mut p){Some(n)=>n,None=>return false}}else{0};
            if kind==4 && end.saturating_sub(p)>=18{return true;}
            if kind==2 || kind==3 {
                let Some(mut cursor)=end.checked_sub(extra).filter(|n|*n>=p) else{return false;};
                while cursor<end {
                    let Some(len)=vint(&data[..end],&mut cursor) else{return false;};
                    let Some(next)=cursor.checked_add(len).filter(|n|*n<=end && *n>cursor) else{return false;};
                    if vint(&data[..next],&mut cursor)==Some(1){return true;}
                    cursor=next;
                }
            }
            at=match end.checked_add(packed){Some(n)=>n,None=>return false};
        }
    }
    false
}
pub fn encrypted_zip_directory(tail:&[u8],start:u64,total:u64)->bool {
    // Follow the actual EOCD directory offset; never scan compressed payload
    // for signatures, which could falsely label an ordinary archive encrypted.
    let Some(end)=(0..tail.len().saturating_sub(21)).rev().find(|&p|tail.get(p..p+4)==Some(b"PK\x05\x06") && u16_at(tail,p+20).is_some_and(|n|p+22+n as usize==tail.len())) else{return false;};
    if u16_at(tail,end+4)!=Some(0) || u16_at(tail,end+6)!=Some(0){return false;}
    let Some(offset)=u32_at(tail,end+16).map(u64::from).filter(|o|*o>=start && *o<total) else{return false;};
    let mut p=(offset-start) as usize;
    for _ in 0..u16_at(tail,end+10).unwrap_or(0){
        if p+46>end || tail.get(p..p+4)!=Some(b"PK\x01\x02"){return false;}
        if u16_at(tail,p+8).unwrap()&1!=0{return true;}
        p+=46+u16_at(tail,p+28).unwrap() as usize+u16_at(tail,p+30).unwrap() as usize+u16_at(tail,p+32).unwrap() as usize;
    }
    false
}

async fn range(client:&reqwest::Client,url:&str,start:u64,end:u64)->Option<Vec<u8>>{
    let mut response=client.get(url).header(reqwest::header::RANGE,format!("bytes={start}-{end}")).header(reqwest::header::ACCEPT_ENCODING,"identity").send().await.ok()?;
    if response.status()!=reqwest::StatusCode::PARTIAL_CONTENT{return None;}
    let content_range=response.headers().get(reqwest::header::CONTENT_RANGE)?.to_str().ok()?;
    if !content_range.starts_with(&format!("bytes {start}-")){return None;}
    let limit=usize::try_from(end-start+1).ok()?;
    let mut bytes=Vec::new();
    while let Some(chunk)=response.chunk().await.ok()?{if bytes.len()+chunk.len()>limit{return None;}bytes.extend_from_slice(&chunk);}
    Some(bytes)
}
pub async fn probe(client:&reqwest::Client,url:&str,extension:&str,size:Option<u64>)->bool {
    if !matches!(extension,"zip"|"rar"){return false;}
    let inspect=async {
        let end=size.map(|s|s.saturating_sub(1).min(65535)).unwrap_or(65535);
        if let Some(bytes)=range(client,url,0,end).await {if encrypted_header(&bytes){return true;}}
        if extension=="zip" {if let Some(total)=size.filter(|s|*s>0){let start=total.saturating_sub(131072);if let Some(tail)=range(client,url,start,total-1).await{return encrypted_zip_directory(&tail,start,total);}}}
        false
    };
    tokio::time::timeout(std::time::Duration::from_secs(4),inspect).await.unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn local(encrypted:bool,payload:&[u8])->Vec<u8>{
        let mut bytes=vec![0u8;30];bytes[..4].copy_from_slice(b"PK\x03\x04");
        bytes[6]=u8::from(encrypted);bytes[18..22].copy_from_slice(&(payload.len() as u32).to_le_bytes());bytes.extend_from_slice(payload);bytes
    }
    #[test]
    fn zip_inspects_real_headers_and_skips_signatures_inside_payload(){
        assert!(encrypted_header(&local(true,b"data")));
        assert!(!encrypted_header(&local(false,&local(true,b"fake"))));
        let mut mixed=local(false,b"first");mixed.extend(local(true,b"second"));assert!(encrypted_header(&mixed));
        assert!(!encrypted_header(b"PK\x03\x04\0\0\x01"));
    }
    #[test]
    fn zip_tail_follows_the_directory_offset(){
        let mut tail=vec![0u8;46];tail[..4].copy_from_slice(b"PK\x01\x02");tail[8]=1;
        let mut end=vec![0u8;22];end[..4].copy_from_slice(b"PK\x05\x06");end[10]=1;end[16..20].copy_from_slice(&1000u32.to_le_bytes());tail.extend(end);
        assert!(encrypted_zip_directory(&tail,1000,1068));
        assert!(!encrypted_zip_directory(&tail,1001,1069));
    }
    #[test]
    fn rar_header_encryption_is_detected_and_unknown_data_is_not(){
        let mut rar4=b"Rar!\x1a\x07\x00".to_vec();rar4.extend([0,0,0x73,0x80,0,13,0,0,0,0,0,0,0]);assert!(encrypted_header(&rar4));
        let mut rar5=b"Rar!\x1a\x07\x01\x00".to_vec();rar5.extend([0,0,0,0,21,4,0]);rar5.extend([0;19]);assert!(encrypted_header(&rar5));
        assert!(!encrypted_header(b"7z\xbc\xaf\x27\x1c"));
        for size in 0..rar5.len(){assert!(!encrypted_header(&rar5[..size]));}
    }
}
