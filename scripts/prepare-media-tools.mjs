import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/media-tools.lock.json'), 'utf8'));
const dest = path.join(root, 'src-tauri/resources/media-tools');
const cache = path.join(root, 'scratch/media-tools');
const hash = data => createHash('sha256').update(data).digest('hex');
const pinnedFiles = Object.assign({}, ...manifest.tools.map(tool => tool.files));
const manifestHash = hash(JSON.stringify(manifest) + fs.readFileSync(path.join(root, 'scripts/media-tools-NOTICES.txt'), 'utf8'));
fs.mkdirSync(dest, { recursive: true });
fs.mkdirSync(cache, { recursive: true });
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('As ferramentas de mídia desta versão requerem Windows x64.');
const verificationFile = path.join(dest, 'verified-tools.json');
try {
  const saved = JSON.parse(fs.readFileSync(verificationFile, 'utf8'));
  if (saved.manifestHash === manifestHash && Object.entries(pinnedFiles).every(([name, sha]) => hash(fs.readFileSync(path.join(dest, name))) === sha)
      && manifest.notices.every(notice => hash(fs.readFileSync(path.join(dest, 'licenses', notice.name))) === notice.sha256)) {
    console.log('Ferramentas de mídia verificadas (cache local).');
    process.exit(0);
  }
} catch { /* Prepare or repair an incomplete local bundle. */ }

for (const tool of manifest.tools) {
  const archive = path.join(cache, tool.file);
  if (!fs.existsSync(archive) || hash(fs.readFileSync(archive)) !== tool.sha256) {
    console.log(`Baixando ${tool.name} ${tool.version}...`);
    const response = await fetch(tool.url);
    if (!response.ok) throw new Error(`Falha ao obter ${tool.name}: HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (hash(data) !== tool.sha256) throw new Error(`SHA-256 inválido: ${tool.name}`);
    fs.writeFileSync(archive, data);
  }
  if (tool.file.endsWith('.zip')) {
    const unpacked = path.join(cache, tool.name);
    const entries = execFileSync('tar.exe', ['-tf', archive], { windowsHide: true, encoding: 'utf8' }).split(/\r?\n/);
    if (entries.some(p => p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split(/[\\/]/).includes('..'))) throw new Error('Caminho inseguro no pacote.');
    fs.mkdirSync(unpacked, { recursive: true });
    execFileSync('tar.exe', ['-xf', archive, '-C', unpacked], { windowsHide: true });
    const visit = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const source = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(source);
        else if (/\.(exe|dll)$/i.test(entry.name) && entry.name !== 'ffplay.exe') fs.copyFileSync(source, path.join(dest, entry.name));
        else if (/license|copying|notice|readme/i.test(entry.name)) {
          const notices = path.join(dest, 'licenses', tool.name);
          fs.mkdirSync(notices, { recursive: true });
          fs.copyFileSync(source, path.join(notices, entry.name));
        }
      }
    };
    visit(unpacked);
  } else fs.copyFileSync(archive, path.join(dest, tool.file));
}

for (const notice of manifest.notices ?? []) {
  const target = path.join(dest, 'licenses', notice.name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target) || hash(fs.readFileSync(target)) !== notice.sha256) {
    let data;
    if (notice.localPath) {
      const source = path.resolve(root, notice.localPath);
      if (!source.startsWith(root + path.sep)) throw new Error('Caminho de aviso local inválido.');
      data = fs.readFileSync(source);
    } else {
      const response = await fetch(notice.url);
      if (!response.ok) throw new Error(`Licença/fonte indisponível: ${notice.name}`);
      data = Buffer.from(await response.arrayBuffer());
    }
    if (hash(data) !== notice.sha256) throw new Error(`SHA-256 inválido: ${notice.name}`);
    fs.writeFileSync(target, data);
  }
}
const version = execFileSync(path.join(dest, 'ffmpeg.exe'), ['-version'], { windowsHide: true, encoding: 'utf8' });
fs.writeFileSync(path.join(dest, 'licenses', 'ffmpeg-build-configuration.txt'), version);
fs.copyFileSync(path.join(root, 'scripts', 'media-tools-NOTICES.txt'), path.join(dest, 'licenses', 'THIRD-PARTY-NOTICES.txt'));
if (version.includes('--enable-gpl') || version.includes('--enable-nonfree')) throw new Error('Build FFmpeg não redistribuível pelo perfil LGPL.');
if (!execFileSync(path.join(dest, 'ffmpeg.exe'), ['-encoders'], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).includes('libmp3lame')) throw new Error('FFmpeg sem encoder MP3.');
const files = Object.fromEntries(fs.readdirSync(dest).filter(f => /\.(exe|dll)$/i.test(f)).map(f => [f, hash(fs.readFileSync(path.join(dest, f)))]));
for (const [name, sha] of Object.entries(pinnedFiles)) if (files[name] !== sha) throw new Error(`Arquivo extraído não corresponde ao manifesto: ${name}`);
fs.writeFileSync(verificationFile, JSON.stringify({ manifestHash, tools: manifest.tools, files }, null, 2));
console.log('Ferramentas de mídia verificadas e prontas para o pacote local.');
