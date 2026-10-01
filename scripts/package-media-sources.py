"""Package the audited local source cache; never build or publish remotely."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / "scripts/media-sources.lock.json"
inventory = json.loads(LOCK.read_text(encoding="utf-8"))
version = inventory["release"].removeprefix("v")
cache = ROOT / "scratch/media-sources"
destination = ROOT / "release" / inventory["release"]
destination.mkdir(parents=True, exist_ok=True)

for entry in inventory["archives"]:
    source = cache / entry["file"]
    if not source.is_file():
        raise SystemExit(f"Missing audited source: {entry['file']}; extract the release source bundle into scratch/media-sources.")
    with source.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    if digest != entry["sha256"]:
        raise SystemExit(f"Source checksum mismatch: {entry['file']}")

archive_path = destination / f"SFDownloader_{version}_media-sources.zip"
with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
    for entry in inventory["archives"]:
        archive.write(cache / entry["file"], "sources/" + entry["file"])
    archive.write(LOCK, "media-sources.lock.json")
    archive.write(ROOT / "scripts/media-tools-third-party-licenses.txt", "THIRD-PARTY-LICENSES.txt")
    archive.write(ROOT / "scripts/media-tools.lock.json", "media-tools.lock.json")
    for name in ["ffmpeg-source.tar.gz", "ffmpeg-build-recipes.tar.gz", "ffmpeg-build-configuration.txt", "THIRD-PARTY-NOTICES.txt", "yt-dlp-third-party-licenses.txt"]:
        archive.write(ROOT / "src-tauri/resources/media-tools/licenses" / name, name)
    archive.writestr("README.txt", """SFDownloader media-tool sources

Sources use the supplier-pinned revisions and registry checksums recorded in
media-sources.lock.json. The FFmpeg build recipes include patches, configuration
and build instructions. Put gitlink source archives at their recorded paths in
the parent project. Registry .crate files are gzip tar source archives and may
be used by Cargo/vendor. AMF contains only the public headers and root notices
used by the pinned build recipe, excluding unrelated proprietary sample SDKs.

Build and test dependencies unused on Windows are included; their presence does
not imply runtime use. The supplier's build environment uses rolling OS packages
and a build-time update of cc. Bit-for-bit reproduction is not asserted.
FFmpeg and ffprobe use LGPL 3, without --enable-gpl or --enable-nonfree, and can
run independently with their separate libav DLLs. Source code may be modified
and rebuilt under its respective upstream licenses; copyrights belong to the
upstream authors. GCC runtime exception/license texts are in the notices.
The source inventory and reproduced notices accompany the binary installers.
""")
print(f"Packaged {len(inventory['archives'])} verified source archives: {archive_path}")
