import type {DrawList} from '../index.js';
import type {TouhouBitmapFont} from './font.js';
import type {TouhouPlayer,TouhouView} from './player.js';
import type {TouhouTimer} from './math.js';
export interface TouhouFloatingScoreSpawn{x:number;y:number;amount:number;color?:number;}
export interface TouhouFloatingScoreOptions{
  /** Borrowed common ASCII font; no new texture or font resource is generated. */
  font?:TouhouBitmapFont|null;player?:Pick<TouhouPlayer,'x'|'y'>|null;
  /** Source defaults: ten rotating slots, sixty frames, speed1 and drag0.95. */
  capacity?:number;lifetime?:number;initialSpeed?:number;drag?:number;
  /** Atlas-pixel scale, independent of world coordinate scale. Default1. */
  scale?:number;drawPriority?:number;
}
export interface TouhouFloatingScoreEntry{active:boolean;x:number;y:number;amount:number;color:number;digits:number[];speed:number;timer:TouhouTimer;}
export class TouhouFloatingScores{
  constructor(options?:TouhouFloatingScoreOptions);font:TouhouBitmapFont|null;player:Pick<TouhouPlayer,'x'|'y'>|null;
  capacity:number;lifetime:number;initialSpeed:number;drag:number;scale:number;drawPriority:number;nextSlot:number;
  entries:Array<TouhouFloatingScoreEntry|{active:false}>;
  spawn(entry:TouhouFloatingScoreSpawn):TouhouFloatingScoreEntry|null;
  update(context?:{clockScale?:number;timerRate?:number}):this;
  draw(draw:DrawList,view?:TouhouView):DrawList;clear():this;destroy():void;snapshot():Record<string,unknown>;
}
