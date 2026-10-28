import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const [executable,backend='quickjs',mode]=process.argv.slice(2);
assert.ok(executable,'Expected native executable');
const output=path.join(root,'build','display-pixels-'+backend);fs.mkdirSync(output,{recursive:true});
const sizes=mode==='fullscreen'?['fullscreen']:['960x720','1440x1080','1920x1440'];
for(const size of sizes){
  const prefix=path.join(output,size);
  const child=spawnSync(executable,['native/tests/display-pixels.js','--root',root,'--backend',backend,
    '--benchmark','--frames','2',...(size==='fullscreen'?['--fullscreen']:['--window-size',size]),
    '--screenshot',prefix+'.png','--snapshot',prefix+'.json'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
  fs.writeFileSync(prefix+'.log',(child.stdout??'')+(child.stderr??''));
  assert.ifError(child.error);assert.equal(child.status,0,child.stderr||child.stdout);
  assert.equal(JSON.parse(fs.readFileSync(prefix+'.json','utf8')).passed,true);
  const png=fs.readFileSync(prefix+'.png'),actual=[png.readUInt32BE(16),png.readUInt32BE(20)];
  if(size!=='fullscreen')assert.deepEqual(actual,size.split('x').map(Number),'Screenshot must contain physical canvas pixels');
  assert.equal(actual[0]*3,actual[1]*4);assert.ok(actual[0]>=960&&actual[0]<=3840);
  console.log(`PASS ${backend} ${size}: ${actual.join('x')} pixels; logical target and canvas contracts preserved`);
}
