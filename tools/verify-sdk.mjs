import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,mkdirSync,mkdtempSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyCommonPack,applicationConsumerSource,APPLICATION_CONSUMER_FRAMES} from './verify-common-pack.mjs';
import {verifyThlibTypes} from './verify-thlib-types.mjs';

const root=resolve(import.meta.dirname,'..'),sdk=resolve(root,process.argv[2]??'dist/TS-STG');
const metadata=JSON.parse(readFileSync(join(sdk,'PACKAGE.json'),'utf8'));
assert.equal(metadata.kind,'engine-sdk');assert.equal(metadata.referenceAssets,false);assert.equal(metadata.entry,'main.js');
const topLevel=['LICENSE','PACKAGE.json','README.md','Run.cmd','START.txt','THIRD_PARTY.md','docs','licenses','packages','run.ps1','ts-stg.exe'];
assert.deepEqual(readdirSync(sdk).sort(),topLevel.sort(),'Release payload must only contain the engine, thlib and required documentation/licenses');
assert.deepEqual(readdirSync(join(sdk,'packages')),['thlib']);
assert.deepEqual(readdirSync(join(sdk,'docs')).sort(),['native-api.md','thlib-guide.md','touhou-boss-death.md','touhou-boss-defeat.md','touhou-boss-entrance.md','touhou-boss-hud.md','touhou-dialogue.md','touhou-end-feedback.md','touhou-item-drops.md','touhou-marisa-bomb-release.md','touhou-music.md','touhou-player-stage-visibility.md','touhou-prefabs.md','touhou-projectile-rules.md','touhou-reimu-bomb-release.md','touhou-rendering.md','touhou-scene-transition.md','touhou-stage-flow.md']);
assert.deepEqual(readdirSync(join(sdk,'packages/thlib')).sort(),['LICENSE','README.md','assets','package.json','src'].sort());
assert.ok(!existsSync(join(sdk,'packages/thlib/src/th20')));
assert.ok(existsSync(join(sdk,'packages/thlib/src/touhou/player.js')),'SDK must contain the restored shared player');
assert.ok(existsSync(join(sdk,'packages/thlib/assets/touhou-common/manifest.json')),'SDK must contain complete shared character/animation assets');
const completeCommon=verifyCommonPack(join(sdk,'packages/thlib/assets/touhou-common'));
for(const module of ['application','scene-transition','stage-clear','stage-transition','game','gameplay-compositor','render-order','render-queue','menu','title-background','stage-selection','dialogue','pause','game-over','hud','boss-hud','boss-phase-plan','boss-phase-timeline','boss-presentation','boss-entrance','boss-death','boss-defeat','boss-phase-clear','bullet-clear-wave','screen-shake','text-renderer','music','music-caption','music-fade','prefabs','bullet-collision','laser-collision','laser-cancellation','world','phase-sequence','player-profile','player-rules'])
 for(const extension of ['js','d.ts'])assert.ok(existsSync(join(sdk,`packages/thlib/src/touhou/${module}.${extension}`)),`Missing public framework ${module}.${extension}`);
