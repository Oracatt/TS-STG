import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createTh20RuntimeFixture,RUNTIME_HOST_FRAMES} from '../tests/fixtures/th20/runtime-native.js';

const root=fileURLToPath(new URL('../',import.meta.url));
if(!existsSync(resolve(root,'games/touhou20/assets/manifest.json')))throw new Error('Import the user-owned reference resources with ./import-th20.ps1 first.');
function runNode(){
  let nextTexture=1;const host={readText:path=>readFileSync(resolve(root,path),'utf8'),loadTexture(path){assert.ok(existsSync(resolve(root,path)),`Missing texture ${path}`);return nextTexture++;}};
  const game=createTh20RuntimeFixture(host);
  for(let frame=0;frame<RUNTIME_HOST_FRAMES;frame++){game.update();game.render();}
  const result=game.snapshot();assert.equal(result.complete,true,'Both character sequences must finish');return result;
}
const started=performance.now(),node=runNode();
const nodeMs=Math.round(performance.now()-started);
const repeated=runNode();assert.deepEqual(node,repeated,'Repeated imported-resource simulations differ');
const candidates=[process.env.TSSTG_BINARY,'build/Release/ts-stg.exe','build/RelWithDebInfo/ts-stg.exe','build/Debug/ts-stg.exe','build/ts-stg.exe','build/ts-stg'].filter(Boolean).map(path=>resolve(root,path));
const binary=candidates.find(existsSync);if(!binary)throw new Error('Build the native host with ./build.ps1 first.');
const output=resolve(root,'build/th20-runtime-native.json');mkdirSync(dirname(output),{recursive:true});
const nativeStart=performance.now();
const child=spawnSync(binary,['tests/fixtures/th20/runtime-native.js','--root',root,'--headless','--frames',String(RUNTIME_HOST_FRAMES),'--snapshot',output],{cwd:root,encoding:'utf8',timeout:180000});
if(child.error)throw child.error;
assert.equal(child.status,0,`Native TH20 integration failed:\n${child.stdout}\n${child.stderr}`);
const native=JSON.parse(readFileSync(output,'utf8'));
assert.deepEqual(native,node,'Imported-resource Node/QuickJS snapshots and render hashes must match exactly');
const manifest=JSON.parse(readFileSync(resolve(root,'games/touhou20/assets/manifest.json'),'utf8'));
const report={format:'ts-stg-th20-runtime-report-v1',hostFrames:RUNTIME_HOST_FRAMES,simulationFramesPerCharacter:node.simulationFramesPerCharacter,
  archiveSha256:Object.fromEntries(['front','bullet','effect','enemy','ascii_960','pl00','pl01'].map(name=>[name,manifest.archives[name].sourceSha256])),
  repeatedNodeDeterminism:true,quickjsSnapshotParity:'strict (no numeric tolerance)',renderStream:'FNV-1a over ordered commands, noninteger values normalized to float32',
  nodeMs,quickjsMs:Math.round(performance.now()-nativeStart),characters:node.results.map(result=>({character:result.character,updates:result.updates,pausedFrames:result.pausedFrames,
    peaks:result.peaks,events:result.events,trace:result.trace,checkpoints:result.checkpoints.length,renderHash:result.renderHash,finalFrame:result.final.frame,continues:result.final.session.continues})),
  scope:'Actual imported ANM, bitmap font, bullet styles and SHT; authored controller sequence. Cross-runtime agreement is not original executable or pixel/audio equivalence.'};
const reportPath=resolve(root,'reports/th20/runtime.json');mkdirSync(dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
