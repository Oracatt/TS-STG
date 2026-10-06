import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SaveStore,createTouhouResources} from '@ts-stg/thlib';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {BOSSES} from '../games/rushboss/src/catalog.js';
import {RushPortraitApplication,RUSH_PORTRAIT_REPLAY_REVISION} from '../games/rushboss/src/portrait-application.js';

const tick=(owner,count)=>{for(let i=0;i<count;i++)owner.update();};
const entities=b=>b.world.entities.concat(b.world.pending);
const sourceFirstEmission={sunny:{3:180,5:180},monstone:{3:180,5:180,7:180},artia:{3:120,5:240,7:120,9:240,11:240}};
function resourceFixture(){
  let handle=0;
  const host={readText:file=>fs.readFileSync(file,'utf8'),loadTexture:()=>++handle,
    createTexture:()=>++handle,createRenderTarget:()=>++handle,unloadTexture(){}};
  return{host,resources:createTouhouResources(host)};
}

test('all ten original nonspell preparations emit their first real projectile at the source frame on every difficulty',()=>{
  let cases=0;
  for(const spec of BOSSES)for(const [number,first]of Object.entries(sourceFirstEmission[spec.key]))for(let difficulty=0;difficulty<4;difficulty++){
    const index=spec.phases.findIndex(p=>p.number===Number(number));
    const b=new RushBattle(spec.phases,{boss:spec.key,profile:'portrait',spellIndex:index,difficulty,invincible:true});
    try{
      assert.ok(b.phaseTimeline);assert.equal(b.phaseTimeline.frame,0);
      for(let frame=1;frame<first;frame++){
        b.update();assert.equal(b.statistics.spawned,0,`${spec.key}:${number}/${difficulty} emitted before source frame${first} at${frame}`);
        assert.equal(entities(b).some(e=>e.alive&&e.group==='bullet'),false);
        assert.equal(entities(b).some(e=>e.alive&&e.visualKind==='maple'),false,'private warmup must not duplicate the common charge');
      }
      b.update();assert.equal(b.phaseFrame,first);assert.equal(b.phaseTimeline.frame,first);
      assert.ok(b.statistics.spawned>0,`${spec.key}:${number}/${difficulty} must emit on frame${first}`);
      assert.ok(entities(b).some(e=>e.alive&&e.group==='bullet'));
      assert.equal(b.boss.damageInvulnerability.current,0,'ring protection expires no later than the first emission');cases++;
    }finally{b.dispose();}
  }
  assert.equal(cases,40);
});

test('a real capped player damage batch enters the next nonspell immediately, then restores its ring before Sunny attacks',()=>{
  const {resources}=resourceFixture(),b=new RushBattle(BOSSES[0].phases,{boss:'sunny',profile:'portrait',spellIndex:1,resources,invincible:true});
  try{
    const adapter=b.playerAdapter,p=b.sharedPlayer,display=b.presentation.shared,panel=display.hud.panels[0];
    p.state=1;p.timer.set(100);const created=[],create=b.presentation.banks.effect.create.bind(b.presentation.banks.effect);
    b.presentation.banks.effect.create=(script,...args)=>{created.push({script,phase:b.phaseIndex,frame:b.phaseFrame});return create(script,...args);};
    // Keep the real 3000 spell HP and original damage cap/resistance. The final
    // batch triggers the production afterBulletUpdate handoff, not a manual end.
    for(let attempts=0;attempts<600&&b.phaseIndex===1;attempts++){
      adapter.syncBoss();adapter.damage.add(adapter.proxy,100000,{x:b.boss.x,y:224-b.boss.y});b.update();
    }
    assert.equal(b.phaseIndex,2);assert.equal(b.phase.number,3);assert.equal(b.results[0].reason,'defeated');
    assert.equal(b.results.length,1);assert.equal(b.transition,0);assert.equal(b.phaseFrame,0);assert.equal(b.patternFrame,0);
    assert.equal(b.phaseTimeline.frame,0);assert.equal(b.boss.hp,b.boss.maxHp);
    assert.equal(b.boss.damageInvulnerability.current,119,'the same damage pass consumes the first protection tick');
    assert.equal(panel.animations.length,0);assert.equal(b.phaseCharges.length,0,'handoff does not start a blue preparation charge');
    const priorFraction=panel.fraction,spawned=b.statistics.spawned;
    for(let offset=1;offset<=118;offset++){
      b.update();assert.equal(panel.animations.length,0);assert.equal(b.statistics.spawned,spawned);
      assert.equal(entities(b).some(e=>e.alive&&e.visualKind==='maple'),false);
    }
    assert.equal(b.boss.damageInvulnerability.current,1);
    b.update();assert.equal(b.phaseFrame,119);assert.equal(b.boss.damageInvulnerability.current,0);
    assert.equal(panel.animations.length,7);assert.equal(panel.target,1);
    assert.equal(panel.fraction,Math.fround(priorFraction+Math.fround(.025)));
    b.update();assert.ok(created.some(v=>v.script===72&&v.phase===2&&v.frame===120));
    tick(b,59);assert.equal(b.phaseFrame,179);assert.equal(b.statistics.spawned,spawned);assert.equal(panel.fraction,1);
    b.update();assert.equal(b.phaseFrame,180);assert.ok(b.statistics.spawned>spawned);
    assert.ok(created.some(v=>v.script===89&&v.phase===2&&v.frame===180),'the retained attack charge releases with the first bullets');
    assert.equal(created.some(v=>[68,79].includes(v.script)&&v.phase===2),false,'the blue/magenta handoff animation is omitted');
    assert.equal(b.presentation.charges.length,0,'only public source charge cues own this opening');
  }finally{b.dispose();resources.dispose();}
});

