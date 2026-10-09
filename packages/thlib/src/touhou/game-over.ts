import type {TouhouMusicInterruption} from './music.js';
import type {AnmDrawList as DrawList} from './anm.js';
import type {AnmBank,AnmInstance} from './anm.js';
import type {TouhouPlayer} from './player.js';
import type {TouhouBitmapFont} from './font.js';
import type {TouhouMusic} from './music.js';
import type {TouhouMenuChoice} from './menu-choices.js';

export interface TouhouContinueSession{difficulty?:number;stage?:number;stageKind?:'normal'|'extra';mode?:number;continues?:number;credits?:number;highScore?:number;}

export interface TouhouScoreRecord{score:number;name:string;continues?:number;stage?:number;stageKind?:'normal'|'extra';cleared?:boolean;timestamp?:number;slowdown?:number;}

export type TouhouContinuePolicy=(player:TouhouPlayer,session:TouhouContinueSession,context:Pick<TouhouGameOverOptions,'onStock'>)=>unknown;

export interface TouhouGameOverPage{done?:boolean;update?(mask:number):void;draw?(draw:DrawList):void;}

export interface TouhouGameOverOptions{bank:AnmBank;font?:TouhouBitmapFont|null;player:TouhouPlayer;session?:TouhouContinueSession;sound?:(id:number)=>void;
  /** Track key for an unfinished, non-spell-practice run; defaults to 'game-over'. */
  music?:string|null;
  /** Shared transport owns save/switch/restore. Track files are supplied by the consumer. */
  musicPlayer?:Pick<TouhouMusic,'interrupt'>|null;
  /** Original stock replenishment by default. Replacement runs before onContinue; no additional reset is applied. Null disables Continue. */
  continuePolicy?:TouhouContinuePolicy|null;
  /** Defaults to normal mode, unfinished run, positive credits and stageKind !== extra. */
  canContinue?:boolean|((player:TouhouPlayer,session:TouhouContinueSession,menu:TouhouGameOver)=>boolean)|null;
  formatStage?:(record:TouhouScoreRecord)=>string;
  onContinue?:(data:{player:TouhouPlayer;session:TouhouContinueSession})=>void;onExit?:()=>void;onRestart?:()=>void;onScene?:(scene:number,guarded:boolean)=>void;
  onOpen?:(data:{music:string|null;pauseMusic:boolean;savedInput:number;clockScale:number})=>void;
  onStock?:(data:{lives:number;lifeFragments:number;bombs:number;bombFragments:number;power:number})=>void;
  onReplay?:(context:{gameOver:TouhouGameOver;close:()=>void})=>TouhouGameOverPage|void;
  onOptions?:TouhouGameOverOptions['onReplay'];onManual?:TouhouGameOverOptions['onReplay'];
  /** Omit these rows and close their gaps; default [] preserves the original menu. */
  hiddenChoices?:readonly TouhouMenuChoice[];
  onSaveRanking?:(data:{records:TouhouScoreRecord[];rank:number;name:string})=>void;
  drawBackground?:(draw:DrawList,gameOver:TouhouGameOver)=>void;rankings?:TouhouScoreRecord[]|null;savedName?:string;timestamp?:number;actualFrames?:number;targetFrames?:number;
  completed?:boolean;restart?:boolean;initialMask?:number;
}

import { Keys } from '../index.js';
import { TouhouButtons } from './menu.js';
import { TouhouRenderQueue } from './render-queue.js';
import { f32, sub, mul } from './math.js';
import { hiddenTouhouMenuChoices, drawTouhouMenuPanel } from './menu-choices.js';

export const TOUHOU_INITIAL_CREDITS: readonly number[] = Object.freeze([5, 5, 5, 5, 0, 0]);
export const TOUHOU_NAME_CHARACTERS: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-=.,!?@:;[]()_/{}|~^#$%&*   ';
const childScripts = [[], [0x78, 0x7e, 0x84, 0x87, 0x89], [0x79, 0x7f, 0x8a], [0x7a, 0x80], [0x7b, 0x81], [0x7c]];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value | 0));
const stageLabel=(entry:TouhouScoreRecord)=>entry.stageKind==='extra'?(entry.cleared?'ExClear':'Extra  '):entry.cleared?'Clear  ':`Stage ${entry.stage??'-'}`;

