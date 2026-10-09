interface EntityGroups { player: import('./player.js').Player; playerShot: import('./player.js').PlayerShot; bomb: import('./player.js').Bomb; enemy: import('./enemy.js').Enemy; enemyBullet: import('./bullets.js').Bullet; enemyLaser: import('./lasers.js').Laser; item: import('./items.js').Item; effect: import('./effects.js').Effect; }
import type { DrawList } from './render.js';
import type { Bounds, EntityOptions, WorldOptions } from './core-types.js';
import { RNG, circlesOverlap } from './math.js';
import { TaskRunner } from './task.js';

export class Entity {  onSpawn?(world: World): void;
  onDestroy?(reason: string, world: World | null): void;

  declare id: number;
  declare world: World | null;
  declare alive: boolean;

  declare age: number;
  declare x: number;
  declare y: number;
  declare vx: number;
  declare vy: number;
  declare radius: number;
  declare group: string;
  declare layer: number;
  declare tag: unknown;
  declare tasks: TaskRunner;
  declare destroyReason?: string;

  constructor(options: EntityOptions = {}) {
    this.id = 0; this.world = null; this.alive = true; this.age = 0;
    this.x = options.x ?? 0; this.y = options.y ?? 0;
    this.vx = options.vx ?? 0; this.vy = options.vy ?? 0;
    this.radius = options.radius ?? 0; this.group = options.group ?? 'entity';
    this.layer = options.layer ?? 0; this.tag = options.tag ?? null;
    this.tasks = new TaskRunner(this);
  }
  get dead() { return !this.alive; }
  update(world: World): void;
  update(): void { this.x += this.vx; this.y += this.vy; }
  draw(_draw: DrawList): void {}
  collidesCircle(x: number, y: number, radius: number): boolean { return this.alive && circlesOverlap(this.x, this.y, this.radius, x, y, radius); }
  getAABB(out: Partial<Bounds> = {}): Bounds { out.x = this.x - this.radius; out.y = this.y - this.radius; out.width = out.height = this.radius * 2; return out as Bounds; }
  destroy(reason: string = 'destroy'): boolean {
    if (!this.alive) return false;
    this.alive = false; this.destroyReason = reason;
    this.tasks.clear();
    if (this.world) this.world.invalidateSpatial();
    this.onDestroy?.(reason, this.world);
    return true;
  }
  snapshot(): Record<string, any> { return { id: this.id, group: this.group, age: this.age, x: this.x, y: this.y, vx: this.vx, vy: this.vy }; }
}

/** Grid broad phase stores AABBs; exact circle/laser tests are performed on candidates. */
export class SpatialHash {
  declare cells: Map<string | number, Entity[]>;
  declare oversized: Entity[];

  declare cellSize: number;

  constructor(cellSize: number = 48) {
    if (!(cellSize > 0) || !Number.isFinite(cellSize)) throw new RangeError('cellSize must be positive');
    this.cellSize = cellSize; this.cells = new Map<string | number, Entity[]>(); this.oversized = [];
  }
  rebuild(entities: Entity[]): void {
    this.cells.clear(); this.oversized.length = 0;
    const size = this.cellSize, scratch = {};
    for (let index = 0; index < entities.length; index++) {
      const entity = entities[index];
      if (!entity.alive) continue;
      const aabb = entity.getAABB(scratch);
      const x0 = Math.floor(aabb.x / size), y0 = Math.floor(aabb.y / size);
      const x1 = Math.floor((aabb.x + aabb.width) / size), y1 = Math.floor((aabb.y + aabb.height) / size);
      // A giant beam must not allocate an unbounded number of grid buckets.
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) { this.oversized.push(entity); continue; }
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const key = x >= -32768 && x < 32768 && y >= -32768 && y < 32768 ? x * 65536 + y : `${x},${y}`;
        let cell = this.cells.get(key);
        if (!cell) { cell = []; this.cells.set(key, cell); }
        cell.push(entity);
      }
    }
  }
  query(x: number, y: number, radius: number): Set<Entity> {
    const result = new Set(this.oversized), size = this.cellSize;
    const x0 = Math.floor((x - radius) / size), x1 = Math.floor((x + radius) / size);
    const y0 = Math.floor((y - radius) / size), y1 = Math.floor((y + radius) / size);
    // Huge cancellation circles are cheaper as a bucket scan.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.cells.size * 2 + 256) {
      for (const cell of this.cells.values()) for (const entity of cell) result.add(entity);
    } else {
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const key = cx >= -32768 && cx < 32768 && cy >= -32768 && cy < 32768 ? cx * 65536 + cy : `${cx},${cy}`;
        const cell = this.cells.get(key);
        if (cell) for (const entity of cell) result.add(entity);
      }
    }
    return result;
  }
}

export class World {
  declare spatialDirty: boolean;