test('custom phases are not given source Boss timing merely because their number matches a source row',()=>{
  const phase={key:'consumer-phase',number:3,hp:300,time:10,spell:false,init(b){b.state.updates=[];},update(b,frame){b.state.updates.push(frame);}};
  const b=new RushBattle([phase],{boss:'sunny',profile:'portrait',invincible:true});
  try{assert.equal(b.phaseTimeline,null);assert.equal(b.boss.damageInvulnerability.current,0);tick(b,3);assert.deepEqual(b.state.updates,[1,2,3]);}
  finally{b.dispose();}
});

test('defeating a nonspell during preparation retires its stopped clock-bound charge without a late release',()=>{
  const {resources}=resourceFixture(),b=new RushBattle(BOSSES[0].phases,{boss:'sunny',profile:'portrait',spellIndex:2,resources,invincible:true});
  try{
    tick(b,125);const oldTimeline=b.phaseTimeline,charges=[...b.phaseCharges],attackCharge=charges.at(-1);
    assert.equal(attackCharge.color,'green');assert.equal(attackCharge.released,false);
    b.damage(b.boss.hp+1);assert.equal(b.phaseIndex,3);assert.equal(b.phaseTimeline,null);
    assert.ok(charges.every(charge=>charge.stopped));tick(b,200);
    assert.equal(oldTimeline.frame,125);assert.equal(attackCharge.released,false);
    assert.ok(charges.every(charge=>!charge.alive));
    assert.ok(charges.every(charge=>!b.presentation.shared.charges.includes(charge)));
  }finally{b.dispose();resources.dispose();}
});

test('practice and legacy routes retain the authored pattern startup, and explicit interphase delays still work',()=>{
  for(const options of [{profile:'portrait',practice:true},{profile:'legacy'}]){
    const b=new RushBattle(BOSSES[0].phases,{boss:'sunny',spellIndex:2,invincible:true,...options});
    try{
      assert.equal(b.phaseTimeline,null);assert.equal(b.boss.damageInvulnerability.current,0);
      tick(b,79);assert.equal(b.statistics.spawned,0);b.update();assert.ok(b.statistics.spawned>0);
      assert.ok(entities(b).some(e=>e.alive&&e.visualKind==='maple'),'these paths retain their authored charge');
    }finally{b.dispose();}
  }
  for(const [profile,explicit,delay]of [['portrait',7,7],['legacy',7,7],['legacy',undefined,60]]){
    const phases=[{key:'first',number:2,spell:true,name:'Custom',hp:1,time:100,...(explicit===undefined?{}:{transitionDelay:explicit})},
      {key:'second',number:3,spell:false,hp:100,time:100,init(b){b.state.updates=[];},update(b,f){b.state.updates.push(f);}}];
    const b=new RushBattle(phases,{profile,invincible:true});
    try{
      b.endPhase('defeated');assert.equal(b.transition,delay);assert.equal(b.phaseIndex,0);
      tick(b,delay-1);assert.equal(b.phaseIndex,0);b.update();assert.equal(b.phaseIndex,1);assert.equal(b.phaseFrame,0);
      b.update();assert.deepEqual(b.state.updates,[1]);
    }finally{b.dispose();}
  }
});

test('current replays preserve a timeout handoff and the following source preparation and first emission',()=>{
  const {resources,host}=resourceFixture();
  const graphics={clearBattle(){},draw(draw){draw.clear();},snapshot:()=>({test:true})};
  const app=new RushPortraitApplication(host,{resources,graphics,store:new SaveStore(),startBoss:'sunny',phaseIndex:1,
    mode:'stage',skipDialogue:true,invincible:true,createBattle:(phases,options)=>new RushBattle(
      phases.map((phase,index)=>index===1?{...phase,time:.2}:phase),options)});
  try{
    tick(app,210);assert.equal(app.battle.phaseIndex,2);assert.ok(app.battle.phaseTimeline.attackStarted);assert.ok(app.battle.statistics.spawned>0);
    const expected=app.application.game.snapshot(),data=app.exportReplay();
    assert.equal(RUSH_PORTRAIT_REPLAY_REVISION,17);assert.equal(data.config.revision,17);
    const old=structuredClone(data);old.config.revision=16;assert.throws(()=>app.playReplay(old),/different game revision/);
    app.playReplay(data);tick(app,data.frames);assert.equal(app.playback.desync,null);assert.equal(app.playback.finished,true);
    assert.deepEqual(app.application.game.snapshot(),expected);
  }finally{app.destroy();resources.dispose();}
});
