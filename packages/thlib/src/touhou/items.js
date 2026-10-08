import { f32, PI, add, sub, mul, div, polar, atan2, cos, sin, wrapAngle, trunc32, TouhouTimer, TouhouRNG } from './math.js';
import {TOUHOU_PLAYER_RULES} from './player-rules.js';
import {resolveTouhouWorld} from './world.js';
import {clampTouhouPointValue,touhouPointItemValue} from './point-value.js';

// source_reconstruction/item_system/{spawn,frame,rewards,environment}.cpp.
// IDs 9..13 and their magic-stone reward counters are deliberately outside this module.
export const TouhouItemType = Object.freeze({ POWER: 1, POINT: 2, LARGE_POWER: 3, LIFE_FRAGMENT: 4,
  LIFE: 5, BOMB_FRAGMENT: 6, BOMB: 7, FULL_POWER: 8, COUNTED_POINT: 15, CANCEL_POINT: 15 });
const aliases = Object.freeze({ power: 1, point: 2, largePower: 3, lifeFragment: 4, life: 5,
  bombFragment: 6, bomb: 7, fullPower: 8, countedPoint: 15, cancelPoint: 15 });
const scripts = [[-1, -1], [115, 137], [116, 138], [117, 139], [118, 140], [119, 141],
  [120, 142], [121, 143], [122, 144]];
const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value | 0));
const iadd = (a, b) => (a + b) | 0, isub = (a, b) => (a - b) | 0, imul = Math.imul;
const idiv = (a, b) => Math.trunc(a / b) | 0;
const roundedPoints = amount => Math.max(10, isub(amount, amount % 10));
const distanceSquared = (a, b) => { const x = sub(a.x, b.x), y = sub(a.y, b.y); return add(mul(x, x), mul(y, y)); };
const notice=(context,type,value=0)=>{if(context.hudNotice)context.hudNotice(type,value);else context.onEvent?.('hudNotice',{type,value});};
const itemType=type=>typeof type==='string'?(aliases[type]??(/^\d+$/.test(type)?Number(type):type)):type;
const supportedType=type=>Number.isInteger(type)&&(type>=1&&type<=8||type===14||type===15);
const rulesFor=player=>player.rules??TOUHOU_PLAYER_RULES;

/** Shared collectibles with recovered motion and selected point-value rules.
 * Score uses the original stored units (display score / 10). */