const graphics=JSON.parse(readFileSync(join(sdk,'packages/thlib/assets/reference-common/manifest.json'),'utf8'));
assert.equal(graphics.format,'ts-stg-sprite-pack-v1');
assert.ok(graphics.sprites['bomb.orb']&&graphics.sprites['bullet.rice.red'],'SDK must include common bullet and Bomb materials');
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
assert.ok(Array.isArray(metadata.runtimes)&&metadata.runtimes.length,'SDK records its compiled JS backends');
const backends=metadata.runtimes.map(runtime=>runtime.id);
assert.deepEqual(backends,[...new Set(backends)]);assert.ok(backends.includes('quickjs'));
assert.ok(backends.includes(metadata.defaultBackend));
assert.ok(backends.every(backend=>backend==='quickjs'||backend==='v8'));
const quickjs=metadata.runtimes.find(runtime=>runtime.id==='quickjs');
assert.equal(quickjs.jit,false);assert.equal(quickjs.linkage,'static');
const v8=metadata.runtimes.find(runtime=>runtime.id==='v8');
if(v8){
  assert.equal(v8.jit,true);assert.equal(v8.linkage,'static');assert.equal(metadata.defaultBackend,'v8');
  const manifestPath=join(sdk,'licenses/v8-sdk-manifest.json');
  assert.equal(sha(manifestPath),v8.sdkManifestSha256);
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.format,'ts-stg-v8-sdk-v1');assert.equal(manifest.version,v8.version);
  assert.equal(manifest.library.sha256,v8.librarySha256);
  assert.deepEqual(manifest.library,v8.library);
  assert.deepEqual(manifest.wrapper,v8.wrapper);assert.deepEqual(manifest.headers,v8.headers);assert.deepEqual(manifest.build,v8.build);
  assert.ok(['rusty_v8.lib','v8-host.lib'].includes(manifest.library.file));assert.equal(manifest.build.linkage,'static');
  if(manifest.library.file==='v8-host.lib'){
    assert.equal(manifest.library.upstreamFile,'rusty_v8.lib');assert.match(manifest.library.upstreamSha256,/^[a-f0-9]{64}$/);
    assert.equal(manifest.build.platformBridge.executableBytesUnmodified,true);
  }
  assert.ok(manifest.licenses.some(file=>file.file==='V8-LICENSE'));
  assert.ok(manifest.licenses.some(file=>file.file==='rusty_v8-LICENSE'));
  for(const notice of manifest.licenses)assert.equal(sha(join(sdk,'licenses/v8',notice.file)),notice.sha256,`V8 notice: ${notice.file}`);
  assert.ok(!existsSync(join(sdk,'rusty_v8.lib'))&&!existsSync(join(sdk,'v8-host.lib'))&&!existsSync(join(sdk,'node.dll')),'Static V8 must not ship development libraries or Node DLLs');
}
const spellBase=join(sdk,'packages/thlib/assets/spell-common');
const spellVisuals=JSON.parse(readFileSync(join(spellBase,'manifest.json'),'utf8'));
assert.equal(spellVisuals.format,'ts-stg-sprite-pack-v1');
assert.equal(Object.keys(spellVisuals.textures).length,3);
assert.ok(spellVisuals.sprites['charge.circle']&&spellVisuals.sprites['spell.attack-strip']);
for(const texture of Object.values(spellVisuals.textures))assert.equal(sha(join(spellBase,texture.file)),texture.sha256);
assert.equal(sha(join(sdk,'ts-stg.exe')),metadata.binarySha256);
assert.equal(sha(join(sdk,'ts-stg.exe')),sha(join(root,'build/Release/ts-stg.exe')));
// Use a consumer-created main.js, outside both the repository and release tree.
const app=mkdtempSync(join(tmpdir(),'tsstg-sdk-consumer-'));mkdirSync(join(app,'packages'));
cpSync(join(sdk,'packages/thlib'),join(app,'packages/thlib'),{recursive:true,errorOnExist:true});
writeFileSync(join(app,'main.js'),`import {Game,Keys,SpriteAtlas,DrawList} from '@ts-stg/thlib';
import {TouhouPlayer,createTouhouResources} from '@ts-stg/thlib/touhou';
const game=new Game({title:'SDK consumer',seed:42});let frame=0;
const basePath='packages/thlib/assets/reference-common',manifest=JSON.parse(tsstg.readText(basePath+'/manifest.json'));
const atlas=new SpriteAtlas(manifest,tsstg,{basePath}).loadAll(),draw=new DrawList();
const spellBase='packages/thlib/assets/spell-common',spellAtlas=new SpriteAtlas(JSON.parse(tsstg.readText(spellBase+'/manifest.json')),tsstg,{basePath:spellBase}).loadAll();
const resources=createTouhouResources(tsstg),players=[0,1].map(character=>new TouhouPlayer({character,power:400,sht:resources.shots[character],bank:resources.banks[character?'pl01':'pl00'],effectBank:resources.banks.effect}));
globalThis.__tsstg_game={update(){game.update(frame===0?Keys.CONFIRM:Keys.SHOOT);for(const player of players)player.update(Keys.SHOOT|Keys.FOCUS|(frame===60?Keys.BOMB:0),{});for(const bank of Object.values(resources.banks)){bank.updateDetached();bank.collect();}frame++;},
 render(){draw.reset();atlas.drawNamed('bullet.rice.red',draw,720,320);atlas.drawNamed('bomb.orb',draw,820,420);for(const player of players)player.draw(draw);return game.render().concat(draw.commands);},
 snapshot:()=>({frame,state:game.state,entry:'main.js',commonTextures:atlas.handles.size,spellCommonTextures:spellAtlas.handles.size,restored:players.map(player=>({character:player.character,bombs:player.bombs,bomb:player.bomb?.constructor.name,animated:!!player.animation}))})};
`);
const output=join(app,'state.json');
const child=spawnSync(join(sdk,'ts-stg.exe'),['--root',app,'--headless','--frames','120','--snapshot',output],{cwd:app,encoding:'utf8',windowsHide:true,timeout:30000});
if(child.error)throw child.error;assert.equal(child.status,0,`${child.stdout}\n${child.stderr}`);
const state=JSON.parse(readFileSync(output,'utf8'));assert.deepEqual(state,{frame:120,state:'playing',entry:'main.js',commonTextures:Object.keys(graphics.textures).length,
  spellCommonTextures:Object.keys(spellVisuals.textures).length,
  restored:[{character:0,bombs:1,bomb:'TouhouReimuBomb',animated:true},{character:1,bombs:1,bomb:'TouhouMarisaBomb',animated:true}]});
