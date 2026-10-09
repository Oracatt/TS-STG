import type { DrawList } from './render.js';
import type { Bullet } from './bullets.js';
import type { Laser } from './lasers.js';
import type { Entity, World } from './world.js';

export interface Vec2 { x: number; y: number; alive?: boolean }

export interface Bounds extends Vec2 { width: number; height: number }

export type DrawValue = number | string | boolean | readonly DrawValue[];

export type DrawCommand = [string, ...DrawValue[]];

export type TaskYield = number | undefined | ((context: any) => boolean) | Iterator<any>;

export type Task = Iterator<TaskYield, any, any>;

export interface TaskHandle { predicate?: ((context: unknown) => boolean) | null; executing?: boolean; stack: Task[]; owner: { alive?: boolean } | null; wake: number; cancelled: boolean; done: boolean }

export interface EntityOptions {
  x?: number; y?: number; vx?: number; vy?: number; radius?: number; group?: string; layer?: number; tag?: unknown;
}

export interface WorldOptions { bounds?: Bounds; seed?: number; cellSize?: number }

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

export interface LaserOptions extends EntityOptions {
  kind?: 'straight' | 'moving' | 'curved'; angle?: number; length?: number; width?: number; speed?: number;
  angularVelocity?: number; turnRate?: number; warningFrames?: number; warning?: number; growFrames?: number;
  grow?: number; activeFrames?: number; duration?: number; fadeFrames?: number; fade?: number;
  color?: number; damage?: number; cancelable?: boolean; grazeCooldown?: number; hitboxScale?: number;
  owner?: Entity | null; follow?: Entity | null; offsetX?: number; offsetY?: number; maxPoints?: number;
  points?: Vec2[]; path?: (age: number, laser: Laser, world: World) => Vec2;
  behavior?: (laser: Laser, world: World) => void;
}

export interface PatternOptions extends BulletOptions {
  count?: number; rows?: number; speedStep?: number; angleStep?: number; spread?: number; target?: Vec2;
  arms?: number; delayStep?: number; speedX?: number; speedY?: number; dx?: number; dy?: number;
}

export type ShaderUniform = readonly [string, 'float'|'vec2'|'vec3'|'vec4'|'int'|'ivec2'|'ivec3'|'ivec4'|'mat4', readonly number[]];

/** Structural cancellation boundary shared by bullet and laser families. */
export interface CancellableEntity extends Entity { cancelable: boolean; cancelAge?: number | null; intersectsCircle?: (x: number, y: number, radius: number) => boolean; cancel(reason?: string): boolean; }
export type PrimitiveDraw = { [K in 'circle' | 'ring' | 'line' | 'rect' | 'text' | 'triangle' | 'point' | 'sprite' | 'spriteRegion']: (...args: Parameters<DrawList[K]>) => void };
