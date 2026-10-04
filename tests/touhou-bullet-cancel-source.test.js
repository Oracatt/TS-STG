import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {auditTouhouCancelGeometry} from '../tools/audit-touhou-cancel-geometry.mjs';

test('cancellation geometry matches raw source bytes and independent 960x720 corner arithmetic',{
  skip:process.env.TS_STG_TEST_STATIC_ASSETS==='1'||!existsSync('D:/AIWorkspace/Touhou20Reconstruction/assets/raw/bullet.anm')||
    !existsSync('packages/thlib/assets/touhou-common/anm/bullet.json'),
},()=>{
  const report=auditTouhouCancelGeometry();
  assert.equal(report.status,'passed');assert.equal(report.cornerSamples,4864);
  assert.ok(report.mappedStyles.length>200);assert.ok(report.maxCornerError<.0001);
  assert.deepEqual(report.families.map(f=>f.fragments),[5,5,5,9]);
});
