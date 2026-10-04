import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const workspace=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let root=workspace,binary,output='reports/th20/title-coverage';
for(let i=0;i<args.length;i++){
  if(args[i]==='--exe')binary=args[++i];
  else if(args[i]==='--root')root=resolve(workspace,args[++i]);
  else if(args[i]==='--out')output=args[++i];
  else throw Error(`Unknown argument ${args[i]}`);
}
assert.ok(existsSync(resolve(root,'games/touhou20/assets/manifest.json')),'Import the original local reference resources first.');
const executable=binary?resolve(workspace,binary):resolve(root,root===workspace?'build/Release/ts-stg.exe':'ts-stg.exe');
const directory=resolve(workspace,output);mkdirSync(directory,{recursive:true});
const snapshot=resolve(directory,'state.json'),screenshot=resolve(directory,'title.png');
// A packaged runtime need not ship developer tests. Run the exact same fixture
// in a temporary in-root directory, at its original relative import depth.
const build=resolve(root,'build'),hadBuild=existsSync(build);mkdirSync(build,{recursive:true});
const temporary=mkdtempSync(join(build,'title-coverage-')),fixture=join(temporary,'fixture');mkdirSync(fixture);
const entry=join(fixture,'entry.js');writeFileSync(entry,readFileSync(resolve(workspace,'tests/fixtures/th20/title-coverage-gpu.js')));
let child;
try{child=spawnSync(executable,[
  relative(root,entry),'--root',root,'--frames','301','--benchmark',
  '--snapshot',snapshot,'--screenshot',screenshot,
],{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000});}
finally{unlinkSync(entry);rmdirSync(fixture);rmdirSync(temporary);if(!hadBuild)rmdirSync(build);}
if(child.error)throw child.error;
assert.equal(child.status,0,`${child.stdout}\n${child.stderr}`);
const state=JSON.parse(readFileSync(snapshot,'utf8'));
assert.equal(state.format,'ts-stg-th20-title-coverage-v1');assert.equal(state.checkedFrame,300);
assert.equal(state.renderedFrames,301);assert.equal(state.simulationFrames,300);assert.equal(state.scene.mode,'title');
assert.equal(state.scene.state,'main');assert.equal(state.scene.phase,2);
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
assert.equal(hash(resolve(root,state.sourceTexture)),state.sourceTextureSha256,'Source artwork bytes differ from the imported manifest');
const report={...state,binary:executable,resourceRoot:root,source:'Imported original title_ch00 artwork, script30 frame300 and actual GPU canvas.',
  scope:'Opaque face/garment/shoe coverage across both triangles; this is not a complete original-executable pixel comparison.',
  screenshot,screenshotSha256:hash(screenshot)};
writeFileSync(resolve(directory,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
const failed=state.checks.filter(check=>!check.passed);
assert.equal(failed.length,0,`Title artwork lost coverage: ${failed.map(c=>`${c.name} at ${c.canvas}: ${c.actual} expected ${c.expected}`).join('; ')}`);
