import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyStepBodyParity} from './fixtures/rushboss-step-body-parity.js';
test('zero drag/force fast path retains all signed-zero and randomized source float32 words',()=>{
  const report=verifyStepBodyParity();assert.equal(report.mismatches,0);assert.equal(report.cases,29504);assert.equal(report.ticks,69584);assert.equal(report.words+report.nanValues,278336);assert.ok(report.nanValues>0);
});
