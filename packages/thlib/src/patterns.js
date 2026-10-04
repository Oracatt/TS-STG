import { Bullet } from './bullets.js';
import { TAU, angleTo } from './math.js';

const countOf = value => {
  if (!Number.isFinite(value) || value < 0 || value > 100000) throw new RangeError('Pattern count must be between 0 and 100000');
  return Math.floor(value);
};
const spawn = (world, options) => world.spawn(new Bullet(options));

/** Pattern helpers return entities; normal JS composition is the pattern language. */
export const Patterns = Object.freeze({
  ring(world, options = {}) {
    const count = countOf(options.count ?? 12), rows = countOf(options.rows ?? 1), result = [];
    for (let row = 0; row < rows; row++) for (let i = 0; i < count; i++) {
      result.push(spawn(world, { ...options, angle: (options.angle ?? 0) + i * TAU / count + row * (options.angleStep ?? 0), speed: (options.speed ?? 2) + row * (options.speedStep ?? 0) }));
    }
    return result;
  },
  fan(world, options = {}) {
    const count = countOf(options.count ?? 5), rows = countOf(options.rows ?? 1), spread = options.spread ?? Math.PI / 3, result = [];
    for (let row = 0; row < rows; row++) for (let i = 0; i < count; i++) {
      const offset = count <= 1 ? 0 : spread * (i / (count - 1) - 0.5);
      result.push(spawn(world, { ...options, angle: (options.angle ?? Math.PI / 2) + offset + row * (options.angleStep ?? 0), speed: (options.speed ?? 2) + row * (options.speedStep ?? 0) }));
    }
    return result;
  },
  aimed(world, options = {}) {
    const target = options.target ?? world.game?.player;
    if (!target) throw new TypeError('An aimed pattern requires a target or world.game.player');
    return Patterns.fan(world, { ...options, count: options.count ?? 1, angle: angleTo({ x: options.x ?? 0, y: options.y ?? 0 }, target) + (options.angle ?? 0) });
  },
  spiral(world, options = {}) {
    const arms = countOf(options.arms ?? 3), count = countOf(options.count ?? 8), result = [];
    for (let step = 0; step < count; step++) for (let arm = 0; arm < arms; arm++) {
      result.push(spawn(world, { ...options, angle: (options.angle ?? 0) + arm * TAU / arms + step * (options.angleStep ?? 0.15), speed: (options.speed ?? 2) + step * (options.speedStep ?? 0.1), delay: (options.delay ?? 0) + step * (options.delayStep ?? 0) }));
    }
    return result;
  },
  random(world, options = {}) {
    const count = countOf(options.count ?? 12), result = [];
    for (let i = 0; i < count; i++) result.push(spawn(world, { ...options, angle: (options.angle ?? 0) + world.rng.float(-(options.spread ?? TAU) / 2, (options.spread ?? TAU) / 2), speed: world.rng.float(options.minSpeed ?? options.speed ?? 1, options.maxSpeed ?? (options.speed ?? 1) + 2) }));
    return result;
  },
  ellipse(world, options = {}) {
    const count = countOf(options.count ?? 24), result = [], rotation = options.angle ?? 0;
    for (let i = 0; i < count; i++) {
      const phase = i * TAU / count, vx = Math.cos(phase) * (options.speedX ?? 3), vy = Math.sin(phase) * (options.speedY ?? 1.5);
      result.push(spawn(world, { ...options, angle: Math.atan2(vy, vx) + rotation, speed: Math.hypot(vx, vy) }));
    }
    return result;
  },
  line(world, options = {}) {
    const count = countOf(options.count ?? 10), result = [], dx = options.dx ?? 12, dy = options.dy ?? 0;
    for (let i = 0; i < count; i++) result.push(spawn(world, { ...options, x: (options.x ?? 0) + dx * i, y: (options.y ?? 0) + dy * i }));
    return result;
  },
});
