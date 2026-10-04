import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Th20Items } from '../games/touhou20/src/items.js';
import { f32, PI, sub, div } from '../games/touhou20/src/math.js';
import { AnmBank } from '../games/touhou20/src/anm.js';
import { DrawList } from '../packages/thlib/src/render.js';

const vectors = JSON.parse(fs.readFileSync(new URL('./fixtures/th20-player-vectors.json', import.meta.url)));
const bits = value => { const view = new DataView(new ArrayBuffer(4)); view.setFloat32(0, value, true); return view.getUint32(0, true); };
const fromBits = value => { const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, value, true); return view.getFloat32(0, true); };
const player = () => ({ x: 0, y: 400, state: 1, power: 100, lives: 2, bombs: 2 });

test('item frame states, delay, attraction and source float boundaries match compiled C++', () => {
  let key, items, item, p;
  for (const [scenario, clockBits, frame, ...expected] of vectors.items) {
    const currentKey = `${scenario},${clockBits}`;
    if (key !== currentKey) {
      key = currentKey; p = player(); items = new Th20Items({ player: p });
      item = items.spawn({ x: -120, y: 160, state: scenario % 4 + 1, delay: scenario === 0 ? 2 : 0,
        angle: sub(div(-PI, 2), .125), speed: 2 });
      items.speedScale = scenario % 2 ? f32(.4) : 1;
      item.attractionSpeed = item.state >= 3 ? div(5, 3) : 0;
    }
    if (scenario >= 8 && frame >= 20) p.y = 100;
    if (scenario >= 12 && frame >= 40) { p.state = 4; p.y = 400; }
    items.update({ clockScale: fromBits(clockBits) });
    assert.deepEqual([item.state, bits(item.x), bits(item.y), bits(item.vx), bits(item.vy), bits(item.attractionSpeed), item.delay, item.timer.current, bits(items.speedScale)], expected,
      `scenario ${scenario} frame ${frame} scale ${fromBits(clockBits)}`);
  }
});

test('all common score/power rewards match original integer operations and score units', () => {
  for (const [type, power, playerY, itemY, state, pointValue, expectedPower, score, amount] of vectors.itemRewards) {
    const p = { ...player(), y: fromBits(playerY), power, pointValue }, items = new Th20Items({ player: p });
    const actual = items.collect({ type, x: 0, y: fromBits(itemY), state });
    assert.deepEqual([p.power, p.score, actual], [expectedPower, score, amount], `type ${type}, power ${power}, playerY ${p.y}, itemY ${fromBits(itemY)}, state ${state}`);
  }
});

test('point-of-collection is strict, proximity starts next frame, and deathbomb releases pursuit', () => {
  const p = { ...player(), y: 128 }, items = new Th20Items({ player: p });
  const item = items.spawn({ x: 120, y: 350, speed: 0 });
  items.update(); assert.equal(item.state, 1);
  p.y = f32(127.99); items.update(); assert.equal(item.state, 3); assert.equal(item.attractionSpeed, f32(5.2));
  p.state = 4; items.update(); assert.equal(item.state, 1); assert.equal(item.vx, 0); assert.equal(item.vy, 0);
  const local = new Th20Items({ player: player() }), near = local.spawn({ x: 50, y: 400, speed: 0 });
  local.update(); assert.equal(near.state, 4); assert.equal(near.x, 50);
  local.update(); assert.ok(near.x < 50);
});

test('fragments, stock caps and source Extra extend sentinel retain original behavior', () => {
  const p = player(), items = new Th20Items({ player: p });
  items.addBombFragments(2); assert.equal(p.bombs, 2); assert.equal(p.bombFragments, 2);
  items.addBombFragments(2); assert.equal(p.bombs, 3); assert.equal(p.bombFragments, 0, 'overflow discarded');
  items.addLifeFragments(7); assert.equal(p.lives, 4); assert.equal(p.lifeFragments, 1); assert.equal(p.extendCount, 2);
  p.lives = 7; p.lifeFragments = 2; items.addLifeFragments(1); assert.equal(p.lifeFragments, 0);
  p.bombs = 7; p.bombFragments = 2; items.addBombFragments(1); assert.equal(p.bombFragments, 0);
  p.lives = 2; p.extendCount = 9; items.difficulty = 4; items.addLifeFragments(3); assert.equal(p.lives, 2); assert.equal(p.lifeFragments, 3);
});

test('type fifteen counter increments difficulty plus one and stone IDs are never silently remapped', () => {
  const items = new Th20Items({ player: player(), difficulty: 0 });
  for (let difficulty = 0; difficulty < 5; difficulty++) {
    const drops = new Th20Items({ player: player(), difficulty });
    for (let i = 1; i < Math.ceil(10/(difficulty+1)); i++) assert.equal(drops.spawn({ type: 15 }), null);
    assert.equal(drops.spawn({ type: 15 }).type, 2); assert.equal(drops.pointCounter, 0);
  }
  assert.equal(items.spawn({ type: 14 }).type, 6);
  assert.throws(() => items.spawn({ type: 13 }), /stone items are excluded/);
});

test('all eight common collectibles bind and render original bullet and effect ANM scripts', () => {
  const load = name => new AnmBank(JSON.parse(fs.readFileSync(new URL(`../games/touhou20/assets/anm/${name}.json`, import.meta.url))), { loadTexture: () => 1 });
  const items = new Th20Items({ player: player(), bank: load('bullet'), effectBank: load('effect') });
  for (let type = 1; type <= 8; type++) items.spawn({ type, x: -150 + type * 35, y: 140 });
  for (let frame = 0; frame < 90; frame++) { items.update(); const draw = new DrawList(); items.draw(draw); assert.ok(draw.commands.length > 0); }
});
