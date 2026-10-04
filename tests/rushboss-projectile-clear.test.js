import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTouhouResources, TouhouBulletClearWave } from '@ts-stg/thlib/touhou';
import { RushBattle } from '../games/rushboss/src/runtime.js';

const hasAssets = fs.existsSync('packages/thlib/assets/touhou-common/manifest.json') && process.env.TS_STG_TEST_STATIC_ASSETS !== '1';
function fixture(visual = false) {
  const resources = visual ? createTouhouResources({ readText: path => fs.readFileSync(path, 'utf8'), loadTexture: () => 1 }) : null;
  const battle = new RushBattle([{ key: 'clear', hp: 20000, time: 1000 }], { profile: 'portrait', resources, invincible: true });
  const sounds = []; battle.playerAdapter.context.sound = (...args) => sounds.push(args);
  return { battle, sounds, dispose() { battle.dispose(); resources?.dispose(); } };
}

test('Rush source616 adapter retains cancel kind and ignores circular bullet protection', () => {
  const f = fixture(), { battle } = f;
  try {
    const b = battle.spawn('XiaoYu', { x: 10, y: 124 }, {}, 1, { delay: 0 });
    const state = battle.projectiles.circle(b); state.protectedFrames = 40; state.cancelKind = 1;
    assert.equal(battle.projectiles.cancel(0, 100, 16, 0, 0, true), 0);
    assert.equal(b.alive, true); assert.equal(state.cancelKind, 1);
    const wave = new TouhouBulletClearWave({ x: 0, y: 100, cancelCircle: (x, y, radius, options) =>
      battle.projectiles.cancel(x, y, radius, 0, 0, true, options) });
    assert.equal(b.alive, false); assert.equal(state.cancelKind, 1); assert.equal(wave.cancelled, 1);
    assert.equal(b.destroyReason, 'bonus'); assert.deepEqual(f.sounds, [[71, 10]]);
    wave.update(); assert.equal(f.sounds.length, 1);
  } finally { f.dispose(); }
});

test('regular Rush circle/rectangle cancellation sets its requested kind and preserves frozen silence', () => {
  const f = fixture(), { battle } = f;
  try {
    const b = battle.spawn('XiaoYu', { x: 0, y: 124 }, {}, 1, { delay: 0, frozen: true });
    const state = battle.projectiles.circle(b); state.cancelKind = 1;
    assert.equal(battle.projectiles.cancel(0, 100, 16, 16, 0, false, { kind: 2 }), 1);
    assert.equal(state.cancelKind, 2); assert.deepEqual(f.sounds, []);
  } finally { f.dispose(); }
});

test('ordinary phase uses nearby640 twice around emitter cleanup and preserves laser protection', () => {
  const f = fixture(), { battle } = f;
  try {
    const position = { x: battle.boss.x, y: battle.boss.y };
    const bullet = battle.spawn('XiaoYu', position, {}, 1, { delay: 30, protectedFrames: 90 });
    const state = battle.projectiles.circle(bullet); state.cancelKind = 2;
    const outside = battle.spawn('XiaoYu', { x: position.x + 800, y: position.y }, {}, 1, { delay: 30 });
    const beam = battle.laser(position, 0, 1, { length: 180, width: 12 });
    battle.projectiles.syncLasers();
    battle.projectiles.lasers.get(beam).protectedFrames = 90;
    let late;
    battle.actor({ ...position, onDestroy() {
      late = battle.spawn('XiaoYu', position, {}, 1, { delay: 30, protectedFrames: 90 });
    } });
    battle.cleanAuto('spell');
    assert.equal(bullet.alive, false); assert.equal(state.cancelKind, 2);
    assert.equal(late.alive, false, 'the second source clear catches an emitter death birth in the same frame');
    assert.equal(outside.alive, true, 'ordinary clear retains the source radius instead of a global erase');
    assert.equal(beam.alive, true, 'nearby bypass applies to ordinary bullets, not protected lasers');
  } finally { f.dispose(); }
});

test('attached zero-sample beam retires with its emitter while an independent beam retains source circle behavior', () => {
  const f = fixture(), { battle } = f;
  try {
    const emitter = battle.actor({ x: 0, y: 124 });
    const attached = battle.laser(emitter, 0, 1, { length: 8, owner: emitter });
    const detached = battle.laser(emitter, 0, 1, { length: 8 });
    assert.equal(battle.projectiles.cancel(0, 100, 100, 0, 0, true, { bullets: false }), 0);
    assert.equal(attached.alive, true); assert.equal(detached.alive, true);
    emitter.kill('phaseEnd');
    assert.equal(attached.alive, false, 'explicit emitter destruction also ends an unborn/short attached beam');
    assert.equal(detached.alive, true, 'independent laser lifetime is not tied to another emitter');
    assert.equal(battle.projectiles.ownedLasers.size, 0);
    battle.projectiles.updateLasers();
    assert.ok(!battle.projectiles.lasers.has(attached));
  } finally { f.dispose(); }
});

test('terminal ECL613 adapter erases protected/offscreen bullets, beams and debris without a radius limit', () => {
  const f = fixture(), { battle } = f;
  try {
    const b = battle.spawn('XiaoYu', { x: 5000, y: 124 }, {}, 1, { delay: 0, protectedFrames: 90 });
    const state = battle.projectiles.circle(b); state.cancelKind = 1;
    const beam = battle.laser({ x: -80, y: 124 }, 0, 1, { length: 180, width: 12 });
    battle.projectiles.syncLasers();
    const beamState = battle.projectiles.lasers.get(beam); beamState.protectedFrames = 90;
    const debris = battle.projectiles.debris.spawnStraight({ x: 0, y: 120, length: 100, initialLength: 100, width: 12 });
    debris.protectedFrames = 90;
    battle.projectiles.finishLasers(); assert.equal(beam.alive, true); assert.equal(debris.state, 2);
    assert.ok(battle.projectiles.clearAll() > 1);
    assert.equal(b.alive, false); assert.equal(state.cancelKind, 1);
    assert.equal(beam.alive, false); assert.equal(beamState.state, 1); assert.equal(debris.state, 1);
    assert.equal(battle.projectiles.lasers.size, 0);
  } finally { f.dispose(); }
});

test('birth-frame cancellation immediately uses the shared style effect and final laser clear keeps its ANM tail', { skip: !hasAssets }, () => {
  const f = fixture(true), { battle } = f;
  try {
    const b = battle.spawn('XiaoYu', { x: 0, y: 124 }, {}, 1, { delay: 30 });
    const state = battle.projectiles.circle(b); state.cancelKind = 1;
    assert.equal(battle.bulletVisuals.visuals.size, 0);
    battle.projectiles.cancel(0, 100, 16, 0, 0, true, { nearby: true, reason: 'bonus' });
    const visual = battle.bulletVisuals.visuals.get(b), effect = battle.bulletVisuals.effects[0];
    assert.equal(visual.phase, 'cancel'); assert.equal(effect.scriptId, state.style.cancelScript);
    assert.equal(effect.x, 0); assert.equal(effect.y, 100); assert.equal(effect.alive, true);
    assert.equal(state.cancelScript, state.style.cancelScript); assert.equal(state.cancelType, state.style.cancelType);
    battle.laser({ x: -80, y: 124 }, 0, 1, { length: 180, width: 12 });
    battle.projectiles.clearAll();
    assert.ok(battle.projectiles.debris.effects.length > 0);
    assert.ok(battle.projectiles.debris.effects.every(animation => animation.alive));
  } finally { f.dispose(); }
});
