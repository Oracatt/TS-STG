// Native-host entry. Run directly for the default 2,000-bullet workload, or use
// benchmark-native.mjs to set counts and also measure complete process wall time.
import { World } from '../packages/thlib/dist/world.js';
import { Bullet } from '../packages/thlib/dist/bullets.js';
import { DrawList } from '../packages/thlib/dist/render.js';

const config = globalThis.__tsstg_benchmark_config ?? {};
const count = config.count ?? 2000;
const measuredFrames = config.frames ?? 240;
const warmupFrames = config.warmup ?? 30;
for (const [name, value, minimum, maximum] of [
  ['count', count, 1, 50000], ['frames', measuredFrames, 1, 100000], ['warmup', warmupFrames, 0, 10000],
]) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`Benchmark ${name} must be an integer between ${minimum} and ${maximum}`);
}

const world = new World({ seed: 83 });
const totalFrames = warmupFrames + measuredFrames;
for (let i = 0; i < count; i++) {
  world.spawn(new Bullet({
    x: 40 + world.rng.float() * 550, y: 30 + world.rng.float() * 650,
    angle: world.rng.float() * Math.PI * 2, speed: 1.2,
    autoCull: false, bounce: true, lifetime: totalFrames + 100, angularVelocity: 0.001,
  }));
}

const draw = new DrawList(), samples = [];
let frame = 0, lastMeasuredFrame = -1, start = 0, updated = 0, queried = 0;
let updateTotal = 0, queryTotal = 0, drawTotal = 0, report = null;
const round = value => Math.round(value * 1000) / 1000;

globalThis.__tsstg_game = {
  update() {
    start = Date.now();
    world.update();
    updated = Date.now();
    world.queryCircle(320, 600, 24, 'enemyBullet');
    queried = Date.now();
    frame++;
  },
  render() {
    draw.reset();
    world.draw(draw);
    const rendered = Date.now();
    if (frame > warmupFrames && frame <= totalFrames && frame !== lastMeasuredFrame) {
      samples.push(rendered - start);
      updateTotal += updated - start;
      queryTotal += queried - updated;
      drawTotal += rendered - queried;
      lastMeasuredFrame = frame;
    }
    if (frame === totalFrames && report === null) {
      const sorted = samples.slice().sort((a, b) => a - b);
      report = {
        kind: 'tsstg-native-benchmark-v1', runtime: globalThis.tsstg.backend,
        bullets: count, warmupFrames, measuredFrames: samples.length,
        medianMs: sorted[Math.floor(sorted.length / 2)],
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        meanUpdateMs: round(updateTotal / samples.length),
        meanQueryMs: round(queryTotal / samples.length),
        meanDrawMs: round(drawTotal / samples.length),
        drawCommands: draw.commands.length, timerResolutionMs: 1,
        scope: 'JS update + spatial query + draw-command generation; excludes native command decoding and GPU',
      };
      globalThis.tsstg.log(JSON.stringify(report));
    }
    return draw.commands;
  },
  snapshot() { return report ?? { frame, totalFrames, complete: false }; },
};
