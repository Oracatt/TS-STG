import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';

/** Package-local validation; no reference checkout or demo is read. */
export function verifyCommonPack(base){
 const manifest=JSON.parse(readFileSync(join(base,'manifest.json'),'utf8'));
 assert.equal(manifest.format,'ts-stg-touhou-common-v1');
 const checked=file=>{const path=resolve(base,file);assert.ok(!relative(base,path).startsWith('..'),'Common pack path escapes package');assert.ok(existsSync(path),`Missing common resource ${file}`);return path;};
 const hash=file=>createHash('sha256').update(readFileSync(checked(file))).digest('hex');
 const required=['pl00','pl01','bullet','effect','enemy','ascii_960','front','text','title','screenswitch'];
 for(const name of required)assert.ok(manifest.archives[name],`Missing common framework bank ${name}`);
 let scripts=0,sprites=0;const archives={};
 for(const [name,entry]of Object.entries(manifest.archives)){
  assert.equal(hash(entry.file),entry.sha256,`${name} archive hash`);
  const archive=JSON.parse(readFileSync(checked(entry.file),'utf8'));archives[name]=archive;
  const scriptCount=archive.scripts.filter(value=>!value.excluded).length,spriteCount=archive.sprites.filter(value=>!value.excluded).length;
  assert.equal(scriptCount,entry.scripts);assert.equal(spriteCount,entry.sprites);scripts+=scriptCount;sprites+=spriteCount;
 }
 for(const resource of [...manifest.textures,...manifest.sounds])assert.equal(hash(resource.file),resource.sha256,resource.file);
 // Dialogue bodies retain their original scripts/geometry, but their PNG must
 // be the recorded clean illustration. Validate this from package-local data;
 // filenames intentionally keep the source body entry ID, so names alone are
 // insufficient to distinguish the excluded stone illustration from its skin.
 const bodySkins=manifest.transformations.filter(change=>change.operation==='clean-dialogue-body-skin');
 assert.equal(bodySkins.length,2,'Both standard player dialogue bodies require an audited clean skin');
 for(const [name,script,bodyEntry,bodySprites,sourceEntries,geometry]of [
  ['pl00',62,24,[92,93,94,95],[21,22,23,24],[498,698]],
  ['pl01',73,26,[107,108,109,110],[23,24,25,26],[618,778]],
 ]){
  const change=bodySkins.find(value=>value.archive===name),archive=archives[name];
  assert.ok(change,`${name} clean body provenance`);assert.equal(change.script,script);assert.equal(change.sourceBodyEntry,bodyEntry);
  assert.deepEqual(change.sprites,bodySprites);assert.equal(change.cleanArchive,'title.anm');
  assert.ok(!archive.scripts[script].excluded,`${name}:${script} original body animation is retained`);
  const entry=archive.entries[bodyEntry],texture=manifest.textures.find(value=>value.file===entry.texture.path);
  assert.ok(texture,`${name} clean texture must be included`);
  assert.equal(texture.source.archive,change.cleanArchive);assert.equal(texture.source.archiveSha256,change.cleanArchiveSha256);
  assert.equal(texture.source.entry,change.cleanEntry);assert.equal(texture.source.pngSha256,change.cleanPngSha256);
  assert.equal(texture.sha256,change.cleanPngSha256);assert.equal(entry.texture.sha256,change.cleanPngSha256);
  assert.equal(entry.texture.sourceSha256,change.cleanPngSha256);
  assert.notEqual(change.sourceBodyPngSha256,change.cleanPngSha256,'Stone body cannot masquerade as a clean skin');
  assert.ok(manifest.textures.every(value=>value.sha256!==change.sourceBodyPngSha256),'Excluded stone body PNG cannot remain in another texture');
  for(const id of sourceEntries){
   assert.ok(!manifest.textures.some(value=>value.source.archive===`${name}.anm`&&value.source.entry===id),'No colored stone body source is retained');
   if(id!==bodyEntry)assert.equal(archive.entries[id].texture.kind,'excluded');
  }
  const image=readFileSync(checked(texture.file)),width=image.readUInt32BE(16),height=image.readUInt32BE(20);
  assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10],'Clean body texture is PNG');
  assert.deepEqual([entry.texture.width,entry.texture.height],[width,height]);
  assert.ok(entry.width>=width&&entry.height>=height,'Padded clean surface encloses its PNG');
  assert.ok(change.mapping.scale>0&&Number.isFinite(change.mapping.scale));
  for(const id of bodySprites){
   const sprite=archive.sprites[id];assert.ok(!sprite.excluded);assert.equal(sprite.entry,bodyEntry);
   assert.equal(sprite.scaleX,sprite.scaleY,'Clean body mapping is uniform');assert.ok(sprite.scaleX>0&&Number.isFinite(sprite.scaleX));
   assert.ok(sprite.x>=0&&sprite.y>=0&&sprite.x+sprite.width<=width&&sprite.y+sprite.height<=height,'Clean body UV must fit actual PNG dimensions');
   assert.ok(Math.abs(sprite.width*sprite.scaleX-geometry[0])<1e-7&&Math.abs(sprite.height*sprite.scaleY-geometry[1])<1e-7,'Original body geometry is preserved');
  }
 }
 for(const file of [...manifest.shots,manifest.styles,manifest.audio,manifest.catalog,manifest.notice])checked(file);
 const audio=JSON.parse(readFileSync(checked(manifest.audio),'utf8'));
 for(const [id,name]of [[5,'se_enep01.wav'],[17,'se_extend.wav'],[46,'se_cardget.wav'],[54,'se_ch02.wav']]){
  const definition=audio.definitions.find(entry=>entry.id===id);assert.ok(definition,`Missing common feedback sound${id}`);
  const file=audio.files[definition.fileIndex];assert.equal(file.name,name);assert.equal(hash(file.path),file.sha256);
 }
 for(const id of [49,50,53,84])assert.ok(!archives.front.scripts[id].excluded,`Missing common result/stock front${id}`);
 for(const name of ['front','ascii_960','title'])for(const entry of archives[name].entries.filter(entry=>entry.texture.path)){
  const supplement=manifest.textures.find(value=>value.file===entry.texture.path&&value.originalHudLabels);
  if(supplement){
   assert.equal(name,'front');
   const audit=JSON.parse(readFileSync(checked(manifest.hudLabels),'utf8'));
   assert.equal(audit.format,'ts-stg-original-hud-labels-v1');
   assert.deepEqual(audit.labels.map(label=>label.key),['pointValue','graze']);
   assert.equal(audit.texture.sha256,supplement.sha256);assert.deepEqual(audit.source,supplement.source);
   assert.match(audit.source.pngSha256,/^[0-9a-f]{64}$/);assert.ok(audit.source.title&&audit.source.url);
   const pixels=readFileSync(checked(supplement.file)),width=pixels.readUInt32BE(16),height=pixels.readUInt32BE(20);
   assert.deepEqual([entry.width,entry.height,entry.texture.width,entry.texture.height],[width,height,width,height]);
   assert.equal(entry.texture.sha256,supplement.sha256);assert.equal(entry.texture.sourceSha256,audit.source.pngSha256);
   const addition=manifest.transformations.find(change=>change.operation==='append-original-hud-labels'&&change.entry===entry.index);
   assert.ok(addition);assert.equal(addition.provenance,manifest.hudLabels);assert.equal(addition.labels.length,2);
   for(const [i,label]of audit.labels.entries()){
    const reference=addition.labels[i],sprite=archives.front.sprites[reference.sprite],animation=archives.front.scripts[reference.script],r=label.rect;
    assert.equal(reference.key,label.key);assert.equal(reference.script,378+i);assert.equal(sprite.entry,entry.index);
    assert.deepEqual([sprite.x,sprite.y,sprite.width,sprite.height],[r.x,r.y,r.width,r.height]);
    assert.equal(sprite.scaleX,1);assert.equal(sprite.scaleY,1);
    assert.deepEqual([r.width,r.height],[label.sourceRect.width,label.sourceRect.height],'Original label dimensions are preserved');
    assert.ok(r.x>=2&&r.y>=2&&r.x+r.width+2<=width&&r.y+r.height+2<=height,'Original label and its own gutters fit');
    assert.ok(animation.instructions.some(ins=>ins.opcode===300&&ins.args[0]===sprite.index));
    assert.equal(supplement.spriteMappings[i].sprite,sprite.index);
   }
   continue;
  }
  if(name==='ascii_960'&&entry.index===7){
   const texture=manifest.textures.find(value=>value.file===entry.texture.path);
   assert.equal(texture.operation,'Byte-for-byte copy');assert.equal(texture.spriteMappings,undefined);
   assert.equal(texture.sha256,texture.source.pngSha256);assert.deepEqual([entry.width,entry.height],[256,256]);
   continue;
  }
  const change=manifest.transformations.find(change=>change.archive===name&&change.entry===entry.index&&change.operation==='pad-ui-atlas');
  assert.ok(change,`${name}:${entry.index} static UI requires independent sampling gutters`);assert.equal(change.padding,2);
  const texture=manifest.textures.find(value=>value.file===entry.texture.path);assert.ok(texture);
  assert.equal(texture.source.archive,`${name}.anm`);assert.equal(texture.source.entry,entry.index);
  assert.equal(entry.texture.sha256,texture.sha256);assert.equal(entry.texture.sourceSha256,texture.source.pngSha256);
  const image=readFileSync(checked(texture.file)),width=image.readUInt32BE(16),height=image.readUInt32BE(20);
  assert.deepEqual([entry.width,entry.height,entry.texture.width,entry.texture.height],[width,height,width,height]);
  assert.deepEqual([change.width,change.height],[width,height]);
  assert.deepEqual(texture.spriteMappings.map(mapping=>mapping.sprite),change.sprites);
  assert.deepEqual(change.sprites,archives[name].sprites.filter(sprite=>!sprite.excluded&&sprite.entry===entry.index).map(sprite=>sprite.index));
  const ringSprites=new Set();
  for(const script of archives[name].scripts)if(!script.excluded&&script.instructions.some(ins=>[600,601,602].includes(ins.opcode)))
   for(const ins of script.instructions){
    if(ins.opcode===300&&!(ins.mask&1)&&ins.args[0]>=0)ringSprites.add(ins.args[0]);
    if(ins.opcode===301&&!(ins.mask&3))for(let i=0;i<ins.args[1];i++)ringSprites.add(ins.args[0]+i);
   }
  assert.deepEqual(change.repeatY,change.sprites.filter(sprite=>ringSprites.has(sprite)),'Procedural ring dependencies preserve a complete Y texture period');
  for(const mapping of texture.spriteMappings){
   const sprite=archives[name].sprites[mapping.sprite],d=mapping.destination,s=mapping.source;
   assert.deepEqual([sprite.x,sprite.y,sprite.width,sprite.height],[d.x,d.y,s.width,s.height]);
   assert.deepEqual([d.width,d.height],[s.width,s.height]);assert.equal(mapping.sourceAddress,'wrap');
   const repeatY=change.repeatY.includes(mapping.sprite);
   assert.equal(mapping.edgeSampling,repeatY?'source':'own');
   assert.deepEqual([mapping.paddingX,mapping.paddingY],[change.repeatX?0:2,repeatY?0:2]);
   assert.ok(d.x>=mapping.paddingX&&d.y>=mapping.paddingY&&d.x+d.width+mapping.paddingX<=width&&d.y+d.height+mapping.paddingY<=height,'UI gutters fit atlas');
   if(change.repeatX){assert.equal(name,'front');assert.ok(entry.index===7||entry.index===9);assert.equal(s.x,0);assert.equal(d.x,0);assert.equal(s.width,width);assert.equal(width,change.sourceWidth);}
   if(repeatY){assert.equal(s.y,0);assert.equal(d.y,0);assert.equal(s.height,height);assert.equal(height,change.sourceHeight);}
  }
 }
 const noticeTexture=manifest.textures.find(value=>value.file===archives.front.entries[0].texture.path);
 for(const [id,y,width]of [[39,192,512],[40,772,320]])
  assert.deepEqual(noticeTexture.spriteMappings.find(mapping=>mapping.sprite===id).source,{x:512,y,width,height:64},'Original notice rectangle must be retained in provenance');
 for(let id=4;id<=13;id++)assert.ok(!archives.ascii_960.scripts[id].excluded,`Missing common capture score digit${id}`);
 for(const id of [14,15,16,17])assert.ok(!archives.ascii_960.scripts[id].excluded,`Missing common NowLoading animation${id}`);
 assert.deepEqual(archives.ascii_960.scripts[17].instructions.filter(ins=>ins.opcode===501).map(ins=>ins.args[0]),[15,14,16]);
 assert.deepEqual(archives.screenswitch.selection.scripts,Array.from({length:12},(_,i)=>i),'Complete source scene-switch animation tree');
 assert.deepEqual(archives.screenswitch.sprites.map(sprite=>[sprite.x,sprite.y,sprite.width,sprite.height]),
  [[0,1,128,128],[0,0,1280,960]],'Scene-switch UVs intentionally wrap beyond the source texture');
 assert.deepEqual(archives.screenswitch.entries.map(entry=>[entry.width,entry.height]),[[64,64],[512,512]]);
 for(const entry of archives.screenswitch.entries){
  const texture=manifest.textures.find(value=>value.file===entry.texture.path);assert.ok(texture);
  assert.equal(texture.operation,'Byte-for-byte copy');assert.equal(texture.spriteMappings,undefined);
  assert.equal(texture.sha256,texture.source.pngSha256);assert.equal(texture.source.archive,'screenswitch.anm');
  assert.equal(texture.source.archiveSha256,manifest.archives.screenswitch.sourceSha256);
 }
 for(const id of [25,57])assert.ok(!archives.effect.scripts[id].excluded,`Missing common Boss death effect${id}`);
 for(const id of [149,150,153,154,157,158])assert.ok(!archives.effect.scripts[id].excluded,`Missing common Boss entrance effect${id}`);
 for(const id of [58,59,60,61,62,63,64,65,66,67,374,375,376,377])assert.ok(!archives.front.scripts[id].excluded,`Missing common Boss stars/health front${id}`);
 assert.ok(!archives.front.scripts[111].excluded,'Missing common STAGE CLEAR banner');
 assert.ok(!archives.front.sprites[83].excluded&&archives.front.entries[2].texture.path,'Missing STAGE CLEAR sprite/texture');
 assert.ok(archives.front.scripts[112].excluded,'Unselected front entry2 animation must remain excluded');
 const timeoutSound=audio.definitions.find(definition=>definition.id===69);
 assert.ok(timeoutSound,'Portable common pack must retain the ordinary spell timeout sound69');
 const timeoutFile=audio.files[timeoutSound.fileIndex];
 assert.equal(timeoutFile.name,'se_fault.wav');assert.equal(hash(timeoutFile.path),timeoutFile.sha256);
 const catalog=JSON.parse(readFileSync(checked(manifest.catalog),'utf8'));
 assert.equal(catalog.format,'ts-stg-touhou-prefabs-v1');
 const inventory=Object.values(catalog.animations).flat();assert.equal(inventory.length,scripts,'Prefab inventory must cover every retained animation');
 for(const entry of inventory)assert.ok(!archives[entry.bank].scripts[entry.script].excluded,entry.id);
 for(const [language,locale]of Object.entries(manifest.locales??{})){
  assert.equal(locale.format,'ts-stg-touhou-locale-v1');assert.equal(locale.language,language);
  const provenance=JSON.parse(readFileSync(checked(locale.provenance),'utf8'));
  assert.deepEqual(provenance.source,locale.source,'Locale provenance is packaged with its manifest');
  const localized={};
  for(const [name,entry]of Object.entries(locale.archives)){
   assert.ok(archives[name],`Localized bank ${name} requires a base bank`);assert.equal(hash(entry.file),entry.sha256);
   const data=JSON.parse(readFileSync(checked(entry.file),'utf8'));localized[name]=data;
   assert.equal(entry.baseSha256,manifest.archives[name].sha256,'Localized bank records its actual base');
   assert.deepEqual(data.scripts,archives[name].scripts,'Localization changes artwork, never animation bytecode or simulation clocks');
   assert.equal(data.sprites.length,archives[name].sprites.length,'Localization preserves public sprite IDs');
   for(const sprite of data.sprites)assert.equal(!!sprite.excluded,!!archives[name].sprites[sprite.index].excluded,'Localization preserves the selected common content boundary');
  }
  for(const texture of locale.textures){
   assert.equal(hash(texture.file),texture.sha256);const image=readFileSync(checked(texture.file)),width=image.readUInt32BE(16),height=image.readUInt32BE(20);
   assert.deepEqual([texture.width,texture.height],[width,height]);
   for(const mapping of texture.spriteMappings){
    const bank=localized[mapping.archive],sprite=bank?.sprites[mapping.sprite],r=mapping.destination,s=mapping.sourceRect;
    assert.ok(sprite&&!sprite.excluded,'Localized labels must have a live public sprite');
    const entry=bank.entries[sprite.entry];assert.equal(entry.texture.path,texture.file);
    assert.deepEqual([sprite.x,sprite.y,sprite.width,sprite.height],[r.x,r.y,r.width,r.height]);
    assert.deepEqual([r.width,r.height],[s.width,s.height],'Cropped original pixels are not resized in the atlas');
    assert.equal(mapping.paddingX,2);assert.equal(mapping.paddingY,2);
    assert.ok(r.x>=2&&r.y>=2&&r.x+r.width+2<=width&&r.y+r.height+2<=height,'Localized cell and gutters fit their atlas');
    if(mapping.source.kind==='base-English-mask'){
     assert.equal(hash(mapping.source.file),mapping.source.pngSha256,'English fallback uses the packaged base artwork');
     const original=archives[mapping.archive].sprites[mapping.source.sprite];
     assert.deepEqual(mapping.source.rect,{x:original.x,y:original.y,width:original.width,height:original.height});
     for(const region of mapping.source.regions)assert.ok(region.x>=0&&region.y>=0&&region.x+region.width<=original.width&&region.y+region.height<=original.height,'English fallback crop stays inside its original sprite');
    }else{
     assert.match(mapping.source.sha256,/^[0-9a-f]{64}$/);assert.match(mapping.source.originalPngSha256,/^[0-9a-f]{64}$/);
     const cell=provenance.cells.find(cell=>cell.key===mapping.key);assert.ok(cell,'Chinese sprite has recorded source provenance');
     assert.equal(mapping.source.sha256,cell.sha256);assert.equal(mapping.source.originalPngSha256,cell.source.pngSha256);
     assert.deepEqual(mapping.source.originalRect,cell.source.rect);
    }
    assert.equal(sprite.scaleX,sprite.scaleY,'Translated artwork retains its aspect ratio');
    assert.ok(Number.isFinite(sprite.scaleX)&&sprite.scaleX>0);
   }
  }
 }
 assert.deepEqual({archives:Object.keys(archives).length,textures:manifest.textures.length,sounds:new Set(manifest.sounds.map(sound=>sound.file)).size,scripts,sprites},
  Object.fromEntries(['archives','textures','sounds','scripts','sprites'].map(key=>[key,manifest.counts[key]])));
 for(let id=150;id<=165;id++)assert.ok(archives.front.scripts[id].excluded,'Named original Boss UI must remain excluded');
 assert.ok(archives.title.scripts[32].excluded&&archives.title.scripts[33].excluded,'Specific title logo/copyright animations must remain excluded');
 assert.ok(archives.enemy.scripts.slice(272).every(script=>script.excluded),'Stone enemy animations must remain excluded');
 return {format:manifest.format,banks:Object.keys(archives),...manifest.counts,prefabs:inventory.length};
}

