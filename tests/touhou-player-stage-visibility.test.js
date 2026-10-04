import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {DrawList,Keys} from '@ts-stg/thlib';
import {TouhouPlayer,createTouhouResources,TOUHOU_PLAYER_DATA} from '@ts-stg/thlib/touhou';

function vm(name,parent=null){
  return{name,parent,alive:true,children:[],ticks:0,events:[],
    interrupt(label,recursive=false){this.events.push([label,recursive]);if(recursive)for(const child of this.children)child.interrupt(label,true);},
    update(){this.ticks++;for(const child of this.children)child.update();},
    draw(output){output.push(name);for(const child of this.children)child.draw(output);},
    destroy(){this.alive=false;}};
}
function record(player){return Object.fromEntries(['character','fixedX','fixedY','x','y','power','lives','bombs','score','pointValue',
  'pointItems','lifeFragments','bombFragments','extendCount','deaths','graze','collisionPercent'].map(key=>[key,player[key]]));}
const optional={skip:!existsSync('packages/thlib/assets/touhou-common/manifest.json')||process.env.TS_STG_TEST_STATIC_ASSETS==='1'};

test('stage cover retains the source player update and draw callbacks while options retract',optional,()=>{
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
  const p=new TouhouPlayer({sht:resources.shots[0],bank:resources.createBank('pl00'),x:0,y:360,power:400});
  try{
    for(let frame=0;frame<30;frame++)p.update(Keys.SHOOT);
    const shot=p.shots.at(-1);assert.ok(shot);const shotTime=shot.timer.current,shotY=shot.y;
    const nextShotId=p.nextShotId,frame=p.frame,time=p.timer.current,option=p.options[0].animation;
    const persistent=[p.power,p.lives,p.bombs,p.score],optionStartX=p.options[0].fixedX;
    let bombsDestroyed=0;p.bomb={destroy(){bombsDestroyed++;}};
    assert.equal(p.finishStageVisibility(),p);p.finishStageVisibility();
    assert.equal(bombsDestroyed,1);assert.equal(option.pendingInterrupt,3);
    const context={enemyReady:false,dialogue:true};
    p.updateStageVisibility(0,context);
    const expectedOptionX=optionStartX+Math.trunc(Math.imul(p.fixedX-optionStartX,30)/100);
    assert.equal(p.options[0].fixedX,expectedOptionX,'source option_frame targets the player center while retracting');
    for(let step=1;step<20;step++){
      p.updateStageVisibility(Keys.RIGHT|Keys.SHOOT|Keys.BOMB,context);
      const submitted=[],draw={enqueuePriority(_priority,submit){submit(this);},enqueueAnm(animation){submitted.push(animation);}};
      p.drawStageVisibility(draw);assert.ok(submitted.includes(p.animation),`cover frame${step}: visible body`);
      assert.equal(p.bomb,null);assert.equal(p.nextShotId,nextShotId);
    }
    assert.ok(p.x>0);assert.equal(p.frame,frame+20);assert.equal(p.timer.current,time+20);
    assert.ok(shot.timer.current>shotTime);assert.notEqual(shot.y,shotY,'old shots keep moving during cover');
    assert.deepEqual([p.power,p.lives,p.bombs,p.score],persistent);
    assert.equal(option.scaleX,0);assert.equal(p.animation.alive,true);
    const animationTime=p.animation.time;p.drawStageVisibility(new DrawList());assert.equal(p.animation.time,animationTime);
  }finally{p.bank.dispose();resources.dispose();}
});

test('resetForStage clears stage shots and focus without replacing persistent resources, position or banks',()=>{
  const p=new TouhouPlayer({character:1,sht:TOUHOU_PLAYER_DATA[1],x:-23.75,y:321.5,power:300,lives:5,bombs:4});
  Object.assign(p,{score:123456,pointValue:76543,pointItems:17,lifeFragments:2,bombFragments:1,extendCount:3,deaths:4,graze:55,collisionPercent:87});
  const expected=record(p),rng=p.rng,bank=p.bank,focus=vm('focus');p.focusEffect=focus;
  const shot={destroyed:0,destroy(){this.destroyed++;}};p.shots.push(shot);p.laserGroups.set(1,{});
  p.timer.set(100);p.focusTimer.set(150);p.shootTimer.set(8);p.secondaryShootTimer.set(25);p.shotGate.set(99);p.invulnerability.set(42);
  p.state=4;p.normalRadius=99;p.focusRadius=98;p.speeds.fill(0);p.collectSpeed=0;p.collectRadius=0;p.attractRadius=0;p.collectLine=0;p.deathbombFrames=3;
  p.finishStageVisibility();assert.equal(p.resetForStage(),p);
  assert.deepEqual(record(p),expected);assert.equal(p.rng,rng);assert.equal(p.bank,bank);
  assert.equal(p.stageVisibility,false);assert.equal(p.state,1);assert.equal(p.timer.current,0);assert.equal(p.focusTimer.current,0);
  assert.equal(p.invulnerability.current,42,'source reset does not clear timers_2050[0]');
  assert.deepEqual([p.shootTimer.current,p.secondaryShootTimer.current,p.shotGate.current],[-1,-1,0]);
  assert.equal(shot.destroyed,1);assert.equal(p.shots.length,0);assert.equal(p.laserGroups.size,0);assert.equal(focus.alive,false);assert.equal(p.focusEffect,null);
  assert.equal(p.options.filter(option=>option.active).length,3);
  assert.deepEqual([p.collectSpeed,p.collectRadius,p.attractRadius,p.collectLine,p.normalRadius,p.focusRadius,p.deathbombFrames],[5,30,70,128,3,3,8]);
  assert.deepEqual(p.speeds,p.sht.speeds.map(speed=>Math.trunc(Math.fround(speed*128))));
  assert.ok(p.history.every(point=>point.x===p.fixedX&&point.y===p.fixedY));
});

