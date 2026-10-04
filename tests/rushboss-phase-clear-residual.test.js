import test from 'node:test';
import assert from 'node:assert/strict';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {sunnyPhases} from '../games/rushboss/src/sunny.js';
import {monstonePhases} from '../games/rushboss/src/monstone.js';
import {artiaPhases} from '../games/rushboss/src/artia.js';

const tick=(battle,count)=>{for(let frame=0;frame<count;frame++)battle.update();};
const entities=battle=>battle.world.entities.concat(battle.world.pending);
const create=(boss,phases,spellIndex,difficulty)=>new RushBattle(phases,
  {boss,profile:'portrait',spellIndex,difficulty,invincible:true});
// The source infinite-laser circular erase can leave its zero-length owner
// alive. Its continued existence alone is not a visible/collision regression.
const residual=entity=>entity.alive&&!(entity.kind==='laser'&&!entity.curve&&entity.length===0);
const scenarios=[
  // The laser head exists before the first trail sample, including the frame
  // its delay reaches zero. An empty cancellation mask must still retire it.
  {boss:'sunny',phases:sunnyPhases,index:5,frame:75,kind:'pending curve'},
  {boss:'sunny',phases:sunnyPhases,index:5,frame:90,kind:'ready empty curve'},
  {boss:'artia',phases:artiaPhases,index:5,frame:150,kind:'pending curve'},
  // Mirror edges start shorter than the 16-unit local eraser sample step.
  {boss:'artia',phases:artiaPhases,index:7,frame:150,kind:'short mirror beam'},
  {boss:'artia',phases:artiaPhases,index:7,frame:600,kind:'late pending curve'},
];

for(const reason of ['defeated','timeout'])for(let difficulty=0;difficulty<4;difficulty++){
  test(`ordinary phase ${reason} retires short and unborn lasers on difficulty ${difficulty}`,()=>{
    for(const scenario of scenarios){
      const battle=create(scenario.boss,scenario.phases,scenario.index,difficulty);
      try{
        tick(battle,scenario.frame);
        const phase=battle.phase.key;
        const heads=entities(battle).filter(entity=>entity.alive&&entity.kind==='laser');
        assert.ok(heads.length>0,`${phase} / ${scenario.kind}: actual attack must have spawned laser owners`);
        if(scenario.kind==='short mirror beam'){
          assert.equal(heads.length,18);
          assert.ok(heads.every(head=>head.length>0&&head.length<16));
        }else{
          assert.ok(heads.some(head=>head.curve&&head.frame===0),`${phase}: a waiting curve is required`);
        }
        battle.endPhase(reason);
        if(scenario.kind==='short mirror beam')assert.ok(heads.every(head=>!head.alive),
          `${phase}: destroying each mirror also retires its owned edges`);
        assert.equal(heads.filter(residual).length,0,`${phase} at ${scenario.frame}: old visible beams and waiting curves must stop`);
        tick(battle,60);
        assert.equal(heads.filter(residual).length,0,`${phase}: previously cleared beams must not regrow`);
        assert.equal(entities(battle).filter(entity=>entity.alive&&heads.includes(entity.laserHead)).length,0,
          `${phase}: cleared laser heads must not grow a new visible trail in the following attack`);
      }finally{battle.dispose();}
    }
  });
}

for(let difficulty=0;difficulty<4;difficulty++){
  test(`all 29 Rush phases retire their old projectiles on difficulty ${difficulty}`,()=>{
    for(const [boss,phases]of [['sunny',sunnyPhases],['monstone',monstonePhases],['artia',artiaPhases]]){
      for(let index=0;index<phases.length;index++){
        const battle=create(boss,phases,index,difficulty);
        try{
          tick(battle,330);
          const old=entities(battle).filter(entity=>entity.alive&&entity.group==='bullet');
          battle.endPhase('defeated');
          // The original final-card retirement deliberately lasts 60 frames.
          // Ordinary cards have no such delay; practice escape is covered
          // separately and deliberately preserves its remaining projectiles.
          if(battle.dying)tick(battle,61);
          assert.equal(old.filter(residual).length,0,phases[index].key);
          tick(battle,60);
          assert.equal(old.filter(residual).length,0,`${phases[index].key}: old beams regrew`);
          assert.equal(entities(battle).filter(entity=>entity.alive&&old.includes(entity.laserHead)).length,0,
            `${phases[index].key}: old curve samples reappeared`);
        }finally{battle.dispose();}
      }
    }
  });
}

test('Artia prism timeout at 44 seconds cannot release its waiting curves into the next nonspell',()=>{
  for(let difficulty=0;difficulty<4;difficulty++){
    const battle=create('artia',artiaPhases,7,difficulty);
    try{
      tick(battle,2639);
      assert.equal(battle.phase.key,'artia_8');
      const heads=entities(battle).filter(entity=>entity.alive&&entity.kind==='laser');
      const waiting=heads.filter(head=>head.curve&&head.frame===0);
      assert.equal(waiting.length,12+4*difficulty,'actual final emission precedes the deadline by only 9 frames');
      battle.update();
      assert.equal(battle.results.at(-1).reason,'timeout');
      assert.equal(battle.results.at(-1).frames,2640);
      assert.equal(battle.phase.key,'artia_9');
      assert.equal(heads.filter(residual).length,0,'deadline clear must also stop delayed heads');
      tick(battle,60);
      assert.equal(heads.filter(residual).length,0,'an erased beam must not regrow in the next attack');
      assert.equal(entities(battle).filter(entity=>entity.alive&&heads.includes(entity.laserHead)).length,0);
    }finally{battle.dispose();}
  }
});
