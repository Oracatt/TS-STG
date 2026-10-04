import { Keys } from '../input.js';
import { f32, PI, add, sub, mul, div, trunc32, polar, atan2, rectangleCircle, TouhouTimer, TouhouRNG } from './math.js';
import { fireTouhouPattern } from './shots.js';
import { TouhouReimuBomb, TouhouMarisaBomb, applyTouhouDamage } from './bombs.js';
import { validateTouhouShots } from './shot-data.js';
import { TOUHOU_OWNER_PRIORITIES } from './render-order.js';
import {touhouCircleCollision} from './bullet-collision.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fixed = value => trunc32(mul(value, 128));
/** Restored base Reimu/Marisa. Coordinates and power use original frame units. */
export class TouhouPlayer {
  constructor({ character = 0, sht, bank = null, effectBank = null, power = 100, lives = 2, bombs = 2,
    state = 1, x = 0, y = 400, seed = 1, rng = null,
    bounds = { x: -192, y: 0, width: 384, height: 448 }, movementInsets = {},
    respawnX = 0, respawnY = 400, respawnStartY = 480 } = {}) {
    if (character !== 0 && character !== 1) throw new RangeError('Touhou character must be 0 (Reimu) or 1 (Marisa)');
    validateTouhouShots(sht);
    this.character = character; this.sht = sht; this.bank = bank; this.effectBank = effectBank;
    this.bounds = { ...bounds }; this.movementInsets = { left: 8, top: 32, right: 8, bottom: 16, ...movementInsets };
    const inset = this.movementInsets;
    if (![bounds.x, bounds.y, bounds.width, bounds.height, ...Object.values(inset), respawnX, respawnY, respawnStartY].every(Number.isFinite) ||
      bounds.width <= inset.left + inset.right || bounds.height <= inset.top + inset.bottom) throw new RangeError('Invalid Touhou player playfield');
    this.movementBounds = { minX: fixed(bounds.x + inset.left), maxX: fixed(bounds.x + bounds.width - inset.right),
      minY: fixed(bounds.y + inset.top), maxY: fixed(bounds.y + bounds.height - inset.bottom) };
    this.respawnX = respawnX; this.respawnY = respawnY; this.respawnStartY = respawnStartY;
    this.rng = rng ?? new TouhouRNG(seed);
    this.fixedX = fixed(x); this.fixedY = fixed(y); this.x = div(this.fixedX, 128); this.y = div(this.fixedY, 128);
    this.state = state; this.timer = new TouhouTimer(0); this.focusTimer = new TouhouTimer(0);
    this.invulnerability = new TouhouTimer(0); this.focused = false;
    this.power = clamp(power | 0, 0, 400); this.lives = clamp(lives | 0, -1, 7); this.bombs = clamp(bombs | 0, 0, 10);
    this.maxPower = 400; this.respawnBombs = 2; this.deaths = 0; this.graze = 0;
    this.startingPower = 100; this.score = 0; this.pointValue = 10000; this.pointItems = 0;
    this.maxLives = 7; this.maxBombs = 7; this.lifeFragments = 0; this.bombFragments = 0; this.extendCount = 0;
    this.collectSpeed = 5; this.collectRadius = 30; this.attractRadius = 70; this.collectLine = 128;
    this.speeds = sht.speeds.map(fixed); this.motionX = 0; this.motionY = 0;
    this.previousMotionX = 0; this.movementScale = 1; this.motionOffsetX = 0; this.motionOffsetY = 0;
    this.smoothFactor = 30; this.history = Array.from({ length: 33 }, () => ({ x: this.fixedX, y: this.fixedY }));
    this.normalRadius = this.focusRadius = 3; this.normalExtent = this.focusExtent = { x: 1.5, y: 1.5 };
    this.collisionPercent = 100; this.deathbombFrames = 8;
    this.options = Array.from({ length: 10 }, (_, index) => ({ index, active: false, fixedX: 0, fixedY: -51200,
      x: 0, y: -400, changed: 0, animation: null, fullAnimation: null, focused: false }));
    this.animation = null; this.animationScript = 0; this.boundThisFrame = false; this.focusEffect = null;
    this.shots = []; this.nextShotId = 1; this.laserGroups = new Map();
    this.shootTimer = new TouhouTimer(-1); this.secondaryShootTimer = new TouhouTimer(-1);
    this.shotGate = new TouhouTimer(0); this.shotAge = new TouhouTimer(0);
    this.effects = []; this.damageRegions = []; this.bomb = null; this.bombBlocksShots = false;
    this.mask = 0; this.previousMask = 0; this.frame = 0; this.powerChanged = true;
    this.stageVisibility = false; this.stageVisibilityAge = 0;
    this.bindAnimation(0); this.refreshPower();
  }
  get powerLevel() { this.power = clamp(this.power | 0, 0, 400); return Math.trunc(this.power / 100); }
  get invulnerableFrames() { return this.invulnerability.current; }
  bindAnimation(script) {
    this.animation?.destroy(); this.animationScript = script;
    this.animation = this.bank?.create(script, { x: this.x, y: this.y }) ?? null;
    this.boundThisFrame = true;
  }
  setPosition(x, y) {
    this.fixedX = fixed(x); this.fixedY = fixed(y); this.x = div(this.fixedX, 128); this.y = div(this.fixedY, 128);
    for (const option of this.options) option.changed = 1;
  }
  refreshPower() {
    const count = this.powerLevel;
    this.powerChanged = true;
    for (const option of this.options) {
      option.animation?.destroy(); option.fullAnimation?.destroy(); option.fullAnimation = null;
      option.active = option.index < count;
      if (!option.active) { option.animation = null; continue; }
      option.focused = this.focused;
      // Original4ff630 dispatches focused_weapon vslot14;4ff760 unfocused_weapon vslot18.
      option.normalOffset = this.sht.offsets[0].normal[count][option.index];
      option.focusOffset = this.sht.offsets[0].focus[count][option.index];
      const offset = this.focused ? option.focusOffset : option.normalOffset;
      option.fixedX = (this.fixedX + fixed(offset.x)) | 0; option.fixedY = (this.fixedY + fixed(offset.y)) | 0;
      option.x = div(option.fixedX, 128); option.y = div(option.fixedY, 128); option.changed = 1;
      option.animation = this.bank?.create(this.sht.optionScripts[0], { x: option.x, y: option.y,beforeStart:vm=>{vm.layer=14;} }) ?? null;
      // power.cpp uses named_spawn flags 2: prepend this registered VM.
      // option_frame.cpp focus replacement instead uses flags 0 below.
      if (this.power >= 400) option.fullAnimation = this.bank?.create(this.sht.fullPowerScripts[0], { x: option.x, y: option.y,front:true }) ?? null;
    }
  }
  setPower(value) { this.power = clamp(value | 0, 0, 400); this.refreshPower(); }
  /** Stage cover retracts options through source interrupt3. The player
   * callback remains enabled: gameplay's "player_primary" is actually the
   * enemy-bullet controller. Cover cleanup retires the separate Bomb owner. */
  finishStageVisibility() {
    if(this.stageVisibility)return this;
    this.stageVisibility=true;this.stageVisibilityAge=0;
    for(const option of this.options){option.animation?.interrupt(3,true);option.fullAnimation?.interrupt(3,true);}
    this.bomb?.destroy();this.bomb=null;this.bombBlocksShots=false;
    return this;
  }
  /** Continue the normal player callback during cover. The application
   * supplies the stage's input/shooting context just as in normal update. */
  updateStageVisibility(mask=0,context={}) { return this.update(mask,context); }
  drawStageVisibility(draw,view={x:336,y:24,scale:1.5,screenScale:1}) {
    return this.draw(draw,view);
  }
  /** Source restore_stage_visibility: resume existing option ANM through2. */
  restoreStageVisibility() {
    if(!this.stageVisibility)return this;
    this.stageVisibility=false;this.stageVisibilityAge=0;
    for(const option of this.options){option.animation?.interrupt(2,true);option.fullAnimation?.interrupt(2,true);}
    return this;
  }
  /** Reuse this player for the next stage without replacing its banks, RNG,
   * position or persistent resource/score record. Source stage_reset.cpp and
   * owner.cpp::clear_shots define these local state resets. */
  resetForStage() {
    this.state=1;this.timer.set(0);this.focusTimer.set(0);
    this.focusEffect?.destroy();this.focusEffect=null;
    for(const shot of this.shots)shot.destroy();this.shots.length=0;this.laserGroups.clear();
    this.shootTimer.set(-1);this.secondaryShootTimer.set(-1);this.shotGate.set(0);
    this.restoreStageVisibility();this.refreshPower();this.bombBlocksShots=false;
    this.movementScale=1;this.deathbombFrames=8;
    this.history=Array.from({length:33},()=>({x:this.fixedX,y:this.fixedY}));
    this.speeds=this.sht.speeds.map(fixed);
    this.collectSpeed=5;this.collectRadius=30;this.attractRadius=70;this.collectLine=128;
    this.normalRadius=this.focusRadius=3;this.normalExtent=this.focusExtent={x:1.5,y:1.5};
    return this;
  }
  updateOptions() {
    for (const option of this.options) {
      if (!option.active) {
        // Retired options are registered ANM roots; their event1 tails keep
        // advancing independently of the option's gameplay state.
        option.animation?.update();option.fullAnimation?.update();
        continue;
      }
      if (option.focused !== this.focused) {
        option.animation?.destroy(); option.fullAnimation?.destroy(); option.fullAnimation = null;
        option.animation = this.bank?.create(this.sht.optionScripts[0], { x: option.x, y: option.y,beforeStart:vm=>{vm.layer=14;} }) ?? null;
        option.animation?.interrupt(7);
        if (this.power >= 400) { option.fullAnimation = this.bank?.create(this.sht.fullPowerScripts[0], { x: option.x, y: option.y }) ?? null; option.fullAnimation?.interrupt(7); }
        option.focused = this.focused;
      }
      const offset = this.focused ? option.focusOffset : option.normalOffset;
      const targetX = this.stageVisibility?this.fixedX:(this.fixedX + fixed(offset.x)) | 0;
      const targetY = this.stageVisibility?this.fixedY:(this.fixedY + fixed(offset.y)) | 0;
      if(this.stageVisibility&&this.stageVisibilityAge>29){
        option.active=false;
        for(const visual of [option.animation,option.fullAnimation])if(visual){visual.interrupt(1,true);visual.update();}
        continue;
      }
      if (option.changed) { option.changed--; option.fixedX = targetX; option.fixedY = targetY; }
      else if (this.smoothFactor > 29) {
        const dx = Math.trunc(Math.imul((targetX - option.fixedX) | 0, this.smoothFactor) / 100);
        const dy = Math.trunc(Math.imul((targetY - option.fixedY) | 0, this.smoothFactor) / 100);
        if (dx === 0 && dy === 0) { option.fixedX = targetX; option.fixedY = targetY; }
        else { option.fixedX = (option.fixedX + dx) | 0; option.fixedY = (option.fixedY + dy) | 0; }
      }
      option.x = div(option.fixedX, 128); option.y = div(option.fixedY, 128);
      for (const visual of [option.animation, option.fullAnimation]) if (visual) {
        visual.x = option.x; visual.y = option.y; visual.update();
      }
    }
  }
  updateMovement(context) {
    const held = key => (this.mask & key) !== 0;
    let direction = 0;
    if (held(Keys.UP) && held(Keys.LEFT)) direction = 5;
    else if (held(Keys.UP) && held(Keys.RIGHT)) direction = 6;
    else if (held(Keys.DOWN) && held(Keys.LEFT)) direction = 7;
    else if (held(Keys.DOWN) && held(Keys.RIGHT)) direction = 8;
    else if (held(Keys.DOWN)) direction = 2;
    else if (held(Keys.UP)) direction = 1;
    else if (held(Keys.LEFT)) direction = 3;
    else if (held(Keys.RIGHT)) direction = 4;
    this.focused = context.enemyReady !== false && this.focusTimer.current >= 4 ? held(Keys.FOCUS) : false;
    if (this.focused && !this.focusEffect) this.focusEffect = this.effectBank?.create(19, { x: this.x, y: this.y }) ?? null;
    else if (!this.focused && this.focusEffect) { this.focusEffect.interrupt(1); this.effects.push({ animation: this.focusEffect, age: 0 }); this.focusEffect = null; }
    const signs = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    const speed = this.speeds[(direction >= 5 ? 2 : 0) + (this.focused ? 1 : 0)];
    let dx = Math.imul(signs[direction][0], speed), dy = Math.imul(signs[direction][1], speed);
    dx = trunc32(mul(f32((fixed(this.motionOffsetX) + dx) | 0), this.movementScale));
    dy = trunc32(mul(f32((fixed(this.motionOffsetY) + dy) | 0), this.movementScale));
    if (dx < 0 && this.previousMotionX >= 0) this.bindAnimation(1);
    else if (dx === 0 && this.previousMotionX < 0) this.bindAnimation(2);
    if (dx > 0 && this.previousMotionX <= 0) this.bindAnimation(3);
    else if (dx === 0 && this.previousMotionX > 0) this.bindAnimation(4);
    this.previousMotionX = dx;
    this.motionX = mul(f32(dx), context.clockScale ?? 1); this.motionY = mul(f32(dy), context.clockScale ?? 1);
    this.fixedX = clamp((this.fixedX + trunc32(this.motionX)) | 0, this.movementBounds.minX, this.movementBounds.maxX);
    this.fixedY = clamp((this.fixedY + trunc32(this.motionY)) | 0, this.movementBounds.minY, this.movementBounds.maxY);
    this.x = div(this.fixedX, 128); this.y = div(this.fixedY, 128);
    if (dx || dy) { this.history.unshift({ x: this.fixedX, y: this.fixedY }); this.history.length = 33; }
    if(this.stageVisibility)this.stageVisibilityAge++;
    this.updateOptions();
  }
  pressed(key) { return (this.mask & ~this.previousMask & key) !== 0; }
  canBomb(context) { return this.bombs > 0 && !this.bomb?.alive && context.enemyReady !== false && !context.bossSuppressed; }
  triggerBomb(context = {}) {
    if (!this.canBomb(context)) return false;
    this.bombs--;
    this.bomb = this.character === 0 ? new TouhouReimuBomb(this, context) : new TouhouMarisaBomb(this, context);
    context.spell?.notifyBombStart(context);
    if (this.state === 4) { this.state = 1; this.timer.set(60); }
    context.onEvent?.('bomb', { player: this }); return true;
  }
  hit(context = {}) {
    if (this.state === 2 || this.state === 3 || this.state === 4 || this.invulnerability.current > 0 || context.bossSuppressed) return false;
    context.spell?.notifyPlayerHit(context);
    this.state = 4; this.timer.set(0); this.invulnerability.set(6); this.deathbombFrames = 8;
    this.bindAnimation(0);
    if (this.effectBank) this.effects.push({ animation: this.effectBank.create(22, { x: this.x, y: this.y }), age: 0 });
    context.sound?.(2, this.x); context.onEvent?.('hit', { x: this.x, y: this.y }); return true;
  }
  beginDeath(context) {
    this.lives = clamp(this.lives - 1, -1, 7); this.deaths = clamp(this.deaths + 1, 0, 999);
    this.state = 2; this.timer.set(0); this.invulnerability.set(180); this.bindAnimation(0);
    if (this.effectBank) this.effects.push({ animation: this.effectBank.create(21, { x: this.x, y: this.y }), age: 0 });
    for (const option of this.options) { option.active = false; option.animation?.interrupt(1); option.fullAnimation?.interrupt(1); }
    context.spell?.notifyPlayerMiss(context);
    context.onEvent?.('miss', { player: this });
  }
  updateShooting(context) {
    const rate = context.timerRate ?? 1;
    const allowed = context.enemyReady !== false && !context.dialogue && this.shotGate.current >= 20 && !this.bombBlocksShots;
    if (!allowed) { this.shootTimer.set(-1); this.secondaryShootTimer.set(-1); }
    else if (!context.inputBlocked) {
      if (this.state !== 1) this.shootTimer.set(-1);
      else {
        const held = (this.mask & Keys.SHOOT) !== 0;
        if (this.shootTimer.current >= 0 || held) {
          if (this.shootTimer.current < 0) { if (this.secondaryShootTimer.current < 0) this.secondaryShootTimer.set(0); this.shootTimer.set(0); }
          if (this.shootTimer.current !== this.shootTimer.previous) {
            fireTouhouPattern(this, this.powerLevel, this.shootTimer.current, this.secondaryShootTimer.current, context);
            fireTouhouPattern(this, (this.focused ? 10 : 5) + this.powerLevel, this.shootTimer.current, this.secondaryShootTimer.current, context);
          }
          if (this.shootTimer.current >= 14) { if (!held) this.shootTimer.set(-1); else this.shootTimer.add(-14, rate); }
          else this.shootTimer.tick(rate);
        }
        if (this.secondaryShootTimer.current >= 0) {
          if (this.secondaryShootTimer.current >= 119) { if (!held) this.secondaryShootTimer.set(-1); else this.secondaryShootTimer.add(-119, rate); }
          else this.secondaryShootTimer.tick(rate);
        }
      }
    }
    for (const shot of this.shots) { shot.update(context); shot.collisions(context); }
    this.shots = this.shots.filter(shot => shot.alive);
    this.powerChanged = false; this.shotGate.tick(rate); this.shotAge.tick(rate);
  }
  update(mask = 0, context = {}) {
    this.previousMask = this.mask; this.mask = mask >>> 0; this.boundThisFrame = false;
    const rate = context.timerRate ?? 1;
    let normal = false;
    if (this.state === 0) {
      if (this.timer.current <= 1) this.bindAnimation(0);
      this.fixedY = (Math.trunc(Math.imul(this.timer.current, fixed(this.respawnY - this.respawnStartY)) / 60) + fixed(this.respawnStartY)) | 0;
      this.y = div(this.fixedY, 128);
      for (const option of this.options) option.changed = 1;
      this.history = Array.from({ length: 33 }, () => ({ x: this.fixedX, y: this.fixedY }));
      if (this.timer.current >= 30) {
        context.cancelCircle?.(this.x, this.y, 640, { bullets: true, lasers: true, reward: false, reason: 'respawn' });
        applyTouhouDamage({ shape: 'circle', x: this.x, y: this.y, radius: 120, damage: 10, bomb: true }, context);
      } else {
        const radius = add(div(mul(f32(this.timer.current), 512), 30), 64);
        context.cancelCircle?.(this.deathPosition?.x ?? this.x, this.deathPosition?.y ?? this.y, radius,
          { bullets: false, lasers: true, reward: true, reason: 'respawn' });
        context.cancelCircle?.(this.deathPosition?.x ?? this.x, this.deathPosition?.y ?? this.y, div(radius, 4),
          { bullets: false, lasers: true, reward: false, reason: 'respawn' });
      }
      if (this.timer.current >= 60) { this.state = 1; this.timer.set(0); normal = true; }
    } else if (this.state === 1) normal = true;
    else if (this.state === 3) {
      if (this.timer.current === 15) context.finishLasers?.(1, 0);
    } else if (this.state === 6) {
      this.timer.set(0); this.x = this.respawnX; this.y = this.respawnStartY; this.fixedX = fixed(this.respawnX); this.fixedY = this.respawnStartY;
    }
    else if (this.state === 4) {
      if (this.timer.current < this.deathbombFrames) { if (this.pressed(Keys.BOMB)) this.triggerBomb(context); }
      else this.beginDeath(context);
    }
    if (normal) {
      if (this.timer.current <= 1) this.bindAnimation(0);
      if (!context.inputBlocked && this.pressed(Keys.BOMB)) this.triggerBomb(context);
      this.updateMovement(context);
    }
    if (this.state === 2) {
      if (this.timer.current === 3) {
        const level = this.powerLevel, percent = level >= 4 ? 80 : level >= 3 ? 60 : level >= 2 ? 50 : 40;
        if (this.power > 100) this.power = Math.max(100, this.power - percent);
        const angle = atan2(-this.bounds.height / 2, sub(this.respawnX, this.x));
        for (let i = 0; i < 7; i++) context.spawnItem?.({ type: 'power', x: this.x, y: this.y, speed: 3,
          angle: sub(add(div(mul(f32(i), PI), 28), angle), div(mul(PI, 3.5), 28)) });
        this.refreshPower();
      }
      if (this.timer.current >= 30) {
        if (this.lives < 0 && this.timer.current === 30) context.onEvent?.('gameover', { player: this });
        else {
          this.state = 0; this.bombs = this.bombs < 2 ? clamp(this.respawnBombs, 2, 10) : clamp(this.bombs, 0, 10);
          this.damageRegions.push({ shape: 'circle', x: this.x, y: this.y, radius: 32, growth: 16, remaining: 30, damage: 150, bomb: false });
          this.deathPosition = { x: this.x, y: this.y }; this.setPosition(this.respawnX, this.respawnStartY);
          this.invulnerability.set(280); this.timer.set(0);
          context.onEvent?.('respawn', { player: this });
        }
      }
    }
    const flashInvulnerable = this.invulnerability.current > 0;
    if (flashInvulnerable) this.invulnerability.add(-1, rate);
    this.movementScale = 1; this.motionOffsetX = this.motionOffsetY = 0;
    if (this.animation) {
      this.animation.x = this.x; this.animation.y = this.y;
      if (!this.boundThisFrame) this.animation.update();
      this.animation.flashColor = flashInvulnerable && this.timer.current !== this.timer.previous && this.timer.current % 3 === 0 ? 0xff0000ff : null;
    }
    // updateMovement advances option roots in normal play. Their registered
    // ANM callbacks also keep running while the player's movement callback
    // is skipped (death/deathbomb/respawn); option.active only gates gameplay.
    if(!normal)for(const option of this.options){option.animation?.update();option.fullAnimation?.update();}
    if (this.focusEffect) { this.focusEffect.x = this.x; this.focusEffect.y = this.y; this.focusEffect.update(); }
    this.timer.tick(rate); this.focusTimer.tick(rate);
    this.updateShooting(context);
    if (this.bomb?.alive) this.bomb.update(context);
    if (this.bomb && !this.bomb.alive) { this.bomb.destroy(); this.bomb = null; }
    for (const region of this.damageRegions) {
      applyTouhouDamage(region, context); region.radius = add(region.radius, region.growth); region.remaining--;
    }
    this.damageRegions = this.damageRegions.filter(region => region.remaining > 0);
    for (const effect of this.effects) {
      effect.age++; effect.animation.update();
      if (effect.motion) {
        const t = Math.min(1, effect.age / effect.motion.duration), distance = mul(effect.motion.distance, sub(1, mul(sub(1, t), sub(1, t))));
        const offset = polar(effect.motion.angle, distance);
        effect.origin ??= { x: effect.animation.x, y: effect.animation.y };
        effect.animation.x = add(effect.origin.x, offset.x); effect.animation.y = add(effect.origin.y, offset.y);
      }
    }
    this.effects = this.effects.filter(effect => effect.animation.alive); this.frame++;
    return this;
  }
  collisionCircle(x, y, radius, context = {}, preview = false) {
    const hitRadius = div(mul(clamp(this.collisionPercent, 0, 100), this.focused ? this.focusRadius : this.normalRadius), 100);
    const collision=touhouCircleCollision(this.x,this.y,hitRadius,x,y,radius);
    if (collision===1) {
      if (context.bossSuppressed) return 0;
      if (preview) return 2;
      if ([2, 3, 4].includes(this.state)) return 0;
      if (this.invulnerability.current <= 0) this.hit(context);
      return 1;
    }
    return collision;
  }
  collisionRectangle(x, y, angle, width, height, context = {}, preview = false) {
    const radius = this.focused ? this.focusRadius : this.normalRadius;
    if (!rectangleCircle(x, y, height, width, angle, this.x, this.y, add(radius, 30))) return 0;
    if (!rectangleCircle(x, y, height, width, angle, this.x, this.y, div(mul(clamp(this.collisionPercent, 0, 100), radius), 100))) return 2;
    if (context.bossSuppressed) return 0;
    if (preview) return 2;
    if ([2, 3, 4].includes(this.state) || this.invulnerability.current > 0) return 0;
    this.hit(context); return 1;
  }
  addGraze(context = {}, position = this, color = 0) {
    this.graze = clamp(this.graze + 1, 0, 99999999); const delay = this.rng.next() % 4;
    context.enqueueGraze?.({ x: position.x, y: position.y, color: ((color & 0xffffff) | 0xff000000) >>> 0, delay });
    context.sound?.(42, position.x); context.onEvent?.('graze', { player: this, delay });
  }
  draw(draw, view = { x: 336, y: 24, scale: 1.5, screenScale: 1 }) {
    for (const shot of this.shots) shot.draw(draw, view);
    for (const option of this.options) { option.animation?.draw(draw, view); option.fullAnimation?.draw(draw, view); }
    if (this.state !== 2 && this.state !== 3 && this.state !== 6 && this.animation) {
      // Source draw_player writes the current position even when no player
      // update has run since a stage reset/teleport.
      this.animation.x=this.x;this.animation.y=this.y;
      if (draw.enqueuePriority) draw.enqueuePriority(TOUHOU_OWNER_PRIORITIES.player, target => this.animation.draw(target, view));
      else this.animation.draw(draw, view);
    }
    this.focusEffect?.draw(draw, view);
    for (const effect of this.effects) effect.animation.draw(draw, view);
    this.bomb?.draw(draw, view);
  }
  snapshot() {
    return { character: this.character, frame: this.frame, state: this.state, time: this.timer.current,
      x: this.x, y: this.y, fixedX: this.fixedX, fixedY: this.fixedY, focused: this.focused,
      power: this.power, lives: this.lives, bombs: this.bombs, invulnerability: this.invulnerability.current,
      animationScript: this.animationScript, shootTime: this.shootTimer.current, secondaryShootTime: this.secondaryShootTimer.current,
      options: this.options.filter(option => option.active).map(option => ({ x: option.x, y: option.y })),
      shots: this.shots.map(shot => ({ id: shot.id, pattern: shot.pattern, index: shot.index, x: shot.x, y: shot.y,
        angle: shot.angle, speed: shot.speed, state: shot.state, time: shot.timer.current, width: shot.width })),
      bomb: this.bomb ? { character: this.character, time: this.bomb.timer.current } : null, rng: this.rng.state };
  }
}
