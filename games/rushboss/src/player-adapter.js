// SPDX-License-Identifier: GPL-3.0-only
// Rush coordinates and Boss events around the shared restored player. Weapon,
// option, Bomb, deathbomb and respawn rules are owned entirely by thlib.
import { Keys } from '@ts-stg/thlib';
import { TouhouPlayer, TouhouItems, TouhouGrazeEffects, TouhouRNG, TouhouHealth, TouhouDamageAccumulator, TouhouSpell, createTouhouResources } from '@ts-stg/thlib/touhou';
import { rushTouhouBulletStyle } from './bullet-visuals.js';

function sourceFacade(player,yOffset=0) {
  const facade={};
  const movementParameters=player.sht.speeds.slice(0,2).map(speed=>speed*60);
  for(const [key,target]of Object.entries({life:'lives',bombs:'bombs',power:'power',state:'state'}))Object.defineProperty(facade,key,{
    enumerable:true,get:()=>player[target],set:value=>key==='power'?player.setPower(value):player[target]=value,
  });
  Object.defineProperties(facade,{
    x:{enumerable:true,get:()=>player.x,set:value=>player.setPosition(value,player.y)},
    y:{enumerable:true,get:()=>yOffset-player.y,set:value=>player.setPosition(player.x,yOffset-value)},
    radius:{enumerable:true,get:()=>player.focused?player.focusRadius:player.normalRadius,
      set:value=>{player.normalRadius=player.focusRadius=value;}},
    invulnerable:{enumerable:true,get:()=>player.invulnerability.current,set:value=>player.invulnerability.set(value)},
    vx:{enumerable:true,get:()=>player.motionX/128*60},
    vy:{enumerable:true,get:()=>-player.motionY/128*60},
    deathbomb:{enumerable:true,get:()=>player.state===4?Math.max(0,player.deathbombFrames-player.timer.current):0,
      set:value=>{if(value>0){player.state=4;player.timer.set(player.deathbombFrames-value);}else if(player.state===4)player.state=1;}},
    respawning:{enumerable:true,get:()=>player.state===2?Math.max(1,30-player.timer.current):player.state===0?Math.max(1,60-player.timer.current):0,
      set:value=>{if(value>0){player.state=0;player.timer.set(60-value);}else if(player.state===0||player.state===2)player.state=1;}},
    shotFrame:{enumerable:true,get:()=>player.shootTimer.current},
  });
  for(const [key,index]of [['moveSpeed',0],['slowMoveSpeed',1]])Object.defineProperty(facade,key,{
    enumerable:true,get:()=>movementParameters[index],set:value=>{
      // Business fog changes a movement parameter; the shared Player still
      // performs fixed-point movement and preserves its SHT diagonal ratio.
      const ratio=player.sht.speeds[index+2]/player.sht.speeds[index];
      movementParameters[index]=value;
      player.speeds[index]=Math.trunc(Math.fround(value/60)*128);
      player.speeds[index+2]=Math.trunc(Math.fround(value/60*ratio)*128);
    },
  });
  return facade;
}

