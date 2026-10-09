import type {AnmCreateOptions,AnmInstance} from './anm.js';
import type {TouhouResources} from './resources.js';
import type {TouhouPlayerOptions} from './player.js';
import type {TouhouEnemyOptions} from './enemy.js';

export interface TouhouAnimationPreset {readonly id:string;readonly bank:string;readonly script:number;}

export interface TouhouEnemyPreset extends TouhouAnimationPreset {readonly sourceTexture:string;readonly directional:boolean;readonly deathScript:number;}

export interface TouhouBulletPreset extends TouhouAnimationPreset {readonly type:number;readonly colorCount:number;readonly radius:number;readonly drawGroup:number;readonly childScript:number;}

export interface TouhouPrefabCatalog {
 readonly players:typeof TOUHOU_PLAYER_PRESETS;readonly bullets:typeof TOUHOU_BULLET_PRESETS;readonly enemies:typeof TOUHOU_ENEMY_PRESETS;readonly effects:typeof TOUHOU_EFFECT_PRESETS;readonly animations:readonly TouhouAnimationPreset[];
 createPlayer(character?:'reimu'|'marisa'|0|1,options?:Omit<TouhouPlayerOptions,'character'|'sht'|'bank'|'effectBank'>):TouhouPlayer;
 createEnemy(preset?:string|number,options?:Omit<TouhouEnemyOptions,'bank'|'script'|'deathBank'>):TouhouEnemy;
 createEffect(preset:string|number,options?:AnmCreateOptions):AnmInstance;
 createAnimation(preset:string,options?:AnmCreateOptions):AnmInstance;
 createBulletField(options?:Omit<ConstructorParameters<typeof TouhouBulletField>[0],'bank'|'styles'>):TouhouBulletField;
 emitBullet(field:TouhouBulletField,preset?:string|number,color?:number,options?:Parameters<TouhouBulletField['emit']>[0]):ReturnType<TouhouBulletField['emit']>;
}

import {TouhouEnemy,touhouEnemyDeathScript} from './enemy.js';
import {TouhouPlayer} from './player.js';
import {TouhouBulletField} from './bullets.js';
import {TOUHOU_BULLET_STYLES} from './bullet-style-data.js';

const freezeEntries=<const T>(entries:readonly T[])=>Object.freeze(entries.map(entry=>Object.freeze(entry)));
const sequence=<T>(count:number,callback:(index:number)=>T)=>Array.from({length:count},(_,index)=>callback(index));
const enemyEntries=[{first:0,last:91,name:'enemy/enemy.png'},{first:92,last:111,name:'enemy/enemy2.png'},
  {first:112,last:165,name:'enemy/enemy_aura.png'},{first:166,last:194,name:'enemy/enemy6.png'},
  {first:195,last:239,name:'enemy/enemy_g.png'},{first:240,last:245,name:'enemy/enemy_ll.png'},
  {first:246,last:271,name:'enemy/enemy_ll2.png'}];
// These source families have the five-script idle/left/right/return layout used
// by enemy_movement.cpp. Every other source script is still instantiable, but
// must not accidentally use the next unrelated ANM as a directional transition.
const directionalRoots=new Set([0,5,10,15,20,25,30,35,40,166,172,178,184,190,
  195,200,205,210,215,220,225,230,235,240,246]);

export const TOUHOU_PLAYER_PRESETS: readonly Readonly<{id:'reimu'|'marisa';character:0|1;bank:'pl00'|'pl01';profile:'standard'}>[]=freezeEntries([
  {id:'reimu',character:0,bank:'pl00',profile:'standard'},
  {id:'marisa',character:1,bank:'pl01',profile:'standard'},
]);
/** All 50 rows of the original standard bullet table, including all 16 color
 * rows and exact collision radii. Colors may intentionally share sprite IDs. */
export const TOUHOU_BULLET_PRESETS: readonly TouhouBulletPreset[]=freezeEntries(TOUHOU_BULLET_STYLES.map((style,type)=>({
  id:`bullet:${type}`,type,bank:'bullet',script:style.script,colorCount:style.colors.length,
  radius:style.radius,drawGroup:style.drawGroup,childScript:style.childScript,
})));
/** The 272 scripts in all seven non-stone enemy atlases. This inventory includes
 * poses, aura children and transitions; it is not a count of enemy species. */
