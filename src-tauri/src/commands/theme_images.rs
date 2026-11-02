use base64::Engine;

use serde::{Deserialize, Serialize};

use sha2::{Digest, Sha256};

use std::{

    io::Read,

    path::{Path, PathBuf},

};

use tauri::{AppHandle, Manager, WebviewWindow};

const MAX_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Serialize, Deserialize)]

pub struct ThemeImage {

    id: String,

    name: String,

    mime: String,

}

fn valid_id(id: &str) -> bool {

    id.len() == 64

        && id

            .bytes()

            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))

}

fn folder(app: &AppHandle) -> Result<PathBuf, String> {

    Ok(app

        .path()

        .app_data_dir()

        .map_err(|e| e.to_string())?

        .join("theme-images"))

}

fn validate(bytes: &[u8]) -> Result<&'static str, String> {

    if bytes.len() as u64 > MAX_BYTES {

        return Err("A imagem deve ter até 20 MB.".into());

    }

    let (mime, w, h, limit) =

        if bytes.len() >= 33 && &bytes[..8] == b"\x89PNG\r\n\x1a\n" && &bytes[12..16] == b"IHDR" {

            (

                "image/png",

                u32::from_be_bytes(bytes[16..20].try_into().unwrap()),

                u32::from_be_bytes(bytes[20..24].try_into().unwrap()),

                32_000_000u64,

            )

        } else if bytes.len() >= 13 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a") {

            (

                "image/gif",

                u16::from_le_bytes(bytes[6..8].try_into().unwrap()) as u32,

                u16::from_le_bytes(bytes[8..10].try_into().unwrap()) as u32,

                8_000_000u64,

            )

        } else {

            return Err("Escolha uma imagem PNG ou GIF válida.".into());

        };

    if w == 0 || h == 0 || w > 8192 || h > 8192 || w as u64 * h as u64 > limit {

        return Err("Dimensões da imagem acima do limite permitido.".into());

    }

    Ok(mime)

}

fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {

    let mut bytes = Vec::new();

    std::fs::File::open(path)

        .map_err(|_| "Imagem indisponível neste computador.")?

        .take(MAX_BYTES + 1)

        .read_to_end(&mut bytes)

        .map_err(|_| "Não foi possível ler a imagem.")?;

    Ok(bytes)

}

#[tauri::command]

pub fn import_theme_image(

    app: AppHandle,

    window: WebviewWindow,

    path: String,

) -> Result<ThemeImage, String> {

    if window.label() != "main" {

        return Err("Importe imagens pelas configurações.".into());

    }

    let bytes = read_bytes(Path::new(&path))?;

    let mime = validate(&bytes)?.to_owned();

    let image = ThemeImage {

        id: format!("{:x}", Sha256::digest(&bytes)),

        name: Path::new(&path)

            .file_name()

            .and_then(|s| s.to_str())

            .unwrap_or("Imagem")

            .chars()

            .take(120)

            .collect(),

        mime,

    };

    let root = folder(&app)?;

    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    std::fs::write(root.join(format!("{}.image", image.id)), bytes).map_err(|e| e.to_string())?;

    std::fs::write(

        root.join(format!("{}.json", image.id)),

        serde_json::to_vec(&image).map_err(|e| e.to_string())?,

    )

    .map_err(|e| e.to_string())?;

    Ok(image)

}

#[tauri::command]

pub fn list_theme_images(app: AppHandle, window: WebviewWindow) -> Result<Vec<ThemeImage>, String> {

    if window.label() != "main" {

        return Err("Acesso restrito às configurações.".into());

    }

    let root = folder(&app)?;

    if !root.exists() {

        return Ok(vec![]);

    }

    let mut images = Vec::new();

    for item in std::fs::read_dir(&root)

        .map_err(|e| e.to_string())?

        .flatten()

    {

        if item.path().extension().and_then(|e| e.to_str()) != Some("json")

            || item.metadata().map(|m| m.len() > 4096).unwrap_or(true)

        {

            continue;

        }

        if let Ok(bytes) = std::fs::read(item.path()) {

            if let Ok(image) = serde_json::from_slice::<ThemeImage>(&bytes) {

                if valid_id(&image.id) && root.join(format!("{}.image", image.id)).is_file() {

                    images.push(image);

                }

            }

        }

    }

    images.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(images)

}

#[tauri::command]

