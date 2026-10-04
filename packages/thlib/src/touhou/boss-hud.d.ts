import type {AnmBank,AnmInstance,AnmView} from './anm.js';
import type {TouhouBitmapFont,TouhouTextOptions} from './font.js';
import type {TouhouPlayer} from './player.js';
import type {TouhouSpell} from './spell.js';
import type {DrawList} from '../core.js';
/** A business Boss can supply this shape without inheriting a thlib enemy. */
export interface TouhouBossHudEnemy {x:number;y:number;z?:number;hp:number;alive?:boolean;maximumHp?:number;phaseHealth?:number;health?:{maximum?:number;threshold?:number};primaryFlags?:number;damageInvulnerability?:{current:number};}
export interface TouhouBossHealthBar {
 current:number;maximum:number;phaseHealth?:number;markers?:number[];groupIndex?:number;visible?:boolean;
 /** false follows the health fraction immediately; omitted uses the source fill animation. */
 animateFill?:boolean;
}
export interface TouhouBossHudState {bosses?:Array<TouhouBossHudEnemy|null>;player?:Pick<TouhouPlayer,'x'|'y'>;spell?:TouhouSpell;spellFlags?:number;remainingFrames?:number;remainingSpells?:number;healthBars?:Array<TouhouBossHealthBar|null>;name?:string;hidden?:boolean;dialogue?:boolean;timerHidden?:boolean;paused?:boolean;labelScript?:number;sound?:(id:number,x:number)=>void;}
export type TouhouBossNameRenderer=(draw:DrawList,name:string,options:TouhouTextOptions,animation:AnmInstance)=>void;
export class TouhouBossHud {
 constructor(options:{bank:AnmBank;textBank:AnmBank;font?:TouhouBitmapFont|null;pointer?:AnmInstance|null;managePointer?:boolean;drawName?:TouhouBossNameRenderer|null;nameStyle?:TouhouTextOptions});
 bank:AnmBank;textBank:AnmBank;font:TouhouBitmapFont|null;pointer:AnmInstance;managePointer:boolean;numbers:AnmInstance[];
 panels:Array<{fraction:number;target:number;hp:number;markers:number[];animations:AnmInstance[];near:boolean}>;
 seconds:number;hundredths:number;previousSeconds:number;timerMode:number;pointerMode:number;timerVisible:boolean;
 remainingSpells:number;stars:Array<AnmInstance|null>;retiringStars:AnmInstance[];name:string;nameAnimation:AnmInstance|null;drawName:TouhouBossNameRenderer|null;nameStyle:TouhouTextOptions;
 setTime(seconds:number,hundredths?:number):this;setRemainingFrames(frames:number):this;setMarkers(index:number,fractions:number[]):this;setLabel(script?:number):this;
 setRemainingSpells(count:number):this;setName(name?:string):this;
 update(state?:TouhouBossHudState):this;draw(draw:DrawList,view?:AnmView):DrawList;snapshot():Record<string,unknown>;destroy():void;
}
