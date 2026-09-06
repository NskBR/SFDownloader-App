use reqwest::Url;

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