/** pause_system/resume.cpp: player entity state/timer intentionally survive. */
export function continueTouhouGame(player: TouhouPlayer, session: TouhouContinueSession, context: Pick<TouhouGameOverOptions,'onContinue'|'onStock'> = {} as Pick<TouhouGameOverOptions,'onContinue'|'onStock'>): number {
  // Source replenishment is a policy, not a rewrite of the character's caps.
  // Custom profiles keep their rules across Continue; callers can replace this
  // whole policy when their replenishment differs from the original 2/3/4.
  player.lives = Math.min(2, player.maxLives ?? player.rules?.maxLives ?? 7); player.lifeFragments = 0;
  player.bombs = Math.min(3, player.maxBombs ?? player.rules?.maxBombs ?? 7); player.bombFragments = 0;
  player.power = Math.min(player.maxPower ?? player.rules?.maxPower ?? 400, (player.startingPower ?? player.rules?.startingPower ?? 100) * 4);
  player.refreshPower?.();
  session.continues = clamp(((session.continues ?? 0) + 1) | 0, 0, 9);
  session.credits = ((session.credits ?? 0) - 1) | 0; player.score = 0;
  context.onStock?.({ lives: player.lives, lifeFragments: 0, bombs: player.bombs, bombFragments: 0, power: player.power });
  context.onContinue?.({ player, session }); return session.continues;
}

/** Ten original records, ties insert before the existing equal score. */
export function insertTouhouHighScore(records: TouhouScoreRecord[], player: TouhouPlayer, session: TouhouContinueSession, { timestamp = 0, actualFrames = 0, targetFrames = 1,completed=false }: {timestamp?:number;actualFrames?:number;targetFrames?:number;completed?:boolean} = {}): number {
  if (!Array.isArray(records) || records.length !== 10) throw new RangeError('Original ranking requires ten records');
  const score = player.score ?? 0; let index = 0;
  while (index < 10 && records[index].score > score) index++;
  if (index >= 10) return -1;
  records.splice(index, 0, { score, continues: clamp(session.continues ?? 0, 0, 9), stage: session.stage ?? 1,
    name: '        ', timestamp, slowdown: sub(100, mul(f32(actualFrames / targetFrames), 100)),
    ...(session.stageKind?{stageKind:session.stageKind}:{}),...(completed?{cleared:true}:{}) });
  records.length = 10; return index;
}

/** Common failure/result UI from pause_system. Save/profile, audio and scene changes are explicit adapters. */
export class TouhouGameOver {
  declare hiddenChoices: Set<number>;
  declare bank: AnmBank;
  declare font: TouhouBitmapFont | null;
  declare sound: (((id: number) => void) | undefined);
  declare onContinue: (((data: { player: TouhouPlayer; session: TouhouContinueSession; }) => void) | undefined);
  declare onExit: ((() => void) | undefined);
  declare onRestart: ((() => void) | undefined);
  declare onScene: (((scene: number, guarded: boolean) => void) | undefined);
  declare onReplay: (((context: { gameOver: TouhouGameOver; close: () => void; }) => TouhouGameOverPage | void) | undefined);
  declare onOptions: (((context: { gameOver: TouhouGameOver; close: () => void; }) => TouhouGameOverPage | void) | undefined);
  declare onManual: (((context: { gameOver: TouhouGameOver; close: () => void; }) => TouhouGameOverPage | void) | undefined);
  declare onStock: (((data: { lives: number; lifeFragments: number; bombs: number; bombFragments: number; power: number; }) => void) | undefined);
  declare onSaveRanking: (((data: { records: TouhouScoreRecord[]; rank: number; name: string; }) => void) | undefined);
  declare drawBackground: (((draw: DrawList, gameOver: TouhouGameOver) => void) | undefined);
  declare rankings: TouhouScoreRecord[] | null;
  declare savedName: string;
  declare timestamp: number;
  declare actualFrames: number;
  declare targetFrames: number;
  declare completed: boolean;
  declare restart: boolean;
  declare continuePolicy: TouhouContinuePolicy | null;
  declare canContinue: boolean | ((player: TouhouPlayer, session: TouhouContinueSession, menu: TouhouGameOver) => boolean)|null;
  declare formatStage: ((record: TouhouScoreRecord) => string);
  declare buttons: TouhouButtons;
  declare disabledChoices:Set<number>;
  declare external:TouhouGameOverPage|null;
  declare renderQueue: TouhouRenderQueue;
  declare musicInterruption: TouhouMusicInterruption | null | undefined | null;

  declare active: boolean;
  declare phase: number;
  declare age: number;
  declare selection: number;
  declare panel: AnmInstance|null;
  declare panelVisible: boolean;
  declare excluded: Set<number>;
  declare session: TouhouContinueSession;
  declare player: TouhouPlayer;
  declare rank: number;
  declare playerName: string;
  declare nameCursor: number;
  declare nameLength: number;

