import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Th20Player } from '../games/touhou20/src/player.js';
import { Th20ReimuBomb, Th20MarisaBomb } from '../games/touhou20/src/bombs.js';
import { parseTh20Sht } from '../games/touhou20/src/shot-data.js';
import { Th20RNG, Th20Timer, f32 } from '../games/touhou20/src/math.js';
import { AnmBank } from '../games/touhou20/src/anm.js';
import { Keys } from '../packages/thlib/src/input.js';
import { DrawList } from '../packages/thlib/src/render.js';

const data = character => JSON.parse(fs.readFileSync(new URL(`../games/touhou20/assets/shots/pl0${character}.json`, import.meta.url)));
const create = (character = 0, options = {}) => new Th20Player({ character, sht: data(character), ...options });
const bank = character => new AnmBank(JSON.parse(fs.readFileSync(new URL(`../games/touhou20/assets/anm/pl0${character}.json`, import.meta.url))), { loadTexture: () => 1 });
const bits = value => { const buffer = new ArrayBuffer(4), view = new DataView(buffer); view.setFloat32(0, value, true); return view.getUint32(0, true); };
const fromBits = value => { const buffer = new ArrayBuffer(4), view = new DataView(buffer); view.setUint32(0, value, true); return view.getFloat32(0, true); };
const fixturePath = new URL('./fixtures/th20-player-vectors.json', import.meta.url);
const vectors = fs.existsSync(fixturePath) ? JSON.parse(fs.readFileSync(fixturePath)) : null;

test('SHT source checksums and all base shooter records are retained', () => {
  const reimu = data(0), marisa = data(1);
  assert.equal(reimu.patterns.length, 160); assert.equal(marisa.patterns.length, 160);
  assert.equal(reimu.patterns.flat().length, 452); assert.equal(marisa.patterns.flat().length, 404);
  assert.equal(reimu.patterns[4][0].speed, 24); assert.equal(reimu.patterns[4][0].damage, 15);
  assert.equal(marisa.patterns[14].length, 4); assert.deepEqual(marisa.patterns[14][0].callbacks, [8, 4, 0, 2]);
  assert.match(reimu.source.sha256, /^[0-9a-f]{64}$/);
  assert.throws(() => parseTh20Sht(new Uint8Array(8)), /Truncated/);
});

test('player fixed motion matches isolated recovered C++ across characters, focus, diagonal and clock scales', () => {
  assert.ok(vectors, 'Run the TH20 C++ oracle and save tests/fixtures/th20-player-vectors.json');
  for (const [character, mask, rateBits, x, y] of vectors.movement) {
    const p = create(character); p.focusTimer.set(4);
    for (let frame = 0; frame < 73; frame++) p.update(mask, { clockScale: fromBits(rateBits) });
    assert.deepEqual([p.fixedX, p.fixedY], [x, y], `character=${character},mask=${mask},scale=${fromBits(rateBits)}`);
  }
});

test('option smoothing uses wrapped integer products and truncation exactly as C++', () => {
  assert.ok(vectors);
  for (const [target, current, factor, expected] of vectors.options) {
    const p = create(), option = p.options[0];
    p.fixedX = p.fixedY = 0; p.smoothFactor = factor;
    option.normalOffset = { x: target / 128, y: 0 }; option.fixedX = current; option.fixedY = 0; option.changed = 0;
    for (let i = 0; i < 17; i++) p.updateOptions();
    assert.equal(option.fixedX, expected);
  }
});

test('original RNG integer and signed float results match C++ bits', () => {
  assert.ok(vectors); let rng, seed;
  for (const [nextSeed, frame, integer, signedBits] of vectors.rng) {
    if (nextSeed !== seed) { seed = nextSeed; rng = new Th20RNG(seed); }
    const copy = new Th20RNG(); copy.state = rng.state;
    assert.equal(copy.next(), integer, `seed ${seed} frame ${frame}`);
    assert.equal(bits(rng.signed()), signedBits);
  }
});

