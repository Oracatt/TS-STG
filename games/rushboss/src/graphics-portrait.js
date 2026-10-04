// SPDX-License-Identifier: GPL-3.0-only
// The business layer supplies Rush stage and Boss artwork and a music skin.
// ANM, player, HUD, spell rings, opening, distortion and animation order are thlib.
import {SpriteAtlas} from '@ts-stg/thlib';
import {AnmBank,TouhouRenderQueue,TouhouGameplayCompositor,TouhouTitleBackground,TouhouMusicCaption,TOUHOU_OWNER_PRIORITIES} from '@ts-stg/thlib/touhou';
import {createRushArtworkAssets} from './artwork-assets.js';
import {RushBossArtwork,RUSH_BOSS_ARTWORK} from './boss-artwork.js';
import {RushStageArtwork} from './stage-artwork.js';
import {drawRushBossSpellPortrait} from './boss-portraits.js';
import {RushMusic} from './music.js';

export const RUSH_PORTRAIT_VIEW=Object.freeze({x:336,y:24,scale:1.5,screenScale:1});
export const RUSH_PORTRAIT_VIEWPORT=Object.freeze({x:48,y:24,width:576,height:672});
export const RUSH_PORTRAIT_ACTORS=Object.freeze(Object.fromEntries(Object.entries(RUSH_BOSS_ARTWORK).map(([key,value])=>[key,value.texture])));
const originalEffects=new Set(['maple','laserFog','freezingFog','death']);
const sx=x=>336+x*1.5,sy=y=>360-y*1.5;

