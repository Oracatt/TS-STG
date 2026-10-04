export * from './core.js';
export * from './bullet-presets.js';
export type { NativeHost, SystemTextLayoutOptions, SystemTextRasterOptions, SystemTextTexture, SystemBitmapTextOptions, SystemBitmapTextPixels } from './native-host.js';
export * from './float32.js';
export * from './grid-mesh.js';
export * from './radial-distortion.js';
export * from './layered-render.js';
export * from './repeating-input.js';
export * from './sprite-atlas.js';
export * from './spell-presentation.js';
export * from './player-characters.js';
export * from './player-presentation.js';
export * from './bomb-geometry.js';
import { Entity, EntityOptions, World, DrawList, Input, TaskRunner, Bounds, DrawCommand } from './core.js';

export interface WeaponOptions {
  type?: 'spread' | 'homing' | 'laser' | 'piercing' | string;
  interval?: number; damage?: number; shotSpeed?: number;
  shotSprite?: string | null; optionSprite?: string | null; laserSprite?: string | null;
  emit?: (player: Player, world: World, weapon: Weapon) => void;
}
export class Weapon {
  constructor(options?: WeaponOptions);
  type: string; interval: number; damage: number; shotSpeed: number; cooldown: number;
  shotSprite: string | null; optionSprite: string | null; laserSprite: string | null;
  emit?: WeaponOptions['emit'];
  update(player: Player, world: World, firing: boolean): void;
}
export interface PlayerShotOptions extends EntityOptions {
  angle?: number; speed?: number; damage?: number; homing?: boolean; turnRate?: number;
  piercing?: boolean; length?: number; duration?: number; color?: number;
  follow?: Player; offsetX?: number; sprite?: string | null;
}
export class PlayerShot extends Entity {
  constructor(options?: PlayerShotOptions);
  angle: number; speed: number; damage: number; homing: boolean; turnRate: number;
  piercing: boolean; length: number; duration: number; color: number; hitTargets: Set<number>;
  follow?: Player; offsetX: number; sprite: string | null;
  update(world: World): void;
  collidesCircle(x: number, y: number, radius: number): boolean;
  draw(draw: DrawList): void;
}
export interface BombOptions extends EntityOptions {
  owner?: Player; duration?: number; damage?: number; maxRadius?: number; expansion?: number;
  onTick?: (bomb: Bomb, world: World) => void; color?: number;
  shape?: 'orb' | 'beam'; angle?: number; length?: number; width?: number; growFrames?: number;
  followOwner?: boolean; offsetX?: number; offsetY?: number;
}
export class Bomb extends Entity {
  constructor(options?: BombOptions);
  owner?: Player; duration: number; damage: number; maxRadius: number; expansion: number; color: number;
  shape: 'orb' | 'beam'; angle: number; length: number; width: number; growFrames: number;
  followOwner: boolean; offsetX: number; offsetY: number; readonly currentWidth: number;
  onTick?: BombOptions['onTick'];
  update(world: World): void;
  intersectsCircle(x: number, y: number, radius: number): boolean;
  intersectsEntity(entity: import('./bomb-geometry.js').BeamTarget): boolean;
  collidesCircle(x: number, y: number, radius: number): boolean;
  getAABB(out?: Partial<Bounds>): Bounds;
  draw(draw: DrawList): void;
}
export function createOrbBomb(options?: BombOptions): Bomb;
export function createBeamBomb(options?: BombOptions): Bomb;
export function cancelBombBeam(world: World, beam: Bomb, options?: { reward?: boolean; force?: boolean }): number;
export interface PlayerOptions extends EntityOptions {
  speed?: number; focusSpeed?: number; grazeRadius?: number; pickupRadius?: number;
  lives?: number; bombs?: number; power?: number; maxPower?: number;
  invulnerableFrames?: number; deathbombFrames?: number; respawnDuration?: number;
  respawnInvulnerability?: number; weapon?: WeaponOptions | Weapon; bomb?: BombOptions;
  character?: string | null;
  bombFactory?: (player: Player, game: Game, options: BombOptions) => Bomb;
}
export class Player extends Entity {
  constructor(options?: PlayerOptions);
  speed: number; focusSpeed: number; grazeRadius: number; pickupRadius: number;
  lives: number; bombs: number; power: number; maxPower: number;
  lifePieces: number; bombPieces: number; graze: number;
  state: 'normal' | 'dying' | 'respawning' | 'gameover'; focused: boolean;
  invulnerableFrames: number; deathbombFrames: number; deathbombRemaining: number;
  respawnDuration: number; respawnRemaining: number; respawnInvulnerability: number;
  weapon: Weapon; options: Array<{ x: number; y: number }>; bombOptions: BombOptions; activeBomb: Bomb | null;
  character: string | null; bombFactory?: PlayerOptions['bombFactory'];
  readonly score: number; readonly vulnerable: boolean;
  update(world: World): void;
  receiveHit(game: Game): boolean;
  useBomb(game: Game): boolean;
  miss(game: Game): void;
  draw(draw: DrawList): void;
}

