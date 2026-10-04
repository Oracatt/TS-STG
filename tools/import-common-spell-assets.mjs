import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Individually reviewed common effect skins. The unchanged magic-square image
// is already available from reference-common and is deliberately not duplicated.
const selected=[
  ['spell-line','eff_line.png','1bdc636e9d649a38c272602dfa281557a730838d32f43d4974d978acffc2cd03'],
  ['legacy-aura','eff_aura.png','03ee3f4d98ae94f32abce87461c329489021951477e0a2ec36b818d4ccc1b773'],
  ['legacy-petals','eff_maple.png','a9795da32b0a25827385a97971d8c031b6f6feac0e5a1926bdf00bbe5819fb50'],
];
export function buildCommonSpellAssets(source=join(root,'games/rushboss/assets')) {
  const sourceManifest=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8'));
  const files=new Map(),manifest={format:'ts-stg-sprite-pack-v1',version:1,name:'spell-common',license:'Original-resource; not MIT',notice:'NOTICE.md',textures:{},sprites:{},clips:{},provenance:{input:'Previously imported local media from TouhouRushBoss thsrc.smx',archiveSha256:sourceManifest.source.sha256,pixels:'Whole reviewed common effect atlases copied byte-for-byte; no game-specific Boss artwork'},excluded:['Boss portraits and cut-ins','Specific Boss backgrounds','Title and HUD artwork']};
  for(const [name,file,expectedHash]of selected){
    const relative=`image/effect/${file}`,bytes=readFileSync(join(source,relative)),sha256=hash(bytes),item=sourceManifest.files[relative];
    if(sha256!==item.sha256||(expectedHash&&sha256!==expectedHash))throw new Error(`Reviewed common spell texture changed: ${relative}`);
    const target=`textures/${name}.png`;files.set(target,bytes);
    manifest.textures[name]={file:target,width:item.width,height:item.height,sha256,source:{file:relative,archiveName:item.archiveName,archiveOffset:item.archiveOffset,sha256}};
  }
  const sprite=(name,texture,x,y,width,height)=>{manifest.sprites[name]={texture,x,y,width,height};};
  sprite('spell.attack-strip','spell-line',96,0,16,128);
  sprite('spell.circle-inner','spell-line',48,0,16,128);
  sprite('spell.circle-outer','spell-line',80,0,16,128);
  sprite('boss.aura-ring','legacy-aura',52,6,39,39);
  sprite('boss.aura-fire','legacy-aura',7,3,37,42);
  sprite('charge.leaf','legacy-petals',32,0,32,32);
  sprite('charge.circle','legacy-petals',0,32,32,32);
  files.set('NOTICE.md',Buffer.from('# Common spell effect skins — original resources, not MIT\n\nThese unchanged common effect PNGs are imported from the local TouhouRushBoss thsrc.smx archive. Artwork retains its original authors\' rights and is not covered by TS-STG\'s MIT code license. The manifest records source archive SHA-256, entry offsets and per-file hashes. No executable data, Boss portraits, Boss backgrounds, title or HUD artwork is included. The legacy aura/petal skin keeps the source\'s alpha edges and charge circle instead of replacing it with an approximate generated shape. This import does not grant redistribution rights.\n'));
  files.set('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
  return{manifest,files};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
  const source=resolve(option('--source',join(root,'games/rushboss/assets'))),out=resolve(option('--out',join(root,'packages/thlib/assets/spell-common'))),check=args.includes('--check'),pack=buildCommonSpellAssets(source);
  for(const[name,bytes]of pack.files){const target=join(out,name);if(check){if(!existsSync(target)||hash(readFileSync(target))!==hash(bytes))throw new Error(`Shared spell resource differs: ${target}`);}else{mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}}
  console.log(JSON.stringify({check,out,textures:Object.keys(pack.manifest.textures).length,sprites:Object.keys(pack.manifest.sprites).length}));
}
