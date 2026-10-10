// Native embedded QuickJS-NG / V8 comparison. Node is the independent portable
// JS oracle, never the game's replacement host. Runs workloads sequentially.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {spawn} from 'node:child_process';
import {cpus,platform,arch} from 'node:os';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let executable=process.env.TSSTG_BINARY??'build/Release/ts-stg.exe',output='reports/backends',scope='all';
for(let i=0;i<args.length;i++){
  if(args[i]==='--exe'&&args[i+1])executable=args[++i];
  else if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--scope'&&args[i+1])scope=args[++i];
  else throw Error(`Unknown or incomplete option: ${args[i]}`);
}
assert.ok(['all','host','graphics','aggregate'].includes(scope),'Invalid --scope');
const exe=resolve(root,executable),out=resolve(root,output),scratch=join(root,'build/backend-verification');
assert.ok(existsSync(exe),'Build the native host with V8 enabled first');
mkdirSync(out,{recursive:true});mkdirSync(scratch,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),fileHash=file=>hash(readFileSync(file));
const portableFiles=directory=>readdirSync(join(root,directory),{withFileTypes:true}).flatMap(e=>
  e.isDirectory()?portableFiles(`${directory}/${e.name}`):e.name.endsWith('.js')?[`${directory}/${e.name}`]:[]);
const files=[...portableFiles('packages/thlib/dist')].sort();
const sourceHashes=()=>Object.fromEntries(files.map(file=>[file,fileHash(join(root,file))]));
const before=sourceHashes(),binarySha256=fileHash(exe),started=new Date().toISOString();
const report={format:'ts-stg-backends-v1',started,scope,binary:relative(root,exe),binarySha256,
  sourceHashes:before,environment:{platform:platform(),arch:arch(),cpu:cpus()[0]?.model},
  execution:'Sequential native embedded QuickJS-NG and embedded V8 in the same executable',
  originalExecutableRun:false,pixelEqualityToOriginalExe:false};
