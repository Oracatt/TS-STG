// Install the actual packed library outside the monorepo: workspace links must
// not hide reverse dependencies on the reference application or its resources.
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyCommonPack,applicationConsumerSource,APPLICATION_CONSUMER_FRAMES} from './verify-common-pack.mjs';
import {verifyThlibTypes} from './verify-thlib-types.mjs';

const root=resolve(import.meta.dirname,'..');
const npmCli=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')].find(path=>path&&existsSync(path));
assert.ok(npmCli,'Run this check through npm run test:package, or install npm beside Node.');
const temporary=mkdtempSync(join(tmpdir(),'tsstg-thlib-package-')),app=join(temporary,'consumer');mkdirSync(app);
function run(binary,args,cwd){
  const result=spawnSync(binary,args,{cwd,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024});
  if(result.error)throw result.error;assert.equal(result.status,0,`${binary}: ${result.stdout}\n${result.stderr}`);return result.stdout;
}
const packed=JSON.parse(run(process.execPath,[npmCli,'pack','--json','--ignore-scripts','--offline','--pack-destination',temporary],join(root,'packages/thlib')))[0];
assert.ok(packed.files.some(file=>file.path==='assets/manifest.json'));
assert.equal(packed.files.filter(file=>file.path.startsWith('assets/audio/')&&file.path.endsWith('.wav')).length,6);
assert.ok(packed.files.some(file=>file.path==='assets/touhou-common/manifest.json'),'Complete shared animation/resources pack is required');
assert.ok(packed.files.some(file=>file.path==='assets/spell-common/manifest.json'),'Shared spell/charge/aura pack is required');
assert.ok(!packed.files.some(file=>/(?:^|\/)(?:th20|games|examples|tests)(?:\/|$)/.test(file.path)),'Library tarball contains game-specific files');
assert.ok(!packed.files.some(file=>/^src\/touhou\/spellcard\.(?:js|d\.ts)$/.test(file.path)),'Removed event-document module returned to the library tarball');
assert.ok(!packed.files.some(file=>/(?:^|\/)(?:tools|spellcard-editor|node_modules)(?:\/|$)/.test(file.path)),'Editor tooling or dependencies leaked into the library tarball');
writeFileSync(join(app,'package.json'),JSON.stringify({name:'independent-thlib-consumer',private:true,type:'module'}));
run(process.execPath,[npmCli,'install','--offline','--ignore-scripts','--no-audit','--no-fund',join(temporary,packed.filename)],app);
const installed=join(app,'node_modules/@ts-stg/thlib');
assert.ok(realpathSync(installed).startsWith(realpathSync(app)),'Installed library must be a real packed copy, not a workspace link');
const installedManifest=JSON.parse(readFileSync(join(installed,'package.json'),'utf8'));
for(const group of ['dependencies','devDependencies','optionalDependencies','peerDependencies']){
  assert.ok(!Object.keys(installedManifest[group]??{}).some(name=>/^(?:@codemirror\/|codemirror$|electron$|esbuild$|@ts-stg\/spellcard-editor$)/.test(name)),`Editor dependency leaked into thlib ${group}`);
}
function inspect(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);if(entry.isDirectory()){inspect(path);continue;}
  if(!entry.name.endsWith('.js'))continue;
  const code=readFileSync(path,'utf8');
  assert.doesNotMatch(code,/games[\\/]touhou20|@ts-stg\/thlib\/th20|\bTh20\w*|\bTH20_\w*/,'Version-specific implementation leaked into thlib');
  assert.doesNotMatch(code,/\b(?:TouhouSpellCardTimeline|createTouhouSpellCard|validateTouhouSpellCard|parseTouhouSpellCard|serializeTouhouSpellCard|createSpellMetadata|validateSpellMetadata)\b/,'Editor metadata or removed event-document API leaked into thlib');
  for(const match of code.matchAll(/\b(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)){
    assert.ok(match[1].startsWith('.'),`Non-portable library import ${match[1]}`);
    assert.ok(relative(installed,resolve(dirname(path),match[1])).split(/[\\/]/)[0]!=='..','Library imports application code');
  }
}}
inspect(join(installed,'src'));
const completeCommon=verifyCommonPack(join(installed,'assets/touhou-common'));
const manifest=JSON.parse(readFileSync(join(installed,'assets/manifest.json'),'utf8'));
for(const sound of Object.values(manifest.sounds))assert.ok(existsSync(join(installed,'assets',sound.file)));
const commonVisualPath=join(installed,'assets/reference-common/manifest.json');
assert.ok(existsSync(commonVisualPath),'Shared bullet/Bomb visual pack must be included in this local library package');
const visuals=JSON.parse(readFileSync(commonVisualPath,'utf8'));assert.equal(visuals.format,'ts-stg-sprite-pack-v1');
assert.ok(Object.keys(visuals.sprites).some(name=>name.includes('bullet')),'Missing bullet sprites');
assert.ok(Object.keys(visuals.sprites).some(name=>name.includes('bomb')),'Missing Bomb sprites');
for(const texture of Object.values(visuals.textures)){
  assert.ok(!texture.file.includes('..')&&!texture.file.startsWith('/'));
  const bytes=readFileSync(join(installed,'assets/reference-common',texture.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),texture.sha256);
}
const spellVisuals=JSON.parse(readFileSync(join(installed,'assets/spell-common/manifest.json'),'utf8'));
assert.equal(spellVisuals.format,'ts-stg-sprite-pack-v1');
assert.equal(Object.keys(spellVisuals.textures).length,3);
assert.ok(spellVisuals.sprites['spell.attack-strip']&&spellVisuals.sprites['charge.circle']&&spellVisuals.sprites['boss.aura-ring']);
for(const texture of Object.values(spellVisuals.textures)){
  assert.ok(!texture.file.includes('..')&&!texture.file.startsWith('/'));
  assert.equal(createHash('sha256').update(readFileSync(join(installed,'assets/spell-common',texture.file))).digest('hex'),texture.sha256);
}
assert.ok(existsSync(join(installed,'assets/spell-common/NOTICE.md')));
const source=`import * as thlib from '@ts-stg/thlib';
import {TouhouPlayer,createTouhouResources} from '@ts-stg/thlib/touhou';
const {Game,Keys,GridMesh,RadialDistortion,LayeredDrawQueue,RepeatingInput,SpriteAtlas,Player,Weapon,PlayerPresentation,createPlayerCharacter}=thlib;
if(!GridMesh||!RadialDistortion||!LayeredDrawQueue||!RepeatingInput||!SpriteAtlas)throw Error('Missing shared templates');
if(!thlib.PerspectiveCamera||!thlib.PerspectiveSprite||!thlib.TexturedRing)throw Error('Missing shared spell presentation primitives');
if(typeof PlayerPresentation!=='function'||typeof createPlayerCharacter!=='function')throw Error('Missing shared player presentation/presets');
const characters=['reimu','marisa'].map(name=>createPlayerCharacter(name));
if(characters.some(player=>!(player instanceof Player)||!(player.weapon instanceof Weapon)))throw Error('Character presets must use shared Player/Weapon');
if(characters[0].weapon.type!=='homing'||characters[1].weapon.type!=='laser')throw Error('Missing shared character weapons');
const game=new Game({seed:42,title:'Independent application'});let frame=0;
const resources=createTouhouResources(globalThis.__testResourceHost??globalThis.tsstg,{basePath:'node_modules/@ts-stg/thlib/assets/touhou-common'});
const restored=[0,1].map(character=>new TouhouPlayer({character,sht:resources.shots[character],bank:resources.banks[character?'pl01':'pl00'],effectBank:resources.banks.effect,power:400}));
const playerDraw=new thlib.DrawList();
globalThis.__tsstg_game={update(){game.update(frame===0?Keys.CONFIRM:Keys.SHOOT);
 for(const player of restored)player.update(Keys.SHOOT|Keys.FOCUS|(frame===60?Keys.BOMB:0),{});
 for(const bank of Object.values(resources.banks)){bank.updateDetached();bank.collect();}frame++;
},render(){playerDraw.reset();for(const player of restored)player.draw(playerDraw);return game.render().concat(playerDraw.commands);},snapshot:()=>({frame,state:game.state,libraryOnly:true,
 characters:characters.map(player=>({character:player.character,weapon:player.weapon.type})),
 restored:restored.map(player=>({character:player.character,shots:player.shots.length,bombs:player.bombs,bomb:player.bomb?.constructor.name,animated:!!player.animation})),
 sharedBanks:Object.keys(resources.banks)})};
`;
writeFileSync(join(app,'main.js'),source);
writeFileSync(join(app,'node-check.mjs'),`import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
let texture=0;globalThis.__testResourceHost={readText:path=>readFileSync(path,'utf8'),loadTexture:()=>++texture};
await import('./main.js');
await assert.rejects(import('@ts-stg/thlib/th20'));
const game=globalThis.__tsstg_game;for(let i=0;i<120;i++){game.update();game.render();}
console.log(JSON.stringify(game.snapshot()));
`);
const node=JSON.parse(run(process.execPath,['node-check.mjs'],app));assert.equal(node.frame,120);
assert.deepEqual(node.restored.map(p=>p.bomb),['TouhouReimuBomb','TouhouMarisaBomb']);
assert.ok(node.restored.every(p=>p.animated&&p.bombs===1));
const binary=resolve(root,process.env.TSSTG_BINARY??'build/Release/ts-stg.exe');
assert.ok(existsSync(binary),'Build the native host first.');
const snapshot=join(temporary,'quickjs.json');
run(binary,['main.js','--root',app,'--backend','quickjs','--headless','--frames','120','--snapshot',snapshot],app);
const native=JSON.parse(readFileSync(snapshot,'utf8'));assert.deepEqual(native,node);
writeFileSync(join(app,'application.js'),applicationConsumerSource('node_modules/@ts-stg/thlib/assets/touhou-common'));
writeFileSync(join(app,'application-node.mjs'),`import {readFileSync} from 'node:fs';let texture=0;
globalThis.__testResourceHost={readText:path=>readFileSync(path,'utf8'),loadTexture:()=>++texture,createTexture:()=>++texture};
await import('./application.js');for(let frame=0;frame<${APPLICATION_CONSUMER_FRAMES};frame++){__tsstg_game.update();__tsstg_game.render();}console.log(JSON.stringify(__tsstg_game.snapshot()));`);
const applicationNode=JSON.parse(run(process.execPath,['application-node.mjs'],app));
const applicationSnapshot=join(temporary,'application-quickjs.json');
run(binary,['application.js','--root',app,'--backend','quickjs','--headless','--frames',String(APPLICATION_CONSUMER_FRAMES),'--snapshot',applicationSnapshot],app);
const applicationNative=JSON.parse(readFileSync(applicationSnapshot,'utf8'));assert.deepEqual(applicationNative,applicationNode);
assert.equal(applicationNative.mode,'title');for(const key of ['paused','resumed','retried','returned','bomb','covered','revealed'])assert.equal(applicationNative[key],true,key);
assert.equal(applicationNative.prefabs,completeCommon.scripts);assert.deepEqual(applicationNative.banks,completeCommon.banks);
const types=verifyThlibTypes(installed);
const report={format:'ts-stg-thlib-isolated-package-v1',library:packed.name,packedFiles:packed.files.length,
  commonSounds:Object.keys(manifest.sounds),commonVisuals:{textures:Object.keys(visuals.textures).length,sprites:Object.keys(visuals.sprites).length,clips:Object.keys(visuals.clips).length},gameFilesIncluded:false,oldSubpathRejected:true,
  installation:app,tarball:join(temporary,packed.filename),binarySha256:createHash('sha256').update(readFileSync(binary)).digest('hex'),
  completeCommon,node,native,applicationNode,applicationNative,types,scope:'Actual npm tarball installed outside the workspace, complete public application lifecycle and prefab inventory, plus shared players/Bombs; Node and embedded QuickJS without the demo or its title-specific assets. Strict TypeScript consumer validates the new public presentation and text contracts.'};
mkdirSync(join(root,'build'),{recursive:true});writeFileSync(join(root,'build/thlib-package-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
