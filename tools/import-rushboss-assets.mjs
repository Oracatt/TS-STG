import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// TouhouRushBoss's ManagedStream SMX container stores UTF-16LE names and
// independently compressed gzip members. Extract media/font data plus the
// original HLSL shader source as business-layer reference; never executables.
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = path.resolve(arg('--source', 'D:/c++/TouhouRushBoss-main'));
const output = path.resolve(arg('--out', path.join(workspace, 'games/rushboss/assets')));
const check = args.includes('--check');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const archivePath = path.join(source, 'src/thsrc.smx');
const archive = await readFile(archivePath);
const files = {};
let offset = 0;
const need = n => { if (offset + n > archive.length) throw new Error(`Truncated SMX header at ${offset}`); };
while (offset < archive.length) {
  need(3);
  const type = archive[offset++];
  const nameBytes = archive.readUInt16LE(offset); offset += 2;
  if (!nameBytes || nameBytes % 2) throw new Error(`Invalid UTF-16 name at ${offset}`);
  need(nameBytes);
  const archiveName = archive.subarray(offset, offset + nameBytes).toString('utf16le'); offset += nameBytes;
  if (type === 1) continue;
  if (type !== 0 && type !== 2) throw new Error(`Unknown SMX record type ${type}`);
  need(28);
  const rawSize = Number(archive.readBigInt64LE(offset));
  const storedSize = Number(archive.readBigInt64LE(offset + 8));
  const dataOffset = Number(archive.readBigInt64LE(offset + 16));
  const year = archive.readUInt16LE(offset + 24), month = archive[offset + 26], day = archive[offset + 27];
  offset += 28;
  if (!Number.isSafeInteger(rawSize) || !Number.isSafeInteger(storedSize) || rawSize < 0 || storedSize < 0 || dataOffset !== offset) throw new Error(`Invalid SMX bounds: ${archiveName}`);
  need(storedSize);
  const data = archive.subarray(offset, offset + storedSize); offset += storedSize;
  const relative = archiveName.split('\\').slice(1).join('/');
  if (!( /^(image|sound|bgm|font)\//.test(relative) && /\.(png|wav|ttf|otf)$/i.test(relative)) && !( /^shader\//.test(relative) && /\.(fx|hlsl)$/i.test(relative))) continue;
  if (relative.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(relative)) throw new Error(`Unsafe archive path: ${archiveName}`);
  if (files[relative]) throw new Error(`Duplicate archive path: ${relative}`);
  const bytes = type === 0 ? gunzipSync(data, { maxOutputLength: rawSize + 1 }) : data;
  if (bytes.length !== rawSize) throw new Error(`SMX unpacked length differs: ${relative}`);
  const item = { file: relative, bytes: rawSize, sha256: hash(bytes), archiveName, archiveOffset: dataOffset, compressed: type === 0, date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
  if (relative.endsWith('.png')) {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error(`Not a PNG: ${relative}`);
    item.width = bytes.readUInt32BE(16); item.height = bytes.readUInt32BE(20);
  }
  const target = path.join(output, ...relative.split('/'));
  if (check) { if (hash(await readFile(target)) !== item.sha256) throw new Error(`Imported bytes differ: ${relative}`); }
  else { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
  files[relative] = item;
}

// SMX uses Windows case-insensitive lookup. Prefer the original SIMYOU.TTF;
// only fall back to the installed Windows YouYuan if an alternate pack lacks it.
const supplementalFonts = [['font/simyou.ttf', 'C:/Windows/Fonts/simyou.ttf']];
for (const [relative, original] of supplementalFonts) {
  if (Object.keys(files).some(name => name.toLowerCase() === relative.toLowerCase())) continue;
  try {
    await stat(original);
    const bytes = await readFile(original);
    const item = { file: relative, bytes: bytes.length, sha256: hash(bytes), source: original, rights: 'Microsoft Windows system font; local-only, not covered by the game GPL or engine MIT license' };
    const target = path.join(output, ...relative.split('/'));
    if (check) { if (hash(await readFile(target)) !== item.sha256) throw new Error(`Font differs: ${relative}`); }
    else { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
    files[relative] = item;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const textureAliases = {};
for (const filename of ['Source.cpp', 'LevelResources.cpp']) {
  const cpp = await readFile(path.join(source, 'src', filename), 'utf8');
  for (const match of cpp.matchAll(/loader\.AddSource\((src_[A-Za-z0-9_]+)(?:\[(\d+)\])?,\s*"([^"]+)"\)/g)) {
    const name = match[1] + (match[2] === undefined ? '' : `_${match[2]}`);
    const relative = match[3].replace(/\\\\/g, '/');
    if (!files[relative]) throw new Error(`Required texture missing: ${name}: ${relative}`);
    textureAliases[name] = relative;
  }
}
const sounds = {};
const soundCpp = await readFile(path.join(source, 'src/SoundEffect.cpp'), 'utf8');
for (const match of soundCpp.matchAll(/loader\.AddSoundEffect\((se_\w+),\s*"([^"]+)"(?:,\s*([\d.]+))?(?:,\s*([\d.]+))?\)/g)) {
  const relative = match[2].replace(/\\\\/g, '/');
  if (!files[relative]) throw new Error(`Required sound missing: ${match[1]}`);
  sounds[match[1]] = { file: relative, volume: Number(match[3] ?? 1), interval: Number(match[4] ?? 0) };
}
const music = {
  gamestart: { file: 'bgm/花の映る塚.wav', loopBegin: 0, loopEnd: 13805768 },
  title: { file: 'bgm/魂の花.wav', loopBegin: 549000, loopEnd: 15450000 },
  grassland: { file: 'bgm/いたずらに命をかけて.wav', loopBegin: 159600, loopEnd: 13020000 },
  riverside: { file: 'bgm/お惠みサマーレイソ.wav', loopBegin: 217500, loopEnd: 10800000 },
  frozenforest: { file: 'bgm/凝霜的魇花.wav', loopBegin: 2450504, loopEnd: 17569000 },
};
for (const item of Object.values(music)) {
  if (!files[item.file]) throw new Error(`Required music missing: ${item.file}`);
  const bytes = await readFile(path.join(output, ...item.file.split('/')));
  let p = 12;
  while (p + 8 <= bytes.length) {
    const type = bytes.toString('ascii', p, p + 4), size = bytes.readUInt32LE(p + 4);
    if (type === 'fmt ') { item.channels = bytes.readUInt16LE(p + 10); item.sampleRate = bytes.readUInt32LE(p + 12); break; }
    p += 8 + size + (size & 1);
  }
  if (!item.sampleRate) throw new Error(`WAV sample rate absent: ${item.file}`);
}
const originalTextFont = Object.keys(files).find(name => name.toLowerCase() === 'font/simyou.ttf');
const manifest = { format: 'ts-stg-rushboss-assets-v1', source: { project: 'TouhouRushBoss-main', path: source.replace(/\\/g, '/'), archive: 'src/thsrc.smx', sha256: hash(archive), codeLicense: 'GPL-3.0', note: 'Original assets extracted unchanged; no source executables are executed or copied.' }, files, textures: textureAliases, sounds, music, fonts: { text: originalTextFont || 'font/digifaw.ttf', digit: 'font/digifaw.ttf' } };
const manifestBytes = JSON.stringify(manifest, null, 2) + '\n';
if (check) {
  if ((await readFile(path.join(output, 'manifest.json'), 'utf8')) !== manifestBytes) throw new Error('Imported manifest differs; reimport required');
} else {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'manifest.json'), manifestBytes);
  await copyFile(path.join(source, 'LICENSE'), path.join(output, 'SOURCE-LICENSE-GPL-3.0.txt'));
  await writeFile(path.join(output, 'NOTICE.txt'), 'Local TouhouRushBoss reference assets\n\nExtracted unchanged from src/thsrc.smx in D:/c++/TouhouRushBoss-main. Every file is recorded with its archive offset and SHA-256 in manifest.json. The upstream project code is GPL-3.0; see SOURCE-LICENSE-GPL-3.0.txt. Artwork, music, sound and fonts retain their original authors\' rights; these files are not MIT-licensed engine artwork. Microsoft YouYuan (simyou.ttf), when supplied by the installed Windows system, is independently attributed in manifest.json and is local-only. This ignored directory is for the authorized local recreation demo and is excluded from the engine SDK.\n');
}
console.log(JSON.stringify({ check, output, files: Object.keys(files).length, textures: Object.keys(textureAliases).length, sounds: Object.keys(sounds).length, archiveSha256: hash(archive) }, null, 2));
