use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager, WebviewWindow};

const MAX_FONT_BYTES: u64 = 10 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
pub struct ImportedFont {
    id: String,
    name: String,
}

fn valid_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("fonts"))
}
fn validate_font(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 12
        || bytes.len() as u64 > MAX_FONT_BYTES
        || !matches!(&bytes[..4], b"\0\x01\0\0" | b"OTTO")
    {
        return Err("Escolha uma fonte TTF ou OTF válida, de até 10 MB.".into());
    }
    let count = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
    if count == 0 || count > 4096 || 12 + count * 16 > bytes.len() {
        return Err("Estrutura da fonte inválida.".into());
    }
    for record in bytes[12..12 + count * 16].chunks_exact(16) {
        let offset = u32::from_be_bytes(record[8..12].try_into().unwrap()) as u64;
        let size = u32::from_be_bytes(record[12..16].try_into().unwrap()) as u64;
        if offset + size > bytes.len() as u64 {
            return Err("A fonte está incompleta ou corrompida.".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn import_custom_font(
    app: AppHandle,
    window: WebviewWindow,
    path: String,
) -> Result<ImportedFont, String> {
    if window.label() != "main" {
        return Err("Importe a fonte pelas configurações do aplicativo.".into());
    }
    let path = Path::new(&path);
    if !path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("ttf") || e.eq_ignore_ascii_case("otf"))
    {
        return Err("Escolha um arquivo .ttf ou .otf.".into());
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|_| "Não foi possível abrir a fonte.")?
        .take(MAX_FONT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Não foi possível ler a fonte.")?;
    validate_font(&bytes)?;
    let font = ImportedFont {
        id: format!("{:x}", Sha256::digest(&bytes)),
        name: path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Fonte importada")
            .chars()
            .take(120)
            .collect(),
    };
    let root = directory(&app)?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    std::fs::write(root.join(format!("{}.font", font.id)), bytes).map_err(|e| e.to_string())?;
    std::fs::write(
        root.join(format!("{}.json", font.id)),
        serde_json::to_vec(&font).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(font)
}

#[tauri::command]
pub fn list_custom_fonts(app: AppHandle) -> Result<Vec<ImportedFont>, String> {
    let root = directory(&app)?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut fonts = Vec::new();
    for entry in std::fs::read_dir(&root)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        if entry.path().extension().and_then(|e| e.to_str()) != Some("json")
            || entry.metadata().map(|m| m.len() > 4096).unwrap_or(true)
        {
            continue;
        }
        let Ok(bytes) = std::fs::read(entry.path()) else {
            continue;
        };
        if let Ok(font) = serde_json::from_slice::<ImportedFont>(&bytes) {
            if valid_id(&font.id) && root.join(format!("{}.font", font.id)).is_file() {
                fonts.push(font);
            }
        }
    }
    fonts.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(fonts)
}

#[tauri::command]
pub fn read_custom_font(app: AppHandle, id: String) -> Result<String, String> {
    if !valid_id(&id) {
        return Err("Identificação da fonte inválida.".into());
    }
    let path = directory(&app)?.join(format!("{id}.font"));
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|_| "A fonte importada não está disponível neste computador.")?
        .take(MAX_FONT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    validate_font(&bytes)?;
    if format!("{:x}", Sha256::digest(&bytes)) != id {
        return Err("A fonte importada foi alterada. Importe o arquivo novamente.".into());
    }
    Ok(format!(
        "data:font/{};base64,{}",
        if bytes.starts_with(b"OTTO") {
            "otf"
        } else {
            "ttf"
        },
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unsafe_identifiers_and_corrupt_font_tables() {
        assert!(valid_id(&"a".repeat(64)));
        for id in ["../outside", "a.font", ""] {
            assert!(!valid_id(id));
        }
        assert!(validate_font(b"not a font").is_err());
        let mut header = vec![0; 28];
        header[..4].copy_from_slice(b"OTTO");
        header[5] = 1;
        header[20..24].copy_from_slice(&100_u32.to_be_bytes());
        assert!(validate_font(&header).is_err());
    }
}
