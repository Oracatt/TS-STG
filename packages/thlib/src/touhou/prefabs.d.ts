import type {AnmCreateOptions,AnmInstance} from './anm.js';
import type {TouhouResources} from './resources.js';
import type {TouhouPlayer,TouhouPlayerOptions} from './player.js';
import type {TouhouEnemy,TouhouEnemyOptions} from './enemy.js';
import type {TouhouBulletField} from './bullets.js';
export interface TouhouAnimationPreset {readonly id:string;readonly bank:string;readonly script:number;}
export interface TouhouEnemyPreset extends TouhouAnimationPreset {readonly sourceTexture:string;readonly directional:boolean;readonly deathScript:number;}
export interface TouhouBulletPreset extends TouhouAnimationPreset {readonly type:number;readonly colorCount:number;readonly radius:number;readonly drawGroup:number;readonly childScript:number;}
export const TOUHOU_PLAYER_PRESETS:readonly Readonly<{id:'reimu'|'marisa';character:0|1;bank:'pl00'|'pl01';profile:'standard'}>[];
export const TOUHOU_BULLET_PRESETS:readonly TouhouBulletPreset[];
export const TOUHOU_ENEMY_PRESETS:readonly TouhouEnemyPreset[];
export const TOUHOU_EFFECT_PRESETS:readonly TouhouAnimationPreset[];
export const TouhouEffectPreset:Readonly<{SPELL_DOUBLE_CIRCLES:6;SPELL_CARD_ATTACK:13}>;
export interface TouhouPrefabCatalog {
 readonly players:typeof TOUHOU_PLAYER_PRESETS;readonly bullets:typeof TOUHOU_BULLET_PRESETS;readonly enemies:typeof TOUHOU_ENEMY_PRESETS;readonly effects:typeof TOUHOU_EFFECT_PRESETS;readonly animations:readonly TouhouAnimationPreset[];
 createPlayer(character?:'reimu'|'marisa'|0|1,options?:Omit<TouhouPlayerOptions,'character'|'sht'|'bank'|'effectBank'>):TouhouPlayer;
 createEnemy(preset?:string|number,options?:Omit<TouhouEnemyOptions,'bank'|'script'|'deathBank'>):TouhouEnemy;
 createEffect(preset:string|number,options?:AnmCreateOptions):AnmInstance;
 createAnimation(preset:string,options?:AnmCreateOptions):AnmInstance;
 createBulletField(options?:Omit<ConstructorParameters<typeof TouhouBulletField>[0],'bank'|'styles'>):TouhouBulletField;
 emitBullet(field:TouhouBulletField,preset?:string|number,color?:number,options?:Parameters<TouhouBulletField['emit']>[0]):ReturnType<TouhouBulletField['emit']>;
}
export function createTouhouPrefabCatalog(resources:TouhouResources):TouhouPrefabCatalog;
