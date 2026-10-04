import type {DrawList} from '../index.js';
import type {TouhouTimer,TouhouRNG} from './math.js';
import type {TouhouView} from './player.js';
export class TouhouShortLine{constructor(options?:{x?:number;y?:number;color?:number;rng?:TouhouRNG});x:number;y:number;positions:Array<{x:number;y:number}>;colors:number[];angle:number;age:TouhouTimer;alive:boolean;update(timerRate?:number):void;draw(draw:DrawList,view?:TouhouView):void;}
export class TouhouGrazeEffects{constructor(options?:{rng?:TouhouRNG});lines:TouhouShortLine[];enqueue(effect:{x:number;y:number;color:number;delay:number}):void;update(context?:{timerRate?:number}):void;draw(draw:DrawList,view?:TouhouView):void;clear():void;}
