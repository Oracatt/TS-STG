// Compile an independent C++ oracle and compare the RushBoss business adapter.
// Run: node tools/verify-rushboss-numerics.mjs [--no-build]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RushRandom } from '../games/rushboss/src/random.js';
import { stepBody, setMove, stepMove } from '../games/rushboss/src/runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build/rushboss-numerics');
const source = path.join(root, 'tools/verify-rushboss-numerics.cpp');
fs.mkdirSync(out, { recursive: true });
const executable = path.join(out, process.platform === 'win32' ? 'oracle.exe' : 'oracle');
if (!process.argv.includes('--no-build')) {
  if (process.platform === 'win32') {
    let build = null;
    if (process.env.VSINSTALLDIR) build = path.join(process.env.VSINSTALLDIR, 'VC/Auxiliary/Build/vcvars64.bat');
    if (!build || !fs.existsSync(build)) {
      const locator = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
      if (fs.existsSync(locator)) {
        const vs = execFileSync(locator, ['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'], { encoding:'utf8' }).trim();
        if (vs) build = path.join(vs, 'VC/Auxiliary/Build/vcvars64.bat');
      }
    }
    const compilerArgs = `/nologo /EHsc /std:c++17 /Od /fp:strict "${source}" /Fe"${executable}" /Fo"${path.join(out,'oracle.obj')}"`;
    if (build && fs.existsSync(build)) {
      execFileSync(process.env.ComSpec || 'cmd.exe', ['/d','/s','/c', `call "${build}" >nul && cl ${compilerArgs}`], { cwd:root,stdio:'pipe',windowsVerbatimArguments:true });
    } else {
      execFileSync('cl.exe', ['/nologo','/EHsc','/std:c++17','/Od','/fp:strict',source,`/Fe${executable}`,`/Fo${path.join(out,'oracle.obj')}`], { cwd:root,stdio:'pipe' });
    }
  } else {
    execFileSync(process.env.CXX || 'c++', ['-std=c++17','-O0','-ffp-contract=off',source,'-o',executable], { cwd:root,stdio:'pipe' });
  }
  const result = execFileSync(executable, [], { cwd:root,encoding:'utf8' });
  fs.writeFileSync(path.join(out,'oracle.json'),result);
}
const fixture = JSON.parse(fs.readFileSync(path.join(out,'oracle.json'),'utf8').replace(/^\uFEFF/,''));
const view = new DataView(new ArrayBuffer(4));
const fromBits = n => { view.setUint32(0,n,true);return view.getFloat32(0,true); };
const bits = n => { view.setFloat32(0,n,true);return view.getUint32(0,true); };
const results = Object.fromEntries(['mt19937','float','integer','moveBody','movingObject'].map(key => [key,{checked:0,mismatches:0,first:null}]));
function check(key,actual,expected,context) {
  const result=results[key];result.checked++;
  if(JSON.stringify(actual)!==JSON.stringify(expected)) {
    result.mismatches++;
    result.first ??= { ...context, actual, expected };
  }
}
for(const stream of fixture.streams) {
  const rng=new RushRandom(stream.seed);
  stream.uints.forEach((value,index)=>check('mt19937',rng.nextUint(),value,{seed:stream.seed,index}));
  const floats=new RushRandom(stream.seed);
  stream.floats.forEach(([a,b,value],index)=>check('float',bits(floats.float(fromBits(a),fromBits(b))),value,
    {seed:stream.seed,index,min:fromBits(a),max:fromBits(b)}));
  const ints=new RushRandom(stream.seed);
  stream.ints.forEach(([min,max,value],index)=>check('integer',ints.int(min,max),value,{seed:stream.seed,index,min,max}));
}
fixture.bodies.forEach((record,caseIndex)=>{
  const [x,y,vx,vy]=record.initial.map(fromBits);
  const body={x,y,vx,vy,fx:fromBits(record.force[0]),fy:fromBits(record.force[1]),drag:{x:fromBits(record.drag[0]),y:fromBits(record.drag[1])}};
  record.frames.forEach((expected,index)=>{
    stepBody(body);check('moveBody',[body.x,body.y,body.vx,body.vy].map(bits),expected,{caseIndex,frame:index+1});
  });
});
fixture.moves.forEach((record,caseIndex)=>{
  const [x,y,tx,ty,max,min]=record.initial.map(fromBits);
  const body={x,y,vx:0,vy:0,fx:0,fy:0,drag:0};setMove(body,{x:tx,y:ty},max,min);
  record.frames.forEach((expected,index)=>{
    stepMove(body);check('movingObject',[bits(body.x),bits(body.y),bits(body.move.speed),body.moving?1:0],expected,{caseIndex,frame:index+1});
  });
});
const report={oracle:fixture.oracle,sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
  originalVectorImplementationAvailable:false,originalLerpImplementationAvailable:false,
  results,passed:Object.values(results).every(r=>r.mismatches===0)};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
