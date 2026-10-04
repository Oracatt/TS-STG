import test from 'node:test';
import assert from 'node:assert/strict';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {monstonePhases} from '../games/rushboss/src/monstone.js';

const tick=(battle,count)=>{for(let frame=0;frame<count;frame++)battle.update(0);};
const entities=battle=>battle.world.entities.concat(battle.world.pending);
const clones=battle=>entities(battle).filter(entity=>entity.alive&&entity.kind==='Monstone');
const create=options=>new RushBattle(monstonePhases,{boss:'monstone',profile:'portrait',spellIndex:7,invincible:true,...options});

for(let difficulty=0;difficulty<4;difficulty++)test(`Monstone survival timeout retires every clone before the next card preparation on difficulty ${difficulty}`,()=>{
  const battle=create({difficulty});
  try{
    // Advance the actual 40-second spell. Skipping directly to its deadline
    // never creates the four emitters and would miss this regression.
    tick(battle,2399);assert.equal(battle.phase.key,'Monstone_SC_8');
    const ghosts=clones(battle);assert.equal(ghosts.length,4);
    assert.ok(ghosts.every(ghost=>ghost.frame>2200));
    battle.update();assert.equal(battle.phase.key,'Monstone_SC_9');
    assert.equal(battle.results.at(-1).reason,'timeout');assert.equal(battle.results.at(-1).captured,true);
    assert.equal(clones(battle).length,0,'phase-bound bodies must retire in the timeout frame');
    const frames=ghosts.map(ghost=>ghost.frame),spawned=battle.statistics.spawned;
    tick(battle,159);assert.equal(battle.phaseEntry.clock.frame,159);
    assert.equal(battle.statistics.spawned,spawned,'old clones must not fire during the independent card entry');
    battle.update();assert.equal(battle.phaseEntry,null);assert.equal(battle.phaseFrame,0);
    tick(battle,74);assert.equal(battle.statistics.spawned,spawned);
    assert.deepEqual(ghosts.map(ghost=>ghost.frame),frames,'terminated emitters never tick in the following phase');
    assert.equal(clones(battle).length,0);
  }finally{battle.dispose();}
});

test('Monstone practice timeout removes clone emitters while preserving the ordinary projectile escape path',()=>{
  const battle=create({practice:true});
  try{
    tick(battle,2399);const ghosts=clones(battle);assert.equal(ghosts.length,4);
    battle.update();assert.ok(battle.escaping);assert.equal(battle.phaseCleanupQuiet,false);
    assert.equal(clones(battle).length,0,'quiet practice cleanup still owns summoned bodies');
    assert.ok(entities(battle).some(entity=>entity.alive&&entity.group==='bullet'),'practice escape does not globally erase ordinary bullets');
    const frames=ghosts.map(ghost=>ghost.frame),spawned=battle.statistics.spawned;
    tick(battle,180);assert.equal(battle.finished,true);assert.equal(battle.escaped,true);
    assert.equal(battle.statistics.spawned,spawned);assert.deepEqual(ghosts.map(ghost=>ghost.frame),frames);
  }finally{battle.dispose();}
});

test('Bomb cancellation cannot remove active Monstone bodies, but their card end can',()=>{
  const battle=create();
  try{
    tick(battle,200);const ghosts=clones(battle);assert.equal(ghosts.length,4);
    battle.playerAdapter.cancelBullets(0,224,2000,{reason:'bomb',reward:false});
    assert.ok(ghosts.every(ghost=>ghost.alive));const spawned=battle.statistics.spawned;
    tick(battle,60);assert.ok(battle.statistics.spawned>spawned,'active clones retain their intended firing behavior');
    battle.endPhase('timeout');assert.ok(ghosts.every(ghost=>!ghost.alive));assert.equal(clones(battle).length,0);
  }finally{battle.dispose();}
});

test('Monstone cleanup handles ending before summons and ending while summons await their first world tick',()=>{
  for(const frame of [0,75]){
    const battle=create();
    try{
      tick(battle,frame);const ghosts=clones(battle);
      assert.equal(ghosts.length,frame===75?4:0);
      if(frame===75)assert.ok(ghosts.every(ghost=>battle.world.pending.includes(ghost)));
      battle.endPhase('timeout');assert.equal(clones(battle).length,0);
      const spawned=battle.statistics.spawned;tick(battle,160);assert.equal(battle.statistics.spawned,spawned);
    }finally{battle.dispose();}
  }
});
