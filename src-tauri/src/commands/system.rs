use reqwest::Url;

#[tauri::command]
pub async fn play_completion_sound() -> Result<(), String> {
    #[cfg(windows)]
    {
        return tokio::task::spawn_blocking(|| {
            use windows_sys::Win32::Media::Audio::{
                PlaySoundW, SND_MEMORY, SND_NODEFAULT, SND_SYNC,
            };
            static SOUND: &[u8] = include_bytes!("../../assets/download-complete.wav");
            // SND_MEMORY is synchronous: keep the embedded WAV alive until playback ends.
            let played = unsafe {
                PlaySoundW(
                    SOUND.as_ptr().cast::<u16>(),
                    std::ptr::null_mut(),
                    SND_MEMORY | SND_NODEFAULT | SND_SYNC,
                )
            };
            if played == 0 {
                Err("Não foi possível reproduzir o som de conclusão.".into())
            } else {
                Ok(())
            }
        })
        .await
        .map_err(|error| error.to_string())?;
    }
    #[cfg(not(windows))]
    Ok(())
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let canonical =
        crate::download::paths::canonical_existing_directory(std::path::Path::new(&path))?;
    let path = canonical.as_os_str();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let url = url.as_str();
    let parsed = Url::parse(url).map_err(|error| format!("URL inválida: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Apenas links http(s) são suportados".into());
    }

    #[cfg(target_os = "windows")]
    {
        // Não use `cmd /c start`: query strings podem conter metacaracteres
        // interpretáveis pelo shell. O Explorer usa a associação de protocolo.
        std::process::Command::new("explorer.exe")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}