export class RushPortraitGraphics {
  constructor(host,resources,options={}){
    this.host=host;this.resources=resources;this.options=options;this.disposed=false;
    this.queue=new TouhouRenderQueue();this.background=host.createRenderTarget(960,720);
    this.compositeTarget=host.createRenderTarget(960,720);
    this.compositor=new TouhouGameplayCompositor({renderTarget:this.background,compositeTarget:this.compositeTarget,viewport:RUSH_PORTRAIT_VIEWPORT});
    this.titleTarget=host.createRenderTarget(960,720);this.title=new TouhouTitleBackground({textureId:this.titleTarget});
    const titleDraw=this.title.draw.bind(this.title);
    this.title.draw=(draw,...args)=>{
      titleDraw(draw,...args);
      resources.font.draw(draw,'Touhou Rush Boss',{x:398,y:68,font:7,scaleX:.88,color:0xff302048,shadowColor:0xb0ffffff});
      return draw;
    };
    const basePath='packages/thlib/assets/reference-common';
    this.atlas=new SpriteAtlas(JSON.parse(host.readText(`${basePath}/manifest.json`)),host,{basePath});
    this.atlasCache=new Map();this.materials=new Set();this.currentBattle=null;
    this.artworkAssets=createRushArtworkAssets(host);
    this.bossArtwork=new RushBossArtwork(this.artworkAssets,{view:RUSH_PORTRAIT_VIEW});
    this.stageArtwork=new RushStageArtwork(this.artworkAssets,{viewport:RUSH_PORTRAIT_VIEWPORT,canvasWidth:960,canvasHeight:720,host});
    this.lastFrame=-1;this.bodyTickCount=0;
    const archive=JSON.parse(host.readText('games/rushboss/assets/portrait/anm/ebg00.json'));
    this.privateTextures=new Set();this.privateBanks=new Map();this.caption=null;
    this.skinAdapter={loadTexture:(...args)=>{const handle=host.loadTexture(...args);this.privateTextures.add(handle);return handle;},unloadTexture:()=>{}};
    this.backgroundBank=new AnmBank(archive,this.skinAdapter);
    this.backgroundVm=this.backgroundBank.create(1);this.backgroundVm.update();
    const titleUpdate=this.title.update.bind(this.title);
    this.title.update=()=>{this.advanceBackground();return titleUpdate();};
    this.title.drawCapture=draw=>this.backgroundVm.draw(draw,{x:0,y:0,scale:1,screenScale:1.5});
    this.manifest=JSON.parse(host.readText('games/rushboss/assets/portrait/manifest.json'));
    this.audio=JSON.parse(host.readText('games/rushboss/assets/manifest.json')).music;
    this.musicPlayer=new RushMusic(host,this.audio,{volume:this.options.musicVolume??.7});
  }
  get musicHandles(){return this.musicPlayer.handles;}
  get currentMusic(){return this.musicPlayer.current;}
  get musicKey(){return this.musicPlayer.key;}
  playMusic(key,options={}){
    if(!this.audio[key])key=key==='title'?'title':key==='gamestart'?'gamestart':key==='riverside'?'riverside':key==='frozenforest'?'frozenforest':'grassland';
    return this.musicPlayer.play(key,options);
  }
  pauseMusic(){this.musicPlayer.pause();}
  resumeMusic(){this.musicPlayer.resume();}
  stopMusic(){this.musicPlayer.stop();}
  setMusicVolume(value){this.musicPlayer.setVolume(value);this.options.musicVolume=value;}
  fadeMusic(seconds=2){return this.musicPlayer.fadeOut(seconds);}
  updateMusic(){this.musicPlayer.update();}
  skinBank(name){
    if(!this.privateBanks.has(name))this.privateBanks.set(name,new AnmBank(JSON.parse(this.host.readText(this.manifest.archives[name].path)),this.skinAdapter));
    return this.privateBanks.get(name);
  }
  showMusicCaption(text){
    this.caption?.destroy();this.caption=null;
    if(!text)return;
    const host=this.host.rasterizeBitmapText&&this.host.encodeText?this.host:null;
    this.caption=new TouhouMusicCaption({text:`BGM. ${text}`,host,codePage:936});
  }
  createTitleBackground(){return this.title;}
  advanceBackground(){this.backgroundVm.update();this.backgroundBank.updateDetached();this.backgroundBank.collect();}
  advanceStageBackground(){this.stageArtwork.tickStage();this.stageArtwork.updateMatrix();}
  updateBodies(battle){
    if(this.currentBattle!==battle){
      // A dialogue may emit its music caption before the first rendered frame.
      // disposeBattle already cleared the old stage; first attachment must not
      // destroy the new stage's freshly created announcement.
      if(this.currentBattle!==null)this.clearBattle();this.currentBattle=battle;
    }
    if(this.lastFrame===battle.frame)return;this.lastFrame=battle.frame;
    this.bodyTickCount++;
    this.bossArtwork.update(battle);
    this.stageArtwork.setStage(battle.bossKey);
    this.stageArtwork.update({frame:battle.frame,battle});
    this.caption?.update();if(this.caption&&!this.caption.alive)this.caption=null;
    for(const bank of this.privateBanks.values()){bank.updateDetached();bank.collect();}
  }
  drawBossPortrait(draw,name,{x,y,width,height,color=0xffffffff,view=RUSH_PORTRAIT_VIEW,clip=true}){
    const size=this.artworkAssets.size(name),s=(view.scale??1)*(view.screenScale??1);
    const left=(view.x??0)+x*s-width*s/2,top=(view.y??0)+y*s-height*s/2,w=width*s,h=height*s;
    if(!(w>0&&h>0))return draw;
    const v=RUSH_PORTRAIT_VIEWPORT,l=clip?Math.max(left,v.x):left,t=clip?Math.max(top,v.y):top,
      r=clip?Math.min(left+w,v.x+v.width):left+w,b=clip?Math.min(top+h,v.y+v.height):top+h;
    if(r<=l||b<=t)return draw;
    // Crop the UVs instead of changing the compositor's active scissor state.
    const texture=this.artworkAssets.texture(name);
    draw.sampler(texture,'bilinear','clamp','clamp').alphaTest(0)
      .blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add');
    draw.spriteRegion(texture,(l-left)/w*size.width,(t-top)/h*size.height,(r-l)/w*size.width,(b-t)/h*size.height,
      (l+r)/2,(t+b)/2,r-l,b-t,0,color).blendEnd();return draw;
  }
  material(name){
    this.materials.add(name);let result=this.atlasCache.get(name);
    if(!result){const sprite=this.atlas.getSprite(name);result={sprite,texture:this.atlas.texture(sprite.texture)};this.atlasCache.set(name,result);}
    return result;
  }
  entity(draw,actor,battle,alpha=1){
    if(actor.kind==='laser'||actor.visualKind==='laserPart')return; // The public laser field owns geometry and rendering.
    if(battle.bulletVisuals.drawBullet(draw,actor,RUSH_PORTRAIT_VIEW,alpha))return;
    if(actor.visualKind==='monstone'){
      this.bossArtwork.draw(draw,actor,battle,{key:'monstone',alpha});return;
    }
    if(actor.visualKind==='afterimage'){
      const fade=(actor.alpha??1)*Math.max(0,1-actor.frame/actor.lifetime)*alpha;
      if(actor.source==='player'){
        const vm=battle.sharedPlayer.animation;if(!vm)return;
        const x=vm.x,y=vm.y,saved=vm.alpha;
        vm.x=actor.x;vm.y=224-actor.y;vm.alpha=Math.floor(saved*fade);vm.draw(draw,RUSH_PORTRAIT_VIEW);
        vm.x=x;vm.y=y;vm.alpha=saved;
      }else if(['sunny','monstone','artia','Monstone'].includes(actor.source)){
        // Boss trails have their source lifetime/pose and are drawn once at 28.
        return;
      }else{
        // An afterimage borrows the original bullet's current common ANM.
        const source=[...battle.bulletVisuals.visuals.values()].find(v=>v.b.kind===actor.source);
        if(!source)return;const vm=source.animation,x=vm.x,y=vm.y,saved=vm.alpha;
        vm.x=actor.x;vm.y=224-actor.y;vm.alpha=Math.floor(saved*fade);vm.draw(draw,RUSH_PORTRAIT_VIEW);
        vm.x=x;vm.y=y;vm.alpha=saved;
      }
    }
  }
  draw(draw,battle,{hud=null,hideHudNumbers=false,stageClear=null,stageTransition=null}={}){
    this.updateBodies(battle);const queue=this.queue.reset(),view=RUSH_PORTRAIT_VIEW;
    queue.enqueuePriority(11,target=>this.stageArtwork.drawSpell(target));
    battle.presentation.draw(queue);
    this.caption?.draw(queue);
    const bossVisible=battle.presentation.shared?.bossVisible!==false&&!battle.boss.hidden&&battle.boss.alive;
    if(bossVisible){
      battle.presentation.shared.drawBody(queue,target=>{
        this.bossArtwork.drawTrails(target,battle);
        this.bossArtwork.draw(target,battle.boss,battle);
      });
    }
    queue.enqueuePriority(63,target=>drawRushBossSpellPortrait(target,this,battle,view));
    if(stageTransition?.phase==='cover')battle.sharedPlayer.drawStageVisibility(queue,view);
    else battle.playerAdapter.draw(queue,view);
    for(const actor of battle.world.entities){
      if(!actor.alive||originalEffects.has(actor.visualKind)||actor.visualKind==='shadow'||actor.visualKind==='shake')continue;
      if(actor.group==='bullet'&&battle.bulletVisuals.visuals.has(actor)){
        this.entity(queue,actor,battle);
      }
      else if(actor.kind==='laser'||actor.visualKind==='laserPart')continue;
      else if(actor.visualKind==='monstone')battle.presentation.shared.drawBody(queue,target=>this.entity(target,actor,battle));
      else if(actor.visualKind==='afterimage'&&!['sunny','monstone','artia','Monstone'].includes(actor.source))
        queue.enqueuePriority(actor.source==='player'?29:39,target=>this.entity(target,actor,battle));
    }
    battle.bulletVisuals.drawEffects(queue,view);
    battle.projectiles.draw(queue,view);
    const player=battle.sharedPlayer;player.score=Math.trunc(battle.score/10);
    if(hud)hud.draw(queue,player,{hideNumbers:hideHudNumbers});
    stageClear?.draw(queue);
    stageTransition?.draw(queue);
    for(const [name,bank]of Object.entries(battle.touhouResources.banks))bank?.drawDetached(queue,name==='front'?{x:0,y:0,scale:1,screenScale:1.5}:view);
    this.compositor.draw(draw,queue,{
      cameraOffset:battle.presentation.shared?.cameraOffset,
      drawBackground:target=>this.stageArtwork.drawStage(target),
      drawDistortion:(target,texture)=>battle.presentation.drawDistortion(target,texture),
    });
    this.lastBattle=battle;return draw;
  }
  snapshot(){return{implementation:'original thlib portrait with private RushBoss artwork',viewport:RUSH_PORTRAIT_VIEWPORT,
    actorScripts:RUSH_PORTRAIT_ACTORS,bodyTicks:this.bodyTickCount,commonMaterials:[...this.materials].sort(),
    rushArtwork:this.artworkAssets.snapshot().names,artworkAssets:this.artworkAssets.snapshot(),
    background:this.stageArtwork.snapshot(),bossArtwork:this.bossArtwork.snapshot(),
    spellBackground:this.currentBattle?.presentation?.shared?.spell?.active?
      `${this.currentBattle.bossKey}:${this.currentBattle.phaseIndex}`:null,music:this.musicKey,musicCaption:this.caption?.snapshot()??null,
    player:this.lastBattle?.playerAdapter.snapshot()??null,boss:this.lastBattle?.presentation.snapshot()??null};}
  clearBattle(){
    this.caption?.destroy();this.caption=null;this.bossArtwork.reset();this.stageArtwork.reset();
    this.currentBattle=null;this.lastBattle=null;this.lastFrame=-1;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.clearBattle();this.bossArtwork.destroy();this.stageArtwork.destroy();this.backgroundBank.dispose();
    this.artworkAssets.dispose();
    this.atlas.dispose();this.atlasCache.clear();
    for(const bank of this.privateBanks.values())bank.dispose();this.privateBanks.clear();
    for(const handle of this.privateTextures)this.host.unloadTexture?.(handle);this.privateTextures.clear();
    this.musicPlayer.dispose();
    this.host.unloadTexture?.(this.background);this.host.unloadTexture?.(this.compositeTarget);this.host.unloadTexture?.(this.titleTarget);
  }
}
