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
assert.ok(['all','host','runtime','graphics','performance','aggregate'].includes(scope),'Invalid --scope');
const exe=resolve(root,executable),out=resolve(root,output),scratch=join(root,'build/backend-verification');
assert.ok(existsSync(exe),'Build the native host with V8 enabled first');
mkdirSync(out,{recursive:true});mkdirSync(scratch,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),fileHash=file=>hash(readFileSync(file));
const portableFiles=directory=>readdirSync(join(root,directory),{withFileTypes:true}).flatMap(e=>
  e.isDirectory()?portableFiles(`${directory}/${e.name}`):e.name.endsWith('.js')?[`${directory}/${e.name}`]:[]);
const files=[...portableFiles('packages/thlib/dist'),...portableFiles('games/rushboss/src')].sort();
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
    ['system-text',2],['bitmap-text',2],['mesh-target',4],['mesh3d',2],['alpha-test',2],['quad',2],
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

if(scope==='all'||scope==='runtime'){
  const runtimes={};
  for(const backend of ['quickjs','v8']){
    const runtimeOut=join(out,`${backend}-portrait-runtime.json`);
    await run(process.execPath,['tools/verify-rushboss-portrait-runtime.mjs','--backend',backend,'--exe',exe,'--out',runtimeOut],`${backend}-portrait-runtime`);
    runtimes[backend]=read(runtimeOut);
  }
  assert.equal(runtimes.quickjs.nodeSnapshotSha256,runtimes.v8.nodeSnapshotSha256,'Node oracle changed');
  assert.equal(runtimes.quickjs.nativeSnapshotSha256,runtimes.v8.nativeSnapshotSha256,'Native gameplay snapshots differ');
  const replays={};
  for(const backend of ['quickjs','v8']){
    const snapshot=join(out,`portrait-replay-${backend}.json`);
    await native(backend,'native/tests/backend-portrait-replay.js',840,`portrait-replay-${backend}`,['--headless','--snapshot',snapshot]);
    replays[backend]=read(snapshot);assert.equal(replays[backend].backend,backend);delete replays[backend].backend;
    assert.equal(replays[backend].expected,replays[backend].actual);assert.equal(replays[backend].persisted,true);
    assert.equal(replays[backend].sawDialogue,true);assert.equal(replays[backend].sawPause,true);
  }
  assert.deepEqual(replays.quickjs,replays.v8,'Actual portrait replay differs across backends');
  report.runtime={cases:232,framesPerBackend:139200,strictGameplayParity:true,
    replay:{recordFrames:420,playbackFrames:420,sameBackendPlaybackChecked:true,crossBackendStateHash:replays.quickjs.actual,
      nativePersistenceReloaded:true,dialogueAndPauseExercised:true,liveInputIgnored:true,passed:true},
    rawEntityDiagnostic:{quickjs:runtimes.quickjs.extendedEntityDiagnostic,v8:runtimes.v8.extendedEntityDiagnostic},passed:true};
}

if(scope==='all'||scope==='graphics'){
  const graphics={};
  for(const backend of ['quickjs','v8']){
    const destination=join(out,backend);
    await run(process.execPath,['tools/verify-rushboss-portrait-graphics.mjs','--backend',backend,'--exe',exe,'--out',destination],`${backend}-portrait-graphics`,{timeout:1200000});
    graphics[backend]=read(join(destination,'report.json'));
  }
  const scenes=graphics.quickjs.results.map(scene=>{
    const left=join(out,'quickjs',scene.scene),right=join(out,'v8',scene.scene);
    return{scene:scene.scene,frames:scene.frames,image:sameImage(`${left}.png`,`${right}.png`),
      state:sameState(read(`${left}.json`),read(`${right}.json`),scene.scene),passed:true};
  });
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
  report.graphics={scenes,generic,note:'Same inputs/source/binary/GPU; exact decoded RGBA. Original game EXE is not executed.',passed:true};
}

