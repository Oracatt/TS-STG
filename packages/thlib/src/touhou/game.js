import { DrawList } from '../index.js';
import { Keys } from '../index.js';
import { TouhouPlayer } from './player.js';
import { TouhouBulletField } from './bullets.js';
import { TouhouHud } from './hud.js';
import { TouhouEnemy } from './enemy.js';
import { TouhouEnemyDistortion } from './distortion.js';
import { TouhouButtons } from './menu.js';
import { TouhouPause } from './pause.js';
import { TouhouLaserField } from './lasers.js';
import { TouhouSpell } from './spell.js';
import { TouhouGrazeEffects } from './short-line.js';
import { TouhouItems } from './items.js';
import { TouhouRNG } from './math.js';
import { TouhouDamageAccumulator } from './damage.js';
import { TouhouGameOver } from './game-over.js';
import { TouhouRenderQueue } from './render-queue.js';
import { TouhouBossHud } from './boss-hud.js';
import { TouhouBossPresentation } from './boss-presentation.js';
import { TouhouBossDefeat, TOUHOU_BOSS_DEFEAT_PRESET } from './boss-defeat.js';
import { TouhouGameplayCompositor } from './gameplay-compositor.js';

export const TOUHOU_GAME_VIEW=Object.freeze({x:336,y:24,scale:1.5,screenScale:1});
export const TOUHOU_VIEWPORT=Object.freeze({x:48,y:24,width:576,height:672});

/** Common original systems composition. Platform resources, stage and callbacks
 * are injected; no Node, browser, native globals or fixed boss scripts. */