export const TOUHOU_ENEMY_PRESETS: readonly TouhouEnemyPreset[]=freezeEntries(sequence(272,(script)=>({
  id:`enemy:${script}`,bank:'enemy',script,sourceTexture:enemyEntries.find(entry=>script>=entry.first&&script<=entry.last)!.name,
  directional:directionalRoots.has(script),deathScript:touhouEnemyDeathScript(script),
})));
export const TOUHOU_EFFECT_PRESETS: readonly TouhouAnimationPreset[]=freezeEntries(sequence(193,script=>({id:`effect:${script}`,bank:'effect',script})));
/** Named source presets supplement (never replace) the complete numeric list. */
export const TouhouEffectPreset: Readonly<{SPELL_DOUBLE_CIRCLES:6;SPELL_CARD_ATTACK:13}>=Object.freeze({
  SPELL_DOUBLE_CIRCLES:6,SPELL_CARD_ATTACK:13,
});

function selected<T>(list:readonly T[],value:string|number,prefix:string){
  const number=typeof value==='number'?value:typeof value==='string'&&value.startsWith(`${prefix}:`)?Number(value.slice(prefix.length+1)):NaN;
  if(!Number.isInteger(number)||number<0||number>=list.length)throw new RangeError(`Unknown ${prefix} preset ${String(value)}`);
  return list[number];
}
function bankOf(resources: TouhouResources,name: string,script: number){
  if(resources.disposed)throw new Error('Touhou resources have been disposed');
  const bank=resources.banks[name];
  if(!bank)throw new Error(`Touhou prefab requires loaded common bank ${name}`);
  const descriptor=bank.data.scripts[script];
  if(!descriptor||descriptor.excluded)throw new RangeError(`Unavailable common animation ${name}:${script}`);
  return bank;
}

/** A portable factory bound to one caller-owned common resource pack. Factories
 * create the real restored thlib classes/ANMs; they do not own an update loop.
 * Concrete stage AI, health and drop choices remain application configuration. */
export function createTouhouPrefabCatalog(resources: TouhouResources): TouhouPrefabCatalog{
  if(!resources?.banks||!resources?.shots)throw new TypeError('Touhou resources required');
  const animations=[];
  for(const [name,data]of Object.entries(resources.data??{}))for(const script of data.scripts)
    if(!script.excluded)animations.push(Object.freeze({id:`${name}:${script.index}`,bank:name,script:script.index}));
  return Object.freeze<TouhouPrefabCatalog>({
    players:TOUHOU_PLAYER_PRESETS,bullets:TOUHOU_BULLET_PRESETS,enemies:TOUHOU_ENEMY_PRESETS,effects:TOUHOU_EFFECT_PRESETS,
    animations:Object.freeze(animations),
    createPlayer(character='reimu',options={}){
      const preset=TOUHOU_PLAYER_PRESETS.find(p=>p.id===character||p.character===character);
      if(!preset)throw new RangeError(`Unknown player preset ${String(character)}`);
      if(resources.disposed)throw new Error('Touhou resources have been disposed');
      return new TouhouPlayer({...options,character:preset.character,sht:resources.shots[preset.character],bank:resources.banks[preset.bank]!,effectBank:resources.banks.effect!});
    },
    createEnemy(preset=0,options={}){
      const descriptor=selected(TOUHOU_ENEMY_PRESETS,preset,'enemy');
      return new TouhouEnemy({directional:descriptor.directional,deathScript:descriptor.deathScript,...options,
        bank:bankOf(resources,'enemy',descriptor.script),script:descriptor.script,deathBank:resources.banks.effect!});
    },
    createEffect(preset,options={}){
      const descriptor=selected(TOUHOU_EFFECT_PRESETS,preset,'effect');
      return bankOf(resources,'effect',descriptor.script).create(descriptor.script,options);
    },
    createAnimation(preset: string,options={}){
      if(typeof preset!=='string')throw new TypeError('Animation preset must be bank:script');
      const split=preset.lastIndexOf(':'),name=preset.slice(0,split),script=Number(preset.slice(split+1));
      if(split<1||!Number.isInteger(script))throw new RangeError(`Invalid animation preset ${preset}`);
      return bankOf(resources,name,script).create(script,options);
    },
    createBulletField(options={}){
      return new TouhouBulletField({...options,bank:bankOf(resources,'bullet',0),styles:resources.styles??TOUHOU_BULLET_STYLES});
    },
    emitBullet(field,preset=0,color=0,options={}){
      const descriptor=selected(TOUHOU_BULLET_PRESETS,preset,'bullet');
      if(!Number.isInteger(color)||color<0||color>=descriptor.colorCount)throw new RangeError('Unknown bullet color preset');
      return field.emit({...options,type:descriptor.type,color});
    },
  });
}