test('both original option presets shrink for20 frames during cover and restore with source interrupt2',optional,()=>{
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
  try{
    for(const character of [0,1]){
      const p=new TouhouPlayer({character,sht:resources.shots[character],bank:resources.createBank(`pl0${character}`),power:400});
      for(let frame=0;frame<30;frame++)p.update();
      const option=p.options[0].animation,full=p.options[0].fullAnimation,body=p.animation;
      let bodyTicks=0;const advanceBody=body.update.bind(body);body.update=()=>{bodyTicks++;return advanceBody();};
      const sourceScale=option.scaleX,fullScale=full.scaleX;
      p.finishStageVisibility();
      for(let frame=1;frame<=20;frame++){
        p.updateStageVisibility();
        const expected=(1-frame/20)**2;
        assert.ok(Math.abs(option.scaleX-sourceScale*expected)<1e-6,`character${character} option frame${frame}`);
        assert.ok(Math.abs(full.scaleX-fullScale*expected)<1e-6,`character${character} full frame${frame}`);
        assert.equal(p.animation,body);assert.equal(bodyTicks,frame,'body ANM keeps advancing once per cover frame');
      }
      assert.equal(option.scaleX,0);assert.equal(full.scaleX,0);assert.equal(body.alive,true);
      const draw=new DrawList();p.drawStageVisibility(draw);assert.ok(draw.commands.length>0);
      p.restoreStageVisibility();assert.equal(option.pendingInterrupt,2);assert.equal(full.pendingInterrupt,2);
      p.update();assert.ok(option.scaleX>0);assert.ok(full.scaleX>0);assert.equal(p.stageVisibility,false);
      p.bank.dispose();
    }
  }finally{resources.dispose();}
});

test('source option retirement at movement frame30 preserves the body and reset restores options',optional,()=>{
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
  try{
    for(const character of [0,1]){
      const p=new TouhouPlayer({character,sht:resources.shots[character],bank:resources.createBank(`pl0${character}`),power:400});
      for(let frame=0;frame<30;frame++)p.update();
      p.finishStageVisibility();for(let frame=0;frame<29;frame++)p.update();
      assert.equal(p.options.filter(option=>option.active).length,4);
      p.update();assert.equal(p.options.filter(option=>option.active).length,0);
      assert.equal(p.animation.alive,true);assert.equal(p.state,1);
      const old=p.options[0].animation;
      for(let frame=0;frame<20;frame++)p.update();
      assert.equal(old.alive,false,'registered event1 tail finishes after gameplay option retirement');
      const position=[p.x,p.y];p.resetForStage();assert.deepEqual([p.x,p.y],position);
      assert.equal(p.options.filter(option=>option.active).length,4);assert.equal(p.stageVisibility,false);
      p.bank.dispose();
    }
  }finally{resources.dispose();}
});

test('restoring visibility after option gameplay retirement still executes the independent ANM event2',optional,()=>{
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
  try{
    for(const character of [0,1]){
      const p=new TouhouPlayer({character,sht:resources.shots[character],bank:resources.createBank(`pl0${character}`),power:400});
      for(let frame=0;frame<30;frame++)p.update();
      p.finishStageVisibility();for(let frame=0;frame<30;frame++)p.update();
      const option=p.options[0],animation=option.animation;
      assert.equal(option.active,false);p.restoreStageVisibility();p.update();
      assert.ok(animation.scaleX>0,'event2 restarts the still registered option ANM');
      assert.equal(option.active,false,'restore does not invent a source gameplay activation; reset/refresh owns it');
      const submitted=[],draw={enqueuePriority(_priority,submit){submit(this);},enqueueAnm(vm){submitted.push(vm);}};
      p.draw(draw);assert.ok(submitted.includes(animation),'animation registration is independent of option.active');
      p.bank.dispose();
    }
  }finally{resources.dispose();}
});

test('option ANM continues while the player is in deathbomb and death states',optional,()=>{
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
  try{
    for(const character of [0,1]){
      const p=new TouhouPlayer({character,sht:resources.shots[character],bank:resources.createBank(`pl0${character}`),power:400});
      for(let frame=0;frame<30;frame++)p.update();
      const animation=p.options[0].animation;
      let ticks=0;const advance=animation.update.bind(animation);animation.update=()=>{ticks++;return advance();};
      p.hit();p.update();assert.equal(p.state,4);assert.equal(ticks,1,'decision window keeps registered ANM ticking');
      p.beginDeath({});p.update();assert.equal(p.state,2);assert.equal(ticks,2,'inactive option consumes death event1');
      assert.equal(animation.pendingInterrupt,0);p.bank.dispose();
    }
  }finally{resources.dispose();}
});

test('body drawing uses the current position before the first update of a new stage',optional,()=>{
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1});
  const p=new TouhouPlayer({sht:resources.shots[0],bank:resources.createBank('pl00')});
  try{
    p.setPosition(135,321.5);const time=p.animation.time;
    p.draw(new DrawList());assert.deepEqual([p.animation.x,p.animation.y],[135,321.5]);
    assert.equal(p.frame,0);assert.equal(p.animation.time,time,'render cannot compensate with an extra simulation step');
  }finally{p.bank.dispose();resources.dispose();}
});
