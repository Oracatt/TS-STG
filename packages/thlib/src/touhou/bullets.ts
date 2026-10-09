import type {AnmDrawList as DrawList} from './anm.js';
import type {TouhouBulletCollisionState,TouhouBulletCollisionContext} from './bullet-collision.js';
import type {TouhouPlayer} from './player.js';
import type {TouhouBulletStyle} from './bullet-patterns.js';
interface BulletMotion {timer:TouhouTimer;duration?:number;acceleration?:number;ax?:number;ay?:number;angular?:number;turns?:number;mode?:number;angle?:number;speed?:number;count?:number;width?:number;height?:number;mask?:number;bounces?:number;offset?:number;factor?:number;x?:number;y?:number;interpolation?:AnmInterpolation;incomingCheck?:boolean;wraps?:number}
export interface TouhouBulletFieldOptions extends TouhouWorldOptions {bank:AnmBank;styles:TouhouBulletStyle[];random?:{next():number;signedUnit():number;unit():number};visualRandom?:{signedUnit():number};capacity?:number;autoBounds?:boolean}
import type {AnmBank,AnmInstance} from './anm.js';
import type {TouhouWorld,TouhouWorldOptions,TouhouNormalizedWorldBounds} from './world.js';
export type TouhouBulletCommand = number[] | { type:number; floats?:number[]; ints?:number[]; concurrent?:boolean };
export interface TouhouBullet extends TouhouBulletCollisionState { style:ReturnType<typeof touhouStyle>;initialSpeed:number;radiusY:number;circle:boolean;commands:number[][];commandLoop:number;motion:Map<number,BulletMotion>;age:TouhouTimer;totalAge:TouhouTimer;offscreenGrace:number;secondaryRate:number;commandSound:number;cancelKind:number;previewOnly:boolean;mark:number;saved?:{x:number;y:number;z:number;angle:number;speed:number};inactiveOffset?:{x:number;y:number;duration:number};inactiveScale?:AnmInterpolation; id:number;slot:number;state:number;type:number;color:number;x:number;y:number;z:number;vx:number;vy:number;vz:number;angle:number;speed:number;scale:number;scaleEnabled:boolean;radius:number;group:number;protectedFrames:number;frozen:boolean;grazesLeft:number;cancelScript:number;activeMask:bigint;commandIndex:number;animation:AnmInstance;world:TouhouWorld;bounds:Readonly<TouhouNormalizedWorldBounds>;autoBounds:boolean; }
export interface TouhouBulletParameters extends TouhouWorldOptions { x?:number;y?:number;type?:number;color?:number;pattern?:number;count?:number;rows?:number;speed?:number;speedStep?:number;angle?:number;angleStep?:number;playerAngle?:number;spawnRadius?:number;commands?:TouhouBulletCommand[];commandIndex?:number;commandSound?:number;shotSound?:number;previewOnly?:boolean;minimumPlayerDistanceSquared?:number;autoBounds?:boolean; }
export interface TouhouBulletContext extends TouhouBulletCollisionContext<TouhouBullet> { paused?:boolean;freezeBullets?:boolean;clockScale?:number;boundsWidth?:number;boundsHeight?:number;sound?:(id:number,x?:number)=>void;selectedEnemy?:()=>{x:number;y:number};onGraze?:(bullet:TouhouBullet)=>void;onCancelEffect?:(bullet:TouhouBullet,animation:AnmInstance)=>void;spawnCancelItem?:(position:{x:number;y:number;z:number},typeOrCount:number,parameters:number|{angle:number;speed:number})=>void; }
// Reconstructed TOUHOU bullet core: shoot/advance/frame/movement/bounds,
// player_collision/cancellation.cpp. Original units: x=-192..192, y=0..448.
// Enemy/laser spawning opcodes 13/24/27 require separate ECL ownership and fail explicitly.
import { f32, PI, add, sub, mul, div, sqrt, atan2, polar, wrapAngle, TouhouTimer } from './math.js';
import { TouhouRandom, touhouShotTrajectory, touhouStyle } from './bullet-patterns.js';
import { AnmInterpolation } from './anm-interpolation.js';
import { TOUHOU_OWNER_PRIORITIES } from './render-order.js';
import {createTouhouBulletAnimation,configureTouhouBulletBirth,createTouhouBulletCancelAnimation} from './bullet-presentation.js';
import {TouhouBulletCollision,updateTouhouBulletCollision,touhouBulletInCancelCircle,touhouBulletInCancelRectangle} from './bullet-collision.js';
import { resolveTouhouWorld } from './world.js';

const wordBuffer = new DataView(new ArrayBuffer(4));
const floatWord = (value: number) => { wordBuffer.setFloat32(0, value, true); return wordBuffer.getUint32(0, true); };
const wordFloat = (value: number) => { wordBuffer.setUint32(0, value, true); return wordBuffer.getFloat32(0, true); };
const bit = (number:number) => BigInt(number);
const timer = (value: number) => new TouhouTimer(value);
const outside = (b: TouhouBullet, w: number, h: number, topMargin = 0) => b.world.outside(b, w, h, topMargin);
const position = (b: TouhouBullet) => ({ x: b.x, y: b.y, z: b.z });

