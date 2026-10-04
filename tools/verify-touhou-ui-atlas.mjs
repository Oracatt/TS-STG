import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),output=join(root,'reports/touhou-ui-atlas');
const audit=JSON.parse(readFileSync(join(output,'audit.json'),'utf8'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const manifest=join(root,'packages/thlib/assets/touhou-common/manifest.json');
assert.equal(hash(manifest),audit.manifestSha256);
const results=[];
for(const fixture of audit.nativeFixtures){
  assert.equal(hash(join(root,fixture.entry)),fixture.sha256);
  const images=[];
  for(const backend of ['v8','quickjs']){
    const prefix=join(output,`${backend}-${fixture.scene}`);
    const run=spawnSync(join(root,'build/Release/ts-stg.exe'),[fixture.entry,'--root',root,'--backend',backend,
      '--frames',String(fixture.frames),'--benchmark','--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`],
      {cwd:root,windowsHide:true,encoding:'utf8',timeout:60000});
    writeFileSync(`${prefix}.log`,(run.stdout??'')+(run.stderr??''));
    assert.ifError(run.error);assert.equal(run.status,0,run.stderr);
    images.push(hash(`${prefix}.png`));
    console.log(`PASS ${backend} ${fixture.scene}`);
  }
  assert.equal(images[0],images[1],`${fixture.scene} image must match both backends`);
  results.push({scene:fixture.scene,frames:fixture.frames,fixtureSha256:fixture.sha256,pngSha256:images[0],backends:['v8','quickjs']});
}
assert.equal(hash(manifest),audit.manifestSha256);
writeFileSync(join(output,'native-report.json'),JSON.stringify({manifestSha256:audit.manifestSha256,results},null,2)+'\n');
console.log('PASS 3 UI scenes, byte-identical V8/QuickJS PNGs');
