// Private demonstration skin: original artwork/music, never SDK payload.
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {decodeAnm} from '@ts-stg/thlib/touhou';

const root=resolve(import.meta.dirname,'..');
const reference=resolve(process.argv[2]??'D:/AIWorkspace/Touhou20Reconstruction');
const output=resolve(root,'games/rushboss/assets/portrait');
if(output===reference||output.startsWith(reference+'\\'))throw new Error('Reference is read-only');
const imported=spawnSync(process.execPath,[resolve(root,'tools/import-th20-assets.mjs'),
  '--reference',reference,'--archives','ebg00','--out',output],{cwd:root,encoding:'utf8'});
if(imported.status!==0)throw new Error(imported.stderr||imported.stdout);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(readFileSync(resolve(output,'manifest.json'),'utf8'));
// All Rush music is extracted from thsrc.smx by import-rushboss-assets.mjs.
// Private TH20 visual skins do not supply music for this demo.
delete manifest.music;
const spellSkins={},captions={};
function filteredArchive(name,rootScript){
  const raw=readFileSync(resolve(reference,'assets/raw',`${name}.anm`)),archive=decodeAnm(raw,name),scripts=new Set([rootScript]);
  for(const id of scripts)for(const instruction of archive.scripts[id].instructions)
    if(instruction.opcode===500)scripts.add(instruction.args[0]);
  const sprites=new Set();
  for(const id of scripts)for(const instruction of archive.scripts[id].instructions)
    if(instruction.opcode===300&&archive.sprites[instruction.args[0]])sprites.add(instruction.args[0]);
  // ANM sprite IDs are archive-wide: a caption's script entry may reference
  // the image in the next entry. Follow the actual sprite dependency too.
  const entries=new Set([...sprites].map(id=>archive.sprites[id].entry));
  for(const script of archive.scripts)if(!scripts.has(script.index)){
    script.instructions=[{offset:0,opcode:-1,size:0,time:-1,mask:0,args:[]}];script.excluded=true;
  }
  for(const entry of archive.entries){
    if(!entries.has(entry.index)){entry.texture={kind:'excluded'};continue;}
    const t=entry.texture;if(!['png','jpeg'].includes(t.kind))throw new Error(`Expected embedded original texture ${name}:${entry.index}`);
    const bytes=raw.subarray(t.offset,t.offset+t.length),file=resolve(output,'textures',name,`entry-${entry.index}.${t.kind==='png'?'png':'jpg'}`);
    mkdirSync(resolve(output,'textures',name),{recursive:true});writeFileSync(file,bytes);
    t.path=relative(root,file).replaceAll('\\','/');t.sha256=hash(bytes);
  }
  archive.source={file:`${name}.anm`,sha256:hash(raw),bytes:raw.length};
  archive.selection={rootScript,scripts:[...scripts],sprites:[...sprites],entries:[...entries],notice:'Original selected background/title animations; Boss body and portrait entries excluded. Selected IDs and instructions remain unchanged; excluded scripts are explicit terminated tombstones.'};
  const file=resolve(output,'anm',`${name}.json`);writeFileSync(file,JSON.stringify(archive));
  manifest.archives[name]={path:relative(root,file).replaceAll('\\','/'),sourceSha256:hash(raw),...archive.selection};
  return{archive:name,rootScript};
}
for(const [key,index]of Object.entries({sunny:1,monstone:2,artia:3})){
  spellSkins[key]=filteredArchive(`st0${index}enm`,index===3?10:13);
  captions[key]=filteredArchive(`st0${index}logo`,2);
}
manifest.skin={background:'ebg00:1',spellSkins,captions,notice:'Original 2D spell background and music-caption ANMs are injected private skins. The original three 3D stages and specific TH20 Boss identities are not part of this demo.'};
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,background:manifest.archives.ebg00,music:'games/rushboss/assets/manifest.json'},null,2));
