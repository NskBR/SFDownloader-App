# Game wallpapers

Full-resolution PNG files are hosted in `wallpapers/` and downloaded on demand from the main branch. The app bundles only small previews. `manifest.json` pins file names, sizes and SHA-256 hashes; changing a wallpaper requires updating the manifest and shipping the corresponding app update.

Files are saved in the user app-data `theme-images` directory and verified before use. No download occurs when opening settings; clicking a theme downloads and applies it. Installed themes remain available offline. A failed download keeps the current theme.
