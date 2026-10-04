import type {AnmInstance,TouhouAnmAttachedEffect} from './anm.js';
export class TouhouConvergingParticles implements TouhouAnmAttachedEffect {
 constructor(animation:AnmInstance);animation:AnmInstance;spawned:number;
 update():number;interrupt(value:number):void;retire():void;
 snapshot():{age:number;spawned:number;active:number;stages:number[]};
}
export function createTouhouAttachedEffect(animation:AnmInstance,type:number):TouhouAnmAttachedEffect;
