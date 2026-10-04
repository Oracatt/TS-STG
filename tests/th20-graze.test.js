import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Th20ShortLine, Th20GrazeEffects } from '../games/touhou20/src/short-line.js';
import { Th20RNG } from '../games/touhou20/src/math.js';
import { DrawList } from '../packages/thlib/src/render.js';
const vectors = JSON.parse(fs.readFileSync(new URL('./fixtures/th20-player-vectors.json', import.meta.url)));
const bits = value => new Uint32Array(new Float32Array([value]).buffer)[0];
test('original graze ShortLine20 trajectory, random stream and alpha match C++ bits', () => {
  let seed, rng, line;
  for (const [nextSeed, index, ...expected] of vectors.graze) {
    if (nextSeed !== seed) { seed = nextSeed; rng = new Th20RNG(seed); line = new Th20ShortLine({ color: 0xff9abcee, rng }); }
    line.update(); assert.deepEqual([bits(line.positions[index].x), bits(line.positions[index].y), bits(line.angle), line.colors[0], line.colors[index], rng.state], expected);
  }
  line.update(); assert.equal(line.alive, false);
});
test('graze requests honor exact enqueue delay and draw colored line strips', () => {
  const effects = new Th20GrazeEffects(); effects.enqueue({ x: 10, y: 150, color: 0xff9abcee, delay: 3 });
  for (let i = 0; i < 3; i++) { effects.update(); assert.equal(effects.lines.length, 0); }
  effects.update(); assert.equal(effects.lines.length, 1); assert.equal(effects.lines[0].age.current, 2);
  const draw = new DrawList(); effects.draw(draw); assert.equal(draw.commands[0][0], 'lineStrip'); assert.equal(draw.commands[0][1].length, 2);
  for (let i = 0; i < 19; i++) effects.update(); assert.equal(effects.lines.length, 0);
});
