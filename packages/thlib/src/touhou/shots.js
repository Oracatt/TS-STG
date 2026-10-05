import { f32, PI, add, sub, mul, div, polar, snap, wrapAngle, angleDifference, rotate, sqrt, rectangleCircle, TouhouTimer } from './math.js';

const active = enemy => enemy.alive !== false && !enemy.excluded && !enemy.invulnerable;

function releaseLaserGroup(shot) {
  // The original releases the group when retirement starts. Its ANM tail can
  // outlive a replacement beam, so later cleanup must only release this owner.
  const groups = shot.player.laserGroups;
  if (groups.get(shot.row.group) === shot) groups.delete(shot.row.group);
}

/** Original base-character SHT shooter (profiles 0..14); unsupported callbacks are explicit errors. */
export class TouhouShot {
  constructor(player, row, pattern, index, context) {
    this.player = player; this.row = row; this.pattern = pattern; this.index = index;
    this.id = player.nextShotId++; this.alive = true; this.state = 1; this.timer = new TouhouTimer(0);
    this.angle = wrapAngle(row.angle); this.speed = row.speed; this.damage = row.damage;
    this.width = row.size.x; this.height = row.size.y; this.contact = false; this.contactVisual = false;
    this.option = row.source ? player.options[(row.source & 15) - 1] : null;
    const origin = this.option ?? player;
    this.x = f32(origin?.x ?? 0); this.y = f32(origin?.y ?? 0); this.z = 0;
    const velocity = polar(this.angle, mul(context.timerRate ?? 1, this.speed));
    this.x = add(this.x, row.type >= 4 && row.type <= 6 ? row.origin.x : sub(row.origin.x, velocity.x));
    this.y = add(this.y, row.type >= 4 && row.type <= 6 ? row.origin.y : sub(row.origin.y, velocity.y));
    this.animation = player.bank?.create(row.animation, { x: this.x, y: this.y }) ?? null;
    if (this.animation) this.animation.scale2X = this.animation.scale2Y = row.type === 2 ? 1 : f32(1.1);
    if (row.callbacks[0] === 8) { this.width = 0; context.sound?.(20, player.x); }
    else if (row.callbacks[0] !== 0) throw new Error(`Unported TOUHOU shot initialization callback ${row.callbacks[0]}`);
    if (row.sound >= 0) context.sound?.(row.sound, this.x);
    this.orientAnimation();
  }
  orientAnimation() {
    const animation = this.animation;
    if (!animation) return;
    switch (animation.orientation) {
      case 1: animation.rotation = this.angle; break;
      case 2:
        if (this.angle >= div(-PI, 2) && this.angle <= div(PI, 2)) { animation.rotation = this.angle; animation.scaleX = Math.abs(animation.scaleX); }
        else { animation.rotation = wrapAngle(add(this.angle, PI)); animation.scaleX = -Math.abs(animation.scaleX); }
        break;
      case 3: animation.rotation = wrapAngle(add(this.angle, PI)); break;
      case 4: animation.rotation = wrapAngle(add(this.angle, div(PI, 2))); break;
      case 5: animation.rotation = wrapAngle(angleDifference(this.angle, div(PI, 2))); break;
      default: break;
    }
  }
  update(context) {
    const row = this.row, rate = context.timerRate ?? 1;
    if (row.lifetime > 0 && this.timer.current >= row.lifetime) { this.animation?.interrupt(1); this.timer.set(-999); }
    if (row.callbacks[1] === 4) this.updateLaser(context);
    else if (row.callbacks[1] !== 0) throw new Error(`Unported TOUHOU shot update callback ${row.callbacks[1]}`);
    if (this.state !== 2) { this.angle = wrapAngle(add(this.angle, row.angularVelocity)); this.speed = add(this.speed, row.acceleration); }
    const velocity = polar(this.angle, mul(rate, this.speed));
    this.x = snap(add(this.x, velocity.x)); this.y = snap(add(this.y, velocity.y));
    if (this.animation && !this.animation.alive) { this.destroy(); return; }
    if (row.type !== 2 && row.type !== 8 && this.timer.current >= 15 && this.outside()) { this.destroy(); return; }
    this.orientAnimation();
    if (this.animation) { this.animation.x = this.x; this.animation.y = this.y; this.animation.update(); }
    this.timer.tick(rate);
  }
  outside() {
    const bounds = this.player.bounds ?? { x: -192, y: 0, width: 384, height: 448 };
    const right = bounds.x + bounds.width, bottom = bounds.y + bounds.height;
    // Uses transformed sprite corners when available (frame_helpers.cpp). No hitbox-as-sprite substitution.
    if (this.animation?.corners) return this.animation.corners().every(p => p.x <= bounds.x || p.x >= right || p.y <= bounds.y || p.y >= bottom);
    // Headless state-only callers provide no sprite; center plus original SHT full extents is conservative.
    return this.x + this.width < bounds.x || this.x - this.width > right || this.y + this.width < bounds.y || this.y - this.width > bottom;
  }
  updateLaser(context) {
    const row = this.row, player = this.player, origin = this.option ?? player;
    this.x = add(origin.x, row.origin.x); this.y = add(origin.y, row.origin.y);
    const desired = wrapAngle(row.angle);
    if (Math.abs(wrapAngle(angleDifference(this.angle, desired))) <= f32(.001)) this.angle = desired;
    else this.angle = wrapAngle(add(wrapAngle(mul(wrapAngle(angleDifference(desired, this.angle)), .4)), this.angle));
    if (this.state === 2) return;
    if (this.width < 512) this.width = add(this.width, 18);
    const damageCenter=polar(this.angle,div(this.width,2));
    this.damagePosition={x:add(origin.x,damageCenter.x),y:add(origin.y,damageCenter.y),z:0};
    if (this.animation) { this.animation.width = this.width; this.animation.textureScaleX = div(this.width, 512); }
    this.damage = row.damage;
    if (!this.contact && this.contactVisual) { this.animation?.interrupt(3); this.contactVisual = false; }
    let keep = (row.fields3c[0] !== 0 || player.shootTimer.current >= 0) && player.state !== 2 && player.state !== 4 &&
      !player.powerChanged && !context.dialogue && context.enemyReady !== false;
    if (row.fields3c[0] > 0 && this.timer.current >= row.fields3c[0]) keep = false;
    const selected = player.sht.patterns[(player.focused ? 2 : 1) * (player.weaponLevels+1) + player.powerLevel];
    if (this.option && !selected.some(record => (record.source & 15) === this.option.index + 1 && record.type === 2)) keep = false;
    if (!keep) { this.state = 2; this.animation?.interrupt(1); releaseLaserGroup(this); context.stopSound?.(20); }
    this.contact = false;
  }
  collisions(context) {
    if (!this.alive || this.state !== 1) return;
    const laser = this.row.type === 2;
    for (const enemy of context.enemies ?? []) {
      if (!active(enemy)) continue;
      const center = laser ? this.damagePosition : this;
      if (!rectangleCircle(center.x, center.y, this.width, this.height,
        this.angle, enemy.x, enemy.y, enemy.radius ?? 0)) continue;
      const damage = this.hit(enemy, context);
      if (damage) {
        if (context.damageEnemy) context.damageEnemy(enemy, damage, this);
        else if (enemy.damage) enemy.damage(damage, this, context);
        else if (Number.isFinite(enemy.hp)) { enemy.hp -= damage; if (enemy.hp <= 0) enemy.alive = false; }
      }
      if (this.state !== 1) break;
    }
  }
  hit(enemy, context) {
    const callback = this.row.callbacks[3];
    if (callback === 2) {
      this.contact = true;
      if (!this.contactVisual) { this.animation?.interrupt(2); this.contactVisual = true; }
      const local = rotate(sub(enemy.x, this.x), sub(enemy.y, this.y), -this.angle);
      const radius = add(div(this.height, 2), enemy.radius ?? 0);
      let near = 0;
      if (!(radius < Math.abs(local.y) || local.x < -radius || (local.x < 0 && mul(radius, radius) < add(mul(local.x, local.x), mul(local.y, local.y)))))
        near = sub(local.x, mul(radius, sqrt(sub(1, mul(div(local.y, radius), div(local.y, radius))))));
      this.width = Math.max(0, add(near, 8));
      if (this.timer.previous !== this.timer.current && this.timer.current % 2 === 0 && this.player.bank) {
        const end = polar(this.angle, this.width);
        const visual = this.player.bank.create(this.row.hitAnimation, { x: add(this.x, end.x), y: add(this.y, end.y) });
        visual.rotation = this.angle;
        this.player.effects.push({ animation: visual, age: 0, motion: { angle: this.angle, distance: 64, duration: 20, mode: 4 } });
      }
      return this.timer.previous !== this.timer.current && this.timer.current % 4 === 0 ? this.damage : 0;
    }
    if (callback !== 0 && callback !== 1) throw new Error(`Unported TOUHOU shot hit callback ${callback}`);
    if (callback === 1 && this.player.effectBank) {
      const rng = this.player.rng;
      const angle = wrapAngle(add(wrapAngle(add(this.angle, mul(rng.signed(), mul(div(PI, 180), 20)))), PI));
      const visual = this.player.effectBank.create(148, { x: this.x, y: this.y }); visual.rotation = angle;
      const r = rng.next() % 128 + 127, g = rng.next() % 64 + 64, b = rng.next() % 64 + 64, a = rng.next() % 64 + 96;
      visual.color = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
      this.player.effects.push({ animation: visual, age: 0 });
    }
    // damage_regions/hit_callbacks.cpp: retain the ANM interrupt animation, stop damage, divide speed by eight.
    this.z = f32(.1); this.speed = div(this.speed, 8); this.state = 2; this.animation?.interrupt(1);
    return this.damage;
  }
  destroy() { this.alive = false; this.animation?.destroy(); if (this.row.type === 2) releaseLaserGroup(this); }
  draw(draw, view) { this.animation?.draw(draw, view); }
}

