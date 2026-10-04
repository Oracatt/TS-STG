import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAnm } from '../games/touhou20/src/anm.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
let reference = 'D:/AIWorkspace/Touhou20Reconstruction', destination = resolve(root, 'games/touhou20/assets'), requested;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--reference') reference = args[++i];
  else if (args[i] === '--out') destination = resolve(root, args[++i]);
  else if (args[i] === '--archives') requested = args[++i].split(',');
  else if (args[i] === '--help') { console.log('node tools/import-th20-assets.mjs [--reference source] [--out games/touhou20/assets] [--archives pl00,pl01,...]'); process.exit(0); }
  else throw new Error(`Unknown importer argument: ${args[i]}`);
}
reference = resolve(reference);
if (destination === reference || destination.startsWith(reference + sep)) throw new Error('Reference source must remain read-only');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const relativeOutput = path => relative(root, path).split(sep).join('/');
const originals = resolve(reference, 'assets/raw');
const available = readdirSync(originals).filter(name => name.endsWith('.anm')).map(name => name.slice(0, -4));
const names = requested ?? ['pl00', 'pl01', 'enemy', 'bullet', 'effect', 'front', 'title', 'title_v', 'aura', 'text', 'ascii', 'ascii_960', 'ascii1280', 'screenswitch', ...available.filter(name => /^ebg\d+$/.test(name)), ...available.filter(name => /^item/.test(name))];
const manifest = { format: 'ts-stg-th20-local-assets', version: 1,
  notice: 'Original TH20 resources imported for local authorized restoration only. Do not redistribute.',
  reference, archives: {}, unresolvedTextures: [], runtimeTextures: [] };
mkdirSync(resolve(destination, 'anm'), { recursive: true });
for (const name of [...new Set(names)]) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`Invalid archive name: ${name}`);
  const sourcePath = resolve(originals, `${name}.anm`), raw = readFileSync(sourcePath), archive = decodeAnm(raw, name);
  archive.source = { file: `${name}.anm`, sha256: hash(raw), bytes: raw.length };
  for (const entry of archive.entries) {
    const texture = entry.texture;
    if (texture.kind === 'png' || texture.kind === 'jpeg') {
      const png = raw.subarray(texture.offset, texture.offset + texture.length);
      const imagePath = resolve(destination, 'textures', name, `entry-${entry.index}.${texture.kind === 'png' ? 'png' : 'jpg'}`);
      mkdirSync(dirname(imagePath), { recursive: true }); writeFileSync(imagePath, png);
      texture.path = relativeOutput(imagePath); texture.sha256 = hash(png);
      const extension = extname(entry.name), stem = entry.name.slice(0, -extension.length);
      const extracted = resolve(reference, 'assets/textures', name, `${stem}@${name}@${entry.index}${extension}`);
      if (existsSync(extracted)) {
        texture.referenceExtractedSha256 = hash(readFileSync(extracted));
        texture.byteMatchesExtracted = texture.referenceExtractedSha256 === texture.sha256;
      }
    } else if (texture.kind === 'external') {
      const extension = extname(entry.name), stem = entry.name.slice(0, -extension.length);
      const extracted = resolve(reference, 'assets/textures', name, `${stem}@${name}@${entry.index}${extension}`);
      if (existsSync(extracted)) {
        const png = readFileSync(extracted), imagePath = resolve(destination, 'textures', name, `entry-${entry.index}${extension}`);
        mkdirSync(dirname(imagePath), { recursive: true }); writeFileSync(imagePath, png);
        texture.path = relativeOutput(imagePath); texture.sha256 = hash(png); texture.externalExtracted = true;
      } else manifest.unresolvedTextures.push({ archive: name, entry: entry.index, name: entry.name, kind: texture.kind });
    } else (texture.kind==='dynamic'||texture.kind==='renderTarget'?manifest.runtimeTextures:manifest.unresolvedTextures).push({ archive: name, entry: entry.index, name: entry.name, kind: texture.kind });
  }
  const jsonPath = resolve(destination, 'anm', `${name}.json`);
  writeFileSync(jsonPath, JSON.stringify(archive));
  manifest.archives[name] = { path: relativeOutput(jsonPath), sourceSha256: archive.source.sha256,
    entries: archive.entries.length, sprites: archive.sprites.length, scripts: archive.scripts.length,
    opcodeCounts: archive.opcodeCounts };
}
writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ output: relativeOutput(destination), archives: Object.keys(manifest.archives).length,
  sprites: Object.values(manifest.archives).reduce((sum, archive) => sum + archive.sprites, 0),
  scripts: Object.values(manifest.archives).reduce((sum, archive) => sum + archive.scripts, 0),
  unresolvedTextures: manifest.unresolvedTextures.length }, null, 2));