export class TouhouItems {
  constructor({ player, bank = null, effectBank = null, rng = null, difficulty = 1, context = {},world,bounds,definitions=[],capacity=512 } = {}) {
    if (!player) throw new TypeError('TouhouItems requires a player');
    if(!Number.isSafeInteger(capacity)||capacity<0)throw new RangeError('Item capacity must be a nonnegative integer');
    this.capacity=capacity;
    this.player = player; this.bank = bank; this.effectBank = effectBank; this.rng = rng ?? player.rng ?? new TouhouRNG(1);
    this.world=resolveTouhouWorld({world:world??player.world,bounds:bounds??(world||player.world?undefined:player.bounds)});
    this.definitions=new Map();for(const [type,definition]of definitions)this.register(type,definition);
    this.difficulty = difficulty; this.context = context; this.items = []; this.effects = [];
    this.speedScale = 1; this.spawnCounter = 0; this.pointCounter = 0; this.cancelPointIncrement = (difficulty + 1) | 0;
    this.attract = false; this.attractionCenter = { x: 0, y: 0 }; this.processed = 0; this.nextId = 1;
    const r=rulesFor(player);
    const defaults = { power: 0, startingPower: r.startingPower, maxPower: r.maxPower,powerPerLevel:r.powerPerLevel, score: 0, pointValue: r.pointValueMinimum, pointItems: 0,
      maxLives: r.maxLives, maxBombs: r.maxBombs, lifeFragments: 0, bombFragments: 0, extendCount: 0,
      collectSpeed: r.collectSpeed, collectRadius: r.collectRadius, attractRadius: r.attractRadius, collectLine: r.collectLine };
    for (const [key, value] of Object.entries(defaults)) player[key] ??= value;
  }
  /** Register an application-owned collectible while retaining source motion,
   * attraction, lifetime and collection notifications. Existing items retain
   * their definition if a later registration replaces the same type. */
  register(type,definition){
    type=itemType(type);if(type===14)type=6;
    if(!(typeof type==='string'&&type.length||Number.isSafeInteger(type)&&type>=0)||!definition||typeof definition.collect!=='function')throw new TypeError('Item definitions require a type and collect callback');
    for(const key of ['script','upScript'])if(definition[key]!==undefined&&(!Number.isSafeInteger(definition[key])||definition[key]<-1))throw new RangeError(`${key} must be an animation script or -1`);
    if(definition.spawnEffect!==undefined&&typeof definition.spawnEffect!=='function')throw new TypeError('Item spawnEffect must be a function');
    this.definitions.set(type,Object.freeze({...definition}));return this;
  }
  supports(type){type=itemType(type);return supportedType(type)||this.definitions.has(type);}
  spawn({ type = 1, x = 0, y = 0, angle = -PI / 2, speed = 2, delay = 0, color = 0xffffffff,
    extra = 0, sound = -1, state = 1 } = {}, context = this.context) {
    type=itemType(type);
    if (type === 14) type = 6;
    if (!this.supports(type))throw new RangeError('Unknown common item type; register an application item definition first (stone items are excluded by default)');
    this.spawnCounter = iadd(this.spawnCounter, 1);
    // Source15 is a difficulty-dependent counter that occasionally emits an
    // ordinary point item. It is not an automatically collected small point.
    // cancelPoint is retained only as a legacy alias; phase clearing uses no drop.
    if (type === 15&&!this.definitions.has(type)) { this.pointCounter = iadd(this.pointCounter, this.cancelPointIncrement); if (this.pointCounter < 10) return null; this.pointCounter = 0; type = 2; }
    if (this.items.length >= this.capacity) return null;
    const velocity = polar(f32(angle), f32(speed)), bounds = this.world.bounds,definition=this.definitions.get(type);
    const item = { id: this.nextId++, type, state, x: f32(Math.max(bounds.x, Math.min(bounds.x + bounds.width, x))), y: f32(y),
      vx: velocity.x, vy: velocity.y, attractionSpeed: 0, delay: delay | 0, sound, extra,
      timer: new TouhouTimer(), drawState: 0, animation: null, secondaryAnimation: null,definition:definition??null };
    if (item.delay === 0) this.spawnEffect(item, context);
    const bank=definition&&'bank'in definition?definition.bank:this.bank,script=definition?definition.script:scripts[type][0],upScript=definition?definition.upScript:scripts[type][1];
    item.animation = script!==undefined&&script>=0?bank?.create(script)??null:null;
    item.secondaryAnimation = upScript!==undefined&&upScript>=0?bank?.create(upScript)??null:null;
    item.animation?.U(0x490, color);
    this.items.unshift(item); return item;
  }
  spawnMany({ x, y }, count, type, context = this.context) {
    const result = [];
    for (; count > 0; count--) {
      const angle = sub(mul(this.rng.signed(), mul(div(PI, 180), 10)), div(PI, 2));
      const item = this.spawn({ type, x, y, angle, speed: 2 }, context); if (item) result.push(item);
    }
    return result;
  }
  /** default.ecl BossItem and ECL509 suppress rewards for ordinary timeouts
   * and spell practice. A survival completion clears the source timeout flag.
   * Rejected drops consume no RNG or item/animation allocations. */
  spawnBossDrops(position,{timedOut=false,survival=false,mode=0,radius=64,...options}={},context=this.context){
    if(mode===2||timedOut&&!survival)return [];
    return this.spawnEnemyDrops(position,{...options,radius},context);
  }
  /** enemy_drop.cpp/ECL507–510: one optional item at the enemy, then an
   * ordered local ellipse of configured rewards. The caller owns quantities;
   * the source owns scatter, RNG consumption and the upward2.2 initial speed.
   * Ordinary enemies start at radius32; default.ecl BossItem selects64. */
  spawnEnemyDrops({x,y},{counts={},centerType=0,radius=32}={},context=this.context){
    const rx=f32(typeof radius==='number'?radius:radius?.x),ry=f32(typeof radius==='number'?radius:radius?.y);
    const center=itemType(centerType),ordered=new Map();
    if(![x,y,rx,ry].every(Number.isFinite)||rx<0||ry<0)
      throw new RangeError('Enemy drop position and nonnegative scatter radii must be finite');
    if(center!==0&&!this.supports(center))throw new RangeError('Enemy center drop must be a registered item type or zero');
    for(const [key,count]of Object.entries(counts)){
      const type=itemType(key);
      if(!this.supports(type)||!Number.isSafeInteger(count)||count<0||count>0x7fffffff)
        throw new RangeError('Enemy drop counts require registered item types and nonnegative signed32-bit counts');
      const total=(ordered.get(type)??0)+count;
      if(total>0x7fffffff)throw new RangeError('Combined enemy drop count exceeds signed32-bit range');
      ordered.set(type,total);
    }
    const result=[],emit=(type,px,py)=>{const item=this.spawn({type,x:px,y:py,angle:div(-PI,2),speed:f32(2.2)},context);if(item)result.push(item);};
    if(center)emit(center,x,y);
    // The initial random angle is consumed even when every count is zero.
    let angle=mul(this.rng.signed(),PI);
    const byType=(a,b)=>typeof a[0]==='number'&&typeof b[0]==='number'?a[0]-b[0]:typeof a[0]==='number'?-1:typeof b[0]==='number'?1:a[0]<b[0]?-1:a[0]>b[0]?1:0;
    for(const [type,count]of [...ordered].sort(byType))for(let index=0;index<count;index++){
      const scale=add(mul(this.rng.unit(),.5),.5);
      emit(type,add(mul(mul(cos(angle),rx),scale),x),add(mul(mul(sin(angle),ry),scale),y));
      angle=wrapAngle(add(add(div(PI,2),angle),div(mul(this.rng.signed(),PI),4)));
    }
    return result;
  }
  spawnEffect(item, context) {
    if(item.definition){item.definition.spawnEffect?.(item,context,this);return;}
    if (![1, 2, 4, 5, 6, 7].includes(item.type)) return;
    const effect = this.effectBank?.create(94, { x: item.x, y: item.y }); if (effect) this.effects.push(effect);
    if (item.type === 4 || item.type === 5) context.sound?.(74, 0);
    else if (item.type === 6 || item.type === 7) context.sound?.(48, 0);
    else if (item.sound >= 0) context.sound?.(item.sound, 0);
    context.onEvent?.('itemSpawnEffect', { item });
  }
  retire(item) { item.state = 0; item.animation?.destroy(); item.secondaryAnimation?.destroy(); }
  forcedCollect(context) {
    const p = this.player;
    return (p.state !== 2 && p.state !== 4 && !(p.collectLine <= p.y)) ||
      (!!p.bomb?.alive && (p.bomb.timer?.current??0) < 60) || !!context.bossCollecting;
  }
  move(item, scale, extra = 1) {
    item.x = add(item.x, mul(mul(item.vx, scale), extra));
    item.y = add(item.y, mul(mul(item.vy, scale), extra));
  }
  pursue(item, scale) {
    const p = this.player, x = sub(p.x, item.x), y = sub(p.y, item.y);
    const velocity = polar(x === 0 && y === 0 ? div(PI, 2) : atan2(y, x), item.attractionSpeed);
    item.vx = velocity.x; item.vy = velocity.y; this.move(item, scale);
    if (item.attractionSpeed < 12) item.attractionSpeed = add(item.attractionSpeed, .2);
    if (p.state === 4) { item.state = 1; item.vx = item.vy = 0; }
  }
  update(context = this.context) {
    const p = this.player, scale = context.clockScale ?? 1; this.processed = 0;
    const bounds = this.world.bounds;
    const outside = item => !(item.y <= bounds.y + bounds.height + 24) || !(item.x > bounds.x - 8 && item.x < bounds.x + bounds.width + 8);
    for (const item of this.items) {
      if (!item.state) continue;
      if (item.state === 1) {
        if (item.delay > 0) { item.delay = isub(item.delay, 1); if (item.delay < 1) this.spawnEffect(item, context); continue; }
        if (this.forcedCollect(context)) { item.attractionSpeed = p.collectSpeed; item.state = 3; this.pursue(item, scale); }
        else {
          this.move(item, scale, this.speedScale); item.vy = add(item.vy, mul(mul(scale, .03), this.speedScale));
          if (item.vy >= 0) item.vx = 0; if (item.vy > 2) item.vy = 2;
          if (outside(item)) { this.retire(item); continue; }
        }
      } else if (item.state === 2) {
        this.move(item, scale); item.vy = add(item.vy, mul(scale, .03)); if (item.vy >= 0) item.state = 1;
        if (outside(item)) { this.retire(item); continue; }
      } else if (item.state === 3) this.pursue(item, scale);
      else if (item.state === 4) { if (this.forcedCollect(context)) { item.attractionSpeed = p.collectSpeed; item.state = 3; } this.pursue(item, scale); }
      else throw new RangeError(`Unsupported original item state ${item.state}`);
      if (p.state !== 2) {
        const distance = distanceSquared(p, item);
        if (distance < mul(p.collectRadius, p.collectRadius) || (this.attract && distanceSquared(this.attractionCenter, item) < 256)) {
          this.collect(item, context); context.sound?.(37, item.x); this.retire(item); continue;
        }
        if (item.state !== 2 && item.state !== 3 && item.state !== 4 && distance < mul(p.attractRadius, p.attractRadius)) {
          item.attractionSpeed = div(p.collectSpeed, 3); item.state = 4;
        }
      }
      item.animation?.update(); item.secondaryAnimation?.update(); item.timer.tick(context.timerRate ?? 1); this.processed = iadd(this.processed, 1);
    }
    this.items = this.items.filter(item => item.state);
    for (const effect of this.effects) effect.update(); this.effects = this.effects.filter(effect => effect.alive);
    if (this.speedScale < 1) this.speedScale = add(this.speedScale, .1); this.attract = false; return this;
  }
  addScore(amount, item, context) {
    if (context.addScore) context.addScore(amount, item);
    else this.player.score = Math.min(999999999, (this.player.score ?? 0) + Math.trunc((amount >>> 0) / 10));
  }
  floatingScore(item, amount, color, context) { context.floatingScore?.({ x: item.x, y: item.y, amount, color, item }); }
  addPower(amount, context) {
    const p = this.player; if (p.power >= p.maxPower) return false;
    p.power = iadd(p.power, amount);
    if (p.maxPower < p.power) { p.power = p.maxPower; notice(context,2); }
    return idiv(isub(p.power, amount), p.powerPerLevel) !== idiv(p.power, p.powerPerLevel);
  }
  addBombs(amount, context = this.context) {
    const p = this.player; p.bombs = iadd(p.bombs, amount);
    if (p.maxBombs <= p.bombs) p.bombFragments = 0;
    if (p.maxBombs < p.bombs) p.bombs = p.maxBombs; else context.sound?.(46, 0);
    this.bombHud(context);
  }
  bombHud(context) { const p = this.player,r=rulesFor(p); p.bombs = clamp(p.bombs, 0, Math.max(r.bombStockLimit,p.maxBombs)); p.bombFragments = clamp(p.bombFragments, 0, r.fragmentLimit); context.onEvent?.('bombStock', { count: p.bombs, fragments: p.bombFragments, maximum: p.maxBombs }); }
  lifeHud(context) { const p = this.player,r=rulesFor(p); p.lives = clamp(p.lives, -1, p.maxLives); p.lifeFragments = clamp(p.lifeFragments, 0, r.fragmentLimit); context.onEvent?.('lifeStock', { count: p.lives, fragments: p.lifeFragments, maximum: p.maxLives }); }
  addBombFragments(amount, context = this.context) {
    const p = this.player;
    if (p.bombs < p.maxBombs) { p.bombFragments = iadd(p.bombFragments, amount); if (p.bombFragments >= rulesFor(p).bombFragmentThreshold) { p.bombFragments = 0; this.addBombs(1, context); } this.bombHud(context); }
    else p.bombFragments = 0;
  }
  extendLife(context = this.context) {
    const p = this.player;
    if (p.maxLives <= p.lives) p.lifeFragments = 0; p.lives = iadd(p.lives, 1);
    if (p.maxLives < p.lives) { p.lives = p.maxLives; p.lifeFragments = 0; }
    this.lifeHud(context); context.sound?.(17, 0); notice(context,4); p.extendCount = iadd(p.extendCount, 1);
  }
  addLifeFragments(amount, context = this.context) {
    const p = this.player,r=rulesFor(p);
    if (p.lives < p.maxLives) {
      p.lifeFragments = iadd(p.lifeFragments, amount);
      const end = this.difficulty === 4 ? r.extraLifeExtendLimit : r.lifeExtendLimit;
      if (p.extendCount < 0 || p.extendCount > end) throw new RangeError('Original life-fragment table index is outside its valid progression');
      const threshold = p.extendCount === end ? 99999999 : r.lifeFragmentThreshold;
      while (threshold <= p.lifeFragments) { p.lifeFragments = isub(p.lifeFragments, threshold); this.extendLife(context); }
      this.lifeHud(context);
    } else p.lifeFragments = 0;
  }
  collect(item, context = this.context) {
    const p = this.player,r=rulesFor(p); p.power = clamp(p.power, 0, p.maxPower); p.pointValue = clampTouhouPointValue(p.pointValue,r);
    let amount = 0;
    const definition=item.definition===undefined?this.definitions.get(item.type):item.definition;
    if(definition){amount=definition.collect(item,p,context,this)??0;context.onEvent?.('itemCollect',{item,player:p,amount});return amount;}
    const refresh = () => { p.refreshPower?.(); this.floatingScore(item, -1, 0xffffff40, context); context.sound?.(13, item.x); };
    if (item.type === 1) {
      if (p.power < p.maxPower) { amount = 100; if (this.addPower(1, context)) refresh(); }
      else {
        const reduced = idiv(imul(p.pointValue, 9), 10);
        amount = p.y <= p.collectLine || item.state === 3 ? roundedPoints(p.pointValue) :
          roundedPoints(isub(reduced, idiv(imul(reduced, isub(trunc32(p.y), trunc32(p.collectLine))), 450)));
        this.floatingScore(item, amount, 0xffffffff, context);
      }
      this.addScore(amount, item, context);
    } else if (item.type === 2 || item.type === 15) {
      // The reference profile retains base/2 after removing stone rewards;
      // classic gives the displayed pointValue before this same height falloff.
      const value = touhouPointItemValue(p), full = item.y <= p.collectLine || item.state === 3, reduced = idiv(imul(value, 9), 10);
      amount = roundedPoints(full ? value : isub(reduced, idiv(imul(reduced, trunc32(sub(item.y, p.collectLine))), 450)));
      this.floatingScore(item, amount, full ? 0xffffff00 : 0xffffffff, context); this.addScore(amount, item, context);
      p.pointItems = clamp(iadd(p.pointItems, 1), 0, 1000000);
    } else if (item.type === 3) {
      if (p.power < p.maxPower) { amount = 100; if (this.addPower(p.startingPower, context)) refresh(); }
      else { amount = 20000; this.addScore(20000, item, context); this.floatingScore(item, 20000, 0xff808080, context); context.sound?.(13, item.x); }
      this.addScore(amount, item, context);
    } else if (item.type === 4) this.addLifeFragments(1, context);
    else if (item.type === 5) this.extendLife(context);
    else if (item.type === 6) this.addBombFragments(1, context);
    else if (item.type === 7) this.addBombs(1, context);
    else if (item.type === 8) {
      if (p.maxPower <= p.power) { amount = roundedPoints(p.pointValue); this.floatingScore(item, amount, 0xff40ff40, context); this.addScore(amount, item, context); }
      if (this.addPower(p.maxPower, context)) refresh();
    } else throw new RangeError(`Unsupported common item reward ${item.type}`);
    context.onEvent?.('itemCollect', { item, player: p, amount });
    return amount;
  }
  draw(draw, view = { x: 336, y: 24, scale: 1.5, screenScale: 1 }, {effects=true}={}) {
    if(draw.enqueuePriority){draw.enqueuePriority(35,target=>this.draw(target,view,{effects:false}));for(const effect of this.effects)effect.draw(draw,view);return draw;}
    for (const item of this.items) {
      if (!item.state || !item.animation?.alive || item.delay > 0) continue;
      item.animation.x = item.x; item.animation.y = item.y;
      if (item.secondaryAnimation) { item.secondaryAnimation.x = item.x; item.secondaryAnimation.y = item.y; }
      // Preserve the recovered script-coordinate test, not an inferred global-Y test.
      if (!(item.animation.F(0x30) < -8)) { item.animation.draw(draw, view); item.drawState = 0; }
      else {
        const visual = item.secondaryAnimation;
        if (visual?.alive) { const shifted = add(visual.F(0x30), 8); visual.F(0x30, 8); visual.alpha = shifted < 32 ? trunc32(mul(div(shifted, 32), 255)) & 255 : 255; visual.draw(draw, view); }
        item.drawState = 1;
      }
    }
    if(effects)for (const effect of this.effects) effect.draw(draw, view);
  }
  snapshot() { return { pointCounter: this.pointCounter, spawnCounter: this.spawnCounter, speedScale: this.speedScale,
    items: this.items.map(item => ({ id: item.id, type: item.type, state: item.state, x: item.x, y: item.y, vx: item.vx, vy: item.vy, attractionSpeed: item.attractionSpeed, delay: item.delay, time: item.timer.current })) }; }
}