export class TouhouGame {
  constructor({banks,font,sht,styles,character=0,difficulty=1,power=100,stage=null,
    renderTarget=null,compositeTarget=null,renderBackground,onSound,onStopSound,onEvent,onExit,onRestart,onReplay,onOptions,onManual,pauseBackground,pauseCapture,itemsFactory,
    seed=1,rng=new TouhouRNG(seed),visualRng=new TouhouRNG(seed),spellOptions={},spellContext={},session={},gameOverOptions={},
    view=TOUHOU_GAME_VIEW,viewport=TOUHOU_VIEWPORT,disposeBanks=false,onDestroy,bossPresentationOptions={}}={}) {
    Object.assign(this,{banks,font,difficulty,stage,renderTarget,renderBackground,onSound,onStopSound,onEvent,onExit,onRestart,onReplay,onOptions,onManual,pauseBackground,pauseCapture});
    this.rng=rng;this.visualRng=visualRng;this.view=view;this.viewport=viewport;this.disposeBanks=disposeBanks;this.onDestroy=onDestroy;this.destroyed=false;
    this.session={difficulty,stage:1,mode:0,continues:0,...session};this.gameOverOptions=gameOverOptions;this.pendingGameOver=false;
    this.player=new TouhouPlayer({character,sht,bank:character?banks.pl01:banks.pl00,effectBank:banks.effect,power,rng});
    this.player.score=0;this.player.lifeFragments=0;this.player.bombFragments=0;
    this.bullets=new TouhouBulletField({bank:banks.bullet,styles,random:rng,visualRandom:visualRng});
    this.lasers=new TouhouLaserField({bank:banks.bullet,styles});
    this.grazeEffects=new TouhouGrazeEffects({rng:visualRng});
    this.hud=new TouhouHud({bank:banks.front,textBank:banks.ascii_960,font,character,difficulty,lives:this.player.lives,bombs:this.player.bombs});
    this.bossHud=banks.ascii_960?new TouhouBossHud({bank:banks.front,textBank:banks.ascii_960,font,pointer:this.hud.roots[1],managePointer:false}):null;
    this.bossHudState={};
    this.enemies=[];this.bossDefeats=[];this.nextEnemyId=1;this.frame=0;this.buttons=new TouhouButtons();this.paused=false;this.pauseVisual=null;
    this.drawList=new DrawList();this.renderQueue=new TouhouRenderQueue();this.distortion=null;this.effects=[];this.stageVisible=true;
    this.compositor=new TouhouGameplayCompositor({renderTarget,compositeTarget,viewport,scale:view.scale??1.5});
    this.items=itemsFactory?itemsFactory(this.player,banks):new TouhouItems({player:this.player,bank:banks.bullet,effectBank:banks.effect,rng,difficulty});
    this.context={enemies:this.enemies,player:this.player,effectBank:banks.effect,deferEnemyContact:true,deferEnemyDamageFeedback:true,clockScale:1,timerRate:1,
      sound:(id,x)=>this.onSound?.(id,x),onEvent:(name,data)=>{if(name==='gameover')this.pendingGameOver=true;this.onEvent?.(name,data);},
      stopSound:id=>this.onStopSound?.(id),
      spawnItem:item=>this.items?.spawn(item),
      // Original mode 1 requests stone item 13, deliberately excluded; mode 4 may request a point item 2.
      spawnCancelItem:(position,kind,parameters)=>kind!==13&&typeof parameters==='object'
        ?this.items?.spawn({type:kind,...position,...parameters}):null,
      cancelCircle:(x,y,radius,options={})=>
        (options.bullets===false?0:this.bullets[options.nearby?'cancelNearbyCircle':'cancelCircle'](x,y,radius,{...options,dropMode:options.dropMode??(options.reward?1:0)}))+
        (options.lasers===false?0:this.lasers.cancelCircle(x,y,radius,options)),
      cancelRectangle:(x,y,width,height,angle,options={})=>
        (options.bullets===false?0:this.bullets.cancelRectangle(x,y,width,height,angle,{...options,dropMode:options.dropMode??(options.reward?1:0)}))+
        (options.lasers===false?0:this.lasers.cancelRectangle(x,y,width,height,angle,options)),
      finishLasers:()=>{for(const laser of this.lasers.lasers)this.lasers.erase(laser);},
      damageEnemy:(enemy,amount,source)=>enemy===this.context.boss&&this.bossPresentation&&(!this.bossPresentation.entranceReady||!this.bossPresentation.combatActive)?0:this.damage.add(enemy,amount,source),
      deferEnemyDefeat:(enemy,source)=>enemy===this.context.boss?!!this.beginBossDefeat(enemy,{source}):false,
      presentEnemyDeath:enemy=>(enemy===this.context.boss||this.bossDefeats.some(entry=>entry.enemy===enemy))&&!!this.bossPresentation,
      enqueueGraze:effect=>this.grazeEffects.enqueue(effect),
      setStageVisible:visible=>{this.stageVisible=visible;},
      hudNumberInterrupt:label=>{for(const vm of this.bossHud?.numbers??[])vm.interruptNow(label);},
      hudNotice:(type,value)=>this.hud.notice(type,value,{spell:this.spell}),
      createNameAnimation:banks.text?.environment.createNameAnimation,
      ...spellContext,
    };
    this.spell=new TouhouSpell({player:this.player,textBank:banks.ascii_960,effectBank:banks.effect,font,difficulty,context:this.context,...spellOptions});
    // The application and an embedded Boss encounter share the same original
    // presentation prefab. Game already ticks the adopted spell/HUD once.
    this.bossPresentation=this.bossHud?new TouhouBossPresentation({banks,player:this.player,font,
      visualRng:this.visualRng,...bossPresentationOptions,view,spell:this.spell,hud:this.bossHud,context:this.context,manageSpell:false,manageHud:false}):null;
    this.damage=new TouhouDamageAccumulator({player:this.player,spell:this.spell});
    this.context.spell=this.spell;if(this.items)this.items.context=this.context;
    this.bullets.player=this.player;this.bullets.context=this.context;
    this.lasers.player=this.player;this.lasers.context=this.context;
  }
  spawnEnemy(options){const enemy=new TouhouEnemy({id:this.nextEnemyId++,bank:this.banks.enemy,...options});this.enemies.push(enemy);return enemy;}
  enterBoss(boss,{entrance,...options}={}){
    if(!this.bossPresentation)throw new Error('Original Boss presentation requires the common ascii_960 ANM bank');
    if(this.context.boss!==boss)this.bossHudState={};
    this.context.boss=boss;this.bossPresentation.enter(boss,options);
    if(entrance)this.bossPresentation.beginEntrance(entrance);
    return this.bossPresentation;
  }
  setBoss(boss,options={}){if(boss)return this.enterBoss(boss,options);this.context.boss=null;this.bossHudState={};this.bossPresentation?.clearBoss();return null;}
  /** Presentation metadata only. A phase plan may supply healthBars and stars;
   * stage callbacks retain control of attacks, dialogue and phase progression. */
  setBossHud(state={}){Object.assign(this.bossHudState,state);return this;}
  startBossCombat(){this.bossPresentation?.startCombat();return this;}
  stopBossCombat(){this.bossPresentation?.stopCombat();return this;}
  /** Final defeat keeps the body and card alive through the source clearing
   * wave. A stage can start dialogue synchronously from the bossburst event.
   * Ordinary phase handoffs remain the stage's responsibility. */
  beginBossDefeat(enemy=this.context.boss,{source=null,...options}={}){
    if(this.destroyed||!enemy?.alive)return null;
    const existing=this.bossDefeats.find(entry=>entry.enemy===enemy);
    if(existing)return existing.sequence;
    // Validate this facade's public parameters before retiring enemies or
    // locking the Boss. The sequence constructor validates too, but creates
    // its first clearing event synchronously, after scene ownership is set.
    const {delayFrames=TOUHOU_BOSS_DEFEAT_PRESET.delayFrames,speed=TOUHOU_BOSS_DEFEAT_PRESET.speed,angle}=options;
    const finite=value=>typeof value==='number'&&Number.isFinite(Math.fround(value));
    if(![enemy.x,enemy.y,enemy.z??0,speed].every(finite)||(angle!==undefined&&!finite(angle)))
      throw new TypeError('Boss defeat coordinates, angle and speed must be finite float32 values');
    if(!Number.isSafeInteger(delayFrames)||delayFrames<0||speed<0)
      throw new RangeError('Boss defeat requires nonnegative speed and integer delayFrames');
    const entry={enemy,source,sequence:null,spell:this.spell.active?this.spell:null,spellIndex:this.spell.spellIndex};
    this.bossDefeats.push(entry);
    enemy.invulnerable=true;enemy.primaryFlags|=0x13;
    enemy.hitThisFrame=false;enemy.animation.flashColor=null;
    // ECL525 removes ordinary enemies without invoking their death rewards.
    for(const other of this.enemies)if(other!==enemy&&other.alive&&!this.bossDefeats.some(record=>record.enemy===other)){
      other.alive=false;other.animation.destroy();
    }
    for(const charge of this.bossPresentation?.charges??[])charge.stop();
    entry.sequence=new TouhouBossDefeat({...options,x:enemy.x,y:enemy.y,z:enemy.z??0,rng:this.rng,
      sound:this.context.sound,
      cancelCircle:this.context.cancelCircle,
      clearAll:()=>{
        for(const bullet of this.bullets.bullets)if(bullet.state)this.bullets.cancel(bullet,0);
        for(const laser of this.lasers.lasers)if(laser.alive)this.lasers.erase(laser,{check:false});
      },
      onMove:position=>{
        enemy.x=position.x;enemy.y=position.y;
        if(enemy.motion?.position)Object.assign(enemy.motion.position,position);
        Object.assign(enemy.animation,position);
      },
      onBurst:sequence=>{
        // delayFrames:0 invokes this during construction. Publish the owner
        // before callbacks can inspect the scene, replace it or destroy it.
        entry.sequence=sequence;
        if(entry.spell?.active&&entry.spell.spellIndex===entry.spellIndex)entry.spell.capture(this.context);
        if(this.destroyed)return;
        enemy.defeat(source,{...this.context,deferEnemyDefeat:undefined});
        if(this.destroyed)return;
        this.bossPresentation?.beginDeath({...sequence.position,follow:null,delayFrames:0});
        if(this.destroyed)return;
        this.context.onEvent?.('bossburst',{enemy,source,sequence});
      }});
    if(this.destroyed)entry.sequence.destroy();
    return entry.sequence;
  }
  beginSpell(options={}){const boss=options.boss===undefined?this.context.boss??null:options.boss;if(boss){this.enterBoss(boss);this.startBossCombat();}else this.setBoss(null);boss?.health?.set?.(boss.hp,true);return this.spell.begin({...options,boss},this.context);}
  postFrame(nowSeconds){return this.spell.postFrame(nowSeconds,this.context);}
  openGameOver(mask=0){
    this.pendingGameOver=false;this.paused=true;
    this.pauseCapture?.capture();
    this.pauseVisual=new TouhouGameOver({bank:this.banks.front,font:this.font,player:this.player,session:this.session,
      sound:id=>this.onSound?.(id,0),onExit:this.onExit,onRestart:this.onRestart,initialMask:mask,
      drawBackground:this.pauseCapture?(draw=>this.pauseCapture.draw(draw)):undefined,...this.gameOverOptions,
      onContinue:data=>{this.pauseCapture?.destroy();this.player.continues=this.session.continues;this.player.highScore=this.session.highScore;this.paused=false;this.gameOverOptions.onContinue?.(data);}});
  }
  setDistortion(center,options={}){this.distortion={center,effect:new TouhouEnemyDistortion(options)};return this.distortion.effect;}
  update(mask=0){
    if(this.destroyed)return;
    this.buttons.update(mask);
    if(!this.paused&&(this.buttons.pressed&Keys.PAUSE)&&this.frame>29){
      this.paused=true;this.pauseVisual=new TouhouPause({bank:this.banks.front,initialMask:mask,continues:this.player.continues??0,
        sound:id=>this.onSound?.(id,0),onResume:()=>{this.paused=false;},onExit:this.onExit,onRestart:this.onRestart,
        onReplay:this.onReplay,onOptions:this.onOptions,onManual:this.onManual,drawBackground:this.pauseBackground,capture:this.pauseCapture});return;
    }
    if(this.paused){this.pauseVisual.update(mask);if(this.pauseVisual instanceof TouhouGameOver)this.pauseCapture?.update();if(!this.pauseVisual.active)this.paused=false;return;}
    // Existing source helper actors run before projectile movement. A defeat
    // created by this frame's damage pass starts advancing on the next frame.
    const defeats=this.bossDefeats.slice();
    this.stage?.(this,this.frame);
    if(this.destroyed)return;
    for(const entry of defeats){entry.sequence?.update();if(this.destroyed)return;}
    this.bossDefeats=this.bossDefeats.filter(entry=>entry.sequence?.alive);
    for(const enemy of this.enemies){
      if(this.bossDefeats.some(entry=>entry.enemy===enemy)){
        for(const effect of enemy.effects)effect.update();enemy.effects=enemy.effects.filter(effect=>effect.alive);
        enemy.animation.x=enemy.x;enemy.animation.y=enemy.y;enemy.animation.update();
      }else enemy.update(this.context);
    }
    this.player.update(mask,this.context);for(const enemy of this.enemies)if(enemy!==this.context.boss||!this.bossPresentation||this.bossPresentation.entranceReady&&this.bossPresentation.combatActive)enemy.collidePlayer?.(this.player,this.context);
    this.bullets.update(this.player,this.context);this.lasers.update(this.player,this.context);
    this.damage.flush(this.context);for(const enemy of this.enemies)if(!this.bossDefeats.some(entry=>entry.enemy===enemy))enemy.finishDamageFeedback?.(this.context);this.items?.update(this.context);
    this.spell.update(this.context);if(this.spell.active&&this.spell.remaining<=0&&!this.bossDefeats.length)this.spell.timeout(this.context);this.grazeEffects.update(this.context);
    this.enemies=this.enemies.filter(enemy=>enemy.alive||enemy.effects.length);this.context.enemies=this.enemies;
    this.bossPresentation?.update({boss:this.context.boss??null,clockScale:this.context.clockScale});
    this.bossHud?.update({...this.bossHudState,dialogue:!!this.bossHudState.dialogue||!this.bossPresentation?.combatActive,bosses:this.context.boss&&this.bossPresentation?.bossVisible!==false?[this.context.boss]:[],player:this.player,spell:this.spell,
      remainingFrames:this.spell.active?this.spell.remaining:-1,sound:this.context.sound});
    this.hud.update(this.player);
    if(this.distortion){const center=typeof this.distortion.center==='function'?this.distortion.center(this):this.distortion.center;this.distortion.effect.update(center);}
    for(const bank of new Set(Object.values(this.banks))){bank.updateDetached?.();bank.collect?.();}
    this.frame++;
    if(this.pendingGameOver)this.openGameOver(mask);
  }
  render(){
    const draw=this.drawList.reset(),queue=this.renderQueue.reset(),view=this.view;
    draw.clear(0x000000ff);
    this.spell.draw(queue,view,this.bossPresentation?.screenView);
    this.bossPresentation?.drawAura(queue);
    this.bossPresentation?.drawEntrance(queue);
    this.bossPresentation?.drawCharge(queue);
    this.bossPresentation?.drawDeath?.(queue);
    for(const enemy of this.enemies)if(enemy!==this.context.boss||this.bossPresentation?.bossVisible!==false)enemy.draw(queue,view);
    this.items?.draw(queue,view);
    this.player.draw(queue,view);this.bullets.draw(queue,view);
    this.lasers.draw(queue,view);
    this.grazeEffects.draw(queue,view);
    for(const [name,bank] of Object.entries(this.banks))bank.drawDetached?.(queue,name==='front'?{x:0,y:0,scale:1,screenScale:1.5}:view);
    this.hud.draw(queue,this.player,{hideNumbers:this.paused});
    if(this.bossHud){this.bossHud.state.paused=this.paused;this.bossHud.draw(queue,this.bossPresentation?.screenView);}
    this.compositor.draw(draw,queue,{
      cameraOffset:this.bossPresentation?.cameraOffset,
      drawBackground:this.stageVisible&&this.renderBackground?(target=>this.renderBackground(target,this)):undefined,
      drawDistortion:(target,texture)=>{
        if(this.distortion){
          target.sampler(texture,'bilinear','clamp','clamp').blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add');
          this.distortion.effect.draw(target,texture,{scale:view.scale??1.5});target.blendEnd();
        }else this.bossPresentation?.drawDistortion(target,texture,{scale:view.scale??1.5});
      },
    });
    if(this.paused)this.pauseVisual.draw(draw);
    return draw.commands;
  }
  snapshot(){return {frame:this.frame,paused:this.paused,pause:this.paused?this.pauseVisual?.snapshot():null,session:{...this.session},player:this.player.snapshot(),enemies:this.enemies.map(enemy=>enemy.snapshot()),bossDefeats:this.bossDefeats.map(entry=>({enemyId:entry.enemy.id,...entry.sequence.snapshot()})),bullets:this.bullets.snapshot(),lasers:this.lasers.snapshot(),items:this.items?.snapshot?.()??null,spell:this.spell.snapshot(),rng:this.rng.state,visualRng:this.visualRng.state};}
  destroy(){if(this.destroyed)return;this.destroyed=true;for(const entry of this.bossDefeats)entry.sequence?.destroy();this.bossDefeats.length=0;this.damage.clear();this.pauseVisual?.destroy();this.pauseCapture?.destroy();this.bossPresentation?.destroy();this.spell.destroy();this.grazeEffects.clear();this.bossHud?.destroy();this.hud.destroy();for(const bank of new Set(Object.values(this.banks))){for(const vm of bank.instances)vm.destroy();if(this.disposeBanks)bank.dispose();}this.onDestroy?.(this);}
}
