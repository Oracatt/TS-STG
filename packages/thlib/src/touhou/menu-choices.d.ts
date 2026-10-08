import type {AnmInstance,AnmView} from './anm.js';
import type {TouhouRenderQueue} from './render-queue.js';
export type TouhouMenuChoice='resume'|'continue'|'exit'|'replay'|'manual'|'options'|'restart';
/** Resume and Continue name the first row of their respective menu. */
export function hiddenTouhouMenuChoices(names?:readonly TouhouMenuChoice[]):Set<number>;
export function drawTouhouMenuPanel(panel:AnmInstance|null,queue:TouhouRenderQueue,view:AnmView,hidden:ReadonlySet<number>):void;