export type Drops = Partial<Record<ItemType, number>>;
export interface EnemyOptions extends EntityOptions {
  hp?: number; score?: number; drops?: Drops; color?: number; invulnerable?: boolean;
  bombResistance?: number; contactDamage?: boolean; offscreenMargin?: number;
  script?: (enemy: Enemy, world: World) => Generator;
  onDefeat?: (enemy: Enemy, world: World) => void;
}
export class Enemy extends Entity {
  constructor(options?: EnemyOptions);
  hp: number; maxHp: number; score: number; drops: Drops; color: number; invulnerable: boolean;
  bombResistance: number; contactDamage: boolean; offscreenMargin: number;
  script?: EnemyOptions['script'] | null; onDefeat?: EnemyOptions['onDefeat'];
  update(world: World): void;
  damage(amount: number, source?: string): number;
  onDestroy(reason: string, world: World): void;
  draw(draw: DrawList): void;
}
export interface BossPhase {
  name?: string; hp?: number; timeLimit?: number; spell?: boolean; survival?: boolean;
  bonus?: number; drops?: Drops; bombResistance?: number;
  position?: { x: number; y: number; frames?: number };
  script?: (boss: Boss, world: World, phase: BossPhase) => Generator;
  onUpdate?: (boss: Boss, world: World, frame: number) => void;
  onEnd?: (boss: Boss, world: World, result: PhaseResult) => void;
}
export interface BossOptions extends Omit<EnemyOptions, 'script'> {
  name?: string; phases: BossPhase[]; transitionFrames?: number; introFrames?: number; startPhaseIndex?: number;
}
export interface PhaseResult {
  name: string; index: number; spell: boolean; captured: boolean; bonus: number;
  reason: string; failure: string | null; frames: number;
}
export class Boss extends Enemy {
  constructor(options: BossOptions);
  name: string; phases: BossPhase[]; phaseIndex: number; phase: BossPhase | null; phaseFrame: number;
  transitionFrames: number; transitionRemaining: number; captureEligible: boolean;
  captureFailure: string | null; results: PhaseResult[]; isBoss: boolean; startPhaseIndex: number;
  readonly timeLeft: number;
  moveTo(x: number, y: number, frames?: number): void;
  beginPhase(index: number): void;
  invalidateCapture(reason: string): void;
  endPhase(reason: string): void;
}

export type ItemType = 'power' | 'point' | 'life' | 'bomb' | 'lifePiece' | 'bombPiece' | 'fullPower' | 'cancel';
export const ItemTypes: Readonly<Record<'POWER' | 'POINT' | 'LIFE' | 'BOMB' | 'LIFE_PIECE' | 'BOMB_PIECE' | 'FULL_POWER' | 'CANCEL', ItemType>>;
export interface ItemOptions extends EntityOptions { type?: ItemType | string; value?: number; attracted?: boolean; collectSpeed?: number }
export class Item extends Entity {
  constructor(options?: ItemOptions);
  type: ItemType | string; value: number; attracted: boolean; fullValue: boolean; collectSpeed: number;
  update(world: World): void;
  collect(game: Game): void;
  draw(draw: DrawList): void;
}
export function spawnDrops(world: World, x: number, y: number, drops?: Drops): Item[];
export interface EffectOptions extends EntityOptions {
  duration?: number; color?: number; size?: number; growth?: number; text?: string; style?: 'ring' | 'spark' | 'text';
}
export class Effect extends Entity {
  constructor(options?: EffectOptions);
  duration: number; color: number; size: number; growth: number; text: string; style: string;
  update(): void;
  draw(draw: DrawList): void;
}
export const Effects: {
  burst(world: World, x: number, y: number, color?: number, count?: number): void;
  text(world: World, x: number, y: number, text: string | number, color?: number): Effect;
};

