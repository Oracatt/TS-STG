import {TouhouEnemy,touhouEnemyDeathScript} from './enemy.js';
import {TouhouPlayer} from './player.js';
import {TouhouBulletField} from './bullets.js';
import {TOUHOU_BULLET_STYLES} from './bullet-style-data.js';

const freezeEntries=entries=>Object.freeze(entries.map(entry=>Object.freeze(entry)));
const sequence=(count,callback)=>Array.from({length:count},(_,index)=>callback(index));
const enemyEntries=[{first:0,last:91,name:'enemy/enemy.png'},{first:92,last:111,name:'enemy/enemy2.png'},
  {first:112,last:165,name:'enemy/enemy_aura.png'},{first:166,last:194,name:'enemy/enemy6.png'},
  {first:195,last:239,name:'enemy/enemy_g.png'},{first:240,last:245,name:'enemy/enemy_ll.png'},
  {first:246,last:271,name:'enemy/enemy_ll2.png'}];
// These source families have the five-script idle/left/right/return layout used
// by enemy_movement.cpp. Every other source script is still instantiable, but
// must not accidentally use the next unrelated ANM as a directional transition.
const directionalRoots=new Set([0,5,10,15,20,25,30,35,40,166,172,178,184,190,
  195,200,205,210,215,220,225,230,235,240,246]);

export const TOUHOU_PLAYER_PRESETS=freezeEntries([
  {id:'reimu',character:0,bank:'pl00',profile:'standard'},
  {id:'marisa',character:1,bank:'pl01',profile:'standard'},
]);
/** All 50 rows of the original standard bullet table, including all 16 color
 * rows and exact collision radii. Colors may intentionally share sprite IDs. */
export const TOUHOU_BULLET_PRESETS=freezeEntries(TOUHOU_BULLET_STYLES.map((style,type)=>({
  id:`bullet:${type}`,type,bank:'bullet',script:style.script,colorCount:style.colors.length,
  radius:style.radius,drawGroup:style.drawGroup,childScript:style.childScript,
})));
/** The 272 scripts in all seven non-stone enemy atlases. This inventory includes
 * poses, aura children and transitions; it is not a count of enemy species. */
export const TOUHOU_ENEMY_PRESETS=freezeEntries(sequence(272,script=>({
  id:`enemy:${script}`,bank:'enemy',script,sourceTexture:enemyEntries.find(entry=>script>=entry.first&&script<=entry.last).name,
  directional:directionalRoots.has(script),deathScript:touhouEnemyDeathScript(script),
})));
export const TOUHOU_EFFECT_PRESETS=freezeEntries(sequence(193,script=>({id:`effect:${script}`,bank:'effect',script})));
/** Named source presets supplement (never replace) the complete numeric list. */
export const TouhouEffectPreset=Object.freeze({
  SPELL_DOUBLE_CIRCLES:6,SPELL_CARD_ATTACK:13,
});

function selected(list,value,prefix){
  const number=typeof value==='number'?value:typeof value==='string'&&value.startsWith(`${prefix}:`)?Number(value.slice(prefix.length+1)):NaN;
  if(!Number.isInteger(number)||number<0||number>=list.length)throw new RangeError(`Unknown ${prefix} preset ${String(value)}`);
  return list[number];
}
function bankOf(resources,name,script){
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
export function createTouhouPrefabCatalog(resources){
  if(!resources?.banks||!resources?.shots)throw new TypeError('Touhou resources required');
  const animations=[];
  for(const [name,data]of Object.entries(resources.data??{}))for(const script of data.scripts)
    if(!script.excluded)animations.push(Object.freeze({id:`${name}:${script.index}`,bank:name,script:script.index}));
  return Object.freeze({
    players:TOUHOU_PLAYER_PRESETS,bullets:TOUHOU_BULLET_PRESETS,enemies:TOUHOU_ENEMY_PRESETS,effects:TOUHOU_EFFECT_PRESETS,
    animations:Object.freeze(animations),
    createPlayer(character='reimu',options={}){
      const preset=TOUHOU_PLAYER_PRESETS.find(p=>p.id===character||p.character===character);
      if(!preset)throw new RangeError(`Unknown player preset ${String(character)}`);
      if(resources.disposed)throw new Error('Touhou resources have been disposed');
      return new TouhouPlayer({...options,character:preset.character,sht:resources.shots[preset.character],bank:resources.banks[preset.bank],effectBank:resources.banks.effect});
    },
    createEnemy(preset=0,options={}){
      const descriptor=selected(TOUHOU_ENEMY_PRESETS,preset,'enemy');
      return new TouhouEnemy({directional:descriptor.directional,deathScript:descriptor.deathScript,...options,
        bank:bankOf(resources,'enemy',descriptor.script),script:descriptor.script,deathBank:resources.banks.effect});
    },
    createEffect(preset,options={}){
      const descriptor=selected(TOUHOU_EFFECT_PRESETS,preset,'effect');
      return bankOf(resources,'effect',descriptor.script).create(descriptor.script,options);
    },
    createAnimation(preset,options={}){
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
