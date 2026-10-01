import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const target = path.resolve(root, process.env.CARGO_TARGET_DIR || 'src-tauri/target', 'release');
const destination = path.join(root, 'release', `v${version}`);
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
if (process.platform !== 'win32') throw new Error('Esta release requer Windows.');
if (!process.argv.includes('--package-only')) {
  run('node', [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', '--bundles', 'nsis,msi']);
}

// Keep earlier releases and running applications intact. Each version has its own folder.
fs.mkdirSync(destination, { recursive: true });
const files = [];
const copy = (source, name = path.basename(source)) => {
  const output = path.join(destination, name);
  fs.copyFileSync(source, output);
  files.push(output);
};
const executable = path.join(target, 'SFDownloader.exe');
const quotedExe = executable.replaceAll("'", "''");
const actualVersion = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Item -LiteralPath '${quotedExe}').VersionInfo.ProductVersion`], { encoding: 'utf8', windowsHide: true }).trim();
if (actualVersion !== version) throw new Error(`Executável ${actualVersion} não corresponde à versão ${version}.`);
copy(executable);
for (const [directory, name] of [
  ['nsis', `SFDownloader_${version}_x64-setup.exe`],
  ['msi', `SFDownloader_${version}_x64_en-US.msi`],
]) copy(path.join(target, 'bundle', directory, name));

// Media downloads need the bundled tools alongside the portable executable.
const portable = path.join(destination, 'portable');
fs.mkdirSync(portable, { recursive: true });
fs.copyFileSync(executable, path.join(portable, 'SFDownloader.exe'));
fs.cpSync(path.join(root, 'src-tauri/resources/media-tools'), path.join(portable, 'media-tools'), { recursive: true });
const portableZip = path.join(destination, `SFDownloader_${version}_x64-portable.zip`);
run('tar.exe', ['-a', '-cf', portableZip, '-C', portable, '.']);
files.push(portableZip);

const extensionVersion = JSON.parse(fs.readFileSync(path.join(root, 'browser-extension/manifest.firefox.json'), 'utf8')).version;
copy(path.join(root, 'browser-extension/release', `sf_downloader_integration-chromium-${extensionVersion}.zip`));
copy(path.join(root, 'browser-extension/release', `7c2944a3066543438b23-${extensionVersion}.xpi`), `sf_downloader_integration-firefox-${extensionVersion}.xpi`);
const checksums = files.map(file => `${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}  ${path.basename(file)}`).join('\n');
fs.writeFileSync(path.join(destination, 'SHA256SUMS.txt'), checksums + '\n');
console.log(`Release ${version} preparada localmente: ${destination}`);
for (const file of files) console.log(`  ${path.basename(file)}`);