pub fn read_theme_image(app: AppHandle, id: String) -> Result<String, String> {

    // Auxiliary windows may read imported theme assets by hash only.

    // Import/list remain restricted to main; arbitrary paths are never accepted here.

    if !valid_id(&id) {

        return Err("Imagem inválida ou acesso não autorizado.".into());

    }

    let bytes = read_bytes(&folder(&app)?.join(format!("{id}.image")))?;

    if format!("{:x}", Sha256::digest(&bytes)) != id {

        return Err("A imagem importada foi alterada.".into());

    }

    let mime = validate(&bytes)?;

    Ok(format!(

        "data:{mime};base64,{}",

        base64::engine::general_purpose::STANDARD.encode(&bytes)

    ))

}

#[cfg(test)]

mod tests {

    use super::*;

    #[test]

    fn rejects_paths_active_content_and_oversized_images() {

        assert!(!valid_id("../../file"));

        assert!(!valid_id(&"A".repeat(64)));

        assert!(valid_id(&"a".repeat(64)));

        assert!(validate(b"<svg onload='alert(1)'/>").is_err());

        let mut gif = b"GIF89a".to_vec();

        gif.extend([255, 255, 255, 255, 0, 0, 0]);

        assert!(validate(&gif).is_err());

        gif[6..10].copy_from_slice(&[32, 0, 32, 0]);

        assert_eq!(validate(&gif).unwrap(), "image/gif");

    }

}



#[derive(Deserialize)]

struct GameWallpaper { id: String, file: String, sha256: String, bytes: u64 }

fn game_wallpapers() -> Result<Vec<GameWallpaper>, String> {

    serde_json::from_str(include_str!("../../../themes/manifest.json")).map_err(|e|e.to_string())

}

#[tauri::command]

pub fn installed_game_themes(app: AppHandle) -> Result<Vec<String>, String> {

    let root=folder(&app)?;

    let entries=game_wallpapers()?;
    Ok(entries.iter().filter(|entry| !entry.id.ends_with("-compact") && !entry.id.ends_with("-medium"))
      .filter(|entry| ["","-compact","-medium"].iter().all(|suffix| {
        entries.iter().find(|asset|asset.id==format!("{}{suffix}",entry.id)).is_some_and(|asset|
          read_bytes(&root.join(format!("{}.image",asset.sha256))).map(|bytes|format!("{:x}",Sha256::digest(&bytes))==asset.sha256).unwrap_or(false))
      })).map(|entry|entry.id.clone()).collect())
}

#[tauri::command]

async fn download_wallpaper(app: AppHandle, id: String) -> Result<(), String> {



    let entry=game_wallpapers()?.into_iter().find(|entry|entry.id==id).ok_or("Tema desconhecido.")?;

    let root=folder(&app)?;

    let target=root.join(format!("{}.image",entry.sha256));

    if read_bytes(&target).map(|bytes|format!("{:x}",Sha256::digest(&bytes))==entry.sha256).unwrap_or(false) { return Ok(()); }

    let url=format!("https://raw.githubusercontent.com/NskBR/SFDownloader-App/main/themes/wallpapers/{}",entry.file);

    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(60)).redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?;

    let mut response=client.get(url).send().await.map_err(|_|"Não foi possível baixar o tema. Verifique sua conexão.")?.error_for_status().map_err(|_|"Imagem do tema indisponível no GitHub.")?;

    let mut bytes=Vec::new();

    while let Some(chunk)=response.chunk().await.map_err(|_|"Download do tema interrompido.")? {

        if bytes.len()+chunk.len()>MAX_BYTES as usize {return Err("Imagem acima do limite.".into());}

        bytes.extend_from_slice(&chunk);

    }

    validate(&bytes)?;

    if bytes.len() as u64!=entry.bytes || format!("{:x}",Sha256::digest(&bytes))!=entry.sha256 {return Err("A imagem do tema não passou na verificação de integridade.".into());}

    std::fs::create_dir_all(&root).map_err(|e|e.to_string())?;

    let temporary=root.join(format!("{}.pending",entry.sha256));

    std::fs::write(&temporary,bytes).map_err(|e|e.to_string())?;

    if target.exists() { std::fs::remove_file(&target).map_err(|e|e.to_string())?; }

    std::fs::rename(temporary,target).map_err(|e|e.to_string())?;

    Ok(())

}


#[tauri::command]
pub async fn download_game_theme(app: AppHandle, window: WebviewWindow, id: String) -> Result<(), String> {
    if window.label()!="main" { return Err("Baixe temas pelas configurações.".into()); }
    let wallpapers = game_wallpapers()?;
    if id.ends_with("-compact") || id.ends_with("-medium") || !wallpapers.iter().any(|entry| entry.id == id) {
        return Err("Tema desconhecido.".into());
    }
    for suffix in ["-compact","-medium",""] {
        download_wallpaper(app.clone(),format!("{id}{suffix}")).await?;
    }
    Ok(())
}
