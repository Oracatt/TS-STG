import type {TouhouDamageTarget,TouhouExpandingDamageRegion,TouhouPlayer,TouhouPlayerContext,TouhouView,TouhouDamageRegion} from './player.js';
import type {DrawList} from '../index.js';
import type {AnmInstance} from './anm.js';
interface ReimuBombOrb {ordinal:number;timer:TouhouTimer;x:number;y:number;centerX:number;centerY:number;radius:number;angle:number;radialVelocity:number;turnRate:number;speed:number;mode:number;dx:number;dy:number;active:boolean;damage:number;totalDamage:number;damageLife:number;animation?:AnmInstance}
import { f32, PI, add, sub, mul, div, polar, snap, wrapAngle, angleDifference, atan2, sqrt, rectangleCircle, TouhouTimer } from './math.js';

/** Immediate damage query. Host adapters may replace this with the original damage-region controller. */
export function applyTouhouDamage(region: TouhouDamageRegion, context: TouhouPlayerContext): number {
  if (context.damageRegion) return context.damageRegion(region) ?? 0;
  let total = 0;
  for (const enemy of context.enemies ?? []) {
    if (enemy.alive === false || enemy.excluded || enemy.invulnerable) continue;
    const hit = region.shape === 'circle' ?
      add(mul(sub(enemy.x, region.x), sub(enemy.x, region.x)), mul(sub(enemy.y, region.y), sub(enemy.y, region.y))) <= mul(add(region.radius, enemy.radius ?? 0), add(region.radius, enemy.radius ?? 0)) :
      rectangleCircle(region.x, region.y, region.width, region.height, region.angle, enemy.x, enemy.y, enemy.radius ?? 0);
    if (!hit) continue;
    total += region.damage;
    if (context.damageEnemy) context.damageEnemy(enemy, region.damage, region);
    else if (enemy.damage) enemy.damage(region.damage, region, context);
    else if (Number.isFinite(enemy.hp)) { enemy.hp! -= region.damage; if (enemy.hp! <= 0) enemy.alive = false; }
  }
  return total;
}
function nearest(enemies: TouhouDamageTarget[]|undefined, x: number, y: number, radius: number) {
  let target = null, best = mul(radius, radius);
  for (const enemy of enemies ?? []) {
    if (enemy.alive === false || enemy.excluded) continue;
    const dx = sub(enemy.x, x), dy = sub(enemy.y, y), distance = add(mul(dx, dx), mul(dy, dy));
    if (distance < best) { best = distance; target = enemy; }
  }
  return target;
}
const updateVisual = (visual: AnmInstance|null|undefined, x: number, y: number) => { if (visual?.alive) { visual.x = x; visual.y = y; visual.update(); } };

/** bomb_system/reimu.cpp, with the original 0/40 spawn, 90+10*n launch and 240 retirement. */
export class TouhouReimuBomb {
  aura: AnmInstance | undefined;

  player:TouhouPlayer;
  timer:TouhouTimer;
  alive:boolean;
  orbs:ReimuBombOrb[];
  explosions:TouhouExpandingDamageRegion[];

