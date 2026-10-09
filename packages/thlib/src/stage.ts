import type { Boss } from './boss.js';
import type { Game } from './game.js';
import type { Input } from './input.js';
import type { DrawList } from './render.js';
import type { Entity } from './world.js';
import type { Bounds } from './core-types.js';
import type { DialogueLine, DialogueOptions, StageOptions } from './api-types.js';
import { TaskRunner, wait } from './task.js';
import { Keys } from './input.js';

export class Dialogue {
  declare onComplete: DialogueOptions['onComplete'];

  declare lines: DialogueLine[];
  declare index: number;
  declare active: boolean;
  declare frames: number;
  declare minimumFrames: number;

  constructor(lines: Array<string | DialogueLine> = [], options: DialogueOptions = {}) {
    this.lines = lines.map(line => typeof line === 'string' ? { text: line } : line);
    this.index = 0; this.active = this.lines.length > 0;
    this.frames = 0; this.minimumFrames = options.minimumFrames ?? 10;
    this.onComplete = options.onComplete;
  }
  update(input: Input): void {
    if (!this.active) return;
    this.frames++;
    if (this.frames >= this.minimumFrames && (input.pressed(Keys.CONFIRM) || input.pressed(Keys.SHOOT) || input.down(Keys.FOCUS))) {
      this.index++; this.frames = 0;
      if (this.index >= this.lines.length) { this.active = false; this.onComplete?.(); }
    }
  }
  draw(draw: DrawList, bounds: Bounds): void {
    if (!this.active) return;
    const line = this.lines[this.index], y = bounds.y + bounds.height - 150;
    draw.rect(bounds.x + 15, y, bounds.width - 30, 132, 0x131729ee);
    draw.rect(bounds.x + 15, y, 3, 132, line.color ?? 0xf2b6dbff);
    draw.text(line.speaker ?? '', bounds.x + 32, y + 14, 20, line.color ?? 0xf2b6dbff);
    const words = line.text.split(' '); let text = '', lineY = y + 45;
    for (const word of words) {
      if ((text + word).length > 48) { draw.text(text, bounds.x + 32, lineY, 17, 0xe9ecf8ff); text = ''; lineY += 22; }
      text += `${word} `;
    }
    draw.text(text, bounds.x + 32, lineY, 17, 0xe9ecf8ff);
    draw.text('Z / ENTER  >', bounds.x + bounds.width - 155, y + 106, 12, 0x919fbaff);
  }
}

/** A stage is a generator-driven timeline. It is independent of the native host. */
export class Stage {
  declare _finishTimer: number;

  declare id: string;
  declare name: string;
  declare script?: StageOptions['script'];
  declare bossFactory?: StageOptions['bossFactory'];
  declare tasks: TaskRunner;
  declare game: Game | null;
  declare frame: number;
  declare boss: Boss | null;
  declare dialogue: Dialogue | null;
  declare started: boolean;
  declare complete: boolean;
  declare scriptComplete: boolean;
  declare autoFinish: boolean;
  declare finishDelay: number;
  declare practicePhase?: number;

  constructor(options: StageOptions = {}) {
    this.id = options.id ?? 'stage-1'; this.name = options.name ?? 'Stage 1';
    this.script = options.script;
    this.bossFactory = options.bossFactory;
    this.tasks = new TaskRunner();
    this.game = null; this.frame = 0; this.boss = null;
    this.dialogue = null; this.started = false;
    this.complete = false; this.scriptComplete = false;
    this.autoFinish = options.autoFinish ?? true;
    this.finishDelay = options.finishDelay ?? 120;
    this._finishTimer = 0;
    this.practicePhase = options.practicePhase;
  }
  start(game: Game): void {
    this.game = game; this.started = true;
    if (this.practicePhase !== undefined && this.bossFactory) {
      const boss = this.bossFactory(game);
      const index = Math.max(0, Math.min(boss.phases.length - 1, this.practicePhase));
      boss.phases = [boss.phases[index]];
      boss.startPhaseIndex = 0;
      this.spawnBoss(boss); this.scriptComplete = true;
    } else if (this.script) {
      const stage = this;
      this.tasks.add((function* () { yield* stage.script!(stage, game); stage.scriptComplete = true; })());
    } else {
      if (this.bossFactory) this.spawnBoss(this.bossFactory(game));
      this.scriptComplete = true;
    }
  }
  spawn<T extends Entity>(entity: T): T { if (!this.game) throw new Error('Stage has not started'); return this.game.world.spawn(entity); }
  spawnBoss(boss: Boss): Boss { this.boss = boss; this.spawn(boss); return boss; }
  *wait(frames: number): Generator<number, void, unknown> { yield* wait(frames); }
  *talk(lines: Array<string | DialogueLine>, options?: DialogueOptions): Generator<number, void, unknown> {
    this.dialogue = new Dialogue(lines, options);
    while (this.dialogue.active) yield 1;
  }
  update(game: Game): void {
    if (!this.started) this.start(game);
    if (this.complete) return;
    if (this.dialogue?.active) { this.dialogue.update(game.input); return; }
    this.tasks.update(game.world); this.frame++;
    if (this.autoFinish && this.scriptComplete && !this.boss?.alive &&
      !game.world.entities.concat(game.world.pending).some(entity => entity.alive && entity.group === 'enemy')) {
      if (++this._finishTimer >= this.finishDelay) this.finish();
    } else this._finishTimer = 0;
  }
  finish(): void { this.complete = true; this.tasks.clear(); this.game?.completeStage(); }
}
