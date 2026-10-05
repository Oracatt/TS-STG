import test from 'node:test';
import assert from 'node:assert/strict';
import {spellCard,createSpell} from '../examples/spellcard/moonfold.spell.js';
import {validateSpellMetadata} from '../tools/spellcard-editor/metadata.js';
import {TouhouBossCharge} from '../packages/thlib/src/touhou/boss-presentation.js';
import {TouhouRNG} from '../packages/thlib/src/touhou/math.js';
import {touhouStyle} from '../packages/thlib/src/touhou/bullet-patterns.js';
import {TOUHOU_BULLET_STYLES} from '../packages/thlib/src/touhou/bullet-style-data.js';
import {bulletTestBank} from './fixtures/th20-bullet-bank.js';

// These tests inspect the authored program and real public charge ownership.
// The ANM test double is not used to claim movement, collision or visual parity;
// those checks need the actual common assets in the native rehearsal verifier.
function rehearsal(playerAt=()=>({x:-80,y:400})){
  let runner;
  const events=[],charges=[],field=[Object.freeze({owner:'another spell'})];
  const bank=bulletTestBank(),boss={...spellCard.boss,motion:{position:{...spellCard.boss}}},player={x:0,y:400};
  const context={boss,player,random:new TouhouRNG(spellCard.seed),
    bullets:{emit(parameters){
      // Preserve arguments now: source-owned command objects may be reused.
      const value=JSON.parse(JSON.stringify(parameters));
      events.push({kind:'bullet',frame:runner.frame,parameters:value});
      const spawned=Array.from({length:(value.count??1)*(value.rows??1)},()=>Object.freeze({owner:'moonfold'}));
      field.push(...spawned);return spawned;
    },cancel(){throw Error('Stopping this spell must not cancel unrelated field objects');}},
    presentation:{beginCharge(options){
      const owner=new TouhouBossCharge(bank,options);charges.push(owner);
      events.push({kind:'charge',frame:runner.frame,color:options.color,releaseFrame:options.releaseFrame});
      return owner;
    },clearCharges(){throw Error('Stopping this spell must not clear charges owned by other scripts');}},
    sound(id,x){events.push({kind:'sound',frame:runner.frame,id,x});},
    clear(){throw Error('The application owns phase settlement and global cancellation');},
  };
  runner=createSpell(context);
  return{runner,events,charges,field,bank,boss,player,
    step(){
      Object.assign(player,playerAt(runner.frame));runner.update();
      // Stage emission runs before TouhouEnemy.update applies motion.position.
      Object.assign(boss,boss.motion.position);
      for(const charge of charges)charge.update();
    },
    run(frames){for(let i=0;i<frames;i++)this.step();return this;},
    until(predicate){
      while(!predicate(this)&&runner.alive)this.step();
      assert.ok(predicate(this),'expected event must occur before the spell completes');return this;
    },
  };
}

test('Moonfold is a portable JS spell using plain metadata, stock styles and fixed-frame completion',()=>{
  assert.deepEqual(validateSpellMetadata(spellCard),spellCard);
  assert.equal('events' in spellCard,false,'the authored JS owns the pattern');
  const preview=rehearsal().run(spellCard.duration);
  assert.equal(preview.runner.frame,spellCard.duration);assert.equal(preview.runner.alive,false);assert.equal(preview.runner.completed,true);
  const bullets=preview.events.filter(event=>event.kind==='bullet');
  assert.ok(bullets.length>0);assert.ok(preview.runner.snapshot().wave>1);assert.ok(preview.runner.snapshot().locks>1);
  assert.deepEqual([...new Set(bullets.map(event=>event.parameters.type))].sort((a,b)=>a-b),[8,11,15]);
  assert.equal(preview.runner.snapshot().emitted,bullets.length);
  for(const {parameters:p} of bullets){
    assert.ok([p.x,p.y,p.speed,p.angle].every(Number.isFinite));
    assert.ok(touhouStyle(TOUHOU_BULLET_STYLES,p.type,p.color).radius>0);
    assert.equal('radius' in p,false,'the spell must retain each common bullet style hitbox');
    assert.equal('previewOnly' in p,false);assert.equal('protectedFrames' in p,false);
    assert.deepEqual(p.commands,[{type:1,ints:[1]}],'every bullet asks thlib for its normal birth animation');
  }
  const terminal=JSON.stringify(preview.events),snapshot=preview.runner.snapshot();preview.run(90);
  assert.equal(JSON.stringify(preview.events),terminal);assert.deepEqual(preview.runner.snapshot(),snapshot);
});

test('Moonfold moves the Boss through its motion owner',()=>{
  const preview=rehearsal().run(30),firstX=preview.boss.motion.position.x;
  preview.run(30);
  assert.notEqual(preview.boss.motion.position.x,firstX,'the requested motion changes with the attack clock');
  assert.equal(preview.boss.x,preview.boss.motion.position.x);
  assert.equal(preview.boss.y,preview.boss.motion.position.y);
});