  constructor(player: TouhouPlayer, context: TouhouPlayerContext = {}) {
    this.player = player; this.timer = new TouhouTimer(0); this.alive = true;
    this.orbs = []; this.explosions = [];
    this.aura = player.bank?.create(61, { x: player.x, y: player.y });
    context.sound?.(49, 0); context.onEvent?.('bombStart', { character: 0, bomb: this });
  }
  spawnWave(second: boolean, context: TouhouPlayerContext) {
    let angle = 0;
    if (second) context.sound?.(44, this.player.x);
    for (let ordinal = 0; ordinal < 8; ordinal++) {
      const orb = { ordinal, timer: new TouhouTimer(0), x: 0, y: 0, centerX: this.player.x, centerY: this.player.y,
        radius: 0, angle: wrapAngle(angle), radialVelocity: div(second ? -PI : PI, 64),
        turnRate: div(second ? -PI : PI, 30), speed: 0, mode: 2, dx: 0, dy: 0, active: true,
        damage: second ? 7 : 15, totalDamage: 0, damageLife: 9999,
        animation: this.player.bank?.create(46, { x: 0, y: 0 }) };
      this.orbs.push(orb); angle = wrapAngle(add(angle, div(mul(PI, 2), 8)));
      context.onEvent?.('bombOrb', { orb });
    }
  }
  retireOrb(orb: ReimuBombOrb, context: TouhouPlayerContext) {
    if (orb.active) {
      context.sound?.(27, orb.x);
      context.cancelCircle?.(orb.x, orb.y, 128, { bullets: true, lasers: true, reward: true, reason: 'reimu-orb-retire' });
      const region:TouhouExpandingDamageRegion = { shape: 'circle', x: orb.x, y: orb.y, radius: 64, growth: 8, remaining: 11, damage: 100, bomb: true };
      if (this.player.damageRegions) this.player.damageRegions.push(region);
      else this.explosions.push(region);
    }
    // env::interrupt addresses the root and its registered children. The
    // old orb cores (49/51/53) must stop as the burst children (50/52/54) start.
    // Source frame240 also interrupts already-retiring roots still alive,
    // without applying their damage/cancellation a second time.
    orb.animation?.interrupt(1, true); orb.active = false;
  }
  updateOrb(orb: ReimuBombOrb, context: TouhouPlayerContext) {
    const time = orb.timer.current, launch = orb.ordinal * 10 + 90;
    if (time !== orb.timer.previous) {
      if (time < 90) {
        orb.centerX = this.player.x; orb.centerY = this.player.y;
        orb.radius = add(orb.radius, 1.5); orb.angle = wrapAngle(add(orb.angle, orb.turnRate));
      } else if (time < launch) {
        orb.centerX = this.player.x; orb.centerY = this.player.y; orb.angle = wrapAngle(add(orb.angle, orb.turnRate));
      } else if (time === launch) {
        orb.mode = 0; orb.angle = wrapAngle(atan2(orb.dy, orb.dx));
        orb.speed = sqrt(add(mul(orb.dx, orb.dx), mul(orb.dy, orb.dy)));
      } else {
        const target = nearest(context.enemies, orb.x, orb.y, 512);
        if (!target) {
          const bounds = this.player.bounds ?? { x: -192, y: 0, width: 384, height: 448 };
          if (orb.x < bounds.x + 32 || orb.x > bounds.x + bounds.width - 32 || orb.y < bounds.y + 32 || orb.y > bounds.y + bounds.height - 32) orb.speed = mul(orb.speed, .9);
        } else {
          const bearing = atan2(sub(target.y, orb.y), sub(target.x, orb.x));
          const difference = angleDifference(bearing, orb.angle);
          if (Math.abs(difference) < div(PI, 4)) {
            if (Math.abs(difference) < div(PI, 12)) orb.speed = Math.min(8, add(orb.speed, .2));
          } else orb.speed = Math.max(1, sub(orb.speed, .7));
          orb.angle = wrapAngle(add(orb.angle, mul(difference, .1)));
        }
      }
    }
    const previousX = orb.x, previousY = orb.y, rate = context.clockScale ?? 1;
    if (orb.mode === 2) {
      orb.radius = add(mul(rate, orb.radialVelocity), orb.radius);
      orb.angle = wrapAngle(add(mul(rate, orb.speed), orb.angle));
      const delta = polar(orb.angle, orb.radius);
      orb.x = snap(add(orb.centerX, delta.x)); orb.y = snap(add(orb.centerY, delta.y));
    } else {
      const delta = polar(orb.angle, mul(rate, orb.speed));
      orb.x = snap(add(orb.x, delta.x)); orb.y = snap(add(orb.y, delta.y));
    }
    orb.dx = sub(orb.x, previousX); orb.dy = sub(orb.y, previousY);
    orb.timer.tick(context.timerRate ?? 1);
    if (orb.totalDamage >= 300) {
      this.retireOrb(orb, context); context.sound?.(27, orb.x);
      context.onEvent?.('screenEffect', { type: 1, duration: 4, parameters: [6, 6, 0, 109] });
    } else if (orb.damageLife % 3 === 0) orb.totalDamage += applyTouhouDamage({ shape: 'circle', x: orb.x, y: orb.y,
      radius: 56, damage: orb.damage, bomb: true, source: orb }, context);
    orb.damageLife--;
  }
  update(context: TouhouPlayerContext = {}): void {
    this.player.invulnerability.set(40);
    if (this.timer.current >= 120 && !this.orbs.some(orb => orb.animation ? orb.animation.alive : orb.active)) {
      this.aura?.interrupt(1, true); this.alive = false; return;
    }
    if (this.timer.current === 240) { for (const orb of this.orbs) this.retireOrb(orb, context); this.aura?.interrupt(1, true); }
    else {
      if (this.timer.current !== this.timer.previous && (this.timer.current === 0 || this.timer.current === 40)) this.spawnWave(this.timer.current === 40, context);
      for (const orb of this.orbs) {
        if (orb.active) this.updateOrb(orb, context);
      }
      this.orbs.forEach((orb, index) => {
        if (orb.active && this.timer.current % 8 === index % 8)
          context.cancelCircle?.(orb.x, orb.y, 64, { bullets: true, lasers: true, reward: false, reason: 'reimu-orb' });
      });
    }
    // Source Bomb callback33 queues retirement before registered ANM44 runs.
    // Advance every animation once after gameplay, including the frame240
    // branch; otherwise both orb bursts and the aura exit begin a frame late.
    updateVisual(this.aura, this.player.x, this.player.y);
    for (const orb of this.orbs) updateVisual(orb.animation, orb.x, orb.y);
    for (const region of this.explosions) {
      applyTouhouDamage(region, context); region.radius = add(region.radius, region.growth); region.remaining--;
    }
    this.explosions = this.explosions.filter(region => region.remaining > 0);
    this.timer.tick(context.timerRate ?? 1);
  }
  draw(draw: DrawList, view?: TouhouView): void { this.aura?.draw(draw, view); for (const orb of this.orbs) orb.animation?.draw(draw, view); }
  destroy(): void { this.alive = false; this.aura?.destroy(); for (const orb of this.orbs) orb.animation?.destroy(); }
}

