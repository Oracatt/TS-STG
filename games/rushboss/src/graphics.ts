// SPDX-License-Identifier: GPL-3.0-only
import type {NativeHost,SpritePackSprite} from '@ts-stg/thlib';
import type {AnmDrawList as DrawList} from '@ts-stg/thlib/touhou';
import type {RushBattle,RushEntity} from './runtime.js';
import type {BossKey,Point} from './types.js';
import type {RushActor} from './ui-types.js';
import type {RushAssets} from './assets.js';
// Source-derived Boss/Spell presentation, consuming thlib's generic drawing ABI.
import { SpriteAtlas, rgba, withAlpha } from '@ts-stg/thlib';
import { TouhouRenderQueue } from '@ts-stg/thlib/touhou';
import { BULLET_STYLES, bulletSprite, COLORS16 } from './bullet-styles.js';
import { screenX, screenY, SOURCE_SCALE as S } from './assets.js';
const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n));
const tint=(value:number|number[]|null,alpha=1)=>Array.isArray(value)?rgba(value[0]*255,value[1]*255,value[2]*255,alpha*255):withAlpha(0xffffffff,alpha);
const BG={sunny:'sunnymilk',monstone:'monstone',artia:'artia'};
const cutin:Record<BossKey,[string,number,number]>={sunny:['src_sunny_ct',383,448],monstone:['src_monstone_ct',476,404],artia:['src_artiaface_ct',270,480]};
const WARP_COLORS=[[1,.5,.5],[.5,1,.5],[.5,.5,1],[1,1,.5],[1,.5,1],[.5,1,1]];
const isPresentationEffect=(b:RushEntity)=>b.group==='effect'||b.visualKind==='freezingFog';
const warpParameters=(boss:RushActor,frame:number,warpFrame:number,colorKey:number)=>({cx:(320+boss.x*.8)/640,cy:(240-boss.y*.8)/480,
  limit:warpFrame<=20?100+(28-100)*Math.pow(warpFrame/20,.3):28,clock:frame/60/3.5,weights:WARP_COLORS[colorKey]});
function warpSample(u:number,v:number,params:ReturnType<typeof warpParameters>,out:{u:number;v:number;cost:number[]}) {
  const dx=(u-params.cx)*640/480,dy=v-params.cy,distance=dx*dx+dy*dy;
  out.u=u;out.v=v;
  const c=out.cost;
  if(distance>.25){c[0]=c[1]=c[2]=0;return out;}
  const r=Math.sqrt(distance),wave=Math.max(0,.03-.003*r*params.limit),phase=params.clock-r;
  const a=.3*Math.sin(phase*40),s=Math.sin(phase*20),len=s*s*wave,cost=1.8*Math.pow(wave/.03,1.5);
  out.u=u+len*Math.cos(a);out.v=v-len*Math.sin(a);
  c[0]=Math.min(1,params.weights[0]*cost);c[1]=Math.min(1,params.weights[1]*cost);c[2]=Math.min(1,params.weights[2]*cost);
  return out;
}

// Legacy Rush shader oracle only. Production uses thlib's original 17×17 mesh.
export function rushWarp(u:number,v:number,boss:RushActor,frame:number,warpFrame=20,colorKey=0) {
  return warpSample(u,v,warpParameters(boss,frame,warpFrame,colorKey),{u,v,cost:[0,0,0]});
}

export class RushGraphics {
 declare assets:RushAssets;declare commonCache:Map<string,{sprite:SpritePackSprite;texture:number}>;declare usedCommon:Set<string>;declare usedFallback:Set<string>;declare lastPlayer:RushBattle['sharedPlayer']|undefined;declare lastBulletVisuals:RushBattle['bulletVisuals']|undefined;declare lastPresentation:RushBattle['presentation']|null;
  declare host: NativeHost;
  declare atlas: SpriteAtlas;
  declare queue: TouhouRenderQueue;
  declare playerView: { scale: number; x: number; y: number; screenScale: number; };
  declare background: number;

