export interface Vec2 { x: number; y: number }
export interface Bounds extends Vec2 { width: number; height: number }
export type DrawValue = number | string | boolean | readonly DrawValue[];
export type DrawCommand = [string, ...DrawValue[]];
export const TAU: number;
export function clamp(value: number, min: number, max: number): number;
export function lerp(a: number, b: number, t: number): number;
export function mod(value: number, divisor: number): number;
export function normalizeAngle(angle: number): number;
export function angleTo(a: Vec2, b: Vec2): number;
export function distanceSq(a: Vec2, b: Vec2): number;
export function distance(a: Vec2, b: Vec2): number;
export function approachAngle(angle: number, target: number, step: number): number;
export function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean;
export function distanceToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number;
export function circleIntersectsRect(x: number, y: number, radius: number, rect: Bounds): boolean;
export const Easings: Readonly<Record<'linear' | 'inQuad' | 'outQuad' | 'inOutQuad' | 'smooth' | 'outCubic', (t: number) => number>>;
export class RNG {
  constructor(seed?: number);
  seed: number; state: number;
  nextUint(): number; next(): number; float(min?: number, max?: number): number;
  /** Upper bound is exclusive. */
  int(max: number): number; int(min: number, max: number): number;
  sign(): 1 | -1; pick<T>(values: readonly T[]): T; shuffle<T>(values: T[]): T[];
  save(): number; restore(state: number): this; clone(): RNG;
}
export const Keys: Readonly<{ LEFT: 1; RIGHT: 2; UP: 4; DOWN: 8; SHOOT: 16; BOMB: 32; FOCUS: 64; PAUSE: 128; CONFIRM: 256; CANCEL: 512 }>;
export class Input {
  mask: number; previous: number;
  update(mask?: number): this; down(key: number): boolean; pressed(key: number): boolean; released(key: number): boolean;
  reset(): void; axis(negative: number, positive: number): number;
}
export type TaskYield = number | undefined | ((context: any) => boolean) | Iterator<any>;
export type Task = Iterator<TaskYield, any, any>;
export interface TaskHandle { stack: Task[]; owner: { alive?: boolean } | null; wake: number; cancelled: boolean; done: boolean }
export function wait(frames?: number): Generator<number, void, unknown>;
export class TaskRunner {
  constructor(owner?: { alive?: boolean } | null);
  owner: { alive?: boolean } | null; frame: number; readonly size: number;
  add(task: Task | ((owner: any) => Task), owner?: { alive?: boolean } | null): TaskHandle;
  cancel(entry: TaskHandle): void; clear(): void; update(context?: any): void;
}
export interface EntityOptions {
  x?: number; y?: number; vx?: number; vy?: number; radius?: number; group?: string; layer?: number; tag?: unknown;
}
export class Entity {
  constructor(options?: EntityOptions);
  id: number; world: World | null; alive: boolean; readonly dead: boolean; age: number;
  x: number; y: number; vx: number; vy: number; radius: number; group: string; layer: number; tag: unknown;
  tasks: TaskRunner; destroyReason?: string;
  update(world: World): void; draw(draw: DrawList): void;
  collidesCircle(x: number, y: number, radius: number): boolean; getAABB(out?: Partial<Bounds>): Bounds;
  destroy(reason?: string): boolean; snapshot(): Record<string, any>;
  onSpawn?(world: World): void; onDestroy?(reason: string, world: World): void;
}
export class SpatialHash {
  constructor(cellSize?: number); cellSize: number;
  rebuild(entities: Entity[]): void; query(x: number, y: number, radius: number): Set<Entity>;
}
export interface WorldOptions { bounds?: Bounds; seed?: number; cellSize?: number }
export class World {
  constructor(options?: WorldOptions);
  bounds: Bounds; seed: number; rng: RNG; frame: number; entities: Entity[]; pending: Entity[];
  nextId: number; tasks: TaskRunner; updating: boolean; game: any; spatial: SpatialHash;
  spawn<T extends Entity>(entity: T): T; add<T extends Entity>(entity: T): T;
  flush(): void; update(): void; step(): void; invalidateSpatial(): void;
  query(group?: string): Entity[];
  queryCircle(x: number, y: number, radius: number, groups?: string | string[] | Set<string>): Entity[];
  clear(group?: string | ((entity: Entity) => boolean), reason?: string): number;
  draw(draw: DrawList): DrawList;
  snapshot(): { frame: number; seed: number; rng: number; entities: Record<string, any>[] };
}
export type BulletShape = 'circle' | 'orb' | 'rice' | 'kunai' | 'arrow' | 'diamond' | 'star';
export interface BulletCommand {
  at: number; action?: (bullet: Bullet, world: World) => void;
  type?: 'turn' | 'aim' | 'speed' | 'acceleration' | 'angularVelocity' | 'pause' | 'style' | 'cancel';
  angle?: number; delta?: number; target?: Vec2 | ((bullet: Bullet, world: World) => Vec2);
  offset?: number; value?: number; frames?: number; color?: number; shape?: BulletShape;
}
export interface BulletOptions extends EntityOptions {
  angle?: number; speed?: number; acceleration?: number; maxSpeed?: number; minSpeed?: number;
  angularVelocity?: number; angularAcceleration?: number; delay?: number; lifetime?: number;
  bounce?: number | boolean; bounceEdges?: ('left' | 'right' | 'top' | 'bottom')[]; wrap?: number | boolean;
  cullMargin?: number; offscreenGrace?: number; autoCull?: boolean; owner?: Entity | null; damage?: number;
  cancelable?: boolean; color?: number; shape?: BulletShape; sprite?: number | null; scale?: number;
  grazeRadius?: number; homing?: Vec2 | ((bullet: Bullet, world: World) => Vec2 | null) | null;
  homingRate?: number; homingFrames?: number; behavior?: (bullet: Bullet, world: World) => void;
  commands?: BulletCommand[]; hitbox?: 'circle' | 'capsule' | 'box'; halfLength?: number; halfWidth?: number;
}
export class Bullet extends Entity {
  constructor(options?: BulletOptions);
  angle: number; speed: number; acceleration: number; maxSpeed: number; minSpeed: number;
  angularVelocity: number; angularAcceleration: number; delay: number; lifetime: number;
  bounce: number; bounceEdges: string[]; wrap: number; cullMargin: number; offscreenGrace: number; autoCull: boolean;
  owner: Entity | null; damage: number; cancelable: boolean; color: number; shape: BulletShape;
  sprite: number | null; scale: number; grazeRadius: number; grazed: Set<number>; readonly isActive: boolean;
  hitbox: 'circle' | 'capsule' | 'box'; halfLength: number; halfWidth: number;
  homing: BulletOptions['homing']; homingRate: number; homingFrames: number; behavior: BulletOptions['behavior'];
  commands: BulletCommand[]; commandIndex: number;
  syncVelocity(): void; setVelocity(angle: number, speed?: number): this; aimAt(target: Vec2, offset?: number): this;
  graze(player: number | Entity): boolean; cancel(reason?: string): boolean;
  execute(command: BulletCommand, world: World): void; handleBounds(bounds: Bounds): void;
  onBounce?(edge: string, world: World | null): void; onWrap?(world: World | null): void;
}
export interface LaserOptions extends EntityOptions {
  kind?: 'straight' | 'moving' | 'curved'; angle?: number; length?: number; width?: number; speed?: number;
  angularVelocity?: number; turnRate?: number; warningFrames?: number; warning?: number; growFrames?: number;
  grow?: number; activeFrames?: number; duration?: number; fadeFrames?: number; fade?: number;
  color?: number; damage?: number; cancelable?: boolean; grazeCooldown?: number; hitboxScale?: number;
  owner?: Entity | null; follow?: Entity | null; offsetX?: number; offsetY?: number; maxPoints?: number;
  points?: Vec2[]; path?: (age: number, laser: Laser, world: World) => Vec2;
  behavior?: (laser: Laser, world: World) => void;
}
export class Laser extends Entity {
  constructor(options?: LaserOptions);
  kind: 'straight' | 'moving' | 'curved'; angle: number; length: number; width: number; speed: number;
  angularVelocity: number; warningFrames: number; growFrames: number; activeFrames: number; fadeFrames: number;
  color: number; damage: number; cancelable: boolean; grazeCooldown: number; hitboxScale: number;
  owner: Entity | null; follow: Entity | null; offsetX: number; offsetY: number; maxPoints: number; points: Vec2[];
  path: LaserOptions['path']; behavior: LaserOptions['behavior'];
  readonly phase: 'warning' | 'grow' | 'active' | 'fade' | 'dead'; readonly isActive: boolean;
  readonly active: boolean; readonly currentWidth: number;
  segments(): [number, number, number, number][];
  intersectsCircle(x: number, y: number, radius: number, width?: number): boolean;
  canGraze(player: number | Entity, frame?: number): boolean; graze(player: number | Entity, frame?: number): boolean;
  cancel(reason?: string): boolean;
}
export interface PatternOptions extends BulletOptions {
  count?: number; rows?: number; speedStep?: number; angleStep?: number; spread?: number; target?: Vec2;
  arms?: number; delayStep?: number; speedX?: number; speedY?: number; dx?: number; dy?: number;
}
export const Patterns: Readonly<Record<'ring' | 'fan' | 'aimed' | 'spiral' | 'random' | 'ellipse' | 'line', (world: World, options?: PatternOptions) => Bullet[]>>;
export function rgba(r: number, g: number, b: number, a?: number): number;
export function withAlpha(color: number, alpha: number): number;
export type ShaderUniform = readonly [string, 'float'|'vec2'|'vec3'|'vec4'|'int'|'ivec2'|'ivec3'|'ivec4'|'mat4', readonly number[]];
export class DrawList {
  commands: DrawCommand[];
  reset(): this; push(command: DrawCommand): this; clear(color?: number): this;
  circle(x: number, y: number, radius: number, color: number): this;
  ring(x: number, y: number, inner: number, outer: number, color: number): this;
  line(x1: number, y1: number, x2: number, y2: number, width: number, color: number): this;
  lineStrip(vertices: Array<[number, number, number]>): this;
  point(x: number, y: number, color: number): this;
  rect(x: number, y: number, width: number, height: number, color: number): this;
  text(text: unknown, x: number, y: number, size: number, color?: number, fontId?: number): this;
  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number): this;
  sprite(id: number, x: number, y: number, width: number, height: number, rotation?: number, color?: number): this;
  spriteRegion(id: number, sx: number, sy: number, sw: number, sh: number, x: number, y: number, width: number, height: number, rotation?: number, color?: number): this;
  blend(mode?: 'alpha' | 'add' | 'multiply'): this; blendEnd(): this;
  /** Generic shader scope. Alpha testing must be disabled; shader owns its fragment output. */
  shaderBegin(id: number, uniforms?: readonly ShaderUniform[]): this; shaderEnd(): this;
  mesh(textureId: number, vertices: Array<[number, number, number, number, number]>, indices: number[]): this;
  /** TL/TR/BL/BR local corners; renderer rounds numeric inputs/each operation to binary32. */
  quad(textureId: number, corners: readonly number[], worldX: number, worldY: number, scale: number, offsetX: number, offsetY: number, u0: number, v0: number, u1: number, v1: number, color0: number, color1: number, color2: number, color3: number, pixelSnap?: boolean): this;
  /** Atomic alpha-test/blend/sampler/quad/blendEnd/alphaTest(0) sequence. */
  statefulQuad(textureId: number, corners: readonly number[], worldX: number, worldY: number, scale: number, offsetX: number, offsetY: number, u0: number, v0: number, u1: number, v1: number, color0: number, color1: number, color2: number, color3: number, pixelSnap: boolean, state: readonly [number,string,string,string,string,string,string,'point'|'bilinear'|'anisotropic4x','clamp'|'wrap'|'mirror','clamp'|'wrap'|'mirror']): this;
  mesh3d(textureId: number, vertices: Array<[number, number, number, number, number, number]>, indices: number[], mvp: number[]): this;
  targetBegin(id: number, clearColor?: number): this; targetEnd(): this;
  blendFactors(src: string, dst: string, op?: string, srcAlpha?: string, dstAlpha?: string, alphaOp?: string): this;
  /** Discard final fragment alpha below cutoff (0..1); zero disables testing. */
  alphaTest(cutoff?: number): this;
  sampler(textureId: number, filter?: 'point' | 'bilinear' | 'anisotropic4x', wrapU?: 'clamp' | 'wrap' | 'mirror', wrapV?: 'clamp' | 'wrap' | 'mirror'): this;
  scissor(x: number, y: number, width: number, height: number): this; scissorEnd(): this;
  toJSON(): DrawCommand[];
}
