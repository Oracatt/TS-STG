export class TouhouRandom {constructor(seed?:number);state:number;last:number;modulus:number;seed(value:number):this;next():number;unit():number;signedUnit():number;snapshot():{state:number;last:number;modulus:number};}
export interface TouhouTrajectoryParameters {count?:number;rows?:number;speed?:number;speedStep?:number;angle?:number;angleStep?:number;}
export interface TouhouBulletStyle {script:number;colors:number[][];radius:number;drawGroup:number;cancelType:number;field150:number;childScript:number;}
export function touhouShotTrajectory(parameters:TouhouTrajectoryParameters,pattern:number,column:number,row:number,playerAngle:number,random?:TouhouRandom):{angle:number;speed:number;initialSpeed:number};
export function touhouStyle(styles:TouhouBulletStyle[],type:number,color?:number):TouhouBulletStyle&{color:number;cancelScript:number;remapSprite:(index:number)=>number};
