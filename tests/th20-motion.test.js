import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Th20Motion } from '../games/touhou20/src/enemy.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/th20/motion.json',import.meta.url)));
const bits=v=>new Uint32Array(new Float32Array([v]).buffer)[0];
const state=m=>[m.position.x,m.position.y,m.position.z,m.velocity.x,m.velocity.y,m.velocity.z,m.speed,m.angle,m.radius,m.angularVelocity,m.axisAngle,m.ellipseScale,m.phase,m.damping,m.delta.x,m.delta.y,m.delta.z];
test('Original enemy motion: source C++ state bits across every common movement mode',()=>{
 for(const c of fixture.cases){const motion=new Th20Motion(c.options);for(const expected of c.expected){motion.update(c.rate);assert.deepEqual(state(motion).map(bits),expected);}}
});
