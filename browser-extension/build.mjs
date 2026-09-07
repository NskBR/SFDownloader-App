import { cp, mkdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const project = dirname(root);
const dist = join(root, "dist");
const release = join(root, "release");

await rm(dist, { recursive: true, force: true });
await mkdir(release, { recursive: true });

for (const target of ["chromium", "firefox"]) {
  const out = join(dist, target);
  await mkdir(join(out, "icons"), { recursive: true });
  
  for (const file of ["background.js", "content.js", "popup.html", "popup.css", "popup.js"]) {
    await cp(join(root, "src", file), join(out, file));
  }
  
  const manifestContent = await readFile(join(root, `manifest.${target}.json`), "utf8");
  const manifest = JSON.parse(manifestContent);
  const version = manifest.version;
  
  await writeFile(join(out, "manifest.json"), manifestContent);
  await cp(join(project, "src-tauri", "icons", "32x32.png"), join(out, "icons", "sf-small.png"));
  await cp(join(project, "src-tauri", "icons", "128x128.png"), join(out, "icons", "sf-large.png"));
  await cp(join(project, "src-tauri", "icons", "32x32_off.png"), join(out, "icons", "sf-small-off.png"));
  await cp(join(project, "src-tauri", "icons", "128x128_off.png"), join(out, "icons", "sf-large-off.png"));
  
  console.log(`Empacotando ${target} v${version}...`);
  
  const webExt = join(project, "node_modules", "web-ext", "bin", "web-ext.js");
  
  execFileSync(
    process.execPath,
    [webExt, "build", "--source-dir", out, "--artifacts-dir", release, "--overwrite-dest"],
    {
      stdio: "inherit",
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    },
  );

  const originalZip = join(release, `sf_downloader_integration-${version}.zip`);
  const targetZip = join(release, `sf_downloader_integration-${target}-${version}.zip`);

  await rm(targetZip, { force: true });
  await rename(originalZip, targetZip);
  console.log(`Sucesso: ${targetZip}`);
}
