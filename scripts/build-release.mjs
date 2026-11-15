import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const destination = path.join(root, 'release', `v${version}`);
const triple = 'x86_64-pc-windows-msvc';
const target = path.resolve(root, process.env.CARGO_TARGET_DIR || 'src-tauri/target', triple, 'release');
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });

if (process.platform !== 'win32') throw new Error('Esta release requer Windows.');
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('Defina uma versão X.Y.Z no package.json.');
}

const installerName = `SFDownloader_${version}_x64-setup.exe`;
const output = path.join(destination, installerName);
if (fs.existsSync(output)) throw new Error(`Já existe um instalador para ${version}. Incremente a versão no package.json.`);

const tauri = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const vitest = path.join(root, 'node_modules/vitest/vitest.mjs');
if (![tauri, vitest].every(file => fs.existsSync(file))) throw new Error('Instale as dependências com npm ci.');
run('node', ['scripts/sync-versions.mjs', '--check']);
run('node', [vitest, 'run', '--configLoader', 'runner']);
run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/test-backend.ps1']);
run('node', [tauri, 'build', '--target', triple, '--bundles', 'nsis']);

const executable = path.join(target, 'SFDownloader.exe');
const quotedExe = executable.replaceAll("'", "''");
const actualVersion = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Item -LiteralPath '${quotedExe}').VersionInfo.ProductVersion`], { encoding: 'utf8', windowsHide: true }).trim();
if (actualVersion !== version) throw new Error(`Executável ${actualVersion} não corresponde à versão ${version}.`);

const installer = path.join(target, 'bundle', 'nsis', installerName);
const fd = fs.openSync(installer, 'r');
try {
  const magic = Buffer.alloc(2);
  if (fs.readSync(fd, magic, 0, magic.length, 0) !== 2 || magic.toString('ascii') !== 'MZ') {
    throw new Error('Instalador NSIS inválido.');
  }
} finally {
  fs.closeSync(fd);
}

fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(installer, output, fs.constants.COPYFILE_EXCL);
const sourceZip = path.join(destination, `SFDownloader_${version}_media-sources.zip`);
const files = [output];
if (fs.existsSync(sourceZip)) files.push(sourceZip);
else console.warn('O pacote local de fontes de mídia pode ser gerado separadamente.');
const checksums = (await Promise.all(files.map(async file => {
  const digest = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return `${digest.digest('hex')}  ${path.basename(file)}`;
}))).join('\n');
fs.writeFileSync(path.join(destination, 'SHA256SUMS.txt'), checksums + '\n');
console.log(`Release ${version} preparada localmente: ${destination}`);
for (const file of files) console.log(`  ${path.basename(file)}`);
