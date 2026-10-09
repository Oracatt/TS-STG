import type {AnmBank,AnmInstance,AnmDrawList,AnmView,TouhouResources} from '@ts-stg/thlib/touhou';
import type {RushEntity} from './runtime.js';
// SPDX-License-Identifier: GPL-3.0-only
// Rush supplies trajectories. The common thlib presentation owns source
// bullet.anm birth, body, child and explicit cancellation/hit animations.
import {touhouStyle,TouhouBulletBirth,TouhouBulletPresentation} from '@ts-stg/thlib/touhou';
import {BULLET_STYLES} from './bullet-styles.js';
export const RUSH_TOUHOU_BULLET_TYPES:Readonly<Partial<Record<string,number>>>=Object.freeze({DianDan:0,JunDan:2,XiaoYu:4,HuanYu:6,MiDan:8,
  LinDan:9,LianDan:9,ZhenDan:10,ZhaDan:11,ChongDan:13,XingDanS:16,ZhongYu:18,TuoDan:20,
  DaoDan:21,DieDan:22,XingDanL:23,GuangYuS:14,DaYu:33,GuangYuL:33,FangDan:48});
export function rushTouhouBulletType(b:RushEntity,commonOnly=false){
  if(commonOnly&&b.kind==='XinDan')return 22;
  if(commonOnly&&b.kind==='YanDan')return 43;
  return RUSH_TOUHOU_BULLET_TYPES[b.kind];
}
const normalizedColor=(b:RushEntity)=>{const count=BULLET_STYLES[b.kind].colors;return ((b.color%count)+count)%count;};
export function rushTouhouBulletStyle(resources:TouhouResources,b:RushEntity,commonOnly=false){
  const type=rushTouhouBulletType(b,commonOnly);if(type===undefined)return null;
  const color=normalizedColor(b);
  return touhouStyle(resources.styles,type,b.kind==='DaYu'||commonOnly&&b.kind==='YanDan'?[1,3,5,6][color]:color);
}
// player_entity/frame_adapter.cpp sends respawn cleanup through cancel_circle,
// so it has the same visual cancellation path as Bomb and phase bonuses.
const cancelReasons=new Set(['cancel','bomb','bonus','respawn','cancelCircle','cancelRectangle',
  'reimu-orb','reimu-orb-retire','marisa-beam']);
type RushVisual=TouhouBulletPresentation&{b:RushEntity;type:number;color:number;palette:number};
export class RushBulletVisuals {
 resources:TouhouResources;yOffset:number;commonOnly:boolean;bank:AnmBank|null;visuals:Map<RushEntity,RushVisual>;effects:AnmInstance[];usedTypes:Set<number>;
  constructor(resources:TouhouResources,{yOffset=0,commonOnly=false}={}){this.resources=resources;this.yOffset=yOffset;this.commonOnly=commonOnly;this.bank=resources.banks.bullet;this.visuals=new Map();this.effects=[];this.usedTypes=new Set();}
  create(b:RushEntity){
    const type=rushTouhouBulletType(b,this.commonOnly);if(type===undefined||!this.bank)return null;
    const style=rushTouhouBulletStyle(this.resources,b,this.commonOnly)!;
    const birthKind=b.birthKind!==undefined?b.birthKind:(b.initialDelay??b.delay)>0?TouhouBulletBirth.NORMAL:TouhouBulletBirth.INSTANT;
    const visual=new TouhouBulletPresentation({bank:this.bank,style,x:b.x,y:this.yOffset-b.y,birthKind}) as RushVisual;
    Object.assign(visual,{b,type,color:normalizedColor(b),palette:style.color});
    this.usedTypes.add(type);this.visuals.set(b,visual);return visual;
  }
  update(entities:RushEntity[]){
    for(const b of entities)if(b.alive&&b.group==='bullet'&&rushTouhouBulletType(b,this.commonOnly)!==undefined){
      const old=this.visuals.get(b);
      if(old&&old.type!==rushTouhouBulletType(b,this.commonOnly)){old.destroy();this.visuals.delete(b);}
      if(!this.visuals.has(b))this.create(b);
    }
    const priorEffectCount=this.effects.length;
    for(const visual of this.visuals.values()){
      const b=visual.b,color=normalizedColor(b),position={x:b.x,y:this.yOffset-b.y};
      if(color!==visual.color){
        visual.color=color;const style=rushTouhouBulletStyle(this.resources,b,this.commonOnly)!;
        visual.palette=style.color;visual.setStyle(style);
      }
      if(!b.alive&&!visual.ending){
        this.finishEntity(b);
        // cancel executes interrupt1 immediately; hit starts on the next tick.
        // Natural removal retires silently, with no separate effect allocation.
      }else visual.update(position);
      if(!visual.alive)this.visuals.delete(b);
    }
    for(let i=0;i<priorEffectCount;i++)this.effects[i].update();this.effects=this.effects.filter(effect=>effect.alive);
  }
  finishEntity(b:RushEntity){
    const reason=b.destroyReason==='hit'?'hit':cancelReasons.has(b.destroyReason!)?'cancel':'retire';
    const visual=this.visuals.get(b)??(reason==='retire'?null:this.create(b));if(!visual||visual.ending)return;
    visual.setPosition({x:b.x,y:this.yOffset-b.y});
    const state=b.sourceCollision,context=b.ctx?.playerAdapter?.context;
    const effect=visual.finish(reason,{velocity:{x:b.vx/60,y:-b.vy/60,z:0},clockScale:context?.clockScale??1,
      cancelKind:state?.cancelKind??0,frozen:state?.frozen??b.frozen??false});
    if(effect)this.effects.push(effect);
  }
  drawBullet(draw:AnmDrawList,b:RushEntity,view:AnmView,alpha=1){
    const visual=this.visuals.get(b);if(!visual)return false;
    visual.setPosition({x:b.x,y:this.yOffset-b.y});
    visual.draw(draw,view,{scale:b.size/BULLET_STYLES[b.kind].size,rotation:-(b.rotation??0),alpha:(b.alpha??1)*alpha,tint:b.tint});return true;
  }
  drawEffects(draw:AnmDrawList,view:AnmView){
    // frame.cpp keeps the cancelled state4 body in its normal draw group,
    // including the actor's scale. Only the separately spawned cancel ANM
    // below has its own source size; resetting the body to scale1 makes a
    // reduced bullet abruptly grow when its disappearance sprite is drawn.
    for(const visual of this.visuals.values())if(visual.ending)this.drawBullet(draw,visual.b,view);
    for(const effect of this.effects)effect.draw(draw,view);
  }
  snapshot(){return {implementation:'@ts-stg/thlib/touhou TouhouBulletPresentation',types:[...this.usedTypes].sort((a,b)=>a-b),active:this.visuals.size,effects:this.effects.length};}
  dispose(){for(const visual of this.visuals.values())visual.destroy();for(const effect of this.effects)effect.destroy();this.visuals.clear();this.effects.length=0;}
}
