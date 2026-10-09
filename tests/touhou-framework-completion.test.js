import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TouhouGame, TouhouItems, TouhouBulletField, TouhouLaserField, createTouhouResources } from '../packages/thlib/dist/touhou/index.js';
import { TouhouPhaseSequence } from '../packages/thlib/dist/touhou/phase-sequence.js';

const fixture = (options = {}) => {
  const resources = createTouhouResources({ readText: file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), loadTexture: () => 1 });
  const game = new TouhouGame({ banks: resources.banks, font: resources.font, sht: resources.shots[0], styles: resources.styles, ...options });
  return { game, dispose() { game.destroy(); resources.dispose(); } };
};

test('natural phase completion waits for enter, nested attack and leave owners, then notifies once', () => {
  const trace = [], context = { label: 'scene' };
  const sequence = new TouhouPhaseSequence([{
    enter: function* (value) { trace.push('enter:' + value.label); yield 2; trace.push('entered'); },
    run: function* () {
      try { yield (function* () { try { trace.push('attack'); yield 2; } finally { trace.push('attack-finished'); } })(); }
      finally { trace.push('run-finished'); }
    },
    leave: function* () { trace.push('leave'); yield 2; trace.push('left'); },
  }], { context, onComplete(value, owner) { assert.equal(value, context); assert.equal(owner.completed, true); trace.push('complete'); } });
  sequence.update(); assert.equal(sequence.state, 'enter'); assert.equal(sequence.finish(), false);
  for (let frame = 0; frame < 12; frame++) sequence.update();
  assert.deepEqual(trace, ['enter:scene', 'entered', 'attack', 'attack-finished', 'run-finished', 'leave', 'left', 'complete']);
  assert.equal(sequence.alive, false); assert.equal(sequence.state, 'complete'); assert.equal(sequence.tasks.size, 0);
  assert.equal(sequence.phaseTasks, null); assert.equal(sequence.finish(), false);
  const snapshot = sequence.snapshot(); sequence.update(); sequence.destroy();
  assert.deepEqual(sequence.snapshot(), snapshot); assert.equal(trace.filter(value => value === 'complete').length, 1);
});

test('cancelling during phase enter or leave closes its suspended generator and prevents completion', () => {
  for (const step of ['enter', 'leave']) {
    const trace = [], phase = { run() { trace.push('run'); } };
    phase[step] = function* () { try { trace.push(step); yield 100; trace.push('resumed'); } finally { trace.push('cleanup'); } };
    const sequence = new TouhouPhaseSequence([phase, { run() { trace.push('next'); } }], { onComplete() { trace.push('complete'); } });
    sequence.update(); assert.equal(sequence.state, step);
    sequence.destroy(); sequence.destroy(); sequence.update();
    assert.deepEqual(trace, step === 'enter' ? ['enter', 'cleanup'] : ['run', 'leave', 'cleanup']);
    assert.equal(sequence.alive, false); assert.equal(sequence.completed, false); assert.equal(sequence.state, 'cancelled');
    assert.equal(sequence.tasks.size, 0);
  }
});

test('an empty phase list completes on its first frame without retaining its task owner', () => {
  let completed = 0;
  const sequence = new TouhouPhaseSequence([], { onComplete() { completed++; } });
  assert.equal(completed, 0); sequence.update(); sequence.update();
  assert.equal(completed, 1); assert.equal(sequence.state, 'complete'); assert.equal(sequence.tasks.size, 0); assert.equal(sequence.alive, false);
});

test('removing one Boss cancels its nested attack scripts without cancelling another Boss sequence', () => {
  const f = fixture(), g = f.game, trace = [];
  const a = g.spawnEnemy({ x: -60, y: 128 }), b = g.spawnEnemy({ x: 60, y: 128 });
  g.registerBoss(a); g.registerBoss(b);
  g.runBossSequence(a, (function* () {
    try { yield (function* () { try { trace.push('a-start'); yield 100; trace.push('a-resumed'); } finally { trace.push('a-child-cleanup'); } })(); }
    finally { trace.push('a-owner-cleanup'); }
  })());
  g.runBossSequence(b, (function* () { trace.push('b-start'); yield 1; trace.push('b-finished'); })());
  try {
    g.update(); assert.deepEqual(trace, ['a-start', 'b-start']);
    assert.equal(g.removeBoss(a), true);
    assert.deepEqual(trace, ['a-start', 'b-start', 'a-child-cleanup', 'a-owner-cleanup']);
    g.update(); assert.equal(trace.at(-1), 'b-finished');
    assert.equal(g.tasks.size, 0); assert.equal(a.alive, false); assert.equal(b.alive, true);
    assert.equal(g.bossRegistry.has(a), false); assert.equal(g.bossRegistry.has(b), true);
    for (let frame = 0; frame < 3; frame++) g.update();
    assert.equal(trace.includes('a-resumed'), false); assert.equal(trace.filter(value => value === 'a-owner-cleanup').length, 1);
  } finally { f.dispose(); }
});

test('game destruction disposes factory-owned resources and an active player Bomb exactly once', () => {
  const disposed = [];
  const factory = (name, Type) => options => { const owner = new Type(options); owner.destroy = () => disposed.push(name); return owner; };
  const f = fixture({ factories: { items: factory('items', TouhouItems), bullets: factory('bullets', TouhouBulletField), lasers: factory('lasers', TouhouLaserField) } }), g = f.game;
  const bomb = { alive: true, destroy() { disposed.push('bomb'); this.alive = false; } };
  g.player.bomb = bomb;
  try {
    g.destroy(); g.destroy();
    assert.deepEqual(disposed.sort(), ['bomb', 'bullets', 'items', 'lasers']);
    assert.equal(bomb.alive, false); assert.equal(g.player.bomb, null);
  } finally { f.dispose(); }
});
