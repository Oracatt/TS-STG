export type TouhouPhaseScript = Generator<number | undefined | (() => boolean) | TouhouPhaseScript, unknown, unknown>;
export interface TouhouPhase<T = unknown> {
  name?: string;
  enter?:(context:T, sequence:TouhouPhaseSequence<T>)=>void|TouhouPhaseScript;
  run?:(context:T, sequence:TouhouPhaseSequence<T>)=>void|TouhouPhaseScript;
  update?:(context:T, sequence:TouhouPhaseSequence<T>)=>void;
  leave?:(context:T, sequence:TouhouPhaseSequence<T>, result:unknown)=>void|TouhouPhaseScript;
}
/** Fixed-frame lifecycle only; all gameplay policy is supplied by the phases. */
export class TouhouPhaseSequence<T = unknown> {
  constructor(phases:readonly TouhouPhase<T>[], options?:{context?:T;onComplete?:((context:T,sequence:TouhouPhaseSequence<T>)=>void)|null});
  readonly phase:TouhouPhase<T>|null;readonly index:number;readonly frame:number;readonly phaseFrame:number;
  readonly alive:boolean;readonly completed:boolean;readonly state:'ready'|'enter'|'running'|'leave'|'complete'|'cancelled';
  context:T;result:unknown;
  finish(result?:unknown):boolean;update(context?:T):this;destroy():void;
  snapshot():{index:number;state:string;frame:number;phaseFrame:number;completed:boolean};
}
