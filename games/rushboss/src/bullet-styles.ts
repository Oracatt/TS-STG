import type {RushBoss} from './types.js';

// SPDX-License-Identifier: GPL-3.0-only
// Source names and animation choices belong to this game. Standard geometry
// belongs to thlib, including motifs needing an application artwork fallback.
import { getBulletPreset } from '@ts-stg/thlib';
export const COLORS16 = ['gray','red','rose','purple','pink','blue','periwinkle','cyan','light-cyan','green','lime','mint','yellow','pale-yellow','orange','white'];
export const COLORS8 = ['gray','red','purple','blue','cyan','green','yellow','white'];
export interface RushBulletStyle{preset:ReturnType<typeof getBulletPreset>;sprite:string|null;size:number;radius:number;rotate:number;add:boolean;colors:number;raw?:number;texture?:string;}
const style = (name: string, rotate = 0, options: Partial<RushBulletStyle> = {}):Readonly<RushBulletStyle> => {
  const preset = getBulletPreset(name);
  return Object.freeze({preset,sprite:name,size:preset.size,radius:preset.radius,
    rotate,add:preset.additive,colors:preset.colors,...options});
};
export const BULLET_STYLES:Readonly<Record<string,RushBulletStyle>> = Object.freeze({
  DianDan:style('pellet'), JunDan:style('micro-orb',0,{raw:16}),
  XiaoYu:style('orb'), HuanYu:style('ring'), MiDan:style('rice',1),
  LinDan:style('kunai',1), LianDan:style('linked',1,{raw:160}), ZhenDan:style('needle',1),
  ZhaDan:style('amulet',1), ChongDan:style('capsule',1), XingDanS:style('star',3),
  ZhongYu:style('orb-medium'), TuoDan:style('oval',1), DaoDan:style('knife',1),
  DieDan:style('heart-ring',1), XingDanL:style('star-large',3),
  XinDan:style('heart',1,{sprite:null,texture:'src_bullet_3'}),
  GuangYuS:style('glow'), DaYu:style('orb-large',0,{colors:4}),
  GuangYuL:style('orb-large'), FangDan:style('diamond',3),
  YanDan:style('flame',1,{sprite:null,texture:'src_bullet_3'}),
});
const SPRITE_NAMES=Object.fromEntries(Object.entries(BULLET_STYLES).map(([kind,data])=>{
  if(!data.sprite)return[kind,[]];
  const palette=data.colors===4?['red','blue','green','yellow']:data.colors===8?COLORS8:COLORS16;
  return[kind,palette.map((color: string,i)=>data.raw!==undefined?
    `bullet-small.${String(data.raw+i).padStart(3,'0')}`:`bullet.${data.sprite}.${color}`)];
}));
export function bulletSprite(kind: string, color = 0) {
  const data = BULLET_STYLES[kind]; if (!data) throw new Error(`Unknown RushBoss bullet kind: ${kind}`);
  if (!data.sprite) return null;
  const names=SPRITE_NAMES[kind];return names[((color%names.length)+names.length)%names.length];
}