export interface DialogueLine { text: string; speaker?: string; color?: number }
export interface DialogueOptions { minimumFrames?: number; onComplete?: () => void }
export class Dialogue {
  constructor(lines?: Array<string | DialogueLine>, options?: DialogueOptions);
  lines: DialogueLine[]; index: number; active: boolean; frames: number; minimumFrames: number;
  update(input: Input): void;
  draw(draw: DrawList, bounds: Bounds): void;
}
export interface StageOptions {
  id?: string; name?: string; script?: (stage: Stage, game: Game) => Generator;
  bossFactory?: (game: Game) => Boss; autoFinish?: boolean; finishDelay?: number; practicePhase?: number;
}
export class Stage {
  constructor(options?: StageOptions);
  id: string; name: string; script?: StageOptions['script']; bossFactory?: StageOptions['bossFactory'];
  tasks: TaskRunner; game: Game | null; frame: number; boss: Boss | null;
  dialogue: Dialogue | null; started: boolean; complete: boolean; scriptComplete: boolean;
  autoFinish: boolean; finishDelay: number; practicePhase?: number;
  start(game: Game): void;
  spawn<T extends Entity>(entity: T): T;
  spawnBoss(boss: Boss): Boss;
  wait(frames: number): Generator<number, void, unknown>;
  talk(lines: Array<string | DialogueLine>, options?: DialogueOptions): Generator<number, void, unknown>;
  update(game: Game): void;
  finish(): void;
}
export interface MenuEntry {
  label: string | (() => string); description?: string;
  enabled?: boolean | (() => boolean); value?: string | number | (() => string | number);
  action?: (context?: Game, entry?: MenuEntry) => void;
  adjust?: (direction: number, context?: Game) => void;
}
export interface MenuOptions {
  title?: string; subtitle?: string; entries?: MenuEntry[]; onCancel?: (context?: Game) => void;
  x?: number; y?: number; width?: number;
}
export class Menu {
  constructor(options?: MenuOptions);
  title: string; subtitle: string; entries: MenuEntry[]; index: number; x: number; y: number; width: number; active: boolean;
  onCancel?: MenuOptions['onCancel'];
  isEnabled(entry: MenuEntry): boolean;
  move(direction: number): void;
  update(input: Input, context?: Game): void;
  draw(draw: DrawList): void;
}

export interface Rules {
  respawnBombs: number; maxLives: number; maxBombs: number; lifePieceThreshold: number; bombPieceThreshold: number;
  scoreExtends: number[]; grazeScore: number; pointValue: number; allowContinue: boolean;
}
export const DEFAULT_RULES: Readonly<Rules>;
export interface GameStats {
  grazes: number; misses: number; bombsUsed: number; enemiesDefeated: number; pointItems: number;
  spellsCaptured: number; continues: number;
}
export interface GameResults extends GameStats { score: number; clearBonus: number; frames: number; practice: boolean }
export type GameState = 'title' | 'playing' | 'paused' | 'gameover' | 'results' | 'options' | 'practice' | 'replayComplete';
export interface GameOptions {
  seed?: number; bounds?: Bounds; title?: string; difficulty?: string; rules?: Partial<Rules>;
  player?: PlayerOptions; stageFactory?: (game: Game) => Stage; stages?: Array<(game: Game) => Stage>; practicePhases?: BossPhase[];
  menu?: { title?: string; subtitle?: string; entries?: MenuEntry[]; layout?: { x?: number; y?: number; width?: number } };
  store?: SaveStore; storage?: StorageAdapter; onQuit?: () => void; replayVersion?: string;
  renderBackground?: (draw: DrawList, game: Game) => void;
  renderHUD?: (draw: DrawList, game: Game) => void;
  renderOverlay?: (draw: DrawList, game: Game) => void;
}
export interface StartOptions {
  seed?: number; difficulty?: string; practice?: boolean; phaseIndex?: number; stageIndex?: number; stage?: Stage;
  player?: PlayerOptions; rules?: Partial<Rules>; bounds?: Bounds; weaponOptions?: WeaponOptions;
}
export interface GameSnapshot {
  version: number; state: GameState; seed: number; difficulty: string; frame: number;
  score: number; pointValue: number; extendIndex: number; stats: GameStats; rng: number;
  player: Record<string, number | string>;
  stage: { id: string; index: number; frame: number; complete: boolean; dialogue: number | null } | null;
  boss: { name: string; phase: number; hp: number; phaseFrame: number; transition: number; captureEligible: boolean } | null;
  entities: unknown[]; menu: { title: string; index: number } | null;
}
export class Game {
  constructor(options?: GameOptions);
  config: GameOptions; title: string; bounds: Bounds; seed: number; rules: Rules; store: SaveStore;
  settings: { difficulty: string; weapon: string; volume: number }; difficulty: string;
  highScore: number; input: Input; state: GameState; uiFrame: number;
  score: number; pointValue: number; stats: GameStats; extendIndex: number;
  world: World; player: Player; stage: Stage | null; stageIndex: number; menu: Menu | null;
  recorder: ReplayRecorder | null; playback: ReplayPlayer | null; lastReplay: ReplayData | null;
  practice: boolean; practicePhase: number; results: GameResults | null;
  readonly boss: Boss | null;
  on(event: string, handler: (data: any, game: Game) => void): () => void;
  emit(event: string, data?: any): void;
  start(options?: StartOptions): this;
  startPractice(phaseIndex?: number, stageIndex?: number): this;
  makeStage(index?: number): Stage;
  advanceStage(): boolean;
  showTitle(): void; showOptions(): void; showPractice(): void; pause(): void; resume(): void;
  update(mask?: number): void;
  collisions(): void; graze(entity: Entity): void;
  cancelBullets(x: number, y: number, radius: number, options?: { reward?: boolean; force?: boolean }): number;
  cancelBeam(beam: Bomb, options?: { reward?: boolean; force?: boolean }): number;
  addScore(amount: number): void;
  finishRecording(): void;
  exportReplay(): ReplayData | null;
  playReplay(data: ReplayData | string): this;
  gameOver(): void; continueGame(): boolean; completeStage(): void;
  render(): DrawCommand[];
  drawHUD(draw: DrawList): void; drawBossHUD(draw: DrawList): void;
  snapshot(): GameSnapshot;
}

