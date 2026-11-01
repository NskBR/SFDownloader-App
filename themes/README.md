# Game wallpapers

Full-resolution PNG files are hosted in `wallpapers/` and downloaded on demand from the main branch. The app bundles only small previews. `manifest.json` pins file names, sizes and SHA-256 hashes; changing a wallpaper requires updating the manifest and shipping the corresponding app update.

Files are saved in the user app-data `theme-images` directory and verified before use. No download occurs when opening settings; clicking a theme downloads and applies it. Installed themes remain available offline. A failed download keeps the current theme.

Auxiliary windows use separate `-compact` (up to 720×420) and `-medium` (up to 1280×800) PNGs. Downloading a theme caches all three versions. Existing installations offer download again to fill the missing variants.
