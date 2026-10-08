import type {DrawList} from '../index.js';
import type {AnmBank,AnmInstance} from './anm.js';
import type {TouhouPlayer} from './player.js';
import type {TouhouBitmapFont} from './font.js';
import type {TouhouMusic} from './music.js';
import type {TouhouMenuChoice} from './menu-choices.js';
export const TOUHOU_INITIAL_CREDITS:readonly number[];export const TOUHOU_NAME_CHARACTERS:string;
export interface TouhouContinueSession{difficulty?:number;stage?:number;stageKind?:'normal'|'extra';mode?:number;continues?:number;credits?:number;highScore?:number;}
export interface TouhouScoreRecord{score:number;name:string;continues?:number;stage?:number;stageKind?:'normal'|'extra';cleared?:boolean;timestamp?:number;slowdown?:number;}
export type TouhouContinuePolicy=(player:TouhouPlayer,session:TouhouContinueSession,context:Pick<TouhouGameOverOptions,'onStock'>)=>unknown;
export function continueTouhouGame(player:TouhouPlayer,session:TouhouContinueSession,context?:Pick<TouhouGameOverOptions,'onContinue'|'onStock'>):number;
export function insertTouhouHighScore(records:TouhouScoreRecord[],player:TouhouPlayer,session:TouhouContinueSession,options?:{timestamp?:number;actualFrames?:number;targetFrames?:number;completed?:boolean}):number;
export interface TouhouGameOverPage{done?:boolean;update?(mask:number):void;draw?(draw:DrawList):void;}
export interface TouhouGameOverOptions{bank:AnmBank;font?:TouhouBitmapFont|null;player:TouhouPlayer;session?:TouhouContinueSession;sound?:(id:number)=>void;
  /** Track key for an unfinished, non-spell-practice run; defaults to 'game-over'. */
  music?:string|null;
  /** Shared transport owns save/switch/restore. Track files are supplied by the consumer. */
  musicPlayer?:Pick<TouhouMusic,'interrupt'>|null;
  /** Original stock replenishment by default. Replacement runs before onContinue; no additional reset is applied. Null disables Continue. */
  continuePolicy?:TouhouContinuePolicy|null;
  /** Defaults to normal mode, unfinished run, positive credits and stageKind !== extra. */
  canContinue?:boolean|((player:TouhouPlayer,session:TouhouContinueSession,menu:TouhouGameOver)=>boolean);
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
export class TouhouGameOver{constructor(options:TouhouGameOverOptions);active:boolean;phase:number;age:number;selection:number;panel:AnmInstance|null;panelVisible:boolean;excluded:Set<number>;session:TouhouContinueSession;player:TouhouPlayer;rank:number;playerName:string;nameCursor:number;nameLength:number;
  update(mask?:number,options?:{retryPressed?:boolean;exitPressed?:boolean}):void;draw(draw:DrawList):DrawList;destroy():void;resultMenu(selection?:number):void;allowsContinue():boolean;finish():void;snapshot():Record<string,unknown>;
}
