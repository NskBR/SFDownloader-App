# Game wallpapers

## Directory organization and legacy compatibility

Current assets are organized as `wallpapers/<theme>/main.png`, `medium.png` and `compact.png`. Wallpaper variations use `wallpapers/<theme>/<variation>/` with the same three filenames. The current manifest references only these organized paths.

Twelve PNGs intentionally remain directly inside `wallpapers/`: `cyberpunk`, `cs2`, `star-citizen` and `god-of-war-ragnarok`, each with its original, `-medium` and `-compact` files. The published manifests for **v1.1.0, v1.1.1 and v1.1.2** download these exact URLs from the main branch. They are compatibility assets, not unused files. Moving or deleting them would prevent older installed apps from downloading those themes. Do not remove them while those releases are supported.

Other flat copies that were not referenced by published releases were removed after verifying their organized equivalents and SHA-256 hashes. New themes and variations must use folders; do not add new flat PNGs.

Full-resolution PNG files are hosted in `wallpapers/` and downloaded on demand from the main branch. The app bundles only small previews. `manifest.json` pins file names, sizes and SHA-256 hashes; changing a wallpaper requires updating the manifest and shipping the corresponding app update.

Files are saved in the user app-data `theme-images` directory and verified before use. No download occurs when opening settings; clicking a theme downloads and applies it. Installed themes remain available offline. A failed download keeps the current theme.

Auxiliary windows use separate `-compact` (up to 720×420) and `-medium` (up to 1280×800) PNGs. Downloading a theme caches all three versions. Existing installations offer download again to fill the missing variants.

The collection also includes Valorant, League of Legends, Overwatch, Among Us, GTA VI, GTA San Andreas, The Last of Us Part II, Red Dead Redemption 2 and Minecraft. User-provided artwork is published with descriptive game filenames; original source files remain untouched. Each theme has its own card/navigation styling and a restrained outer silhouette. Status colors and multi-selection remain functional.