async function run(binary,argv,label,{failure=false,timeout=600000}={}){
  const start=performance.now(),child=spawn(binary,argv,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false;
  child.stdout.on('data',data=>{stdout+=data;});child.stderr.on('data',data=>{stderr+=data;});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
  let status;try{status=await new Promise((done,fail)=>{child.once('error',fail);child.once('close',done);});}finally{clearTimeout(timer);}
  writeFileSync(join(out,`${label}.log`),stdout+stderr);
  assert.equal(timedOut,false,`${label}: timeout`);
  assert.equal(failure?status!==0:status===0,true,`${label}: exit ${status}; ${stderr.slice(-6000)}`);
  assert.equal(fileHash(exe),binarySha256,'Executable changed during comparison');
  assert.deepEqual(sourceHashes(),before,'Production JS changed during comparison');
  console.log(`PASS ${label} (${Math.round(performance.now()-start)} ms)`);
  return{status,stdout,stderr,wallMs:performance.now()-start};
}
const native=(backend,entry,frames,prefix,extra=[])=>run(exe,[entry,'--root',root,'--backend',backend,
  '--frames',String(frames),...extra],prefix);
const read=file=>JSON.parse(readFileSync(file,'utf8'));
function sameImage(left,right){
  const a=decodeRgbaPng(readFileSync(left)),b=decodeRgbaPng(readFileSync(right));
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  let changedPixels=0,maxChannelDifference=0;
  for(let i=0;i<a.rgba.length;i+=4){let changed=false;for(let c=0;c<4;c++){
    const delta=Math.abs(a.rgba[i+c]-b.rgba[i+c]);changed||=delta!==0;maxChannelDifference=Math.max(maxChannelDifference,delta);
  }if(changed)changedPixels++;}
  assert.equal(changedPixels,0,`${relative(out,left)}: ${changedPixels} changed pixels; RGBA max ${maxChannelDifference}`);
  return{width:a.width,height:a.height,changedPixels,maxChannelDifference,
    rgbaSha256:hash(a.rgba),pngBytesIdentical:fileHash(left)===fileHash(right)};
}
function sameState(left,right,label){
  // Integer/discrete values must be exact. Extended raw binary64 expressions
  // may differ by libm ulps; this does not relax the strict gameplay verifier.
  const result={exact:true,numericDifferences:0,maximumAbsoluteDifference:0,first:[]};
  function visit(a,b,path=''){
    if(a===b)return;
    if(a&&b&&typeof a==='object'&&typeof b==='object'){
      assert.deepEqual(Object.keys(a),Object.keys(b),`${label}: keys ${path}`);
      for(const key of Object.keys(a))visit(a[key],b[key],`${path}.${key}`);return;
    }
    assert.equal(typeof a,typeof b,`${label}: type ${path}`);
    assert.equal(typeof a,'number',`${label}: discrete ${path}`);
    assert.ok(Number.isFinite(a)&&Number.isFinite(b),`${label}: nonfinite ${path}`);
    assert.ok(!(Number.isInteger(a)&&Number.isInteger(b)),`${label}: integer ${path}: ${a} != ${b}`);
    const absolute=Math.abs(a-b),allowance=1e-12*Math.max(1,Math.abs(a),Math.abs(b));
    assert.ok(absolute<=allowance,`${label}: numeric ${path}: ${a} != ${b}`);
    result.exact=false;result.numericDifferences++;result.maximumAbsoluteDifference=Math.max(result.maximumAbsoluteDifference,absolute);
    if(result.first.length<8)result.first.push({path,quickjs:a,v8:b});
  }
  visit(left,right);return result;
}

if(scope==='all'||scope==='host'){
  const cases=[
    ['backend',8,16],['backend-dynamic-import',1],['smoke',4,16],['media',4],['audio-pause',15],['audio-volume',6],['pixels',2],['texture-region',2],
    ['system-text',2],['bitmap-text',2],['mesh3d',2],['alpha-test',2],['quad',2],
    ['stateful-quad',2,1],['shader',2],
  ],failures=['invalid-command','script-error','traversal','unhandled-rejection','unbalanced-blend',
    'stateful-quad-invalid-state','stateful-quad-invalid-cutoff','stateful-quad-invalid-sampler',
    'stateful-quad-nested','stateful-quad-feedback','quad-invalid','quad-feedback','alpha-test-invalid',
    'bad-mesh3d','mesh-invalid','target-feedback','backend-unresolved-await','backend-missing-render',
    'backend-async-update','backend-job-limit','backend-time-limit','backend-command-getter','backend-snapshot-getter'];
  const host=[];
  for(const [name,frames,input]of cases){
    const snapshots={};for(const backend of ['quickjs','v8']){
      const snapshot=join(out,`host-${name}-${backend}.json`);
      await native(backend,`native/tests/${name}.js`,frames,`host-${name}-${backend}`,
        ['--headless','--input',String(input??0),'--snapshot',snapshot]);
      snapshots[backend]=read(snapshot);
    }
    if(name==='backend'){for(const backend of ['quickjs','v8']){
      assert.equal(snapshots[backend].backend,backend);delete snapshots[backend].backend;
    }}
    const parity=sameState(snapshots.quickjs,snapshots.v8,name);host.push({name,frames,parity,passed:true});
  }
  await native('v8','native/tests/backend-v8.js',1,'host-embedded-v8',['--headless']);
  for(const name of failures){
    for(const backend of ['quickjs','v8']){
      const result=await run(exe,[`native/tests/${name}.js`,'--root',root,'--backend',backend,'--headless','--frames','1',
        ...(name==='backend-snapshot-getter'?['--snapshot',join(out,`${backend}-snapshot-error.json`)]:[])],`host-reject-${name}-${backend}`,{failure:true});
      assert.match(result.stderr,/TS-STG error:/,`${name}: native failure was not propagated`);
      if(name==='script-error')assert.match(result.stderr,/Expected error with stack trace/);
      if(name==='unhandled-rejection')assert.match(result.stderr,/Expected unhandled rejection/);
      if(name==='backend-unresolved-await')assert.match(result.stderr,/unresolved top-level await/);
      if(name==='backend-async-update')assert.match(result.stderr,/must be synchronous/);
      if(name==='backend-job-limit')assert.match(result.stderr,/10000 pending JavaScript jobs/);
      if(name==='backend-time-limit')assert.ok(result.wallMs<30000,'Script watchdog failed to stop the loop');
      if(name==='backend-command-getter'||name==='backend-snapshot-getter'){
        assert.match(result.stderr,new RegExp(`Expected ${name==='backend-command-getter'?'command':'snapshot'} getter error`));
        assert.match(result.stderr,/backend-(command|snapshot)-getter\.js/,'JavaScript stack/source location missing');
      }
    }
    host.push({name,rejectedByBoth:true,passed:true});
  }
  for(let input=0;input<10;input++)for(const backend of ['quickjs','v8'])
    await run(exe,['native/tests/shader-invalid.js','--root',root,'--backend',backend,'--headless','--frames','1','--input',String(input)],
      `host-shader-reject-${input}-${backend}`,{failure:true});
  report.host={cases:host,shaderFailures:10,embeddedV8Checked:true,passed:true};
}

if(scope==='all'||scope==='graphics'){
  const generic=[];
  for(const entry of ['stateful-quad','quad-gpu','mesh3d-graphics','pixel-capture-graphics','mesh-texture-switch-gpu']){
    for(const backend of ['quickjs','v8']){
      const prefix=join(out,`generic-${entry}-${backend}`);
      await native(backend,`native/tests/${entry}.js`,3,`generic-${entry}-${backend}`,
        ['--benchmark','--input','1','--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`]);
    }
    const left=join(out,`generic-${entry}-quickjs`),right=join(out,`generic-${entry}-v8`);
    generic.push({entry,image:sameImage(`${left}.png`,`${right}.png`),state:sameState(read(`${left}.json`),read(`${right}.json`),entry),passed:true});
  }
  report.graphics={generic,note:'Same inputs/source/binary/GPU; exact decoded RGBA. Original game EXE is not executed.',passed:true};
}

if(scope==='aggregate'){
  report.verificationRuns=[];
  for(const section of ['host','graphics']){
    const previous=read(join(out,`${section}-report.json`));
    assert.equal(previous.passed,true,`${section} report did not pass`);
    assert.equal(previous.binarySha256,binarySha256,`${section} used a different executable`);
    assert.deepEqual(previous.sourceHashes,before,`${section} used different production JS`);
    report[section]=previous[section];
    report.verificationRuns.push({scope:section,started:previous.started,completed:previous.completed,report:`${section}-report.json`});
  }
}
assert.deepEqual(sourceHashes(),before);report.completed=new Date().toISOString();report.sourceStable=true;report.passed=true;
writeFileSync(join(out,scope==='all'||scope==='aggregate'?'report.json':`${scope}-report.json`),JSON.stringify(report,null,2)+'\n');
console.log(`PASS ${scope}: reports in ${out}`);