/** Encode one original 11-word extended command, preserving its float/int lanes. */
export function touhouBulletCommand(type: number, { floats = [], ints = [], concurrent = false }: {floats?:number[];ints?:number[];concurrent?:boolean} = {}): number[] {
  const words = Array(11).fill(0);
  floats.slice(0, 4).forEach((value, i) => { words[i] = floatWord(value); });
  ints.slice(0, 4).forEach((value, i) => { words[i + 4] = value >>> 0; });
  words[8] = type >>> 0; words[9] = concurrent ? 1 : 0;
  return words;
}
const supportedCommands = new Set(Array.from({ length: 34 }, (_, i) => i).filter(i => ![13, 24, 27].includes(i)));
export const SUPPORTED_TOUHOU_BULLET_COMMANDS = Object.freeze([...supportedCommands]);
function commandsOf(commands:TouhouBulletCommand[] = []) {
  return commands.map(command => {
    const words = Array.isArray(command) ? command.slice() : touhouBulletCommand(command.type, command);
    if (words.length !== 11 || words.some((value: number) => !Number.isInteger(value))) throw new TypeError('Extended command must be 11 uint32 words');
    if (!supportedCommands.has(words[8])) throw new Error(`Unsupported Touhou bullet extended opcode ${words[8]} (requires enemy/laser/subshot ownership)`);
    return words.map((value: number) => value >>> 0);
  });
}

export class TouhouBulletField {
  declare destroy?:()=>void;
  bank: AnmBank;
  styles: TouhouBulletStyle[];
  random: { next(): number; signedUnit(): number; unit(): number; };
  visualRandom: { signedUnit(): number; };
  free: number[];
  slots: { cancelScript: number; }[];
  nextId: number;
  context: TouhouBulletContext;
  player: { x: number; y: number; collisionCircle(x: number, y: number, radius: number, context: TouhouBulletContext, preview?: boolean): number; addGraze(context: TouhouBulletContext, position?: { x: number; y: number; }, color?: number): void; } | null;

  world:TouhouWorld;
  bounds:Readonly<TouhouNormalizedWorldBounds>;
  autoBounds:boolean;
  readonly capacity:number;
  bullets:TouhouBullet[];
  effects:AnmInstance[];
  age:number;
  cancelCounter:number;
  itemCounter:number;