test('Moonfold samples the player again at each gold tell, then retains its locked direction and origin',()=>{
  let target={x:-140,y:402};
  const preview=rehearsal(()=>target);
  let previousAngle;
  for(let lock=1;lock<=3;lock++){
    preview.until(p=>p.runner.snapshot().locks===lock);
    const stroke=preview.runner.snapshot().pending.find(event=>event.kind==='ink');
    assert.ok(stroke);assert.ok(stroke.due>=preview.runner.frame,'a tell precedes its attack');
    assert.equal(stroke.angle,Math.fround(Math.atan2(target.y-stroke.y,target.x-stroke.x)));
    if(previousAngle!==undefined)assert.ok(Math.abs(stroke.angle-previousAngle)>.5,'later tells respond to the new position');
    previousAngle=stroke.angle;
    target={x:-target.x,y:402};
    preview.until(p=>p.runner.frame===stroke.due);
    assert.equal(preview.events.filter(event=>event.kind==='bullet'&&event.parameters.type===15&&event.frame===stroke.due).length,0);
    preview.step();
    const burst=preview.events.filter(event=>event.kind==='bullet'&&event.parameters.type===15&&event.frame===stroke.due);
    assert.ok(burst.length>0);
    const angles=burst.map(event=>event.parameters.angle);
    assert.ok(angles.includes(stroke.angle),'the central stroke keeps its sampled angle');
    assert.ok(Math.abs((Math.min(...angles)+Math.max(...angles))/2-stroke.angle)<1e-12);
    assert.ok(Math.abs(stroke.angle-Math.atan2(target.y-stroke.y,target.x-stroke.x))>.5,
      'the delayed attack must not follow movement after its tell');
    assert.ok(burst.some(({parameters:p})=>p.x===stroke.x&&p.y===stroke.y),'the source also remains at the tell position');
    for(const {parameters:p} of burst){
      const dx=p.x-stroke.x,dy=p.y-stroke.y;
      assert.ok(Math.abs(dx*Math.sin(p.angle)-dy*Math.cos(p.angle))<1e-9,'beads stay on the locked stroke');
      assert.ok(dx*Math.cos(p.angle)+dy*Math.sin(p.angle)<=1e-9,'trailing beads start behind the locked source');
    }
  }
});

test('Moonfold stop clears queued attacks and its charges without cancelling other owners or live bullets',()=>{
  const preview=rehearsal();
  const foreignCharge=new TouhouBossCharge(preview.bank,{releaseFrame:1000});
  preview.until(p=>{
    const pending=p.runner.snapshot().pending;
    return pending.some(event=>event.kind==='ink')&&pending.some(event=>event.kind==='echo');
  });
  const pending=preview.charges.at(-1);
  assert.equal(pending.released,false,'stop during the gold tell before its release');
  const beforeEvents=JSON.stringify(preview.events),beforeBirths=preview.bank.instances.length,frame=preview.runner.frame;
  const liveBullets=[...preview.field];
  preview.runner.stop();preview.runner.stop();preview.run(180);
  assert.equal(preview.runner.alive,false);assert.equal(preview.runner.completed,false);assert.equal(preview.runner.frame,frame);
  assert.deepEqual(preview.runner.snapshot().pending,[]);
  assert.equal(JSON.stringify(preview.events),beforeEvents);assert.equal(preview.bank.instances.length,beforeBirths);
  assert.ok(preview.charges.every(owner=>owner.stopped));assert.equal(pending.released,false);
  assert.equal(foreignCharge.stopped,false,'an unrelated charge owner remains active');
  assert.equal(preview.field.length,liveBullets.length);
  for(let i=0;i<liveBullets.length;i++)assert.equal(preview.field[i],liveBullets[i],'already emitted and unrelated bullets remain game-owned');
});

test('Moonfold charge releases share the attack clock rather than firing one host update early',()=>{
  const preview=rehearsal().until(p=>p.charges.length>0),opening=preview.charges[0];
  const openingTell=preview.events.find(event=>event.kind==='charge');
  const openingRelease=openingTell.frame+openingTell.releaseFrame;
  preview.until(p=>p.runner.frame===openingRelease);
  assert.equal(opening.released,false);preview.step();assert.equal(opening.released,true);
  assert.ok(preview.events.some(event=>event.kind==='bullet'&&event.parameters.type===8&&event.frame===openingRelease));
  preview.until(p=>p.runner.snapshot().pending.some(event=>event.kind==='ink'));
  const stroke=preview.runner.snapshot().pending.find(event=>event.kind==='ink'),gold=preview.charges.at(-1);
  const goldTell=preview.events.findLast(event=>event.kind==='charge');
  assert.equal(goldTell.frame+goldTell.releaseFrame,stroke.due);
  preview.until(p=>p.runner.frame===stroke.due);assert.equal(gold.released,false);
  preview.step();assert.equal(gold.released,true);
  assert.ok(preview.events.some(event=>event.kind==='bullet'&&event.parameters.type===15&&event.frame===stroke.due));
});

test('Moonfold runners remain independent and replay the same input deterministically',()=>{
  const path=frame=>({x:130*Math.sin(frame/83),y:390+24*Math.sin(frame/127)});
  const first=rehearsal(path),second=rehearsal(path),unrelated=rehearsal(()=>({x:170,y:300}));
  first.until(p=>p.runner.snapshot().locks>0);unrelated.run(first.runner.frame);unrelated.runner.stop();
  while(first.runner.alive){second.step();first.step();}
  second.run(spellCard.duration-second.runner.frame);
  assert.deepEqual(second.events,first.events);assert.deepEqual(second.runner.snapshot(),first.runner.snapshot());
  const different=rehearsal(()=>({x:160,y:320})).run(spellCard.duration);
  const paper=events=>events.filter(event=>event.kind==='bullet'&&event.parameters.type!==15);
  const ink=events=>events.filter(event=>event.kind==='bullet'&&event.parameters.type===15);
  assert.deepEqual(paper(different.events),paper(first.events),'paper motion is independent of the aimed strokes');
  assert.notDeepEqual(ink(different.events),ink(first.events),'player decisions change the gold trajectories');
});