/** Complete public application exercise used by both isolated installations. */
export const APPLICATION_CONSUMER_FRAMES=360;
export function applicationConsumerSource(basePath){return `
import {Keys} from '@ts-stg/thlib';
import {TouhouApplication,TouhouPause,TouhouReimuBomb,createTouhouResources,createTouhouPrefabCatalog} from '@ts-stg/thlib/touhou';
const host=globalThis.__testResourceHost??globalThis.tsstg;
const resources=createTouhouResources(host,{basePath:${JSON.stringify(basePath)}}),catalog=createTouhouPrefabCatalog(resources);
const app=new TouhouApplication({resources,gameOptions:{power:400},menuOptions:{excluded:[1,3,4,5,6,7,8]}});
let frame=0,pauseRequested=false,paused=false,resumed=false,retried=false,returned=false,bomb=false,covered=false,revealed=false;
globalThis.__tsstg_game={
 update(){
  let mask=0;
  if(app.mode==='title'){if(!returned&&app.menu.phase===2&&app.menu.age===1)mask=Keys.CONFIRM;}
  else{
   const game=app.game;mask=Keys.SHOOT|Keys.FOCUS;
   if(!retried&&game.frame===35)mask|=Keys.BOMB;
   if(game.player.bomb instanceof TouhouReimuBomb)bomb=true;
   if(!pauseRequested&&game.frame===45){pauseRequested=true;mask=Keys.PAUSE;}
   if(game.paused){paused=game.pauseVisual instanceof TouhouPause;if(game.pauseVisual.phase===6&&game.pauseVisual.age===1)mask=Keys.PAUSE;else mask=0;}
   if(paused&&!game.paused)resumed=true;
   if(!retried&&game.frame===60){game.onRestart();retried=true;mask=0;}
   else if(retried&&game.frame===5){game.onExit();returned=true;mask=0;}
  }
  app.update(mask);frame++;
  covered ||= app.transition?.phase==='cover';revealed ||= app.transition?.phase==='reveal';
 },
 render(){return app.render();},
 snapshot(){return{frame,mode:app.mode,paused,resumed,retried,returned,bomb,covered,revealed,
  banks:Object.keys(resources.banks),prefabs:catalog.animations.length,counts:resources.manifest.counts};}
};
`;
}
