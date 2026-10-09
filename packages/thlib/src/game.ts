import type { CancellableEntity } from './core-types.js';
import type { Boss } from './boss.js';
import type { Bomb } from './player.js';
import type { Entity } from './world.js';
import type { Bounds, DrawCommand } from './core-types.js';
import type { Rules, GameStats, GameResults, GameState, GameOptions, StartOptions, GameSnapshot, ReplayData } from './api-types.js';
import { World } from './world.js';
import { DrawList } from './render.js';
import { Input, Keys } from './input.js';
import { Player, Weapon, cancelBombBeam } from './player.js';
import { Item } from './items.js';
import { Stage } from './stage.js';
import { Menu } from './menu.js';
import { Effects } from './effects.js';
import { ReplayRecorder, ReplayPlayer, SaveStore } from './replay.js';

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({ respawnBombs: 3, maxLives: 8, maxBombs: 8,
  lifePieceThreshold: 5, bombPieceThreshold: 5, scoreExtends: [100000, 300000, 700000, 1500000],
  grazeScore: 10, pointValue: 1000, allowContinue: true });

export class Game {
  declare listeners: Map<string, Array<(data: unknown, game: Game) => void>>;
  declare replayCompleted?: {frames: number; desync: ReplayPlayer['desync']};

  declare config: GameOptions;
  declare title: string;
  declare bounds: Bounds;
  declare seed: number;
  declare rules: Rules;
  declare store: SaveStore;
  declare settings: { difficulty: string; weapon: string; volume: number };
  declare difficulty: string;
  declare highScore: number;
  declare input: Input;
  declare state: GameState;
  declare uiFrame: number;
  declare score: number;
  declare pointValue: number;
  declare stats: GameStats;
  declare extendIndex: number;
  declare world: World;
  declare player: Player;
  declare stage: Stage | null;
  declare stageIndex: number;
  declare menu: Menu | null;
  declare recorder: ReplayRecorder | null;
  declare playback: ReplayPlayer | null;
  declare lastReplay: ReplayData | null;
  declare practice: boolean;
  declare practicePhase: number;
  declare results: GameResults | null;


