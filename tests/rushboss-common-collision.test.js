import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TouhouBulletField, TouhouPlayer, createTouhouResources, getTouhouPlayerData } from '@ts-stg/thlib/touhou';
import { RushBattle } from '../games/rushboss/src/runtime.js';

const phase={key:'collision-parity',hp:20000,time:1000};
const optional={skip:!fs.existsSync('packages/thlib/assets/touhou-common/manifest.json')||process.env.TS_STG_TEST_STATIC_ASSETS==='1'};
function fixture(x=10,delay=0){
  const resources=createTouhouResources({readText:p=>fs.readFileSync(p,'utf8'),loadTexture:()=>1});
  const battle=new RushBattle([phase],{profile:'portrait',resources}),actual=battle.sharedPlayer;
  actual.setPosition(0,200);actual.invulnerability.set(0);
  const reference=new TouhouPlayer({character:0,sht:getTouhouPlayerData(0),x:0,y:200});reference.invulnerability.set(0);
  const field=new TouhouBulletField({bank:resources.banks.bullet,styles:resources.styles});field.player=reference;
  const [original]=field.emit({type:4,color:1,x,y:200,speed:0,shotSound:-1});
  const adapted=battle.spawn('XiaoYu',{x,y:24},{},1,{delay});
  return {battle,actual,reference,field,original,adapted,dispose(){battle.dispose();resources.dispose();}};
}

test('Marisa rectangular cancellation includes original viewport eligibility, so offscreen bullets produce no cancellation',optional,()=>{
  for(const [x,expected]of [[192,1],[196,1],[196.001,0],[200,0]]){
    const f=fixture(x);f.battle.invincible=true;
    f.adapted.y=124;f.original.y=100;
    assert.equal(f.field.cancelRectangle(x,100,64,64),expected,`original viewport edge ${x}`);
    assert.equal(f.battle.playerAdapter.cancelRectangle(x,100,64,64,0),expected,`external viewport edge ${x}`);
    assert.equal(f.adapted.alive,expected===0);f.dispose();
  }
});

test('Rush collision matches the original field at strict circle tangency even during startup fog',optional,()=>{
  for(const [x,expected] of [[4.875,1],[5,2],[43,2],[43.25,0]])for(const delay of [0,30]){
    const f=fixture(x,delay);
    try{
      assert.equal(f.field.hitTest(f.original),expected);
      f.battle.checkBullet(f.adapted);
      assert.equal(f.actual.state,f.reference.state);
      assert.equal(f.actual.graze,f.reference.graze);
      assert.equal(!f.adapted.alive,f.original.state===3);
      assert.equal(f.adapted.destroyReason,expected===1?'hit':undefined);
    }finally{f.dispose();}
  }
});

test('Rush and original field both graze at ticks0/60/120 and replenish only after60 ticks outside',optional,()=>{
  const f=fixture(),awards=[],referenceAwards=[];
  try{
    const tick=frame=>{
      const before=f.actual.graze,referenceBefore=f.reference.graze;
      f.battle.checkBullet(f.adapted);f.field.hitTest(f.original);
      if(f.actual.graze!==before)awards.push(frame);
      if(f.reference.graze!==referenceBefore)referenceAwards.push(frame);
      assert.equal(f.actual.graze,f.reference.graze,`tick${frame}`);
      const a=f.adapted.sourceCollision,b=f.original;
      assert.deepEqual([a.grazesLeft,a.grazeTimer.current,a.touchingTimer.current,a.outsideTimer.current],
        [b.grazesLeft,b.grazeTimer.current,b.touchingTimer.current,b.outsideTimer.current],`clocks tick${frame}`);
    };
    for(let frame=0;frame<200;frame++)tick(frame);
    assert.deepEqual(awards,[0,60,120]);assert.deepEqual(referenceAwards,awards);
    f.actual.setPosition(160,200);f.reference.setPosition(160,200);
    for(let frame=200;frame<259;frame++)tick(frame);
    assert.equal(f.adapted.sourceCollision.grazesLeft,0);
    tick(259);assert.equal(f.adapted.sourceCollision.grazesLeft,3);
    f.actual.setPosition(0,200);f.reference.setPosition(0,200);tick(260);
    assert.deepEqual(awards,[0,60,120,260]);assert.deepEqual(referenceAwards,awards);
  }finally{f.dispose();}
});