if(scope==='all'||scope==='performance'){
  const scenes=[
    {name:'title',options:{},frames:1800,warmup:600},
    {name:'sunny-sc2',options:{startBoss:'sunny',phaseIndex:1,character:0,difficulty:3,mode:'spell',invincible:true,skipDialogue:true},frames:1800,warmup:600},
    {name:'artia-sc13',options:{startBoss:'artia',phaseIndex:12,character:1,difficulty:3,mode:'spell',invincible:true,skipDialogue:true},frames:1800,warmup:600},
    {name:'artia-sc13-initial',options:{startBoss:'artia',phaseIndex:12,character:1,difficulty:3,mode:'spell',invincible:true,skipDialogue:true},frames:300,warmup:60},
  ];
  const performance=[];
  for(const scene of scenes){
    const entry=join(scratch,`${scene.name}.js`);
    writeFileSync(entry,`import{SaveStore}from'@ts-stg/thlib';
import{createRushPortraitGame}from'../../games/rushboss/src/portrait-application.js';
const game=createRushPortraitGame(tsstg,{...${JSON.stringify(scene.options)},store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);let frames=0;
globalThis.__tsstg_game={update(){game.update(0);frames++;},render(){return game.render();},postFrame(now){return game.postFrame(now);},snapshot(){return{frames,...game.snapshot()};}};
`);
    const measurements={};
    // ABBA ordering reduces cache/thermal ordering bias. No runs overlap.
    for(const [index,backend]of ['quickjs','v8','v8','quickjs'].entries()){
      const prefix=join(out,`performance-${scene.name}-${index}-${backend}`);
      await native(backend,relative(root,entry),scene.frames,`performance-${scene.name}-${index}-${backend}`,
        ['--benchmark','--profile-warmup',String(scene.warmup),'--profile',`${prefix}-profile.json`,
          '--snapshot',`${prefix}.json`,'--screenshot',`${prefix}.png`]);
      const profile=read(`${prefix}-profile.json`),state=read(`${prefix}.json`);
      assert.equal(profile.warmupRenderFrames,scene.warmup);assert.equal(profile.simulationFrames,scene.frames);
      assert.equal(profile.metrics.frameWorkMs.samples,scene.frames-scene.warmup);
      assert.equal(state.frames,scene.frames);assert.equal(state.application.completed??false,false);
      if(scene.options.startBoss)assert.equal(state.application.battle.phaseFrame,scene.frames,'Benchmark phase ended');
      (measurements[backend]??=[]).push({prefix,profile,state});
    }
    const reference=measurements.quickjs[0],comparisons=[];
    for(const sample of [...measurements.quickjs,...measurements.v8]){
      comparisons.push({artifactPrefix:relative(out,sample.prefix),image:sameImage(`${reference.prefix}.png`,`${sample.prefix}.png`),
        state:sameState(reference.state,sample.state,`performance-${scene.name}`)});
    }
    const summary=backend=>Object.fromEntries(Object.keys(measurements[backend][0].profile.metrics).map(key=>[key,
      {meanAcrossRuns:measurements[backend].reduce((sum,sample)=>sum+sample.profile.metrics[key].mean,0)/2,
        p95ByRun:measurements[backend].map(sample=>sample.profile.metrics[key].p95),
        maxByRun:measurements[backend].map(sample=>sample.profile.metrics[key].max),
        meanByRun:measurements[backend].map(sample=>sample.profile.metrics[key].mean)}]));
    const quickjs=summary('quickjs'),v8=summary('v8');
    performance.push({scene:scene.name,frames:scene.frames,warmup:scene.warmup,runsPerBackend:2,order:['quickjs','v8','v8','quickjs'],
      gpuDevice:reference.profile.gpuDevice,quickjs,v8,workSpeedup:quickjs.frameWorkMs.meanAcrossRuns/v8.frameWorkMs.meanAcrossRuns,
      comparisons,exactStateMatched:comparisons.every(sample=>sample.state.exact),stateAndRgbaMatched:true,passed:true});
  }
  report.performance={workloads:performance,includesStartup:false,warmupIsRenderFrames:true,
    note:'600-frame JIT warmup for 1800-frame sequences, measured same original time range. Initial curve-laser window has only 60-frame warmup and is reported separately. Muted audio but calls/resources retained. ABBA sequential runs; no FPS cap. Does not promise every phase reaches 60 FPS.',passed:true};
}
if(scope==='aggregate'){
  report.verificationRuns=[];
  for(const section of ['host','runtime','graphics','performance']){
    const previous=read(join(out,`${section}-report.json`));
    assert.equal(previous.passed,true,`${section} report did not pass`);
    assert.equal(previous.binarySha256,binarySha256,`${section} used a different executable`);
    assert.deepEqual(previous.sourceHashes,before,`${section} used different production JS`);
    report[section]=previous[section];
    report.verificationRuns.push({scope:section,started:previous.started,completed:previous.completed,report:`${section}-report.json`});
  }
  // Recheck existing captures rather than rerunning expensive benchmarks. This
  // also enriches reports produced before per-run comparison details existed.
  for(const scene of report.performance.workloads){
    const reference=join(out,`performance-${scene.scene}-0-quickjs`),comparisons=[];
    for(const[index,backend]of ['quickjs','v8','v8','quickjs'].entries()){
      const prefix=join(out,`performance-${scene.scene}-${index}-${backend}`);
      comparisons.push({artifactPrefix:relative(out,prefix),image:sameImage(`${reference}.png`,`${prefix}.png`),
        state:sameState(read(`${reference}.json`),read(`${prefix}.json`),`${scene.scene}/${index}/${backend}`)});
    }
    scene.comparisons=comparisons;scene.exactStateMatched=comparisons.every(sample=>sample.state.exact);
  }
}
assert.deepEqual(sourceHashes(),before);report.completed=new Date().toISOString();report.sourceStable=true;report.passed=true;
writeFileSync(join(out,scope==='all'||scope==='aggregate'?'report.json':`${scope}-report.json`),JSON.stringify(report,null,2)+'\n');
console.log(`PASS ${scope}: reports in ${out}`);