test('Reimu orbit and launch trajectory matches recovered C++ float bits', () => {
  assert.ok(vectors);
  const player = { x: 0, y: 400, invulnerability: new Th20Timer() }, bomb = new Th20ReimuBomb(player);
  const actual = new Map();
  for (let frame = 0; frame < 230; frame++) {
    player.x = f32((frame % 60 - 30) * .125); bomb.update({});
    bomb.orbs.forEach((orb, index) => {
      const age = frame - (index >= 8 ? 40 : 0);
      if (age % 5 === 0 || age === 189) actual.set(`${index >= 8 ? 1 : 0},${index % 8},${age}`,
        [orb.x, orb.y, orb.radius, orb.angle, orb.speed].map(bits));
    });
  }
  for (const [second, index, frame, ...expected] of vectors.orbs)
    assert.deepEqual(actual.get(`${second},${index},${frame}`), expected, `wave ${second} orb ${index} frame ${frame}`);
});

test('Marisa steering, first-frame timer and three damage centers match C++ bits', () => {
  assert.ok(vectors);
  const player = { x: 32, y: 400, motionX: 0, invulnerability: new Th20Timer() };
  const bomb = new Th20MarisaBomb(player), actual = []; let frame = 0, index = 0;
  const context = { damageRegion: region => { actual.push([frame, [208, 240, 304][index++ % 3], bits(region.angle), bits(region.x), bits(region.y)]); return 0; } };
  for (; frame <= 300; frame++) {
    player.motionX = frame % 90 < 30 ? -1 : frame % 90 < 60 ? 0 : 1;
    bomb.update(context);
  }
  assert.deepEqual(actual, vectors.marisa);
});

test('original player hit uses squared radii and the exact eight-frame deathbomb gate', () => {
  const p = create();
  assert.equal(p.collisionCircle(p.x + 5, p.y, 4), 2, '3^2+4^2 boundary is graze, not conventional summed radii hit');
  assert.equal(p.collisionCircle(p.x + 4.9, p.y, 4), 1); assert.equal(p.state, 4);
  for (let i = 0; i < 8; i++) p.update(0);
  p.update(Keys.BOMB); assert.equal(p.state, 2); assert.equal(p.lives, 1); assert.equal(p.bombs, 2);
  const rescued = create(); rescued.hit();
  for (let i = 0; i < 7; i++) rescued.update(0);
  rescued.update(Keys.BOMB); assert.equal(rescued.state, 1); assert.equal(rescued.lives, 2); assert.equal(rescued.bombs, 1);
});

test('death power loss, bomb restoration and sixty-frame entry follow the recovered state machine', () => {
  const p = create(0, { power: 400, bombs: 0 });
  p.hit(); for (let i = 0; i < 12; i++) p.update(0);
  assert.equal(p.power, 320);
  while (p.state === 2) p.update(0);
  assert.equal(p.state, 0); assert.equal(p.y, 480); assert.equal(p.bombs, 2);
  while (p.state === 0) p.update(0);
  assert.equal(p.state, 1); assert.equal(p.y, 400); assert.ok(p.invulnerability.current >= 219);
});

test('firing finishes its fourteen-frame cycle after button release, retaining original row ordering', () => {
  const p = create(); p.shotGate.set(20);
  p.update(Keys.SHOOT); assert.equal(p.shots.length, 5); assert.equal(p.shots[0].pattern, 6);
  let created = 5;
  const ctx = { onEvent: name => { if (name === 'shot') created++; } };
  for (let i = 0; i < 14; i++) p.update(0, ctx);
  assert.equal(created, 25); assert.equal(p.shootTimer.current, -1);
});

test('original ANM assets render both characters, full-power options, shots, focus and bombs without substitutes', () => {
  for (const character of [0, 1]) {
    const p = create(character, { power: 400, bank: bank(character) });
    for (let frame = 0; frame < 350; frame++) {
      p.update((frame < 50 ? Keys.SHOOT : 0) | (frame > 20 && frame < 80 ? Keys.FOCUS : 0) | (frame === 90 ? Keys.BOMB : 0));
      if (frame % 35 === 0) { const draw = new DrawList(); p.draw(draw); assert.ok(draw.commands.length > 0); }
    }
  }
});
