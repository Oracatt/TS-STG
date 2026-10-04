import type {TouhouPlayer,TouhouPlayerContext,TouhouView,TouhouDamageRegion} from './player.js';
import type {TouhouTimer} from './math.js';
import type {DrawList} from '../index.js';
export function applyTouhouDamage(region:TouhouDamageRegion,context:TouhouPlayerContext):number;
export class TouhouReimuBomb{constructor(player:TouhouPlayer,context?:TouhouPlayerContext);player:TouhouPlayer;timer:TouhouTimer;alive:boolean;orbs:Array<{x:number;y:number;radius:number;angle:number;speed:number;active:boolean}>;update(context:TouhouPlayerContext):void;draw(draw:DrawList,view?:TouhouView):void;destroy():void;}
export class TouhouMarisaBomb{constructor(player:TouhouPlayer,context?:TouhouPlayerContext);player:TouhouPlayer;timer:TouhouTimer;alive:boolean;angle:number;update(context:TouhouPlayerContext):void;draw(draw:DrawList,view?:TouhouView):void;destroy():void;}