const report={format:'ts-stg-sdk-verification-v1',sdk,binarySha256:metadata.binarySha256,demosIncluded:false,referenceAssets:false,
  completeCommon,commonTextures:Object.keys(graphics.textures).length,topLevel,consumer:app,defaultEntrySmoke:state,
  defaultBackend:metadata.defaultBackend,runtimes:metadata.runtimes,backendConsumers:[],runtimeProbes:[]};
writeFileSync(join(app,'backend.js'),`globalThis.__tsstg_game={update(){},render:()=>[],snapshot:()=>({backend:tsstg.backend,process:typeof process,require:typeof require})};`);
for(const selected of ['auto',...backends]){
  const probeOutput=join(app,`backend-${selected}.json`);
  const probe=spawnSync(join(sdk,'ts-stg.exe'),['backend.js','--backend',selected,'--root',app,'--headless','--frames','1','--snapshot',probeOutput],
    {cwd:app,encoding:'utf8',windowsHide:true,timeout:30000});
  if(probe.error)throw probe.error;assert.equal(probe.status,0,`${selected}: ${probe.stdout}\n${probe.stderr}`);
  const actual=JSON.parse(readFileSync(probeOutput,'utf8')),effective=selected==='auto'?metadata.defaultBackend:selected;
  assert.equal(actual.backend,effective);
  assert.equal(actual.process,'undefined');assert.equal(actual.require,'undefined','The embedded V8 backend exposes the platform ABI without a Node runtime');
  report.runtimeProbes.push({selected,effective,...actual});
}
for(const backend of backends){
  const backendOutput=join(app,`state-${backend}.json`);
  const backendChild=spawnSync(join(sdk,'ts-stg.exe'),['--backend',backend,'--root',app,'--headless','--frames','120','--snapshot',backendOutput],
    {cwd:app,encoding:'utf8',windowsHide:true,timeout:30000});
  if(backendChild.error)throw backendChild.error;assert.equal(backendChild.status,0,`${backend}: ${backendChild.stdout}\n${backendChild.stderr}`);
  const backendState=JSON.parse(readFileSync(backendOutput,'utf8'));assert.deepEqual(backendState,state,`${backend} shares the same player/Bomb and external-consumer behavior`);
  report.backendConsumers.push({backend,defaultEntrySmoke:backendState});
}
writeFileSync(join(app,'application.js'),applicationConsumerSource('packages/thlib/assets/touhou-common'));
const applicationOutput=join(app,'application-state.json');
const applicationChild=spawnSync(join(sdk,'ts-stg.exe'),['application.js','--root',app,'--headless','--frames',String(APPLICATION_CONSUMER_FRAMES),'--snapshot',applicationOutput],{cwd:app,encoding:'utf8',windowsHide:true,timeout:60000});
if(applicationChild.error)throw applicationChild.error;assert.equal(applicationChild.status,0,`${applicationChild.stdout}\n${applicationChild.stderr}`);
report.applicationSmoke=JSON.parse(readFileSync(applicationOutput,'utf8'));assert.equal(report.applicationSmoke.mode,'title');
for(const key of ['paused','resumed','retried','returned','bomb','covered','revealed'])assert.equal(report.applicationSmoke[key],true,key);
assert.equal(report.applicationSmoke.prefabs,completeCommon.scripts);assert.deepEqual(report.applicationSmoke.banks,completeCommon.banks);
report.types=verifyThlibTypes(join(sdk,'packages/thlib'));
for(const consumer of report.backendConsumers){
  const backendOutput=join(app,`application-state-${consumer.backend}.json`);
  const backendChild=spawnSync(join(sdk,'ts-stg.exe'),['application.js','--backend',consumer.backend,'--root',app,'--headless','--frames',String(APPLICATION_CONSUMER_FRAMES),'--snapshot',backendOutput],
    {cwd:app,encoding:'utf8',windowsHide:true,timeout:60000});
  if(backendChild.error)throw backendChild.error;assert.equal(backendChild.status,0,`${consumer.backend}: ${backendChild.stdout}\n${backendChild.stderr}`);
  consumer.applicationSmoke=JSON.parse(readFileSync(backendOutput,'utf8'));
  assert.deepEqual(consumer.applicationSmoke,report.applicationSmoke,`${consumer.backend} public application/menu/pause/result lifecycle matches the default backend`);
}
mkdirSync(join(root,'build'),{recursive:true});writeFileSync(join(root,'build/sdk-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
