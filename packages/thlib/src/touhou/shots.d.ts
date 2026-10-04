import type {TouhouPlayer,TouhouPlayerContext,TouhouView,TouhouDamageTarget} from './player.js';
import type {TouhouShooter} from './shot-data.js';
import type {TouhouTimer} from './math.js';
import type {DrawList} from '../index.js';
export class TouhouShot{constructor(player:TouhouPlayer,row:TouhouShooter,pattern:number,index:number,context:TouhouPlayerContext);id:number;x:number;y:number;z:number;angle:number;speed:number;damage:number;damagePosition?:{x:number;y:number;z:number};width:number;height:number;state:number;alive:boolean;timer:TouhouTimer;pattern:number;index:number;row:TouhouShooter;update(context:TouhouPlayerContext):void;collisions(context:TouhouPlayerContext):void;draw(draw:DrawList,view?:TouhouView):void;destroy():void;}
export function fireTouhouPattern(player:TouhouPlayer,pattern:number,timer:number,secondaryTimer:number,context:TouhouPlayerContext):void;
