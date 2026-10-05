import test from 'node:test';
import assert from 'node:assert/strict';
import {spellCard,createSpell} from '../examples/spellcard/moonfold.spell.js';
import {validateTouhouSpellCard} from '../packages/thlib/src/touhou/spellcard.js';
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
  const events=[],charges=[],bank=bulletTestBank(),boss={...spellCard.boss},player={x:0,y:400};
  const context={boss,player,random:new TouhouRNG(spellCard.seed),
    bullets:{emit(parameters){
      // Preserve arguments now: source-owned command objects may be reused.
      const value=JSON.parse(JSON.stringify(parameters));
      events.push({kind:'bullet',frame:runner.frame,parameters:value});
      return Array.from({length:(value.count??1)*(value.rows??1)},()=>({}));
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
  return{runner,events,charges,bank,boss,player,
    step(){Object.assign(player,playerAt(runner.frame));runner.update();for(const charge of charges)charge.update();},
    run(frames){for(let i=0;i<frames;i++)this.step();return this;},
  };
}

test('Moonfold is a portable JS spell using public metadata, stock styles and fixed-frame completion',()=>{
  assert.deepEqual(validateTouhouSpellCard(spellCard),spellCard);
  assert.equal(spellCard.events.length,0,'the authored JS owns the pattern, not an editor arrangement');
  const preview=rehearsal().run(spellCard.duration);
  assert.equal(preview.runner.frame,spellCard.duration);assert.equal(preview.runner.alive,false);assert.equal(preview.runner.completed,true);
  const bullets=preview.events.filter(event=>event.kind==='bullet');
  assert.ok(bullets.length>2000,'all five phrases should execute');
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

test('Moonfold takes one aim sample per phrase and never retargets the three gold bursts',()=>{
  const sampleFrame=120+252,target={x:-90,y:402};
  const preview=rehearsal(frame=>frame<=sampleFrame?target:{x:frame%2?170:-170,y:frame%3?350:425}).run(120+309);
  const expected=Math.fround(Math.atan2(target.y-spellCard.boss.y,target.x)),burstFrames=[120+280,120+294,120+308];
  const gold=preview.events.filter(event=>event.kind==='bullet'&&event.parameters.type===15);
  assert.equal(gold.length,27);
  for(const frame of burstFrames){
    const burst=gold.filter(event=>event.frame===frame);assert.equal(burst.length,9);
    const angles=burst.map(event=>event.parameters.angle);
    for(let lane=0;lane<3;lane++)for(let bead=0;bead<3;bead++)
      assert.equal(angles[lane*3+bead],expected+(lane-1)*.026);
  }
  assert.ok(Math.abs(gold[0].parameters.angle-Math.atan2(425-spellCard.boss.y,170))>.2,
    'moving after the tell must not pull a late burst onto the new player position');
});

test('Moonfold stop is idempotent and prevents future shots, sounds and pending charge births',()=>{
  const preview=rehearsal().run(120+266),pending=preview.charges.at(-1);
  assert.equal(pending.released,false,'stop during the gold tell before its release');
  const beforeEvents=JSON.stringify(preview.events),beforeBirths=preview.bank.instances.length,frame=preview.runner.frame;
  preview.runner.stop();preview.runner.stop();preview.run(180);
  assert.equal(preview.runner.alive,false);assert.equal(preview.runner.completed,false);assert.equal(preview.runner.frame,frame);
  assert.equal(JSON.stringify(preview.events),beforeEvents);assert.equal(preview.bank.instances.length,beforeBirths);
  assert.ok(preview.charges.every(owner=>owner.stopped));assert.equal(pending.released,false);
});

test('Moonfold charge releases share the attack clock rather than firing one host update early',()=>{
  const preview=rehearsal().run(120),opening=preview.charges[0];
  assert.equal(opening.released,false);preview.step();assert.equal(opening.released,true);
  assert.ok(preview.events.some(event=>event.kind==='sound'&&event.id===6&&event.frame===120));
  preview.run(279);const gold=preview.charges.at(-1);
  assert.equal(preview.runner.frame,400);assert.equal(gold.released,false);
  preview.step();assert.equal(gold.released,true);
  assert.ok(preview.events.some(event=>event.kind==='bullet'&&event.parameters.type===15&&event.frame===400));
});

test('Moonfold re-instantiation reproduces the same source program and reserves its crossing beat',()=>{
  const path=frame=>{
    if(frame<120)return{x:-80,y:400};
    const phrase=Math.floor((frame-120)/480),beat=(frame-120)%480,side=phrase%2?1:-1;
    return{x:beat<374?side*80:beat<454?side*80*(1-(beat-374)/40):-side*80,y:400};
  };
  const first=rehearsal(path).run(spellCard.duration),second=rehearsal(path).run(spellCard.duration);
  assert.deepEqual(second.events,first.events);assert.deepEqual(second.runner.snapshot(),first.runner.snapshot());
  for(let phrase=0;phrase<5;phrase++){
    const start=120+phrase*480+374,end=120+phrase*480+454;
    assert.equal(first.events.filter(event=>event.kind==='bullet'&&event.frame>=start&&event.frame<=end).length,0,
      'the crossing beat must not contain a newly spawned attack');
  }
  // This establishes authored timing, not that old bullets leave a safe path.
  // Collision clearance is verified against actual ANM/movement elsewhere.
});