  constructor({ bank, font = null, player, session = {}, sound, onContinue, onExit, onRestart, onScene,
    onReplay, onOptions, onManual, onOpen, onStock, onSaveRanking, drawBackground,
    rankings = null, savedName = '        ', timestamp = 0, actualFrames = 0, targetFrames = 1,
    completed = false, restart = false, initialMask = 0, music = 'game-over', musicPlayer = null,
    continuePolicy=continueTouhouGame,canContinue=null,formatStage=stageLabel,hiddenChoices=[] }: TouhouGameOverOptions = {} as TouhouGameOverOptions) {
    this.hiddenChoices=hiddenTouhouMenuChoices(hiddenChoices);
    if (!bank || !player) throw new TypeError('TouhouGameOver requires front ANM bank and player');
    if(continuePolicy!==null&&typeof continuePolicy!=='function')throw new TypeError('Continue policy must be a function or null');
    if(canContinue!==null&&typeof canContinue!=='function'&&typeof canContinue!=='boolean')throw new TypeError('canContinue must be a function, boolean or null');
    if(typeof formatStage!=='function')throw new TypeError('Ranking stage formatter must be a function');
    Object.assign(this, { bank, font, player, session, sound, onContinue, onExit, onRestart, onScene, onReplay,
      onOptions, onManual, onStock, onSaveRanking, drawBackground, rankings, savedName, timestamp, actualFrames, targetFrames, completed, restart,continuePolicy,canContinue,formatStage });
    session.difficulty ??= 1; session.stage ??= 1; session.mode ??= 0; session.continues = clamp(session.continues ?? 0, 0, 9);
    session.credits ??= TOUHOU_INITIAL_CREDITS[session.difficulty] ?? 0; session.highScore ??= 0;
    this.buttons = new TouhouButtons(); this.buttons.update(initialMask); this.active = true; this.phase = completed ? 3 : 2;
    this.age = 0; this.selection = 0; this.panel = null; this.panelVisible = true; this.excluded = new Set(); this.disabledChoices = new Set(); this.external = null; this.renderQueue = new TouhouRenderQueue();
    this.rank = -1; this.nameCursor = 0; this.playerName = String(savedName).slice(0, 8).padEnd(8, ' '); this.nameLength = this.playerName.trimEnd().length;
    if (this.playerName !== '        ') this.nameCursor = TOUHOU_NAME_CHARACTERS.length - 1;
    if (restart) { this.active = false; onScene?.(4, true); onExit?.(); return; }
    // finish_game saves and replaces the current track; finish_practice does
    // not touch music. Spell practice also keeps its ongoing track on failure.
    const changeMusic = !completed && session.mode !== 2;
    this.musicInterruption = changeMusic && music !== null ? musicPlayer?.interrupt(music) : null;
    if (!completed) sound?.(14);
    onOpen?.({ music: changeMusic ? music : null, pauseMusic: changeMusic, savedInput: 1, clockScale: 1 });
  }
  phaseTo(phase: number) { this.phase = phase; this.age = 0; }
  allowsContinue(): boolean{
    if(!this.continuePolicy)return false;
    if(this.canContinue!==null)return typeof this.canContinue==='function'?!!this.canContinue(this.player,this.session,this):this.canContinue;
    return !this.completed&&this.session.mode===0&&this.session.stageKind!=='extra'&&this.session.credits!>0;
  }
  child(script: number) { const find = (vm:AnmInstance|null):AnmInstance|null => { for (const child of vm?.children ?? []) { if (child.scriptId === script) return child; const result = find(child); if (result) return result; } return null; }; return find(this.panel); }
  signalChoice(choice: number, label: number) { for (const script of childScripts[choice]) this.child(script)?.interrupt(label, true); }
  select(index: number) { for (let i = 0; i < 6; i++) { index = (index + 6) % 6; if (!this.excluded.has(index)) { this.selection = index; return; } index++; } }
  move(delta: number) { const old = this.selection; for (let i = 0; i < 6; i++) { this.selection = (this.selection + delta + 6) % 6; if (!this.excluded.has(this.selection)) break; } return old !== this.selection; }
  resultMenu(selection?: number): void {
    this.panel?.destroy(); this.excluded.clear(); this.disabledChoices.clear();
    const disable=(choice:number)=>{this.excluded.add(choice);this.disabledChoices.add(choice);};
    const practice = this.completed || this.session.mode !== 0;
    this.panel = this.bank.create(practice ? 0x94 : 0x93); this.panelVisible = true;
    if (practice) disable(3);
    else if (this.session.continues! > 0) this.excluded.add(2);
    if(!this.allowsContinue())disable(0);
    for (const [choice, callback] of [[1, this.onExit ?? this.onScene], [2, this.onReplay], [3, this.onManual], [4, this.onOptions], [5, this.onRestart ?? this.onScene]] as const) if (!callback) disable(choice);
    for (const choice of this.hiddenChoices) disable(choice);
    this.select(selection ?? (practice && !this.completed ? 5 : this.excluded.has(0) ? 1 : 0));
    this.panel.interruptNow(3, true); this.panel!.interrupt(this.selection + 7, true);
    // pause_system/menu.cpp::result_menu only excludes continued Replay.
    for (const choice of this.disabledChoices) this.signalChoice(choice, 5);
    this.phaseTo(6); this.external = null;
  }
  rankScore() {
    // Original high-score update compares the low word only when high word is zero.
    if (this.session.highScore! <= 0xffffffff && (this.session.highScore! >>> 0) < ((this.player.score ?? 0) >>> 0)) this.session.highScore = this.player.score;
    if (this.session.mode === 0 && this.rankings) {
      this.rank = insertTouhouHighScore(this.rankings, this.player, this.session, this);
      if (this.rank >= 0) { this.panelVisible = false; this.phaseTo(15); return; }
    }
    this.resultMenu();
  }
  confirmChoice() {
    this.sound?.(7); const choice = this.selection; this.signalChoice(choice, 6);
    if (choice === 0) this.panel!.interrupt(1, true);
    this.phaseTo(choice === 2 ? 10 : choice === 3 ? 14 : choice === 4 ? 16 : 18);
  }
  finish(): void {
    const choice = this.selection;
    if(choice===0&&!this.allowsContinue()){this.resultMenu();return;}
    this.active = false; this.panel?.destroy(); this.bank.collect();
    if (choice === 0) {
      this.continuePolicy!(this.player,this.session,{onStock:this.onStock});
      this.musicInterruption?.restore(); this.musicInterruption = null;
      this.onContinue?.({player:this.player,session:this.session});
    } else if (choice === 1 || choice === 5) {
      this.musicInterruption?.discard(); this.musicInterruption = null;
      if (choice === 1) { this.onScene?.(4, true); this.onExit?.(); }
      else { this.onScene?.(this.session.mode !== 0 || this.session.stageKind === 'extra' ? 10 : 24, false); this.onRestart?.(); }
    }
  }
  nameInput(confirm: boolean, cancel: boolean) {
    const b = this.buttons, length = TOUHOU_NAME_CHARACTERS.length;
    const move = (delta:number) => { this.nameCursor = (this.nameCursor + delta + length) % length; };
    const before = this.nameCursor;
    if (b.repeat(Keys.UP)) move(-13); if (b.repeat(Keys.DOWN)) move(13);
    if (b.repeat(Keys.LEFT)) move(this.nameCursor % 13 === 0 ? 12 : -1);
    if (b.repeat(Keys.RIGHT)) move(this.nameCursor % 13 === 12 ? -12 : 1);
    if (before !== this.nameCursor) this.sound?.(10);
    const remove = () => { if (this.nameLength) { const chars = this.playerName.split(''); chars[--this.nameLength] = ' '; this.playerName = chars.join(''); } };
    if (!confirm) { if (cancel) { this.sound?.(9); remove(); } return; }
    if (this.nameCursor === length - 1) {
      this.rankings![this.rank].name = this.playerName; this.savedName = this.playerName;
      this.onSaveRanking?.({ records: this.rankings!, rank: this.rank, name: this.playerName }); this.sound?.(7); this.resultMenu(); return;
    }
    if (this.nameCursor === length - 2) { if (this.nameLength) { remove(); this.sound?.(9); } return; }
    const chars = this.playerName.split(''), character = this.nameCursor === length - 3 ? ' ' : TOUHOU_NAME_CHARACTERS[this.nameCursor];
    if (this.nameLength < 8) { chars[this.nameLength++] = character; if (this.nameLength > 7) this.nameCursor = length - 1; }
    else chars[this.nameLength - 1] = character;
    this.playerName = chars.join(''); this.sound?.(7);
  }
  update(mask: number = 0, { retryPressed = false, exitPressed = false }: {retryPressed?:boolean;exitPressed?:boolean} = {}): void {
    if (!this.active) return; this.buttons.update(mask); const b = this.buttons;
    const confirm = !!(b.pressed & (Keys.SHOOT | Keys.CONFIRM)), cancel = !!(b.pressed & (Keys.BOMB | Keys.CANCEL | Keys.PAUSE));
    if ([2, 3, 4, 5].includes(this.phase)) { if (this.age >= 10) this.rankScore(); }
    else if (this.phase === 6) {
      let moved = false; if (b.repeat(Keys.UP)) moved = this.move(-1) || moved; if (b.repeat(Keys.DOWN)) moved = this.move(1) || moved;
      if (moved) { this.panel!.interrupt(this.selection + 7, true); this.sound?.(10); }
      if (confirm && !this.excluded.has(this.selection)) this.confirmChoice();
      if (retryPressed && !this.excluded.has(5)) { this.select(5); this.confirmChoice(); }
      // Escape's original fallback is Continue -> Exit. Hiding that fallback
      // must not make it close on an external page without invoking the page.
      const escapeHidden=this.hiddenChoices.has(0)||(this.hiddenChoices.size>0&&this.excluded.has(0)&&this.excluded.has(1));
      if ((b.pressed & Keys.PAUSE) && !escapeHidden) { this.select(0); this.panel!.interrupt(1, true); this.phaseTo(18); }
      if (exitPressed && !this.excluded.has(1)) { this.select(1); this.confirmChoice(); }
    } else if (this.phase === 15) { if (this.age >= 10) this.nameInput(confirm, cancel); }
    else if ([10, 14, 16].includes(this.phase)) {
      if (this.age === 20) {
        this.panelVisible = false; const phase = this.phase, callback = phase === 10 ? this.onReplay : phase === 14 ? this.onManual : this.onOptions;
        const selection = this.selection; this.external = callback?.({ gameOver: this, close: () => this.resultMenu(selection) }) ?? null;
        if (phase === 10 && this.phase === 10) this.phaseTo(11);
      } else if (this.age > 20) { this.external?.update?.(mask); if (this.external?.done) this.resultMenu(this.selection); }
    } else if (this.phase === 11) { this.external?.update?.(mask); if (this.external?.done) this.resultMenu(this.selection); }
    else if (this.phase === 18) { if (this.age >= 12) this.finish(); }
    else throw new Error(`Unsupported Game Over phase ${this.phase}`);
    if (this.active) { this.panel?.update(); this.age++; } this.bank.collect();
  }
  draw(draw: DrawList): DrawList {
    if (!this.active) return draw;
    this.drawBackground?.(draw, this);
    // Keep this panel's registered ANM ordering separate from font/external UI.
    const queue = this.renderQueue.reset();
    if (this.panelVisible) drawTouhouMenuPanel(this.panel, queue, { x: 0, y: 0, scale: 1, screenScale: 1.5 }, this.hiddenChoices); queue.flush(draw);
    const write = (text: string, x: number, y: number, color = 0xffffffff) => this.font?.draw(draw, text, { x, y, font: 0, color });
    if (this.phase === 15) {
      write('            Score Ranking!!', 48, 64);
      for (let i = 0; i < 10; i++) {
        const entry = this.rankings![i], date = entry.timestamp ? new Date(entry.timestamp * 1000) : null;
        const stamp = date ? `${String(date.getFullYear() % 100).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}` : '--/--/--';
        const name = i === this.rank ? this.playerName : entry.name;
        write(`${String(i + 1).padStart(2, ' ')} ${name} ${String(entry.score).padStart(9, ' ')}${entry.continues ?? 0} ${stamp} ${date ? this.formatStage(entry) : 'Stage -'}`, 48, 96 + i * 18, i === this.rank ? 0xffffff00 : 0xff808080);
      }
      write('_', 75 + (this.nameLength === 8 ? 7 : this.nameLength) * 9, 96 + this.rank * 18, 0xffffff00);
      for (let i = 0; i < TOUHOU_NAME_CHARACTERS.length; i++) {
        const last = TOUHOU_NAME_CHARACTERS.length - 3;
        const char = i < last ? TOUHOU_NAME_CHARACTERS[i] : String.fromCharCode(i === last ? 0x81 : i === last + 1 ? 0x7f : 0x80);
        write(char, 108 + i % 13 * 18, 320 + Math.floor(i / 13) * 16, i === this.nameCursor ? 0xffffff00 : 0xff808080);
      }
    }
    if (![11, 14, 16].includes(this.phase) && this.session.mode !== 2) write(`Credit ${this.session.credits}`, 184, 448);
    this.external?.draw?.(draw); return draw;
  }
  destroy(): void { this.musicInterruption?.discard(); this.musicInterruption = null; this.active = false; this.panel?.destroy(); this.bank.collect(); }
  snapshot(): Record<string,unknown> { return { active: this.active, phase: this.phase, age: this.age, selection: this.selection,
    rank: this.rank, playerName: this.playerName, nameCursor: this.nameCursor, credits: this.session.credits,
    continues: this.session.continues, excluded: [...this.excluded] }; }
}
