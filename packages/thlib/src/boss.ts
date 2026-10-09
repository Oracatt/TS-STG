import type { World } from './world.js';
import type { DrawList } from './render.js';
import type { BossPhase, BossOptions, PhaseResult } from './api-types.js';
import { Enemy } from './enemy.js';
import { Effects } from './effects.js';
import { spawnDrops } from './items.js';

/** A phase owns its script, timer, HP, capture eligibility and bullet cleanup. */
export class Boss extends Enemy {
  declare _move: { fromX: number; fromY: number; x: number; y: number; frames: number; frame: number } | null;

  declare name: string;
  declare phases: BossPhase[];
  declare phaseIndex: number;
  declare phase: BossPhase | null;
  declare phaseFrame: number;
  declare transitionFrames: number;
  declare transitionRemaining: number;
  declare captureEligible: boolean;
  declare captureFailure: string | null;
  declare results: PhaseResult[];
  declare isBoss: boolean;
  declare startPhaseIndex: number;


  constructor(options: BossOptions = {}) {
    super({ radius: 24, score: 10000, drops: {}, offscreenMargin: 10000, ...options });
    this.name = options.name ?? 'Unknown';
    this.phases = options.phases ?? [];
    if (!this.phases.length) throw new Error('Boss requires at least one phase');
    this.phaseIndex = -1; this.phase = null; this.phaseFrame = 0;
    this.transitionFrames = options.transitionFrames ?? 90;
    this.transitionRemaining = options.introFrames ?? 60;
    this.captureEligible = true;
    this.captureFailure = null;
    this.results = [];
    this.invulnerable = true;
    this.isBoss = true;
    this.script = null;
    this._move = null;
    this.startPhaseIndex = options.startPhaseIndex ?? 0;
  }
  get timeLeft() { return this.phase ? Math.max(0, (this.phase.timeLimit ?? 1800) - this.phaseFrame) : 0; }
  moveTo(x: number, y: number, frames: number = 60): void {
    this._move = { fromX: this.x, fromY: this.y, x, y, frames: Math.max(1, frames), frame: 0 };
  }
  update(world: World): void {
    if (this._move) {
      const move = this._move;
      const t = Math.min(1, ++move.frame / move.frames), ease = t * t * (3 - 2 * t);
      this.x = move.fromX + (move.x - move.fromX) * ease;
      this.y = move.fromY + (move.y - move.fromY) * ease;
      if (t >= 1) this._move = null;
    } else { this.x += this.vx; this.y += this.vy; }
    if (this.transitionRemaining > 0) {
      if (--this.transitionRemaining === 0) this.beginPhase(this.phaseIndex < 0 ? this.startPhaseIndex : this.phaseIndex + 1);
      return;
    }
    if (!this.phase) { this.beginPhase(this.startPhaseIndex); return; }
    this.phaseFrame++;
    this.phase.onUpdate?.(this, world, this.phaseFrame);
    if (this.timeLeft <= 0) this.endPhase('timeout');
  }
  beginPhase(index: number): void {
    if (index >= this.phases.length) { this.destroy('defeated'); return; }
    this.phaseIndex = index; this.phase = this.phases[index];
    this.hp = this.phase.hp ?? 500; this.maxHp = this.hp;
    this.phaseFrame = 0;
    this.captureEligible = !this.world!.game?.player.activeBomb?.alive;
    this.captureFailure = this.captureEligible ? null : 'bomb';
    this.invulnerable = !!this.phase.survival;
    this.bombResistance = this.phase.bombResistance ?? 1;
    this.vx = this.vy = 0;
    if (this.phase.position) this.moveTo(this.phase.position.x, this.phase.position.y, this.phase.position.frames ?? 60);
    if (this.phase.script) this.tasks.add(this.phase.script(this, this.world!, this.phase));
    this.world!.game?.emit('phaseStart', { boss: this, phase: this.phase, index });
  }
  invalidateCapture(reason: string): void { this.captureEligible = false; this.captureFailure = this.captureFailure ?? reason; }
  damage(amount: number, source: string = 'shot'): number {
    if (!this.alive || this.invulnerable || !this.phase || this.transitionRemaining > 0 || !Number.isFinite(amount) || amount <= 0) return 0;
    const dealt = Math.min(this.hp, amount * (source === 'bomb' ? this.bombResistance : 1));
    if (source === 'bomb' && dealt > 0) this.invalidateCapture('bomb');
    this.hp -= dealt;
    if (this.hp <= 0) this.endPhase('defeated');
    return dealt;
  }
  endPhase(reason: string): void {
    if (!this.phase || this.transitionRemaining > 0 || !this.alive) return;
    const game = this.world!.game, phase = this.phase;
    const captured = !!phase.spell && this.captureEligible &&
      ((phase.survival && reason === 'timeout') || (!phase.survival && reason === 'defeated'));
    const ratio = phase.survival ? 1 : Math.max(0.1, this.timeLeft / (phase.timeLimit ?? 1800));
    const bonus = captured ? Math.floor((phase.bonus ?? 100000) * ratio / 10) * 10 : 0;
    const result = { name: phase.name ?? '', index: this.phaseIndex, spell: !!phase.spell,
      captured, bonus, reason, failure: captured ? null : this.captureFailure ?? reason,
      frames: this.phaseFrame };
    this.results.push(result);
    this.tasks.clear();
    this.invulnerable = true;
    game?.cancelBullets(this.x, this.y, Infinity, { reward: true, force: true });
    if (game) {
      game.addScore(bonus);
      if (captured) game.stats.spellsCaptured++;
      game.emit('phaseEnd', { boss: this, phase, result });
    }
    if (phase.spell) Effects.text(this.world!, this.x - 75, this.y + 45,
      captured ? `SPELL BONUS ${bonus}` : 'SPELL FAILED', captured ? 0xffe1a5ff : 0xb5bfd4ff);
    spawnDrops(this.world!, this.x, this.y, phase.drops ?? { power: 2, point: 6 });
    Effects.burst(this.world!, this.x, this.y, phase.spell ? 0xffaddbff : 0x9fe8ffff, 20);
    phase.onEnd?.(this, this.world!, result);
    if (this.phaseIndex >= this.phases.length - 1) this.destroy('defeated');
    else this.transitionRemaining = Math.max(1, this.transitionFrames);
  }
  draw(draw: DrawList): void {
    const a = this.age * 0.025;
    draw.ring(this.x, this.y, 35, 36.5, 0xffb4eccc);
    for (let i = 0; i < 6; i++) {
      const r = a + i * Math.PI / 3;
      draw.line(this.x + Math.cos(r) * 29, this.y + Math.sin(r) * 29,
        this.x + Math.cos(r) * 44, this.y + Math.sin(r) * 44, 2, 0xc991f0ff);
    }
    draw.triangle(this.x, this.y - 25, this.x - 21, this.y + 24, this.x + 21, this.y + 24, 0xceb7edff);
    draw.circle(this.x, this.y - 4, 10, 0xfff0e2ff);
    draw.rect(this.x - 17, this.y + 9, 34, 5, 0xeb5d93ff);
  }
}