  constructor(host:NativeHost,assets:RushAssets) {
    this.host=host;this.assets=assets;
    const basePath='packages/thlib/assets/reference-common';
    this.atlas=new SpriteAtlas(JSON.parse(host.readText(`${basePath}/manifest.json`)),host,{basePath});
    this.queue=new TouhouRenderQueue();this.playerView={scale:S,x:480,y:360,screenScale:1};
    this.background=host.createRenderTarget(960,720);
    this.usedCommon=new Set();this.usedFallback=new Set();this.commonCache=new Map();
  }
  common(draw:DrawList,name:string,x:number,y:number,w:number,h:number,angle=0,color=0xffffffff) {
    // Source animations may shrink exactly to zero on their last visible tick.
    if(w===0||h===0)return;
    this.usedCommon.add(name);
    let resolved=this.commonCache.get(name);
    if(!resolved){const sprite=this.atlas.getSprite(name);resolved={sprite,texture:this.atlas.texture(sprite.texture)};this.commonCache.set(name,resolved);}
    const s=resolved.sprite;
    draw.spriteRegion(resolved.texture,s.x,s.y,s.width,s.height,screenX(x),screenY(y),w*S,h*S,-angle,color>>>0);
  }
  animatedBoss(draw:DrawList,boss:RushActor,battle:RushBattle,alpha=1,t:number|number[]|null=null,which=battle.bossKey) {
    // Character.cpp translates the unit sprite locally, before its world scale.
    const localBob=Math.fround(.05*Math.sin(battle.frame/60*4)),height=which==='artia'?74:64;
    const bob=Math.fround(localBob*height),x=boss.x,y=Math.fround(boss.y+bob);
    let frame=Math.floor(battle.frame/7)%4,row=0,flip=false;
    if(boss.moving||boss.vx!){row=1;frame=3+Math.floor(battle.frame/7)%3;flip=boss.vx!<0;}
    const color=t?tint(t,alpha):withAlpha(0xffffffff,alpha);
    if(which==='monstone'){const c=boss.vx!<0?1:boss.vx!>0?2:0;this.assets.region(draw,'src_monstone',[c*64,0,64,64],x,y,64,64,0,color);}
    else if(which==='sunny'){
      if(boss.animationIndex===5){frame=2;row=2;}
      else if(row===1)frame=1+Math.floor(battle.frame/7)%3;
      this.assets.region(draw,'src_sunnymilk',[frame*96,row*96,96,96],x,y,flip?-64:64,64,0,color);
    }else this.assets.region(draw,'src_artia',[frame*96,row*111,96,111],x,y,flip?-64:64,74,0,color);
  }
  player(draw:DrawList,battle:RushBattle,pos:Point=battle.player,alpha=1) {
    const vm=battle.sharedPlayer.animation;if(!vm)return;
    const previous=vm.alpha;vm.alpha=Math.floor(previous*alpha);
    vm.draw(draw,{...this.playerView,x:480+(pos.x-battle.sharedPlayer.x)*S,y:360+(-pos.y-battle.sharedPlayer.y)*S});vm.alpha=previous;
  }
  bullet(draw:DrawList,b:Pick<RushEntity,'kind'|'color'|'size'|'rotation'|'x'|'y'|'alpha'|'frame'>,alpha=1) {
    const s=BULLET_STYLES[b.kind];if(!s)return;
    const name=bulletSprite(b.kind,b.color),size=b.size??s.size,rotation=b.rotation??0;
    if(name)this.common(draw,name,b.x,b.y,size,size,rotation,withAlpha(0xffffffff,alpha*b.alpha));
    else {
      // Solid hearts and animated flames are absent from the common visual pack.
      const c=((b.color%s.colors)+s.colors)%s.colors,frame=Math.floor(b.frame/2)%4;
      const region:[number,number,number,number]=b.kind==='XinDan'?[c*32,0,32,32]:[(c%2)*128+frame*32,128+Math.floor(c/2)*32,32,32];
      this.usedFallback.add(b.kind);this.assets.region(draw,s.texture!,region,b.x,b.y,size,size,rotation,withAlpha(0xffffffff,alpha*b.alpha));
    }
  }
  fog(draw:DrawList,b:RushEntity) {
    const progress=1-b.delay/Math.max(1,b.initialDelay),s=(b.size??32)*(4-3*progress);
    this.common(draw,'effect.charge',b.x,b.y,s,s,0,withAlpha(0xffffffff,progress));
  }
  entity(draw:DrawList,b:RushEntity,battle:RushBattle) {
    if(battle.bulletVisuals.drawBullet(draw,b,this.playerView))return;
    if(b.delay>0){this.fog(draw,b);return;}
    if(b.visualKind==='monstone'){this.animatedBoss(draw,b,battle,b.alpha,b.tint,'monstone');return;}
    if(b.kind==='laser'){
      if(b.curve)return;
      const x=b.x+Math.cos(b.angle)*b.length*.5,y=b.y+Math.sin(b.angle)*b.length*.5;
      const name=`laser.straight.${COLORS16[((b.color%16)+16)%16]}`;
      this.common(draw,name,x,y,b.length,2*Math.max(0,b.width),b.angle);return;
    }
    if(b.visualKind==='laserPart'){
      const fade=Math.max(0,Math.min(1,b.frame/b.animFrames!,(b.lifetime!-b.frame)/b.animFrames!));
      const name=`bullet-small.${String(352+((b.color%16)+16)%16).padStart(3,'0')}`;
      this.common(draw,name,b.x,b.y,Math.max(0,b.width*Math.pow(fade,.3)),Math.max(0,b.sizeY!),b.angle,withAlpha(0xffffffff,b.alpha));return;
    }
    if(b.group==='bullet'){this.bullet(draw,b);return;}
    const kind=b.visualKind,age=b.frame;
    if(!kind||kind==='shadow'||kind==='shake')return;
    if(kind==='afterimage'){
      const a=b.alpha*(1-age/b.lifetime!);
      if(b.source==='player')this.player(draw,battle,b,a);
      else if(b.source==='artia'||b.source==='sunny'||b.source==='monstone'||b.source==='Monstone')this.animatedBoss(draw,b,battle,a,b.tint,b.source==='Monstone'?'monstone':b.source);
      else this.bullet(draw,{...b,kind:b.source!,alpha:a},1);
    }else if(kind==='freezingFog'){
      this.usedFallback.add('freezingFog');this.assets.sprite(draw,'src_fog',b.x,b.y,b.scale!,b.scale!,0,rgba(0,255,255,clamp(b.alpha,0,1)*255));
    }else if(kind==='maple'){
      // The common effect151..164 owners submit their ANMs to the shared queue.
    }else if(kind==='laserFog'){
      const p=b.follow??b,fade=age<15?age/15:age>(b.frames??120)?Math.max(0,1-(age-(b.frames??120))/15):1;
      this.common(draw,'effect.charge',p.x,p.y,(b.scale??50)*fade,(b.scale??50)*fade,0,withAlpha(0xffffffff,fade));
    }else if(kind==='death')this.common(draw,'effect.death-ring.blue',b.x,b.y,age*8,age*8,0,withAlpha(0xffffffff,1-age/b.lifetime!));
    else this.common(draw,'effect.charge',b.x,b.y,b.scale??64,b.scale??64,age*.02,withAlpha(0xffffffff,b.alpha??1));
  }
  textureFill(draw:DrawList,name:string,u0=0,v0=0,us=1,vs=1,color=0xffffffff) {
    const texture=this.assets.texture(name);draw.sampler(texture,'anisotropic4x','wrap','wrap');
    draw.mesh(texture,[[0,0,u0,v0,color],[960,0,u0+us,v0,color],[0,720,u0,v0+vs,color],[960,720,u0+us,v0+vs,color]],[0,1,2,1,3,2]);
  }
  drawBackground(draw:DrawList,battle:RushBattle) {
    const key=BG[battle.bossKey];
    draw.targetBegin(this.background,0x000000ff);
    const texture=battle.bossKey==='sunny'?'src_grassland':battle.bossKey==='monstone'?'src_river_ground':'src_forest1';
    draw.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','one','add');
    this.textureFill(draw,texture,0,battle.frame/900,1,1,0x8793b3ff);draw.rect(0,0,960,720,0x07112f65);draw.blendEnd();
    for(const card of battle.presentation.cards){const f=card.age,fade=card.alpha;if(fade<=0)continue;
      draw.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','one','add');
      if(battle.bossKey==='sunny'){
        draw.rect(0,0,960,720,withAlpha(0x000000ff,fade));
        this.textureFill(draw,'src_sunnymilk_cdbg2',0,.125,1,.75,withAlpha(0xffffffff,fade));
        draw.blendEnd();draw.blendFactors('srcAlpha','one','add','one','one','add');this.textureFill(draw,'src_sunnymilk_cdbg1',card.scroll,0,2.4,1.8,withAlpha(0xffffffff,card.overlayAlpha));draw.blendEnd();
      }else{
        this.textureFill(draw,`src_${key}_cdbg1`,0,0,1,1,withAlpha(0xffffffff,fade));
        draw.blendEnd();draw.blendFactors('srcAlpha','one',battle.bossKey==='artia'?'reverseSubtract':'add','one','one','add');
        this.textureFill(draw,`src_${key}_cdbg2`,battle.bossKey==='artia'?0:card.scroll,card.scroll,battle.bossKey==='artia'?2.5:2.4,battle.bossKey==='artia'?1.6:1.8,withAlpha(0xffffffff,card.overlayAlpha));
        draw.blendEnd();
      }
    }
    draw.targetEnd();
    draw.sprite(this.background,480,360,960,720);
    battle.presentation.drawDistortion(draw,this.background);
  }
  lifeBar(draw:DrawList,battle:RushBattle) {
    battle.presentation.shared?.hud.draw(draw,battle.presentation.shared.screenView);
  }
  draw(draw:DrawList,battle:RushBattle,options?:{focused?:boolean}):DrawList;
  draw(draw:DrawList,battle:RushBattle) {
    this.lastPresentation=battle.presentation;
    draw.reset().clear(0x03091aff);this.drawBackground(draw,battle);draw.alphaTest(.01);
    const p=battle.player;
    const queue=this.queue.reset(),view=this.playerView;
    battle.presentation.draw(queue);
    queue.enqueuePriority(29,target=>this.animatedBoss(target,battle.boss,battle));
    battle.playerAdapter.draw(queue,view);
    for(const layer of [1,3,4,5]){
      queue.enqueuePriority(layer===4?38:40,target=>{
        // ANM owns standard bullet blend/animation. Application effects retain
        // the Rush source blend around shapes that have no shared ANM entry.
        for(const b of battle.world.entities)if(b.alive&&b.layer===layer&&!isPresentationEffect(b)){
          if((layer===4||layer===1)&&!battle.bulletVisuals.visuals.has(b)){
            target.blendFactors('srcAlpha','one','add','one','one','add');this.entity(target,b,battle);target.blendEnd();
          }else this.entity(target,b,battle);
        }
      });
    }
    // Effect(true) belongs between source highlight bullets (locator12) and
    // ordinary bullets (locator16), independently of the actor's runtime layer.
    for(const b of battle.world.entities)if(b.alive&&isPresentationEffect(b)){
      const kind=b.visualKind;let priority=kind==='maple'||kind==='freezingFog'?39:41;
      if(kind==='shadow'||kind==='shake')continue;
      if(kind==='afterimage')priority=b.source==='player'?29.9:['artia','sunny','monstone'].includes(b.source!)?28.9:BULLET_STYLES[b.source!]?.add?37.9:39.9;
      queue.enqueuePriority(priority,target=>{
        // Shared player ANM/statefulQuad and the source charge renderer own
        // their draw state; wrapping either would create a nested native scope.
        if(kind==='maple'||kind==='afterimage'&&b.source==='player')this.entity(target,b,battle);
        else{const additive=kind==='freezingFog'||kind==='afterimage'&&BULLET_STYLES[b.source!]?.add;
          target.blendFactors('srcAlpha',additive?'one':'oneMinusSrcAlpha','add','one','one','add');this.entity(target,b,battle);target.blendEnd();}
      });
    }
    queue.enqueuePriority(38,target=>battle.bulletVisuals.drawEffects(target,view));
    battle.projectiles.draw(queue,view);
    for(const bank of Object.values(battle.touhouResources.banks))bank?.drawDetached(queue,view);
    queue.flush(draw);this.lastPlayer=battle.sharedPlayer;this.lastBulletVisuals=battle.bulletVisuals;
    this.assets.text(draw,battle.bossKey==='sunny'?'Sunny Milk':battle.bossKey==='artia'?'Artia':'Monstone',-305,232,14);
    const remaining=battle.phases.slice(battle.phaseIndex).filter(p=>p.spell).length;
    for(let i=0;i<remaining;i++)this.common(draw,'bullet.star.yellow',-185+14*i,226,10,10,0);
    for(const entrance of battle.presentation.entrances){
      const c=cutin[entrance.boss],f=entrance.age;
      if(f>0&&f<=90)this.assets.sprite(draw,c[0],entrance.x,entrance.y,c[1],c[2],0,withAlpha(0xffffffff,entrance.cutinAlpha));
    }
    draw.rect(0,687,960,33,0x05101fbb);
    this.assets.text(draw,`PLAYER ${Math.max(0,p.life)}   BOMB ${p.bombs}   GRAZE ${battle.graze}   SCORE ${String(battle.score).padStart(9,'0')}`,-307,-221,13,0xffffffff,'digit');
    draw.alphaTest(0);return draw;
  }
  snapshot(){return{commonSprites:[...this.usedCommon].sort(),
    playerPresentation:{implementation:'@ts-stg/thlib/touhou TouhouPlayer.draw',character:this.lastPlayer?.character,
      bank:this.lastPlayer?.bank?.data.name,effectBank:this.lastPlayer?.effectBank?.data.name,
      bodyScript:this.lastPlayer?.animationScript,options:this.lastPlayer?.options.filter(o=>o.active).length??0,
      shots:this.lastPlayer?.shots.length??0,bomb:this.lastPlayer?.bomb?.constructor.name??null},
    bulletPresentation:this.lastBulletVisuals?.snapshot(),spellPresentation:this.lastPresentation?.snapshot(),fallbacks:[...this.usedFallback].sort(),commonTextures:this.atlas.handles.size,spellCommonTextures:this.lastPresentation?.banks.effect?.textures.size??0};}
  clearBattle(){this.lastPresentation=null;}
  dispose(){this.atlas.dispose();this.commonCache.clear();this.host.unloadTexture(this.background);}
}
