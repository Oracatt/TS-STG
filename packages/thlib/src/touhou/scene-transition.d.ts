import type {DrawList} from '../index.js';
import type {AnmBank,AnmInstance,AnmView} from './anm.js';
export interface TouhouSceneTransitionOptions {
 bank:AnmBank;loadingBank?:AnmBank|null;
 /** Original title request: 40 - 10 frames after the effect is spawned. */
 coverFrames?:number;revealLimit?:number;
 coverScripts?:readonly number[];revealScripts?:readonly number[];maskScript?:number|null;loadingScript?:number|null;
 view?:AnmView;width?:number;height?:number;
 /** Source RGBA framebuffer path; false selects its untextured XRGB fallback. */
 masked?:boolean;
}
/** Owns its ANM updates; do not also advance the supplied banks each frame. */
export class TouhouSceneTransition {
 constructor(options:TouhouSceneTransitionOptions);
 bank:AnmBank;loadingBank:AnmBank|null;panels:AnmInstance[];mask:AnmInstance|null;loading:AnmInstance|null;
 phase:'cover'|'reveal';age:number;alive:boolean;destroyed:boolean;readonly ready:boolean;
 reveal():this;update():this;draw(draw:DrawList):DrawList;
 snapshot():{phase:'cover'|'reveal';age:number;ready:boolean;alive:boolean};destroy():void;
}