export class RushPlayerAdapter {
  constructor(battle,{character=0,practice=false,seed=0,resources=null}={}) {
    this.battle=battle;const shared=resources??createTouhouResources();
    this.yOffset=battle.playerYOffset??0;
    this.resources={...shared,banks:Object.fromEntries(Object.entries(shared.banks).map(([name,bank])=>
      [name,bank?shared.createBank(name):null]))};
    const banks=this.resources.banks;
    this.player=new TouhouPlayer({character,sht:this.resources.shots[character],bank:character?banks.pl01:banks.pl00,
      effectBank:banks.effect,x:0,y:battle.portrait?400:200,power:battle.portrait&&!practice?100:400,lives:practice?7:2,bombs:battle.portrait&&!practice?2:3,seed,
      ...(battle.portrait?{}:{bounds:{x:-320,y:-240,width:640,height:480},movementInsets:{left:8,top:8,right:8,bottom:8},
        respawnX:0,respawnY:200,respawnStartY:280})});
    this.player.invulnerability.set(90);if(!battle.portrait)this.player.collectLine=128-200;this.facade=sourceFacade(this.player,this.yOffset);
    this.proxy={x:0,y:this.yOffset-250,alive:true,radius:20,invulnerable:false};
    this.stats={grazes:0,misses:0,bombsUsed:0};
    this.health=new TouhouHealth();
    this.damage=new TouhouDamageAccumulator({player:this.player});
    // The no-texture simulation still runs exactly the same spell rules.
    this.headlessSpell=new TouhouSpell({player:this.player,difficulty:battle.difficulty,stage:{sunny:1,monstone:2,artia:3}[battle.bossKey]??1});
    this.context={enemies:[this.proxy],enemyReady:true,clockScale:1,timerRate:1,
      get dialogue(){return battle.dialogue;},
      // FrontInf's source collecting flag is dialogue presence, not a Boss
      // defeat/phase-transition shortcut. Other attraction rules stay in Items.
      get bossCollecting(){return battle.dialogue;},
      sound:(id,x=0)=>this.resources.audio?.request(id,x),stopSound:id=>this.resources.audio?.stop(id),
      onEvent:(event,data)=>this.emit(event,data),
      hudNotice:(type,value)=>battle.onHudNotice?.(type,value),
      spell:{notifyBombStart:()=>this.notifySpell('notifyBombStart'),notifyPlayerHit:()=>this.notifySpell('notifyPlayerHit'),
        notifyPlayerMiss:()=>this.notifySpell('notifyPlayerMiss')},
      damageEnemy:(enemy,amount,source)=>this.damage.add(enemy,amount,source),
      applyEnemyDamage:(_enemy,amount,source)=>battle.damage(amount,source),
      cancelCircle:(x,y,radius,options)=>this.cancelBullets(x,y,radius,options),
      cancelRectangle:(x,y,width,height,angle,options)=>this.cancelRectangle(x,y,width,height,angle,options),
      spawnItem:item=>this.items.spawn(item,this.context),enqueueGraze:effect=>this.grazeEffects.enqueue(effect),
      addScore:amount=>{battle.score+=Math.max(0,Math.floor(amount));},
      finishLasers:()=>battle.projectiles.finishLasers(),
    };
    this.items=new TouhouItems({player:this.player,bank:banks.bullet,effectBank:banks.effect,difficulty:battle.difficulty,context:this.context});
    this.headlessSpell.context={...this.context,addScore:()=>{}};
    this.grazeEffects=new TouhouGrazeEffects({rng:new TouhouRNG(seed^0x5a5a5a5a)});
    if(this.resources.audio)this.resources.audio.panRange=battle.portrait?192:320;
  }
  get spell(){return this.battle.presentation?.shared?.spell??this.headlessSpell;}
  preparePhase(phase){this.damage.clear();this.health.set(phase.hp,false);}
  beginPhase(phase) {
    this.damage.clear();this.health.set(phase.hp,!!phase.spell);
    if(!this.battle.presentation.shared){
      this.headlessSpell.destroy();
      if(phase.spell)this.headlessSpell.begin({id:phase.cardId??phase.number??0,name:phase.name??'',duration:Math.round(phase.time*60),survival:!!phase.survival});
    }
  }
  notifySpell(method) {
    if(!this.battle.phase?.spell||!this.spell.active)return false;
    return this.spell[method]();
  }
  endPhase({reason}) {
    this.damage.clear();
    if(!this.battle.phase?.spell||!this.spell.active)return null;
    return reason==='timeout'?this.spell.timeout():this.spell.capture();
  }
  syncBoss() {
    const battle=this.battle,boss=battle.boss,proxy=this.proxy;
    proxy.x=boss.x;proxy.y=this.yOffset-boss.y;proxy.alive=boss.alive;
    proxy.invulnerable=!boss.alive||!boss.checking||boss.invulnerable||boss.immuneDamage||
      !!battle.phase?.survival||!!battle.transition||!!battle.dying||!battle.combatActive;
  }
  emit(event,data) {
    if(event==='hudNotice')this.battle.onHudNotice?.(data.type,data.value);
    if(event==='bomb')this.stats.bombsUsed++;
    if(event==='gameover')this.battle.gameOver=true;
    this.syncStatistics();
  }
  syncStatistics() {
    this.stats.misses=this.player.deaths;this.stats.grazes=this.player.graze;
    this.battle.statistics.misses=this.stats.misses;this.battle.statistics.bombs=this.stats.bombsUsed;
    this.battle.graze=this.player.graze;
  }
  cancelBullets(x,y,radius,options={}) {
    return this.battle.projectiles.cancel(x,y,radius,0,0,true,options);
  }
  cancelRectangle(x,y,width,height,angle,options={}) {
    return this.battle.projectiles.cancel(x,y,width,height,angle,false,options);
  }
  receiveHit() {return this.battle.combatActive&&!this.battle.invincible&&this.player.hit(this.context);}
  addGraze(bullet) {
    const style=rushTouhouBulletStyle(this.resources,bullet,this.battle.portrait);
    const color=style?.cancelType===6?style.colors[style.color][4]:0xffd08080;
    this.player.addGraze(this.context,{x:bullet.x,y:this.yOffset-bullet.y},color);this.syncStatistics();
  }
  update(mask=0) {
    if(!this.battle.combatActive)mask&=~(Keys.SHOOT|Keys.BOMB);
    this.syncBoss();this.player.update(mask,this.context);this.items.update(this.context);this.syncStatistics();
  }
  afterBulletUpdate() {
    this.syncBoss();
    if(!this.player.bomb?.alive)this.spell.flags&=~0x20;
    this.damage.flush({...this.context,spell:this.spell});
    this.grazeEffects.update(this.context);
    for(const bank of Object.values(this.resources.banks))if(bank){bank.updateDetached();bank.collect();}
  }
  draw(draw,view) {this.player.draw(draw,view);this.items.draw(draw,view);this.grazeEffects.draw(draw,view);}
  get shots(){return this.player.shots;}
  get bombRemaining(){const bomb=this.player.bomb;return bomb?.alive?Math.max(1,(this.player.character?300:240)-bomb.timer.current):0;}
  snapshot(){return {implementation:'@ts-stg/thlib/touhou TouhouPlayer/TouhouShot/TouhouReimuBomb/TouhouMarisaBomb',
    ...this.player.snapshot(),shotCount:this.shots.length,bombRemaining:this.bombRemaining,items:this.items.items.length};}
  dispose(){this.damage.clear();this.headlessSpell.destroy();for(const bank of Object.values(this.resources.banks))bank?.dispose();this.grazeEffects.clear();}
}