export function fireTouhouPattern(player, pattern, frame, secondary, context) {
  if (!Number.isInteger(pattern)||pattern < 0 || pattern >= 3*((player.weaponLevels??4)+1)) throw new Error(`TOUHOU special weapon profile excluded: ${pattern}`);
  const rows = player.sht.patterns[pattern];
  if (!rows) throw new Error(`Missing SHT pattern ${pattern}`);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.period && (row.secondaryPeriod ? secondary % row.secondaryPeriod !== row.secondaryPhase : frame % row.period !== row.phase)) continue;
    if (row.type === 2 && player.laserGroups.has(row.group)) {
      const existing = player.laserGroups.get(row.group); existing.row = row; existing.pattern = pattern; existing.index = index; continue;
    }
    const shot = player.shotFactory?player.shotFactory(player,row,pattern,index,context):new TouhouShot(player, row, pattern, index, context);
    if(!shot||typeof shot.update!=='function'||typeof shot.collisions!=='function'||typeof shot.draw!=='function'||typeof shot.destroy!=='function')throw new TypeError('Shot factory must return an update/collisions/draw/destroy owner');
    // Original active list prepends, so newer shots update and collide first.
    player.shots.unshift(shot);
    if (row.type === 2) player.laserGroups.set(row.group, shot);
    context.onEvent?.('shot', { shot });
  }
}

/** Default main and focused/unfocused option emission. A custom shoot strategy
 * may call this before or after emitting its own weapons. */
export function fireTouhouPlayerWeapons(player,frame,secondary,context){
  fireTouhouPattern(player,player.powerLevel,frame,secondary,context);
  fireTouhouPattern(player,(player.focused?2:1)*(player.weaponLevels+1)+player.powerLevel,frame,secondary,context);
}
