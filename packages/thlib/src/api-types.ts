import type { SpriteAnimation } from './animation.js';
import type { Boss } from './boss.js';
import type { Enemy } from './enemy.js';
import type { Game } from './game.js';
import type { Weapon, Bomb, Player } from './player.js';
import type { DrawList } from './render.js';
import type { SaveStore } from './replay.js';
import type { Stage } from './stage.js';
import type { World } from './world.js';
import type { Bounds, EntityOptions } from './core-types.js';

export interface WeaponOptions {
  type?: 'spread' | 'homing' | 'laser' | 'piercing' | string;
  interval?: number; damage?: number; shotSpeed?: number;
  shotSprite?: string | null; optionSprite?: string | null; laserSprite?: string | null;
  emit?: (player: Player, world: World, weapon: Weapon) => void;
}

export interface PlayerShotOptions extends EntityOptions {
  angle?: number; speed?: number; damage?: number; homing?: boolean; turnRate?: number;
  piercing?: boolean; length?: number; duration?: number; color?: number;
  follow?: Player; offsetX?: number; sprite?: string | null;
}

export interface BombOptions extends EntityOptions {
  owner?: Player; duration?: number; damage?: number; maxRadius?: number; expansion?: number;
  onTick?: (bomb: Bomb, world: World) => void; color?: number;
  shape?: 'orb' | 'beam'; angle?: number; length?: number; width?: number; growFrames?: number;
  followOwner?: boolean; offsetX?: number; offsetY?: number;
}

export interface PlayerOptions extends EntityOptions {
  speed?: number; focusSpeed?: number; grazeRadius?: number; pickupRadius?: number;
  lives?: number; bombs?: number; power?: number; maxPower?: number;
  invulnerableFrames?: number; deathbombFrames?: number; respawnDuration?: number;
  respawnInvulnerability?: number; weapon?: WeaponOptions | Weapon; bomb?: BombOptions;
  character?: string | null;
  bombFactory?: (player: Player, game: Game, options: BombOptions) => Bomb;
}

export type Drops = Partial<Record<ItemType, number>>;

export interface EnemyOptions extends EntityOptions {
  hp?: number; score?: number; drops?: Drops; color?: number; invulnerable?: boolean;
  bombResistance?: number; contactDamage?: boolean; offscreenMargin?: number;
  script?: (enemy: Enemy, world: World) => Generator<import('./core-types.js').TaskYield, unknown, unknown>;
  onDefeat?: (enemy: Enemy, world: World) => void;
}

export interface BossPhase {
  name?: string; hp?: number; timeLimit?: number; spell?: boolean; survival?: boolean;
  bonus?: number; drops?: Drops; bombResistance?: number;
  position?: { x: number; y: number; frames?: number };
  script?: (boss: Boss, world: World, phase: BossPhase) => Generator<import('./core-types.js').TaskYield, unknown, unknown>;
  onUpdate?: (boss: Boss, world: World, frame: number) => void;
  onEnd?: (boss: Boss, world: World, result: PhaseResult) => void;
}

export interface BossOptions extends Omit<EnemyOptions, 'script'> {
  name?: string; phases?: BossPhase[]; transitionFrames?: number; introFrames?: number; startPhaseIndex?: number;
}

export interface PhaseResult {
  name: string; index: number; spell: boolean; captured: boolean; bonus: number;
  reason: string; failure: string | null; frames: number;
}

export type ItemType = 'power' | 'point' | 'life' | 'bomb' | 'lifePiece' | 'bombPiece' | 'fullPower' | 'cancel';

export interface ItemOptions extends EntityOptions { type?: ItemType | string; value?: number; attracted?: boolean; collectSpeed?: number }

export interface EffectOptions extends EntityOptions {
  duration?: number; color?: number; size?: number; growth?: number; text?: string; style?: 'ring' | 'spark' | 'text';
}

export interface DialogueLine { text: string; speaker?: string; color?: number }

export interface DialogueOptions { minimumFrames?: number; onComplete?: () => void }

export interface StageOptions {
  id?: string; name?: string; script?: (stage: Stage, game: Game) => Generator<import('./core-types.js').TaskYield, unknown, unknown>;
  bossFactory?: (game: Game) => Boss; autoFinish?: boolean; finishDelay?: number; practicePhase?: number;
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

export interface Rules {
  respawnBombs: number; maxLives: number; maxBombs: number; lifePieceThreshold: number; bombPieceThreshold: number;
  scoreExtends: number[]; grazeScore: number; pointValue: number; allowContinue: boolean;
}

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

export interface ReplayData {
  format: 'ts-stg-replay'; version: 1; config: Record<string, any>; frames: number;
  runs: Array<[number, number]>; checkpoints: Array<{ frame: number; hash: string }>;
}

export interface StorageAdapter {
  readText?: (path: string) => string | undefined;
  writeText?: (path: string, text: string) => void;
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
}

export interface AnimationFrame { x: number; y: number; width: number; height: number; duration?: number }

export interface AnimationOptions {
  texture?: number; frames?: AnimationFrame[]; frameDuration?: number; loop?: boolean;
  onComplete?: (animation: SpriteAnimation) => void;
}

export interface ResourceHost {
  loadTexture?(path: string): number; loadSound?(path: string): number;
  loadMusic?(path: string): number; loadFont?(path: string): number;
  unloadTexture?(id: number): void; unloadSound?(id: number): void;
  unloadMusic?(id: number): void; unloadFont?(id: number): void;
  readText(path: string): string; writeText(path: string, text: string): void;
}
