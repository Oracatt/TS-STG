// Portable fixture, also evaluated by native QuickJS. Both demonstrations
// share the class identity, resource data, input frames and ANM view.
import { Keys,DrawList } from '@ts-stg/thlib';
import { TouhouPlayer,TouhouShot,TouhouReimuBomb,TouhouMarisaBomb } from '@ts-stg/thlib/touhou';
import { Th20Player } from '../../games/touhou20/src/player.js';
import { RushBattle } from '../../games/rushboss/src/runtime.js';
export const RESTORED_PLAYER_FRAMES=360;
const phase={key:'restored-player-fixture',hp:1e7,time:1000,spell:true,bonus:100000,
  init(ctx){ctx.boss.x=0;ctx.boss.y=100;ctx.boss.moving=false;}};
export function createRestoredPlayerFixture(resources,{render=true}={}){
  const pilots=[0,1].map(character=>{
    const battle=new RushBattle([phase],{character,seed:5489,invincible:true,resources});battle.phaseFrame=18000;
    const player=battle.sharedPlayer,bank=player.bank?resources.createBank(`pl0${character}`):null,
      effectBank=player.effectBank?resources.createBank('effect'):null;
    const reference=new Th20Player({character,sht:player.sht,bank,effectBank,power:400,lives:2,bombs:3,
      x:0,y:200,seed:5489,bounds:player.bounds,movementInsets:player.movementInsets,respawnX:0,respawnY:200,respawnStartY:280});
    reference.invulnerability.set(90);
    const sound=[],referenceSound=[],context={...battle.playerAdapter.context,sound:(id,x)=>referenceSound.push([id,x]),
      onEvent:()=>{},damageEnemy:()=>{},cancelCircle:()=>{},cancelRectangle:()=>{},spawnItem:()=>{}};
    battle.playerAdapter.context.sound=(id,x)=>sound.push([id,x]);
    return {battle,reference,context,bank,effectBank,sound,referenceSound,
      sawShot:false,sawBomb:false,traces:[],drawFrames:0,drawCommands:0,drawHash:2166136261};
  });
  let frame=0;
  function equal(a,b,label){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Restored demo divergence: ${label}, frame ${frame}`);}
  return {update(){
    if(frame>=RESTORED_PLAYER_FRAMES)return;
    const mask=Keys.SHOOT|(frame>30&&frame<110?Keys.FOCUS:0)|(frame>40&&frame<70?Keys.LEFT:0)|(frame===115?Keys.BOMB:0);
    for(const p of pilots){
      const {battle,reference,context,bank,effectBank}=p;battle.playerAdapter.syncBoss();reference.update(mask,context);battle.update(mask);
      for(const b of [bank,effectBank]){b?.updateDetached();b?.collect();}
      equal(battle.sharedPlayer.snapshot(),reference.snapshot(),'Player state');equal(p.sound,p.referenceSound,'Sound requests');
      p.sawShot||=battle.shots.some(shot=>shot.constructor===TouhouShot);
      const bomb=battle.sharedPlayer.bomb;p.sawBomb||=bomb?.constructor===(battle.character?TouhouMarisaBomb:TouhouReimuBomb);
      if(render){
        const actual=new DrawList(),expected=new DrawList(),view={x:480,y:360,scale:1.5,screenScale:1};
        battle.sharedPlayer.draw(actual,view);reference.draw(expected,view);equal(actual.commands,expected.commands,'Full ANM draw commands');
        p.drawFrames++;p.drawCommands+=actual.commands.length;
        const text=JSON.stringify(actual.commands);for(let i=0;i<text.length;i++)p.drawHash=Math.imul(p.drawHash^text.charCodeAt(i),16777619)>>>0;
      }
      if([0,31,69,110,115,155,205,300,359].includes(frame))p.traces.push({frame:frame+1,player:battle.sharedPlayer.snapshot(),bossHp:battle.boss.hp});
    }
    frame++;
  },render(){return [];},snapshot(){return {frames:frame,complete:frame===RESTORED_PLAYER_FRAMES,
    comparisons:pilots.map(p=>({classIdentity:Th20Player===TouhouPlayer&&p.battle.sharedPlayer.constructor===Th20Player,
      shotDataIdentity:p.battle.sharedPlayer.sht===p.reference.sht,
      animationDataIdentity:p.battle.sharedPlayer.bank?.data===p.reference.bank?.data,
      stateFrames:frame,drawFrames:p.drawFrames,drawCommands:p.drawCommands,drawHash:p.drawHash.toString(16),
      sawShot:p.sawShot,sawBomb:p.sawBomb,soundEvents:p.sound.length,shotsPerPattern:p.battle.sharedPlayer.sht.patterns.map(p=>p.length),
      traces:p.traces,final:p.battle.snapshot()}))};}};
}