export interface ReplayData {
  format: 'ts-stg-replay'; version: 1; config: Record<string, any>; frames: number;
  runs: Array<[number, number]>; checkpoints: Array<{ frame: number; hash: string }>;
}
export function stateHash(value: unknown): string;
export class ReplayRecorder {
  constructor(config?: Record<string, unknown>);
  config: Record<string, any>; runs: Array<[number, number]>; frames: number;
  checkpoints: Array<{ frame: number; hash: string }>;
  record(mask: number): void;
  checkpoint(snapshot: unknown): void;
  toJSON(): ReplayData;
  serialize(): string;
}
export class ReplayPlayer {
  constructor(source: ReplayData | string);
  data: ReplayData; config: Record<string, any>; frame: number;
  desync: { frame: number; expected: string; actual: string } | null;
  readonly finished: boolean;
  next(): number | null;
  verify(snapshot: unknown): boolean;
}
export interface StorageAdapter {
  readText?: (path: string) => string | undefined;
  writeText?: (path: string, text: string) => void;
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
}
export class SaveStore {
  constructor(adapter?: StorageAdapter | null, prefix?: string);
  get<T = unknown>(key: string, fallback?: T): T;
  set<T>(key: string, value: T): T;
}

export const Easing: Readonly<Record<'linear' | 'inQuad' | 'outQuad' | 'inOutCubic' | 'outSine', (t: number) => number>>;
export function tween<T extends object>(target: T, values: Partial<Record<keyof T, number>>, frames: number,
  easing?: (t: number) => number): Generator<number, void, unknown>;
export interface AnimationFrame { x: number; y: number; width: number; height: number; duration?: number }
export interface AnimationOptions {
  texture: number; frames: AnimationFrame[]; frameDuration?: number; loop?: boolean;
  onComplete?: (animation: SpriteAnimation) => void;
}
export class SpriteAnimation {
  constructor(options: AnimationOptions);
  static grid(texture: number, options: { width: number; height: number; columns: number; count: number;
    start?: number; frameDuration?: number; loop?: boolean; onComplete?: AnimationOptions['onComplete'] }): SpriteAnimation;
  texture: number; frames: AnimationFrame[]; loop: boolean; index: number; elapsed: number; finished: boolean;
  reset(): this;
  update(frames?: number): this;
  draw(draw: DrawList, x: number, y: number, options?: { scaleX?: number; scaleY?: number; rotation?: number; color?: number }): void;
  snapshot(): { index: number; elapsed: number; finished: boolean };
}
export class Camera3D {
  constructor(options?: { x?: number; y?: number; z?: number; focalLength?: number; centerX?: number; centerY?: number; near?: number });
  x: number; y: number; z: number; focalLength: number; centerX: number; centerY: number; near: number;
  project(x: number, y: number, z: number): { x: number; y: number; scale: number; depth: number } | null;
}
export interface ResourceHost {
  loadTexture?(path: string): number; loadSound?(path: string): number;
  loadMusic?(path: string): number; loadFont?(path: string): number;
  unloadTexture?(id: number): void; unloadSound?(id: number): void;
  unloadMusic?(id: number): void; unloadFont?(id: number): void;
  readText(path: string): string; writeText(path: string, text: string): void;
}
export class Resources {
  constructor(host: ResourceHost);
  load(kind: 'texture' | 'sound' | 'music' | 'font', path: string): number;
  texture(path: string): number; sound(path: string): number; music(path: string): number; font(path: string): number;
  release(kind: 'texture' | 'sound' | 'music' | 'font', path: string): boolean;
  dispose(): void;
  readJSON<T = unknown>(path: string, fallback?: T): T;
  writeJSON(path: string, data: unknown): void;
}

export * from './touhou/index.js';
