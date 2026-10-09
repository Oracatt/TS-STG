// Actual restored player/SHT/ANM equality between the demos, plus native parity.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createTouhouResources} from '@ts-stg/thlib/touhou';
import {createRestoredPlayerFixture,RESTORED_PLAYER_FRAMES} from '../tests/fixtures/rushboss-restored-player.js';
const root=resolve(import.meta.dirname,'..'),out=join(root,'build/rushboss-runtime');mkdirSync(out,{recursive:true});
const codeFiles=['games/rushboss/src/runtime.js','games/rushboss/src/player-adapter.js','games/rushboss/src/bullet-visuals.js',
  'tests/fixtures/rushboss-restored-player.js',...readdirSync(join(root,'packages/thlib/dist/touhou')).filter(f=>f.endsWith('.js')).map(f=>`packages/thlib/dist/touhou/${f}`)];
const hashSources=()=>Object.fromEntries(codeFiles.map(f=>[f,createHash('sha256').update(readFileSync(join(root,f))).digest('hex')]));
const hashes=hashSources(),textures=new Map(),host={readText:f=>readFileSync(join(root,f),'utf8'),loadTexture:f=>{
  if(!textures.has(f))textures.set(f,textures.size+1);return textures.get(f);}};
const resources=createTouhouResources(host),fixture=createRestoredPlayerFixture(resources);
for(let i=0;i<RESTORED_PLAYER_FRAMES;i++)fixture.update();const node=fixture.snapshot();
for(const c of node.comparisons){assert.equal(c.classIdentity,true);assert.equal(c.shotDataIdentity,true);assert.equal(c.animationDataIdentity,true);
  assert.equal(c.stateFrames,360);assert.equal(c.drawFrames,360);assert.ok(c.drawCommands>1000);assert.ok(c.sawShot&&c.sawBomb);assert.ok(c.final.statistics.shotDamage>0);}
const entry=join(out,'restored-player-fixture.js');writeFileSync(entry,`import {createTouhouResources} from '@ts-stg/thlib/touhou';
import {createRestoredPlayerFixture} from '../../tests/fixtures/rushboss-restored-player.js';
const textures=new Map();const host={readText:p=>tsstg.readText(p),loadTexture:p=>{if(!textures.has(p))textures.set(p,textures.size+1);return textures.get(p);}};
globalThis.__tsstg_game=createRestoredPlayerFixture(createTouhouResources(host));
`);
const binary=[process.env.TSSTG_BINARY,'build/Release/ts-stg.exe','build/ts-stg.exe'].filter(Boolean).map(f=>resolve(root,f)).find(existsSync);assert.ok(binary,'Build native host first');
const snapshot=join(out,'restored-player-native.json'),child=spawn(binary,[relative(root,entry),'--root',root,'--headless','--frames',String(RESTORED_PLAYER_FRAMES),'--snapshot',snapshot],
  {cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
const status=await new Promise((ok,fail)=>{child.on('error',fail);child.on('close',ok);});assert.equal(status,0,output);
const native=JSON.parse(readFileSync(snapshot,'utf8'));assert.deepEqual(native,JSON.parse(JSON.stringify(node)),'Native restored player differs from Node');
assert.deepEqual(hashSources(),hashes,'Source changed while verifying');
const report=join(root,'reports/rushboss/shared-player.json');mkdirSync(join(root,'reports/rushboss'),{recursive:true});
writeFileSync(report,JSON.stringify({scope:'Same original Player class, complete SHT resources and full ANM draw commands in both demos; strict Node/QuickJS parity',
  frames:RESTORED_PLAYER_FRAMES,characters:2,comparisonFrames:720,strictParity:true,sourceHashes:hashes,passed:true,...node},null,2)+'\n');
resources.dispose();console.log(`PASS: 720 restored state/animation input frames; strict Node/QuickJS parity; ${report}`);