  constructor(options: GameOptions = {}) {
    this.config = options;
    this.title = options.title ?? 'TS-STG';
    this.bounds = options.bounds ?? { x: 32, y: 24, width: 576, height: 672 };
    this.seed = options.seed ?? 2020;
    this.rules = { ...DEFAULT_RULES, ...options.rules };
    if (this.rules.lifePieceThreshold <= 0 || this.rules.bombPieceThreshold <= 0)
      throw new RangeError('Item piece thresholds must be positive');
    this.store = options.store instanceof SaveStore ? options.store : new SaveStore(options.storage ?? null);
    this.settings = { difficulty: options.difficulty ?? 'normal', weapon: options.player?.weapon?.type ?? 'spread',
      volume: 0.7, ...this.store.get('settings', {}) };
    this.difficulty = this.settings.difficulty;
    this.highScore = this.store.get('highscore', 0);
    this.listeners = new Map();
    this.input = new Input();
    this.state = 'title'; this.uiFrame = 0;
    this.score = 0; this.pointValue = this.rules.pointValue;
    this.stats = this.freshStats(); this.extendIndex = 0;
    this.world = new World({ bounds: this.bounds, seed: this.seed }); this.world.game = this;
    this.player = this.createPlayer();
    this.world.spawn(this.player); this.world.flush();
    this.stage = null; this.stageIndex = 0; this.menu = null;
    this.recorder = null; this.playback = null; this.lastReplay = null;
    this.practice = false; this.results = null;
    this.showTitle();
  }
  freshStats() { return { grazes: 0, misses: 0, bombsUsed: 0, enemiesDefeated: 0, pointItems: 0, spellsCaptured: 0, continues: 0 }; }
  createPlayer(overrides = {}) {
    const options = this.config.player ?? {};
    return new Player({ x: this.bounds.x + this.bounds.width / 2, y: this.bounds.y + this.bounds.height - 72,
      ...options, weapon: options.weapon instanceof Weapon ? options.weapon : { ...(options.weapon ?? {}), type: this.settings.weapon }, ...overrides });
  }
  get boss() { return this.stage?.boss?.alive ? this.stage.boss : null; }
  on(event: string, handler: (data: any, game: Game) => void): () => void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(handler); this.listeners.set(event, listeners);
    return () => { const index = listeners.indexOf(handler); if (index >= 0) listeners.splice(index, 1); };
  }
  emit(event: string, data: any = {}): void { for (const handler of this.listeners.get(event) ?? []) handler(data, this); }
  start(options: StartOptions = {}): this {
    this.seed = options.seed ?? this.seed;
    if (options.bounds) this.bounds = { ...options.bounds };
    this.rules = { ...DEFAULT_RULES, ...this.config.rules, ...options.rules };
    if (this.rules.lifePieceThreshold <= 0 || this.rules.bombPieceThreshold <= 0)
      throw new RangeError('Item piece thresholds must be positive');
    this.difficulty = options.difficulty ?? this.settings.difficulty;
    this.practice = options.practice ?? false;
    this.practicePhase = options.phaseIndex ?? 0;
    this.stageIndex = options.stageIndex ?? 0;
    this.world = new World({ bounds: this.bounds, seed: this.seed }); this.world.game = this;
    this.player = this.createPlayer(options.player ?? {});
    this.player.weapon.cooldown = 0;
    if (options.weaponOptions) Object.assign(this.player.weapon, options.weaponOptions);
    this.world.spawn(this.player); this.world.flush();
    this.score = 0; this.pointValue = this.rules.pointValue; this.extendIndex = 0;
    this.stats = this.freshStats(); this.results = null;
    this.input.reset(); this.state = 'playing'; this.menu = null;
    this.stage = options.stage ?? this.makeStage(this.stageIndex);
    if (this.practice) this.stage.practicePhase = this.practicePhase;
    this.stage.start(this);
    this.playback = null;
    this.recorder = new ReplayRecorder({ seed: this.seed, difficulty: this.difficulty,
      stageId: this.stage.id, stageIndex: this.stageIndex, practice: this.practice, phaseIndex: this.practicePhase,
      weapon: this.settings.weapon, rules: this.rules, bounds: this.bounds,
      player: { x: this.player.x, y: this.player.y, lives: this.player.lives, bombs: this.player.bombs, power: this.player.power,
        maxPower: this.player.maxPower, speed: this.player.speed, focusSpeed: this.player.focusSpeed,
        radius: this.player.radius, grazeRadius: this.player.grazeRadius, pickupRadius: this.player.pickupRadius,
        invulnerableFrames: this.player.invulnerableFrames, deathbombFrames: this.player.deathbombFrames,
        respawnDuration: this.player.respawnDuration, respawnInvulnerability: this.player.respawnInvulnerability },
      weaponOptions: { type: this.player.weapon.type, interval: this.player.weapon.interval,
        damage: this.player.weapon.damage, shotSpeed: this.player.weapon.shotSpeed },
      libraryVersion: '0.1.0', gameVersion: this.config.replayVersion ?? '1' });
    this.emit('start', { stage: this.stage, practice: this.practice });
    this.emit('stageStart', { stage: this.stage, stageIndex: this.stageIndex });
    return this;
  }
  makeStage(index: number = 0): Stage {
    if (this.config.stages) {
      if (!Number.isInteger(index) || index < 0 || index >= this.config.stages.length)
        throw new RangeError(`Stage index is unavailable: ${index}`);
      return this.config.stages[index](this);
    }
    return this.config.stageFactory?.(this) ?? new Stage({ autoFinish: false });
  }
  startPractice(phaseIndex: number = 0, stageIndex: number = 0): this { return this.start({ practice: true, phaseIndex, stageIndex }); }
  showTitle(): void {
    this.state = 'title'; this.playback = null;
    this.menu = new Menu({ title: this.config.menu?.title ?? this.title,
      subtitle: this.config.menu?.subtitle ?? 'A SCRIPTABLE BULLET HELL ENGINE',
      entries: this.config.menu?.entries ?? [
        { label: 'Start Game', description: 'Begin a new journey', action: () => this.start() },
        { label: 'Spell Practice', description: 'Choose a spell to practice', action: () => this.showPractice() },
        { label: 'Replay', description: 'Play the last recorded run', enabled: () => !!this.lastReplay || !!this.store.get('replay'),
          action: () => this.playReplay(this.lastReplay ?? this.store.get('replay')) },
        { label: 'Options', description: 'Difficulty, weapon and sound', action: () => this.showOptions() },
        { label: 'Quit', action: () => { this.emit('quit'); this.config.onQuit?.(); } },
      ], ...(this.config.menu?.layout ?? {}) });
    this.emit('title');
  }
  showOptions(): void {
    this.state = 'options';
    const cycle = (key: 'difficulty' | 'weapon', values: string[], direction: number) => {
      this.settings[key] = values[(values.indexOf(this.settings[key]) + direction + values.length) % values.length];
      this.store.set('settings', this.settings); this.emit('settings', { settings: this.settings });
    };
    this.menu = new Menu({ title: 'Options', subtitle: 'LEFT / RIGHT TO ADJUST', onCancel: () => this.showTitle(), entries: [
      { label: 'Difficulty', value: () => this.settings.difficulty, adjust: d => cycle('difficulty', ['easy', 'normal', 'hard', 'lunatic'], d),
        action: () => cycle('difficulty', ['easy', 'normal', 'hard', 'lunatic'], 1) },
      { label: 'Weapon', value: () => this.settings.weapon, adjust: d => cycle('weapon', ['spread', 'homing', 'laser', 'piercing'], d),
        action: () => cycle('weapon', ['spread', 'homing', 'laser', 'piercing'], 1) },
      { label: 'Volume', value: () => `${Math.round(this.settings.volume * 100)}%`, adjust: d => {
        this.settings.volume = Math.round(Math.max(0, Math.min(1, this.settings.volume + d * 0.1)) * 10) / 10;
        this.store.set('settings', this.settings); this.emit('settings', { settings: this.settings });
      } },
      { label: 'Back', action: () => this.showTitle() },
    ] });
  }
  showPractice(): void {
    this.state = 'practice';
    const entries = [];
    const count = this.config.stages?.length ?? 1;
    for (let stageIndex = 0; stageIndex < count; stageIndex++) {
      const stage = this.makeStage(stageIndex), boss = stage?.bossFactory?.(this);
      const phases = stageIndex === 0 && this.config.practicePhases ? this.config.practicePhases : boss?.phases ?? [];
      for (let index = 0; index < phases.length; index++) entries.push({
        label: `${count > 1 ? `${stageIndex + 1}. ` : ''}${phases[index].name ?? `Phase ${index + 1}`}`,
        action: () => this.startPractice(index, stageIndex),
      });
    }
    this.menu = new Menu({ title: 'Spell Practice', subtitle: 'ISOLATED PHASE / NO CONTINUES', onCancel: () => this.showTitle(),
      entries: [...entries, { label: 'Back', action: () => this.showTitle() }] });
  }
  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.menu = new Menu({ title: 'Paused', subtitle: 'THE WORLD IS STILL', entries: [
      { label: 'Resume', action: () => this.resume() },
      { label: 'Restart', action: () => this.start({ practice: this.practice, phaseIndex: this.practicePhase, stageIndex: this.practice ? this.stageIndex : 0 }) },
      { label: 'Return to Title', action: () => { this.finishRecording(); this.showTitle(); } },
    ], onCancel: () => this.resume() });
    this.emit('pause');
  }
  resume(): void { this.state = 'playing'; this.menu = null; this.emit('resume'); }
  update(mask: number = 0): void {
    this.uiFrame++;
    if (this.playback) {
      const recorded = this.playback.next();
      if (recorded === null) {
        const replay = this.playback.data;
        this.replayCompleted = { frames: this.playback.frame, desync: this.playback.desync };
        this.playback = null; this.state = 'replayComplete';
        this.menu = new Menu({ title: 'Replay Complete', subtitle: `${replay.frames} RECORDED FRAMES`, entries: [
          { label: 'Watch Again', action: () => this.playReplay(replay) },
          { label: 'Return to Title', action: () => this.showTitle() },
        ], onCancel: () => this.showTitle() });
        this.input.reset(); return;
      }
      mask = recorded;
    }
    this.input.update(mask);
    const recording = this.recorder && !this.playback && (this.state === 'playing' || this.state === 'paused');
    if (recording) this.recorder!.record(mask);
    if (this.state === 'playing' && this.input.pressed(Keys.PAUSE)) this.pause();
    else if (this.state === 'paused') {
      if (this.input.pressed(Keys.PAUSE)) this.resume();
      else this.menu?.update(this.input, this);
    } else if (this.state === 'playing') {
      this.stage?.update(this);
      if (this.state === 'playing' && !this.stage?.dialogue?.active) {
        this.world.update();
        if (this.state === 'playing') this.collisions();
      }
    } else this.menu?.update(this.input, this);
    if (recording && this.recorder && this.recorder.frames % 300 === 0) this.recorder.checkpoint(this.snapshot());
    this.playback?.verify(this.snapshot());
  }
  collisions(): void {
    const player = this.player, world = this.world;
    const enemies = world.query('enemy');
    for (const shot of world.query('playerShot')) {
      for (const enemy of enemies) {
        if (!shot.alive || !enemy.alive || enemy.invulnerable || shot.hitTargets.has(enemy.id)) continue;
        if (!shot.collidesCircle(enemy.x, enemy.y, enemy.radius)) continue;
        shot.hitTargets.add(enemy.id);
        enemy.damage?.(shot.damage, 'shot');
        if (!shot.piercing) shot.destroy('hit');
      }
    }
    if (player.state !== 'normal') return;
    for (const item of world.queryCircle(player.x, player.y, player.pickupRadius, 'item')) item.collect(this);
    if (!player.vulnerable) return;
    const candidates = world.queryCircle(player.x, player.y, player.grazeRadius, 'enemyBullet');
    for (const bullet of candidates) {
      if (bullet.collidesCircle(player.x, player.y, player.radius)) {
        player.receiveHit(this); bullet.destroy('playerHit'); break;
      }
      if (bullet.graze(player)) this.graze(bullet);
    }
    if (player.state !== 'normal') return;
    for (const laser of world.query('enemyLaser')) {
      if (!laser.isActive) continue;
      if (laser.collidesCircle(player.x, player.y, player.radius)) { player.receiveHit(this); break; }
      if (laser.collidesCircle(player.x, player.y, player.grazeRadius) && laser.canGraze(player)) this.graze(laser);
    }
    if (player.state !== 'normal') return;
    for (const enemy of world.queryCircle(player.x, player.y, player.radius, 'enemy')) {
      if (enemy.contactDamage !== false) { player.receiveHit(this); break; }
    }
  }
  graze(entity: Entity): void {
    this.player.graze++; this.stats.grazes++; this.addScore(this.rules.grazeScore);
    this.pointValue += 1;
    if (this.player.graze % 5 === 0) Effects.burst(this.world, this.player.x, this.player.y, 0xd4efffff, 2);
    this.emit('graze', { entity });
  }
  cancelBullets(x: number, y: number, radius: number, { reward = true, force = false }: { reward?: boolean; force?: boolean } = {}): number {
    let count = 0;
    for (const entity of this.world.entities.concat(this.world.pending) as CancellableEntity[]) {
      if (!entity.alive || (entity.group !== 'enemyBullet' && entity.group !== 'enemyLaser') || (!force && !entity.cancelable)) continue;
      const intersects = radius === Infinity || (entity.intersectsCircle ? entity.intersectsCircle(x, y, radius) :
        Math.hypot(entity.x - x, entity.y - y) <= radius + entity.radius);
      if (!intersects) continue;
      const alreadyCancelled = entity.cancelAge !== undefined && entity.cancelAge !== null;
      if (!(force ? entity.destroy('phaseClear') : entity.cancel('cancel'))) continue;
      count++;
      if (reward && !alreadyCancelled) this.world.spawn(new Item({ x: entity.x, y: entity.y, type: 'cancel', attracted: true }));
    }
    return count;
  }
  cancelBeam(beam: Bomb, options?: { reward?: boolean; force?: boolean }): number { return cancelBombBeam(this.world, beam, options); }
  addScore(amount: number): void {
    this.score += Math.max(0, Math.floor(amount));
    while (this.extendIndex < this.rules.scoreExtends.length && this.score >= this.rules.scoreExtends[this.extendIndex]) {
      this.extendIndex++;
      this.player.lives = Math.min(this.rules.maxLives, this.player.lives + 1);
      Effects.text(this.world, this.player.x - 26, this.player.y - 45, 'EXTEND', 0xffbce4ff);
      this.emit('extend', { lives: this.player.lives });
    }
  }
  finishRecording(): void {
    if (this.recorder && this.recorder.frames > 0 && !this.playback) {
      this.lastReplay = this.recorder.toJSON();
      this.store.set('replay', this.lastReplay);
    }
    if (!this.practice && !this.playback && this.stats.continues === 0 && this.score > this.highScore) {
      this.highScore = this.score; this.store.set('highscore', this.highScore);
    }
  }
  exportReplay(): ReplayData | null { return this.recorder?.toJSON() ?? this.lastReplay; }
  playReplay(data: ReplayData | string): this {
    const playback = new ReplayPlayer(data);
    if (playback.config.libraryVersion && playback.config.libraryVersion !== '0.1.0') throw new Error('Replay library version mismatch');
    if (playback.config.gameVersion && playback.config.gameVersion !== (this.config.replayVersion ?? '1'))
      throw new Error('Replay game version mismatch');
    this.settings.weapon = playback.config.weapon ?? this.settings.weapon;
    this.start(playback.config);
    if (this.stage!.id !== playback.config.stageId) throw new Error(`Replay stage is unavailable: ${playback.config.stageId}`);
    this.playback = playback; this.recorder = null;
    this.emit('replay', { playback }); return this;
  }
  gameOver(): void {
    this.state = 'gameover'; this.finishRecording();
    this.menu = new Menu({ title: 'Game Over', subtitle: `SCORE ${this.score}`, entries: [
      { label: 'Continue', enabled: () => this.rules.allowContinue && !this.practice && !this.playback,
        action: () => this.continueGame() },
      { label: 'Retry', action: () => this.start({ practice: this.practice, phaseIndex: this.practicePhase, stageIndex: this.practice ? this.stageIndex : 0 }) },
      { label: 'Return to Title', action: () => this.showTitle() },
    ] });
    this.emit('gameover');
  }
  continueGame(): boolean {
    if (this.state !== 'gameover' || !this.rules.allowContinue || this.practice || this.playback) return false;
    this.stats.continues++;
    this.score = 0; this.extendIndex = 0;
    this.player.lives = this.config.player?.lives ?? 2; this.player.bombs = this.rules.respawnBombs;
    this.player.power = this.player.maxPower; this.player.state = 'respawning';
    this.player.respawnRemaining = 60;
    this.cancelBullets(this.player.x, this.player.y, Infinity, { reward: false, force: true });
    this.state = 'playing'; this.menu = null;
    // A continued run cannot be reproduced from the original start without recording menu frames.
    this.recorder = null; this.emit('continue'); return true;
  }
  completeStage(): void {
    if (this.state !== 'playing') return;
    const clearBonus = this.practice ? 0 : 10000 + Math.max(0, this.player.lives) * 10000 + this.player.bombs * 1000;
    this.addScore(clearBonus);
    const final = this.practice || !this.config.stages || this.stageIndex + 1 >= this.config.stages.length;
    this.emit('stageClear', { stage: this.stage, stageIndex: this.stageIndex, clearBonus, final });
    if (!final && this.advanceStage()) return;
    this.state = 'results';
    this.results = { score: this.score, clearBonus, ...this.stats, frames: this.world.frame, practice: this.practice };
    this.finishRecording();
    this.menu = new Menu({ title: this.practice ? 'Practice Complete' : 'Stage Clear', subtitle: `SCORE ${this.score}`, entries: [
      { label: 'Play Again', action: () => this.start({ practice: this.practice, phaseIndex: this.practicePhase, stageIndex: this.practice ? this.stageIndex : 0 }) },
      { label: 'Return to Title', action: () => this.showTitle() },
    ] });
    this.emit('clear', { results: this.results });
  }
  advanceStage(): boolean {
    if (this.practice || !this.config.stages || this.stageIndex + 1 >= this.config.stages.length) return false;
    this.stage?.tasks.clear();
    this.world.tasks.clear();
    this.world.clear(entity => entity !== this.player, 'stageChange');
    this.player.tasks.clear();
    this.player.activeBomb = null;
    this.player.state = 'normal';
    this.player.deathbombRemaining = 0; this.player.respawnRemaining = 0;
    this.player.invulnerableFrames = Math.max(120, this.player.invulnerableFrames);
    this.player.x = this.bounds.x + this.bounds.width / 2;
    this.player.y = this.bounds.y + this.bounds.height - 72;
    this.stageIndex++;
    this.stage = this.makeStage(this.stageIndex);
    this.stage.start(this);
    this.emit('stageStart', { stage: this.stage, stageIndex: this.stageIndex });
    return true;
  }
  render(): DrawCommand[] {
    const draw = new DrawList(), b = this.bounds;
    draw.clear(0x090f1fff);
    if (this.config.renderBackground) this.config.renderBackground(draw, this);
    else {
      draw.rect(b.x, b.y, b.width, b.height, 0x101b30ff);
      for (let i = 0; i < 18; i++) {
        const y = b.y + (i * 42 + this.world.frame * 0.5) % b.height;
        draw.line(b.x, y, b.x + b.width, y, 1, 0x38517433);
      }
    }
    draw.scissor(b.x, b.y, b.width, b.height);
    if (['playing', 'paused', 'gameover', 'results'].includes(this.state)) this.world.draw(draw);
    this.stage?.dialogue?.draw(draw, b);
    draw.scissorEnd();
    if (this.config.renderHUD) this.config.renderHUD(draw, this);
    else this.drawHUD(draw);
    if (this.boss && ['playing', 'paused'].includes(this.state)) this.drawBossHUD(draw);
    this.menu?.draw(draw);
    this.config.renderOverlay?.(draw, this);
    return draw.commands;
  }
  drawHUD(draw: DrawList): void {
    const x = this.bounds.x + this.bounds.width + 35;
    draw.text(this.title, x, 42, 32, 0xe7d9f5ff);
    draw.text('TOUHOU-STYLE SCRIPTING TOOLKIT', x, 83, 11, 0x738dabff);
    if (!['playing', 'paused', 'gameover', 'results'].includes(this.state)) return;
    draw.text(this.difficulty.toUpperCase(), x, 125, 17, 0xe5afceff);
    const fields = [['HI SCORE', Math.max(this.highScore, this.score)], ['SCORE', this.score],
      ['LIVES', Math.max(0, this.player.lives)], ['BOMBS', this.player.bombs],
      ['POWER', this.player.power.toFixed(2)], ['GRAZE', this.player.graze]];
    fields.forEach(([label, value], index) => {
      draw.text(label, x, 173 + index * 64, 12, 0x859db9ff);
      draw.text(String(value), x, 192 + index * 64, 23, 0xeaf2ffff);
    });
    draw.text('ARROWS  Move     SHIFT  Focus', x, 627, 12, 0x8297b2ff);
    draw.text('Z  Shoot    X  Bomb    ESC  Pause', x, 649, 12, 0x8297b2ff);
    draw.text(this.playback ? 'REPLAY' : this.practice ? 'PRACTICE' : '60 FPS / FIXED SIMULATION', x, 682, 11, 0xb38dc2ff);
  }
  drawBossHUD(draw: DrawList): void {
    const boss = this.boss, b = this.bounds;
    if (!boss) return;
    draw.text(boss.name, b.x + 12, b.y + 11, 14, 0xffdceaff);
    const ratio = Math.max(0, Math.min(1, boss.hp / (boss.maxHp || 1)));
    draw.rect(b.x + 12, b.y + 33, b.width - 24, 5, 0x3f3555ee);
    draw.rect(b.x + 12, b.y + 33, (b.width - 24) * ratio, 5, boss.phase?.spell ? 0xf79dd5ff : 0xc5e8ffff);
    if (boss.phase) {
      draw.text(boss.phase.name ?? '', b.x + 12, b.y + 48, 16, 0xe8d5efff);
      draw.text(String(Math.ceil(boss.timeLeft / 60)).padStart(2, '0'), b.x + b.width - 49, b.y + 5, 25, 0xffe8bdff);
    }
  }
  snapshot(): GameSnapshot {
    const world = this.world.snapshot(), p = this.player;
    return { version: 1, state: this.state, seed: this.seed, difficulty: this.difficulty,
      frame: world.frame, score: this.score, pointValue: this.pointValue, extendIndex: this.extendIndex,
      stats: { ...this.stats }, rng: world.rng,
      player: { x: p.x, y: p.y, state: p.state, lives: p.lives, bombs: p.bombs, power: p.power,
        graze: p.graze, lifePieces: p.lifePieces, bombPieces: p.bombPieces,
        invulnerableFrames: p.invulnerableFrames, deathbombRemaining: p.deathbombRemaining,
        respawnRemaining: p.respawnRemaining, shotCooldown: p.weapon.cooldown },
      stage: this.stage ? { id: this.stage.id, index: this.stageIndex, frame: this.stage.frame, complete: this.stage.complete,
        dialogue: this.stage.dialogue?.active ? this.stage.dialogue.index : null } : null,
      boss: this.boss ? { name: this.boss.name, phase: this.boss.phaseIndex, hp: this.boss.hp,
        phaseFrame: this.boss.phaseFrame, transition: this.boss.transitionRemaining, captureEligible: this.boss.captureEligible } : null,
      entities: world.entities, menu: this.menu ? { title: this.menu.title, index: this.menu.index } : null };
  }
}
