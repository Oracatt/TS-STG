import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TouhouGame,TouhouBossPhasePlan,createTouhouResources} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {BOSSES} from '../games/rushboss/src/catalog.js';

function resources(){return createTouhouResources({readText:file=>fs.readFileSync(file,'utf8'),loadTexture:()=>11});}

test('Rush portrait blood proportions come from thlib HP defaults and ignore the legacy Rush lifeBar skin',()=>{
  const res=resources(),source=BOSSES[0].phases;
  const battle=new RushBattle(source.map(p=>({...p,lifeBar:{min:.4,max:.41}})),{boss:'sunny',profile:'portrait',resources:res,invincible:true});
  const plan=battle.presentation.phasePlan,group=plan.groups[0],state=plan.hudState(1);
  assert.equal(group.maximum,source[0].hp+source[1].hp);
  assert.equal(state.healthBars[0].current,source[1].hp);
  assert.equal(plan.hudState(0).healthBars[0].markers[0],Math.fround(source[1].hp/group.maximum));
  assert.equal(plan.spellRing,'shared');
  assert.equal(state.healthBars[0].maximum,group.maximum);
  assert.deepEqual(state.healthBars[0].markers,[Math.fround(source[1].hp/group.maximum)]);
  battle.dispose();res.dispose();
});

test('public Game integrates entry ownership, visual metadata and protection without a demo adapter',()=>{
  const res=resources(),game=new TouhouGame({banks:res.banks,font:res.font,sht:res.shots[0],styles:res.styles});
  const boss=game.spawnEnemy({x:0,y:128,hp:3000,damageInvulnerability:0});
  const display=game.enterBoss(boss,{entrance:{mode:'blackFog'}}),plan=new TouhouBossPhasePlan([{hp:3000},{hp:1000,spell:true},{hp:900,spell:true}]);
  game.setBossHud({name:'Reusable Boss',...plan.hudState(0)});
  let bodies=0;const drawBody=boss.draw.bind(boss);boss.draw=(...args)=>{bodies++;return drawBody(...args);};
  assert.equal(game.context.damageEnemy(boss,100,'test'),0);
  for(let frame=0;frame<100;frame++)game.update();
  assert.equal(display.entrance.age,100);assert.equal(display.bossVisible,false);assert.equal(boss.hp,3000);
  const hiddenCommands=game.render();assert.equal(bodies,0);
  assert.ok(hiddenCommands.some(c=>c[0]==='statefulQuad'&&c[17][3]==='reverseSubtract'),'Game actually draws the owned black mist');
  game.update();game.render();assert.equal(bodies,1);assert.equal(display.entrance.age,101);
  assert.equal(game.bossHud.name,'Reusable Boss');assert.equal(game.bossHud.remainingSpells,1);
  assert.equal(display.distortionReady,false);game.update();assert.equal(display.distortionReady,false);
  assert.equal(game.context.damageEnemy(boss,100,'test'),0,'revealed Boss still awaits the attack signal');
  game.startBossCombat();game.update();assert.equal(display.distortionReady,true);
  game.enterBoss(boss);assert.equal(display.entrance.age,103,'phase attachment never restarts entry');
  game.setBoss(null);assert.deepEqual(game.bossHudState,{});assert.equal(display.entrance,null);
  const fly=game.enterBoss(boss,{entrance:{mode:'flyIn'}});assert.equal(fly.bossVisible,true);assert.equal(fly.entranceReady,true);
  const charge=fly.beginCharge();let chargeDraws=0;const drawCharge=charge.draw.bind(charge);
  charge.draw=(...args)=>{chargeDraws++;return drawCharge(...args);};game.update();game.render();
  assert.equal(chargeDraws,1,'the composed Game draws the shared attack charge once');
  game.destroy();res.dispose();
});

test('portrait Rush projects every authored health group through thlib and keeps spell practice standalone',()=>{
  const res=resources();
  for(const spec of BOSSES){
    const battle=new RushBattle(spec.phases,{boss:spec.key,profile:'portrait',resources:res,invincible:true});
    const display=battle.presentation,plan=display.phasePlan;
    assert.ok(plan instanceof TouhouBossPhasePlan);
    for(const group of plan.groups){
      for(let i=group.start;i<group.end;i++){
        battle.beginPhase(i);
        // An ECL515-protected group cannot reach its defeat boundary yet;
        // its source HUD is hidden until that timer has elapsed.
        while(battle.boss.damageInvulnerability.current>0)battle.update();
        // Let the original upward fill settle before exercising the boundary.
        for(let frame=0;frame<41;frame++)display.update();
        battle.boss.hp=0;display.update();
        const before=display.shared.hud.panels[0].target;assert.ok(before<1);
        battle.beginPhase(i+1);display.update();
        if(!battle.phase.survival){
          assert.equal(display.shared.hud.panels[0].target,before,`${spec.key} phases ${i}→${i+1} keeps the remaining shared section`);
          assert.equal(display.shared.hud.panels[0].fraction,before);
          assert.deepEqual(display.shared.hud.panels[0].markers,[...group.markers,...Array(4-group.markers.length).fill(0)]);
          assert.ok(display.shared.hud.panels[0].animations.slice(3).every(vm=>!vm.visible),'reached section markers are hidden');
        }else assert.equal(display.shared.hud.panels[0].animations.length,0);
      }
    }
    assert.equal(display.shared.hud.remainingSpells,plan.hudState(battle.phaseIndex).remainingSpells);
    battle.dispose();
    const index=spec.phases.findIndex(p=>p.spell),practice=new RushBattle(spec.phases,{boss:spec.key,profile:'portrait',resources:res,practice:true,spellIndex:index,invincible:true});
    for(let frame=0;frame<41;frame++)practice.presentation.update();const hud=practice.presentation.shared.hud;
    assert.equal(hud.panels[0].target,1);assert.equal(hud.panels[0].fraction,1);assert.equal(hud.remainingSpells,0);assert.deepEqual(hud.panels[0].markers,[0,0,0,0]);
    practice.dispose();
  }
  res.dispose();
});