  declare bounds: Bounds;
  declare seed: number;
  declare rng: RNG;
  declare frame: number;
  declare entities: Entity[];
  declare pending: Entity[];
  declare nextId: number;
  declare tasks: TaskRunner;
  declare updating: boolean;
  declare game: any;
  declare spatial: SpatialHash;

  constructor({ bounds = { x: 32, y: 24, width: 576, height: 672 }, seed = 1, cellSize = 48 }: WorldOptions = {}) {
    this.bounds = { ...bounds }; this.seed = seed >>> 0; this.rng = new RNG(this.seed);
    if (!(this.bounds.width > 0 && this.bounds.height > 0) || !Object.values(this.bounds).every(Number.isFinite)) throw new RangeError('World bounds must be finite with positive size');
    this.frame = 0; this.entities = []; this.pending = []; this.nextId = 1;
    this.tasks = new TaskRunner(); this.updating = false; this.game = null;
    this.spatial = new SpatialHash(cellSize); this.spatialDirty = true;
  }
  spawn<T extends Entity>(entity: T): T {
    if (!(entity instanceof Entity)) throw new TypeError('world.spawn requires an Entity');
    if (entity.world) throw new Error('An entity can only be spawned once');
    if (!entity.alive) throw new Error('Cannot spawn a destroyed entity');
    entity.world = this; entity.id = this.nextId++;
    this.pending.push(entity); this.invalidateSpatial();
    entity.onSpawn?.(this);
    return entity;
  }
  add<T extends Entity>(entity: T): T { return this.spawn(entity); }
  flush(): void {
    if (this.updating) return;
    for (const entity of this.pending) if (entity.alive) this.entities.push(entity);
    this.pending.length = 0;
    this.invalidateSpatial();
  }
  update(): void {
    if (this.updating) throw new Error('World.update is not reentrant');
    this.flush(); this.updating = true;
    try {
      this.tasks.update(this);
      for (let index = 0; index < this.entities.length; index++) {
        const entity = this.entities[index];
        if (!entity.alive) continue;
        entity.tasks.update(this);
        if (entity.alive) entity.update(this);
        if (entity.alive) entity.age++;
      }
    } finally {
      this.updating = false;
      let write = 0;
      for (const entity of this.entities) if (entity.alive) this.entities[write++] = entity;
      this.entities.length = write;
      this.flush(); this.frame++;
    }
  }
  step(): void { this.update(); }
  invalidateSpatial(): void { this.spatialDirty = true; }
  query<K extends keyof EntityGroups>(group: K): EntityGroups[K][];
  query(group?: string): Entity[];
  query(group?: string): Entity[] { return this.entities.filter(entity => entity.alive && (group === undefined || entity.group === group)); }
  queryCircle<K extends keyof EntityGroups>(x: number, y: number, radius: number, groups: K): EntityGroups[K][];
  queryCircle(x: number, y: number, radius: number, groups?: string | string[] | Set<string>): Entity[];
  queryCircle(x: number, y: number, radius: number, groups?: string | string[] | Set<string>): Entity[] {
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Query radius must be finite and nonnegative');
    if (this.spatialDirty) { this.spatial.rebuild(this.entities); this.spatialDirty = false; }
    const matches = typeof groups === 'string' ? (group: string) => group === groups : groups ? (group: string) => (groups as string[]).includes ? (groups as string[]).includes(group) : (groups as Set<string>).has(group) : () => true;
    const hits = [];
    for (const entity of this.spatial.query(x, y, radius)) {
      if (entity.alive && matches(entity.group) && entity.collidesCircle(x, y, radius)) hits.push(entity);
    }
    // Hash cell traversal order must never determine gameplay event order.
    return hits.sort((a, b) => a.id - b.id);
  }
  clear(group?: string | ((entity: Entity) => boolean), reason: string = 'clear'): number {
    const matches = typeof group === 'function' ? group : (entity: Entity) => group === undefined || entity.group === group;
    let count = 0;
    // Snapshot ensures destruction callbacks cannot grow this loop indefinitely.
    for (const entity of this.entities.concat(this.pending)) if (entity.alive && matches(entity)) {
      entity.destroy(reason); count++;
    }
    this.invalidateSpatial(); return count;
  }
  draw(draw: DrawList): DrawList {
    // Entities already retain spawn/ID order. Sort layers, not thousands of bullets.
    const layers = new Map<number, Entity[]>();
    for (const entity of this.entities) if (entity.alive) {
      let entries = layers.get(entity.layer);
      if (!entries) { entries = []; layers.set(entity.layer, entries); }
      entries.push(entity);
    }
    for (const layer of [...layers.keys()].sort((a, b) => a - b)) for (const entity of layers.get(layer)!) entity.draw(draw);
    return draw;
  }
  snapshot(): { frame: number; seed: number; rng: number; entities: Record<string, any>[] } {
    return { frame: this.frame, seed: this.seed, rng: this.rng.save(), entities: this.entities.filter(entity => entity.alive).map(entity => entity.snapshot()) };
  }
}
