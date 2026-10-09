import { performance } from 'node:perf_hooks';
import { World } from '../packages/thlib/dist/world.js';
import { Bullet } from '../packages/thlib/dist/bullets.js';
import { DrawList } from '../packages/thlib/dist/render.js';

const count = Number(process.argv[2] ?? 5000), frames = Number(process.argv[3] ?? 240);
if (!Number.isInteger(count) || count < 1 || count > 100000 || !Number.isInteger(frames) || frames < 1)
  throw new RangeError('Usage: node tools/benchmark.mjs [1..100000 bullets] [positive frames]');
const world = new World({ seed: 83 });
for (let i = 0; i < count; i++) world.spawn(new Bullet({ x: 40 + world.rng.float() * 550,
  y: 30 + world.rng.float() * 650, angle: world.rng.float() * Math.PI * 2, speed: 1.2,
  autoCull: false, bounce: true, lifetime: frames + 100, angularVelocity: .001 }));
const draw = new DrawList(), times = [];
for (let i = 0; i < frames + 30; i++) {
  const start = performance.now();
  world.update(); world.queryCircle(320, 600, 24, 'enemyBullet');
  draw.reset(); world.draw(draw);
  if (i >= 30) times.push(performance.now() - start);
}
times.sort((a,b) => a-b);
console.log(JSON.stringify({ runtime: `Node ${process.version}`, bullets: count, measuredFrames: frames,
  updateCollisionAndDrawMedianMs: +times[Math.floor(times.length / 2)].toFixed(3),
  p95Ms: +times[Math.floor(times.length * .95)].toFixed(3), commands: draw.commands.length,
  note: 'CPU-side JS benchmark only; native QuickJS and GPU performance require separate measurement.' }, null, 2));
