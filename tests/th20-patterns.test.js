import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Th20Random, th20ShotTrajectory } from '../games/touhou20/src/bullet-patterns.js';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/th20/shot-patterns.json', import.meta.url)));
const bits = v => new Uint32Array(new Float32Array([v]).buffer)[0];
test('TH20 all thirteen arrangements match reconstruction C++ float bit vectors', () => {
  assert.equal(fixture.evidence.failures,0);
  assert.equal(new Set(fixture.vectors.map(v => v.pattern)).size,13);
  for (const v of fixture.vectors) {
    const rng = new Th20Random(v.seed), r = th20ShotTrajectory(v.parameters,v.pattern,v.column,v.row,v.playerAngle,rng);
    assert.deepEqual([bits(r.angle),bits(r.speed),bits(r.initialSpeed),rng.state],v.expected,JSON.stringify(v));
  }
});