  constructor({ bank, styles, random = new TouhouRandom(1), visualRandom = new TouhouRandom(2), capacity = 2000, world, bounds, autoBounds = true }: TouhouBulletFieldOptions = {} as TouhouBulletFieldOptions) {
    if (!bank?.create || !Array.isArray(styles) || styles.length < 50) throw new TypeError('Original bullet ANM bank and 50-entry style table required');
    // Slots are ordinary JS array indices, not a native Uint16 pool. The only
    // upper bound here is the language's maximum array length; allocation may
    // still fail when a caller requests more storage than the host can supply.
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 0xffffffff) throw new RangeError('Bullet capacity must be a positive supported array length');
    if (typeof autoBounds !== 'boolean') throw new TypeError('Bullet autoBounds must be boolean');
    this.world = resolveTouhouWorld({ world, bounds }); this.bounds = this.world.bounds; this.autoBounds = autoBounds;
    this.bank = bank; this.styles = styles; this.random = random; this.visualRandom = visualRandom;
    this.capacity = capacity; this.free = Array.from({ length: capacity }, (_, i) => i);
    this.slots = Array.from({ length: capacity }, () => ({ cancelScript: 0 }));
    this.bullets = []; this.effects = []; this.age = 0; this.nextId = 1;
    this.cancelCounter = 0; this.itemCounter = 0; this.context = {}; this.player = null;
  }
  get count(): number { return this.capacity - this.free.length; }
  angleToPlayer(b: {x:number;y:number}) {
    if (!this.player) return div(PI, 2);
    const dx = sub(this.player.x, b.x), dy = sub(this.player.y, b.y);
    return dx === 0 && dy === 0 ? div(PI, 2) : atan2(dy, dx);
  }
  emit(parameters: TouhouBulletParameters = {}, { random = this.random }: {random?:Pick<TouhouRandom,'unit'|'signedUnit'>} = {}): TouhouBullet[] {
    const p = { x: 0, y: 0, type: 0, color: 0, pattern: 1, count: 1, rows: 1, speed: 1, speedStep: 1, angle: 0, angleStep: 0, ...parameters };
    const commands = commandsOf(p.commands);
    const world = resolveTouhouWorld({ world: p.world ?? this.world, bounds: p.bounds }), autoBounds = p.autoBounds ?? this.autoBounds;
    if (typeof autoBounds !== 'boolean') throw new TypeError('Bullet autoBounds must be boolean');
    if (!Number.isInteger(p.count) || !Number.isInteger(p.rows) || p.count < 1 || p.rows < 1) throw new RangeError('Positive integer row/count required');
    const style = touhouStyle(this.styles, p.type, p.color), emitted:TouhouBullet[] = [];
    const playerAngle = p.playerAngle ?? this.angleToPlayer(p);
    for (let row = 0; row < p.rows; row++) for (let column = 0; column < p.count; column++) {
      if (!this.free.length) { if ((p.shotSound ?? 21) >= 0) this.context.sound?.(p.shotSound ?? 21, p.x); return emitted; }
      const slot = this.free.pop()!, inheritedCancel = this.slots[slot].cancelScript;
      const trajectory = touhouShotTrajectory(p, p.pattern, column, row, playerAngle, random);
      const angle = wrapAngle(wrapAngle(add(trajectory.angle, 0))), velocity = polar(trajectory.angle, trajectory.speed);
      const b:TouhouBullet = { ...new TouhouBulletCollision({radius:style.radius}),id: this.nextId++, slot, type: p.type, color: p.color, style, state: 1,
        x: f32(p.x), y: f32(p.y), z: f32(.1), vx: velocity.x, vy: velocity.y, vz: 0,
        angle, speed: trajectory.speed, initialSpeed: trajectory.initialSpeed, scale: 1, scaleEnabled: false,
        radius: f32(style.radius), radiusY: f32(style.radius), circle: true, group: style.drawGroup,
        cancelScript: style.cancelType === 5 ? inheritedCancel : style.cancelScript,
        handle: style.cancelType === 6 ? style.colors[p.color][4] >>> 0 : 0xffd08080,
        commands, commandIndex: p.commandIndex ?? 0, commandLoop: 0, activeMask: 0n, motion: new Map(),
        age: timer(0), totalAge: timer(0), offscreenGrace: 5, frozen: false,
        collisionEnabled: true, secondaryRate: 1, primaryRate: 1, commandSound: p.commandSound ?? 38, child: null,
        animation: null!, cancelKind: 0, previewOnly: p.previewOnly ?? false, mark: 0, world, bounds: world.bounds, autoBounds };
      if (p.spawnRadius) { const delta = polar(angle, f32(p.spawnRadius)); b.x = add(b.x, delta.x); b.y = add(b.y, delta.y); }
      b.animation = createTouhouBulletAnimation(this.bank,style, { x: b.x, y: b.y }, {spriteRemap: id => b.style.remapSprite(id)});
      b.animation.U(0x4a0, (b.animation.U(0x4a0) & ~0x03000000) | 0x01000000);
      if (style.childScript) b.child = this.bank.create(style.childScript, { x: b.x, y: b.y });
      this.slots[slot] = b; this.bullets.unshift(b); emitted.push(b);
      const first = commands[b.commandIndex];
      if (first?.[8] === 1) {
        const kind = (first[4] << 16) >> 16;
        configureTouhouBulletBirth(b.animation,kind);
        this.spawnTransition(b); b.commandIndex++;
      } else configureTouhouBulletBirth(b.animation,null);
      this.executeCommands(b); b.animation.update();
      if (p.minimumPlayerDistanceSquared! > 0 && this.player) {
        const dx = sub(b.x, this.player.x), dy = sub(b.y, this.player.y);
        if (add(mul(dx, dx), mul(dy, dy)) < p.minimumPlayerDistanceSquared!) this.retire(b);
      }
    }
    if ((p.shotSound ?? 21) >= 0) this.context.sound?.(p.shotSound ?? 21, p.x);
    return emitted;
  }
  spawnTransition(b: TouhouBullet) { b.state = 2; b.x = sub(b.x, mul(b.vx, 4)); b.y = sub(b.y, mul(b.vy, 4)); b.z = sub(b.z, mul(b.vz, 4)); }
  retire(b: TouhouBullet): void {
    if (!b.state) return;
    b.state = 0; b.animation.destroy(); b.child?.destroy(); b.activeMask = 0n;
    this.free.push(b.slot);
  }
  setVelocity(b: TouhouBullet, angle = b.angle, speed = b.speed) { const v = polar(angle, speed); b.vx = v.x; b.vy = v.y; }
  sound(b: TouhouBullet) { if (b.commandSound >= 0) this.context.sound?.(b.commandSound, b.x); }
  resolveAngle(b: TouhouBullet, requested: number, spread: number) {
    if (spread <= -999990) spread = PI;
    if (requested <= -999990) return b.angle;
    if (requested >= 999990 && requested < 1999990) return add(this.angleToPlayer(b), spread);
    if (requested >= 2999990 && requested < 3999990) return add(this.angleToPlayer(b), mul(this.random.signedUnit(), spread));
    if (requested >= 3999990 && requested < 4999990) return add(mul(this.random.signedUnit(), spread), b.angle);
    if (requested >= 4999990) {
      const target = this.context.selectedEnemy?.();
      if (!target) throw new Error('TOUHOU bullet enemy-relative angle requires context.selectedEnemy');
      return atan2(sub(target.y, b.y), sub(target.x, b.x));
    }
    return requested;
  }
  startMotion(b: TouhouBullet, flag: number, data: Omit<BulletMotion,'timer'> & {timer?:TouhouTimer}) { b.activeMask |= bit(flag); b.motion.set(flag, { timer: timer(0), ...data }); }
  clearMotion(b: TouhouBullet, flag: number) { b.activeMask &= ~bit(flag); b.motion.delete(flag); return 1; }
  executeCommands(b: TouhouBullet) {
    for (let budget = 0; budget < 4096; budget++) {
      if (b.commandIndex > 23 || b.commandIndex >= b.commands.length) return;
      const op = b.commands[b.commandIndex], type = op[8];
      if (!type) return;
      const flag = (type & 255) < 64 ? 1n << BigInt(type & 255) : 0n;
      if (!op[9] && (b.activeMask & ~(flag | 0x200000100n))) return;
      const f = (i: number) => wordFloat(op[i]), i = (n: number) => op[n] | 0;
      switch (type) {
        case 1: b.animation.interrupt(((op[4] << 16) >> 16) + 7); this.spawnTransition(b); break;
        case 2: case 21: case 32: {
          const acceleration = type === 2 ? f(0) : div(sub(type === 32 ? mul(f(0), b.speed) : f(0), b.speed), f32(i(4)));
          const angle = this.resolveAngle(b, f(1), f(2)), vector = polar(angle, acceleration);
          this.startMotion(b, type === 21 ? 0x200000 : 4, { acceleration, ax: vector.x, ay: vector.y, duration: i(4) });
          if (b.commandIndex) this.sound(b); break;
        }
        case 3: this.startMotion(b, 8, { acceleration: f(0), angular: f(1), duration: i(4) }); if (b.commandIndex) this.sound(b); break;
        case 4: {
          let angle = this.resolveAngle(b, f(0), f(2)), speed = f(1) <= -999990 ? b.speed : f(1);
          const mode = op[6];
          if (mode === 2) angle = wrapAngle(add(this.angleToPlayer(b.saved ?? { x: 0, y: 0 }), angle));
          else if (mode === 3) angle = wrapAngle(add(angle, b.saved?.angle ?? 0));
          else if (mode === 5 || mode === 6) angle = mul(this.random.signedUnit(), f(0));
          else if (mode === 7) { angle = f(0) <= -999990 ? b.angle : f(0) < 990 ? f(0) : this.angleToPlayer(b); speed = add(mul(this.random.signedUnit(), f(1)), b.speed); }
          this.startMotion(b, 16, { angle, speed, mode, duration: i(4), count: i(5), turns: 0 }); break;
        }
        case 6: this.startMotion(b, 64, { speed: f(0), width: op[5] & 32 ? f(1) : b.bounds.width, height: op[5] & 32 ? f(2) : b.bounds.height, count: i(4), mask: op[5], bounces: 0 }); break;
        case 7: b.protectedFrames = i(4); break;
        case 8: this.startMotion(b, 0x100, { timer: timer(i(4)), incomingCheck: !!op[5] }); break;
        case 9: this.changeStyle(b, op[4], op[5]); break;
        case 10: if (op[4] === 1) b.cancelScript = -1; this.cancel(b, 0); break;
        case 11: this.context.sound?.(i(4), b.x); break;
        case 12: this.startMotion(b, 0x1000, { count: i(4), mask: op[5], wraps: 0 }); break;
        case 15: b.mark = op[4]; break;
        case 16:
          if (i(5) < 1) { b.commandIndex = op[4]; continue; }
          if (!b.commandLoop) { b.commandLoop = op[5]; b.commandIndex = op[4]; continue; }
          if (b.commandLoop !== 1) { b.commandLoop--; b.commandIndex = op[4]; continue; }
          b.commandLoop = 0; break;
        case 17: {
          const x = op[5] & 0x100 ? add(f(0), b.x) : f(0), y = op[5] & 0x100 ? add(f(1), b.y) : f(1);
          this.startMotion(b, 0x20000, { x, y, speed: b.speed, duration: i(4), interpolation: new AnmInterpolation([b.x, b.y, b.z], [x, y, 0], i(4), op[5] & 255) }); break;
        }
        case 18:
          if (!(f(0) >= 990)) { if (f(0) >= -990) b.angle = wrapAngle(f(0)); }
          else b.angle = wrapAngle(wrapAngle(add(this.angleToPlayer(b), sub(f(0), 999))));
          if (f(1) >= -990) b.speed = f(1); this.setVelocity(b); break;
        case 19: this.clearMotion(b, 0x80000); b.inactiveOffset = { ...polar(f(0), f(1)), duration: i(4) }; break;
        case 20: b.animation.B(0x499, op[4] === 2 ? 2 : op[4] === 1 ? 1 : 0); break;
        case 22: this.clearMotion(b, 0x400000); b.inactiveScale = new AnmInterpolation([f(0)], [f(1)], i(4), i(5)); b.scaleEnabled = true; break;
        case 23: b.saved = { ...position(b), angle: b.angle, speed: b.speed }; break;
        case 25: if (op[4] > 5) throw new RangeError('Original draw group outside 0..5'); b.group = op[4]; break;
        case 26: if (i(4) > 0) this.startMotion(b, 0x4000000, { timer: timer(i(4)) }); break;
        case 29: b.radius = b.radiusY = f(0) >= 0 ? f(0) : f32(this.styles[b.type].radius); break;
        case 30: if (i(4) > 0) this.startMotion(b, 0x40000000, { timer: timer(i(4)) }); break;
        case 31: this.startMotion(b, 0x80000000, { speed: f(0), offset: f(1), factor: f(2), duration: i(4) }); break;
        case 33: b.activeMask = (b.activeMask & ~0x200000000n) | (BigInt(op[4] & 1) << 33n); break;
        // 5,14,28 are deliberate no-op/default cases in the reconstructed switch.
        default: break;
      }
      b.commandIndex++;
    }
    throw new Error('TOUHOU extended command instruction budget exceeded (loop without frame wait)');
  }
  changeStyle(b: TouhouBullet, type: number, color: number) {
    if (type & 0x8000) throw new Error('TOUHOU external enemy ANM style requires explicit enemy animation ownership');
    b.animation.destroy(); b.child?.destroy(); b.child = null;
    b.type = type; b.color = color & 0x7fff; b.style = touhouStyle(this.styles, b.type, b.color);
    b.radius = b.radiusY = f32(b.style.radius); b.group = b.style.drawGroup; b.cancelScript = b.style.cancelScript; b.circle = true;
    b.animation = createTouhouBulletAnimation(this.bank,b.style,{ x: b.x, y: b.y },{spriteRemap: id => b.style.remapSprite(id)});
    b.animation.U(0x4a0, (b.animation.U(0x4a0) & ~0x03000000) | 0x01000000);
    if (b.style.childScript) b.child = this.bank.create(b.style.childScript, { x: b.x, y: b.y });
    if (color & 0x8000) b.animation.interrupt(2);
  }
  updateMotion(b: TouhouBullet, rate: number) {
    let finished = 0;
    for (const flag of [1, 4, 0x200000, 8, 16, 64, 0x80000000, 0x20000, 0x80000, 0x100, 0x40000000, 0x4000000]) {
      const c = b.motion.get(flag); if (!c || !(b.activeMask & bit(flag))) continue;
      const t = c.timer;
      if ([4, 0x200000, 8, 0x80000000].includes(flag) && t.current >= c.duration!) { finished += this.clearMotion(b, flag); continue; }
      if (flag === 1) {
        if (t.current > 16) { finished += this.clearMotion(b, flag); continue; }
        this.setVelocity(b, b.angle, add(sub(5, div(mul(t.value, 5), 16)), b.speed)); t.tick(rate);
      } else if (flag === 4 || flag === 0x200000) {
        b.speed = add(b.speed, mul(rate, c.acceleration!)); b.vx = add(b.vx, mul(c.ax!, rate)); b.vy = add(b.vy, mul(c.ay!, rate));
        if (Math.abs(b.vx) > f32(.0001) || Math.abs(b.vy) > f32(.0001)) { b.angle = wrapAngle(atan2(b.vy, b.vx)); b.speed = sqrt(add(mul(b.vx, b.vx), mul(b.vy, b.vy))); }
        t.tick(rate);
      } else if (flag === 8) {
        b.angle = wrapAngle(wrapAngle(add(b.angle, mul(rate, c.angular!)))); b.speed = add(b.speed, mul(rate, c.acceleration!)); this.setVelocity(b); t.tick(rate);
      } else if (flag === 16) {
        let speed;
        if (t.current >= c.duration!) {
          this.sound(b); c.turns!++;
          if (c.mode! === 0 || c.mode! === 5) b.angle = wrapAngle(add(b.angle, c.angle!));
          else if (c.mode! === 1 || c.mode! === 6) b.angle = wrapAngle(add(this.angleToPlayer(b), c.angle!));
          else if ([2, 3, 4].includes(c.mode!)) b.angle = wrapAngle(c.angle!);
          b.speed = speed = c.speed!; t.set(0);
          if (c.turns! >= c.count!) { this.setVelocity(b); finished += this.clearMotion(b, flag); continue; }
        } else speed = sub(b.speed, div(mul(t.value, b.speed), f32(c.duration!)));
        this.setVelocity(b, b.angle, speed); t.tick(rate);
      } else if (flag === 64) finished += this.bounce(b, c);
      else if (flag === 0x80000000) {
        const desired = polar(wrapAngle(add(c.offset!, this.angleToPlayer(b))), c.speed!);
        b.vx = add(b.vx, mul(sub(desired.x, b.vx), c.factor!)); b.vy = add(b.vy, mul(sub(desired.y, b.vy), c.factor!)); b.vz = 0;
        b.speed = sqrt(add(mul(b.vx, b.vx), mul(b.vy, b.vy))); b.angle = wrapAngle(atan2(b.vy, b.vx)); t.tick(rate);
      } else if (flag === 0x20000) {
        if (t.current >= c.duration!) { b.x = c.x!; b.y = c.y!; b.z = 0; b.speed = c.speed!; this.setVelocity(b); b.vz = 0; finished += this.clearMotion(b, flag); continue; }
        if (!t.current) c.interpolation!.start = [b.x, b.y, b.z];
        const target = c.interpolation!.sample(rate); b.vx = sub(target[0], b.x); b.vy = sub(target[1], b.y); b.vz = 0;
        if (Math.abs(b.vx) > f32(.0001) || Math.abs(b.vy) > f32(.0001)) b.angle = wrapAngle(atan2(b.vy, b.vx)); t.tick(rate);
      } else if (flag === 0x80000) { b.x = add(b.x, mul(c.x!, rate)); b.y = add(b.y, mul(c.y!, rate)); t.set(0); }
      else if (flag === 0x100) {
        t.add(-1, rate);
        if ((c.incomingCheck && this.offscreenMovingAway(b)) || t.current <= 0) finished += this.clearMotion(b, flag);
      } else if (flag === 0x40000000 || flag === 0x4000000) {
        if (t.current <= 0) { finished += this.clearMotion(b, flag); if (flag === 0x4000000) b.frozen = false; }
        else { if (flag === 0x4000000) b.frozen = true; t.add(-1, rate); }
      }
    }
    return finished;
  }
  bounce(b: TouhouBullet, c: BulletMotion) {
    const { centerX, centerY } = b.bounds;
    const width = this.context.boundsWidth! > 0 ? f32(this.context.boundsWidth!) : c.width!;
    const height = this.context.boundsHeight! > 0 ? f32(this.context.boundsHeight!) : c.height!;
    if (!(b.x <= add(centerX, div(-width, 2)) || b.x >= add(centerX, div(width, 2)) || b.y <= sub(centerY, div(height, 2)) || b.y >= add(centerY, div(height, 2)))) return 0;
    let bounced = false;
    for (const mask of [1, 2, 8, 4]) {
      const enabled = mask === 1 ? b.y < sub(centerY, div(height, 2)) : mask === 2 ? b.y >= add(centerY, div(height, 2)) : mask === 8 ? b.x >= add(centerX, div(width, 2)) : b.x < add(centerX, div(-width, 2));
      if (!(c.mask! & mask) || !enabled) continue; bounced = true;
      if (c.mask! & 16) continue;
      if (mask === 1 || mask === 2) { b.angle = wrapAngle(-b.angle); b.y = sub(mask === 2 ? add(mul(centerY, 2), height) : sub(mul(centerY, 2), height), b.y); }
      else { b.angle = wrapAngle(wrapAngle(add(wrapAngle(sub(-b.angle, PI)), 0))); b.x = sub(add(mul(centerX, 2), mask === 8 ? width : -width), b.x); }
    }
    if (bounced) { if (c.speed! > -990) b.speed = c.speed!; this.setVelocity(b); c.bounces!++; this.sound(b); }
    return c.bounces! >= c.count! ? this.clearMotion(b, 64) : 0;
  }
  spriteSize(b: TouhouBullet) { const sprite = this.bank.data.sprites[b.animation.spriteIndex]; return { width: f32(sprite?.width ?? b.animation.width), height: f32(sprite?.height ?? b.animation.height) }; }
  offscreenMovingAway(b: TouhouBullet) {
    const size = this.spriteSize(b); if (!outside(b, div(size.width, 2), div(size.height, 2))) return false;
    const direction = polar(b.angle, 1); let negative = -999, positive = -999;
    for (let i = 0; i < 4; i++) {
      let x = sub(add(b.bounds.centerX, div(i & 1 ? add(b.bounds.width, size.width) : sub(-b.bounds.width, size.width), 2)), b.x);
      let y = sub(add(b.bounds.centerY, div(i & 2 ? add(b.bounds.height, size.height) : sub(-b.bounds.height, size.height), 2)), b.y);
      const length = sqrt(add(mul(x, x), mul(y, y))); if (Math.abs(length) >= f32(.01)) { x = div(x, length); y = div(y, length); }
      const cross = sub(mul(direction.x, y), mul(direction.y, x)), dot = add(mul(direction.x, x), mul(direction.y, y));
      if (cross <= 0 && negative < dot && dot >= 0) negative = dot;
      if (cross >= 0 && positive < dot && dot >= 0) positive = dot;
    }
    return negative < -998 || positive < -998;
  }
  screenWrap(b: TouhouBullet) {
    const c = b.motion.get(0x1000); if (!c) return;
    const size = this.spriteSize(b); if (!outside(b, div(size.width, 2), div(size.height, 2))) return;
    if ((c.mask! & 1) && b.y < b.bounds.top) b.y = add(add(b.y, b.bounds.height), size.height);
    else if ((c.mask! & 2) && b.y > b.bounds.bottom) b.y = sub(b.y, add(b.bounds.height, size.height));
    else if ((c.mask! & 4) && b.x < b.bounds.left) b.x = add(add(b.x, b.bounds.width), size.width);
    else if ((c.mask! & 8) && b.x > b.bounds.right) b.x = sub(b.x, add(b.bounds.width, size.width)); else return;
    c.wraps!++; this.sound(b); if (c.wraps! >= c.count!) this.clearMotion(b, 0x1000);
  }
  advance(b: TouhouBullet) {
    b.totalAge.tick(this.context.clockScale ?? 1);
    let rate = [2, 3, 4].includes(b.state) || b.frozen ? f32(this.context.clockScale ?? 1) : mul(b.primaryRate, b.secondaryRate);
    const move = (scale: number, divisor = 1) => { b.x = add(b.x, div(mul(b.vx, scale), divisor)); b.y = add(b.y, div(mul(b.vy, scale), divisor)); b.z = add(b.z, div(mul(b.vz, scale), divisor)); };
    if (b.state === 2) { move(1, 2); b.primaryRate = b.secondaryRate = rate = 1; if (b.animation.U(0x444)) b.state = 1; }
    if (b.state === 1) {
      let movementAllowed = true;
      for (let retry = 0; retry < 4096; retry++) {
        if (!(b.activeMask & 0x4000000n)) {
          this.executeCommands(b);
          if (b.state === 2) { b.primaryRate = b.secondaryRate = rate = 1; if (!b.animation.U(0x444)) { movementAllowed = false; break; } b.state = 1; }
        }
        if (!this.updateMotion(b, rate)) break;
        if (retry === 4095) throw new Error('TOUHOU bullet motion retry budget exceeded');
      }
      if (!b.frozen && movementAllowed) move(rate);
    } else if (b.state === 3) { b.primaryRate = b.secondaryRate = 1; move(1, 2); }
    else if (b.state === 4) b.primaryRate = b.secondaryRate = 1;
    this.screenWrap(b);
    const size = this.spriteSize(b);
    if (b.autoBounds && !(b.activeMask & 0x100n) && b.offscreenGrace < 1 && outside(b, div(mul(size.width, b.scale), 2), div(mul(size.height, b.scale), 2), 64)) { this.retire(b); return; }
    if (b.protectedFrames) b.protectedFrames = (b.protectedFrames - 1) | 0;
    if (b.offscreenGrace > 0) b.offscreenGrace--;
    if (!b.frozen) b.animation.update();
    if (!b.animation.alive) this.retire(b);
  }
  hitTest(b: TouhouBullet, preview = false) {
    return updateTouhouBulletCollision(b,this.player,this.context,{preview,visualRandom:this.visualRandom,onHit:()=>this.hitAnimation(b)});
  }
  effect(b: TouhouBullet, drifting: boolean) {
    const animation=createTouhouBulletCancelAnimation(this.bank,b.cancelScript,{x:b.x,y:b.y,
      cancelKind:b.cancelKind,drifting,velocity:{x:b.vx,y:b.vy,z:b.vz},clockScale:this.context.clockScale??1});
    if(!animation)return;
    this.effects.push(animation); this.context.onCancelEffect?.(b, animation);
  }
  hitAnimation(b: TouhouBullet) { b.state = 3; b.animation.interrupt(1); b.child?.interrupt(1, true); this.effect(b, true); }
  cancel(b: TouhouBullet, dropMode: number = 0): void {
    if (!b.state) return;
    b.animation.interrupt(1); b.animation.update(); b.child?.interrupt(1, true);
    if (!b.frozen) { this.effect(b, false); this.context.sound?.(71, b.x); this.dropItems(b, dropMode); }
    const rate = f32(this.context.clockScale ?? 1);
    b.x = add(b.x, div(mul(b.vx, rate), 2)); b.y = add(b.y, div(mul(b.vy, rate), 2)); b.z = add(b.z, div(mul(b.vz, rate), 2));
    b.state = 4; b.primaryRate = b.secondaryRate = 1; b.age.set(0);
  }
  dropItems(b: TouhouBullet, mode: number) {
    if (!mode || outside(b, 32, 32)) return;
    this.itemCounter++;
    if (mode === 1) this.context.spawnCancelItem?.(position(b), 1, 13);
    else if (mode === 4) {
      const residue = (this.itemCounter | 0) % 5;
      const point = residue === 0 || (residue === 2 && this.random.next() % 2 === 0) || (residue === 4 && this.random.next() % 3 === 0);
      this.context.spawnCancelItem?.(position(b), point ? 2 : 1, point ? { angle: -div(PI, 2), speed: f32(2.2) } : 13);
    }
  }
  cancelCircle(x: number, y: number, radius: number, { dropMode = 0, limit = 99999, kind = 0 }: {dropMode?:number;limit?:number;kind?:number} = {}): number {
    let count = 0;
    for (const b of this.bullets) {
      if (![1, 2].includes(b.state) || b.protectedFrames || !touhouBulletInCancelCircle(b,x,y,radius)) continue;
      b.cancelKind = kind & 3; this.cancel(b, dropMode); this.cancelCounter++; count++; if (--limit < 1) break;
    }
    return count;
  }
  /** ECL615/616 use player_cancellation.cpp cancel_near_circle. Unlike the
   * regular circle this ignores protection and retains each bullet's kind. */
  cancelNearbyCircle(x: number, y: number, radius: number, { dropMode = 0 }: {dropMode?:number} = {}): number {
    let count = 0;
    for (const b of this.bullets) {
      if (![1, 2].includes(b.state) || !touhouBulletInCancelCircle(b, x, y, radius)) continue;
      this.cancel(b, dropMode); this.cancelCounter++; count++;
    }
    return count;
  }
  cancelRectangle(x: number, y: number, width: number, height: number, angle: number = 0, { dropMode = 0, kind = 0 }: {dropMode?:number;kind?:number} = {}): number {
    let count = 0;
    for (const b of this.bullets) {
      if (![1, 2].includes(b.state) || b.protectedFrames) continue;
      if (!touhouBulletInCancelRectangle(b,x,y,width,height,angle,b.bounds)) continue;
      b.cancelKind = kind & 3; this.cancel(b, dropMode); this.cancelCounter++; count++;
    }
    return count;
  }
  update(player: {x:number;y:number;collisionCircle(x:number,y:number,radius:number,context:TouhouBulletContext,preview?:boolean):number;addGraze(context:TouhouBulletContext,position?:{x:number;y:number},color?:number):void}|null = null, context: TouhouBulletContext = {}): this {
    this.player = player; this.context = context;
    if (context.paused) return this;
    const priorEffects = this.effects.slice();
    for (const b of this.bullets.slice()) {
      if (!b.state) continue;
      if (!context.freezeBullets) {
        if (b.previewOnly && (b.state === 1 || (b.state === 2 && b.age.current >= 8))) this.hitTest(b, true);
        else {
          this.advance(b); if (!b.state) continue;
          if (b.child) { b.child.x = b.x; b.child.y = b.y; b.child.update(); }
          if (!b.frozen) {
            if (b.state === 1 || (b.state === 2 && (b.age.current < 8 || this.hitTest(b) !== 1))) this.hitTest(b);
          }
        }
      }
      b.age.tick(context.clockScale ?? 1);
    }
    for (const effect of priorEffects) effect.update();
    this.bullets = this.bullets.filter(b => b.state !== 0); this.effects = this.effects.filter(effect => effect.alive);
    this.bank.instances = this.bank.instances.filter(animation => animation.alive);
    this.age++; return this;
  }
  draw(draw: DrawList, view: {x:number;y:number;scale:number} = { x: 336, y: 24, scale: 1.5 }, {effects=true,children=true}={}): DrawList {
    if(draw.enqueuePriority){
      // BulletInf draws only each embedded main animation at priority 41.
      // Independently registered spawn/child/cancel animations retain their
      // own ANM callbacks; capturing the entire tree moves them wrongly.
      draw.enqueuePriority(TOUHOU_OWNER_PRIORITIES.bullet,target=>this.draw(target,view,{effects:false,children:false}));
      for(const b of this.bullets)if(b.state&&!b.frozen){
        for(const child of b.animation.children)child.draw(draw,view);
        b.child?.draw(draw,view);
      }
      if(effects)for(const effect of this.effects)effect.draw(draw,view);return draw;
    }
    for (let group = 0; group < 6; group++) for (const b of this.bullets) {
      if (!b.state || b.frozen || b.group !== group) continue;
      b.animation.x = b.x; b.animation.y = b.y; b.animation.z = b.z;
      if (b.animation.orientation) { b.animation.rotation = wrapAngle(add(b.angle, div(PI, 2))); b.animation.flag(2, 2); }
      if (b.scaleEnabled) { b.animation.scale2X = b.animation.scale2Y = b.scale; b.animation.flag(4, 4); }
      if(children){b.animation.draw(draw,view);b.child?.draw(draw,view);}else b.animation.drawSelf(draw,view);
    }
    if(effects)for (const effect of this.effects) effect.draw(draw, view);
    return draw;
  }
  snapshot(): unknown { return { age: this.age, count: this.bullets.length, free: this.free.length, cancelCounter: this.cancelCounter,
    itemCounter: this.itemCounter, bullets: this.bullets.map(b => ({ id: b.id, slot: b.slot, state: b.state, type: b.type, color: b.color,
      x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, angle: b.angle, speed: b.speed, radius: b.radius,
      age: b.age.current, grazesLeft: b.grazesLeft, activeMask: b.activeMask.toString(), commandIndex: b.commandIndex,
      cancelScript: b.cancelScript, animation: b.animation.snapshot() })) }; }
}
