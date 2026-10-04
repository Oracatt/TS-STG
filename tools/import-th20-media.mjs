import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const reference=path.resolve(process.argv[2]??'D:/AIWorkspace/Touhou20Reconstruction');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'games/touhou20/assets/audio');
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(reference,'source_reconstruction/audio_runtime/audio_constants.cpp'),'utf8');
const definitions=[...source.slice(source.indexOf('effect_definitions'),source.indexOf('effect_filenames')).matchAll(/\{\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\}/g)]
  .map(m=>({id:+m[1],fileIndex:+m[2],volume:+m[3],cooldown:+m[4],playFlags:+m[5],retained:+m[6]}));
const names=[...source.slice(source.indexOf('effect_filenames')).matchAll(/"([^"]+\.wav)"/g)].map(m=>m[1]);
if(definitions.length!==90||names.length!==72)throw new Error('Original sound table shape changed');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const files=names.map(name=>{
  const bytes=fs.readFileSync(path.join(reference,'assets/raw',name));fs.writeFileSync(path.join(out,name),bytes);
  return {name,path:`games/touhou20/assets/audio/${name}`,sha256:hash(bytes)};
});
const loops=JSON.parse(fs.readFileSync(path.join(reference,'assets/bgm/loops.json'),'utf8'));
const music=['th20_01.wav','th20_02.wav','th128_08.wav'].map(name=>{
  const bytes=fs.readFileSync(path.join(reference,'assets/bgm',name));fs.writeFileSync(path.join(out,name),bytes);
  return {name,path:`games/touhou20/assets/audio/${name}`,sha256:hash(bytes),...loops[name]};
});
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({format:'th20-original-audio',definitions,files,music,sourceSha256:hash(Buffer.from(source))},null,2));
console.log(`Imported ${definitions.length} sound definitions, ${files.length} sound table entries and ${music.length} original music tracks`);