/** bomb_system/marisa.cpp. Cancellation follows original ANM57 child positions and scale. */
export class TouhouMarisaBomb {
  x: number;
  y: number;
  beam: AnmInstance | undefined;
  aura: AnmInstance | undefined;

  player:TouhouPlayer;
  timer:TouhouTimer;
  alive:boolean;
  angle:number;

  constructor(player: TouhouPlayer, context: TouhouPlayerContext = {}) {
    this.player = player; this.timer = new TouhouTimer(0); this.alive = true;
    // Unlike Reimu::start, Marisa::start never timer_set: the zero-constructed
    // timer has previous==current on the first update, so frame0 creates no damage.
    this.timer.previous = 0;
    this.x = player.x; this.y = player.y; this.angle = f32(-1.5707963705062866);
    this.beam = player.bank?.create(51, { x: this.x, y: this.y });
    this.aura = player.bank?.create(65, { x: this.x, y: this.y });
    player.invulnerability.set(120); player.bombBlocksShots = true;
    context.sound?.(49, 0); context.onEvent?.('bombStart', { character: 1, bomb: this });
    context.onEvent?.('screenEffect', { type: 8, duration: 3, parameters: [60, 240, 30, 109] });
  }
  update(context: TouhouPlayerContext = {}): void {
    const player = this.player; player.invulnerability.set(40);
    if (this.beam && !this.beam.alive) { this.aura?.interrupt(1, true); this.alive = false; player.bombBlocksShots = false; return; }
    if (this.timer.current <= 300) {
      if (this.timer.current === 300) {
        // character_environment::interrupt uses interrupt_animation_children.
        // pl01:52–56 need event1 to shrink/fade in ten frames; interrupting only
        // root51 leaves full-size beams until its forty-frame retirement.
        this.beam?.interrupt(1, true); this.aura?.interrupt(1, true);
        player.movementScale = 1; player.bombBlocksShots = false;
      }
      if (this.beam) this.beam.rotation = this.angle;
      const step = f32(.0026179938577115536);
      if (player.motionX < 0) this.angle = wrapAngle(sub(this.angle, step));
      else if (player.motionX > 0) this.angle = wrapAngle(add(this.angle, step));
      // Source deliberately writes .5 even on frame300, after restoring1.
      player.movementScale = f32(.5); this.x = player.x; this.y = player.y;
      if (this.timer.current !== this.timer.previous && this.timer.current % 3 === 0) {
        const distances = [208, 240, 304], heights = [32, 128, 256], damage = [50, 15, 15];
        for (let index = 0; index < 3; index++) {
          const delta = polar(this.angle, distances[index]);
          applyTouhouDamage({ shape: 'rectangle', x: add(delta.x, this.x), y: add(delta.y, this.y),
            width: 512, height: heights[index], angle: this.angle, damage: damage[index], bomb: true, source: this }, context);
        }
      }
    }
    const visit = (animation: AnmInstance|undefined) => {
      for (const child of animation?.children ?? []) {
        if (child.scriptId === 57 && child.alive) {
          const position = child.worldPosition?.();
          if (!position) throw new Error('Marisa bomb requires ANM child worldPosition()');
          context.cancelRectangle?.(position.x, position.y, mul(this.beam!.scaleX, 48), mul(this.beam!.scaleY, 160), this.angle,
            { bullets: true, lasers: true, reward: false, reason: 'marisa-beam' });
        }
        visit(child);
      }
    };
    visit(this.beam);
    updateVisual(this.beam, this.x, this.y); updateVisual(this.aura, this.x, this.y);
    this.timer.tick(context.timerRate ?? 1);
    if (!this.beam && this.timer.current > 300) { this.alive = false; player.bombBlocksShots = false; }
  }
  draw(draw: DrawList, view?: TouhouView): void { this.beam?.draw(draw, view); this.aura?.draw(draw, view); }
  destroy(): void { this.alive = false; this.beam?.destroy(); this.aura?.destroy(); this.player.bombBlocksShots = false; }
}
