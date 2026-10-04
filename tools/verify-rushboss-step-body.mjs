// Run the frozen physics differential oracle in Node and actual QuickJS, then
// isolate old/optimized MoveBody calls without rendering or gameplay changes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {verifyStepBodyParity} from '../tests/fixtures/rushboss-step-body-parity.js';
const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let binary='build/performance-luastg/ts-stg.exe',output='reports/rushboss/step-body-performance',benchmark=true;
for(let i=0;i<args.length;i++){
  if(args[i]==='--exe')binary=args[++i];else if(args[i]==='--out')output=args[++i];else if(args[i]==='--no-benchmark')benchmark=false;else throw Error(`Unknown option ${args[i]}`);
}
const executable=resolve(root,binary),destination=resolve(root,output),fixtures=join(root,'build/rushboss-step-body');
assert.ok(existsSync(executable));mkdirSync(destination,{recursive:true});mkdirSync(fixtures,{recursive:true});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const watched=['games/rushboss/src/runtime.js','tests/fixtures/rushboss-step-body-reference.js','tests/fixtures/rushboss-step-body-parity.js'];
const sourceHashes=()=>Object.fromEntries(watched.map(file=>[file,hash(resolve(root,file))]));
const before=sourceHashes();
const run=argv=>{const child=spawnSync(executable,argv,{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000});assert.equal(child.status,0,`${child.error??''}\n${child.stdout}\n${child.stderr}`);};
const node=verifyStepBodyParity(),parityPath=join(destination,'quickjs-parity.json');
run(['tests/fixtures/rushboss-step-body-parity.js','--root',root,'--headless','--frames','1','--snapshot',parityPath]);
const quickjs=JSON.parse(readFileSync(parityPath,'utf8'));assert.deepEqual(quickjs,node,'Frozen MoveBody differential must match in actual QuickJS');
console.log(`PASS Node/QuickJS: ${node.ticks} ticks, ${node.words} exact words and ${node.nanValues} exact NaN classifications`);
const comparisons=[];
if(benchmark)for(const forces of[false,true]){
  const label=forces?'force-drag-fallback':'zero-force-drag',runs={};
  for(const mode of['original','optimized']){
    const entry=join(fixtures,`${label}-${mode}.js`),prefix=join(destination,`${label}-${mode}`);
    writeFileSync(entry,`import {stepBody} from '../../games/rushboss/src/runtime.js';
import {referenceStepBody} from '../../tests/fixtures/rushboss-step-body-reference.js';
const tick=${mode==='original'?'referenceStepBody':'stepBody'},bodies=[],memory=new DataView(new ArrayBuffer(4));let frame=0;
for(let i=0;i<2000;i++)bodies.push({x:Math.fround((i%37)-18),y:Math.fround((i%41)-20),vx:Math.fround((i%53-26)*17.3),vy:Math.fround((i%47-23)*13.7),fx:${forces?'31':'0'},fy:${forces?'-29':'0'},drag:${forces?'.025':'i&1?-0:0'}});
globalThis.__tsstg_game={update(){for(const b of bodies)tick(b);frame++;},render(){return[];},snapshot(){let hash=0x811c9dc5;for(const b of bodies)for(const key of['x','y','vx','vy']){memory.setFloat32(0,b[key],true);hash=Math.imul(hash^memory.getUint32(0,true),0x01000193)>>>0;}return{frame,bodies:bodies.length,hash:hash.toString(16).padStart(8,'0'),first:bodies[0],last:bodies.at(-1)};}};
`);
    run([relative(root,entry),'--root',root,'--headless','--frames','150','--profile-warmup','30','--profile',`${prefix}-profile.json`,'--snapshot',`${prefix}-snapshot.json`]);
    runs[mode]={profile:JSON.parse(readFileSync(`${prefix}-profile.json`,'utf8')),snapshot:JSON.parse(readFileSync(`${prefix}-snapshot.json`,'utf8'))};
  }
  assert.deepEqual(runs.optimized.snapshot,runs.original.snapshot,`${label}: physics state changed`);
  const original=runs.original.profile.metrics.updateJsMs,optimized=runs.optimized.profile.metrics.updateJsMs;
  comparisons.push({label,bodies:2000,frames:150,warmupFrames:30,stateIdentical:true,original,optimized,meanReductionPercent:(1-optimized.mean/original.mean)*100});
  console.log(`${label}: actual QuickJS update mean ${original.mean.toFixed(3)} -> ${optimized.mean.toFixed(3)} ms; state identical`);
}
assert.deepEqual(sourceHashes(),before,'Physics source changed during verification');
const report={format:'ts-stg-rushboss-step-body-performance-v1',scope:'Actual native QuickJS physics differential and isolated 2000-body update loops; no GPU, no frame pacing. These timings are not whole-game FPS.',binary:executable,binarySha256:hash(executable),sourceHashes:before,sourceStable:true,parity:{...node,nodeQuickjsIdentical:true},comparisons,passed:true};
writeFileSync(join(destination,'report.json'),JSON.stringify(report,null,2)+'\n');
