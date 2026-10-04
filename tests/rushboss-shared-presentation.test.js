import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {DrawList,Keys} from '@ts-stg/thlib';
import {createTouhouResources,TouhouBossPresentation,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {RushGraphics} from '../games/rushboss/src/graphics.js';
import {createRushAssets} from '../games/rushboss/src/assets.js';
import {RushSharedPresentation,RUSH_BOSS_VIEW} from '../games/rushboss/src/shared-presentation.js';
import {hostFixture} from './fixtures/rushboss-host.js';
import {assertRenderScopes} from './fixtures/render-scopes.js';

const available=existsSync(new URL('../packages/thlib/assets/touhou-common/manifest.json',import.meta.url));
const phase={key:'shared-card',name:'霊符「夢想封印」',cardId:3,spell:true,hp:8000,time:60,bonus:5000000};
function fixture(){
  const {host,calls}=hostFixture(),read=host.readText;
  host.readText=file=>file.startsWith('packages/thlib/assets/touhou-common/')?readFileSync(new URL('../'+file,import.meta.url),'utf8'):read(file);
  const resources=createTouhouResources(host),battle=new RushBattle([phase],{resources,invincible:true}),assets=createRushAssets(host),graphics=new RushGraphics(host,assets);
  return{host,calls,resources,battle,assets,graphics,dispose(){battle.presentation.dispose();battle.bulletVisuals.dispose();battle.playerAdapter.dispose();graphics.dispose();assets.dispose();resources.dispose();}};
}

test('Rush production uses the full public original Boss owner with centered-coordinate translation',{skip:!available},()=>{
  const f=fixture(),{battle}=f,presentation=battle.presentation,shared=presentation.shared;
  assert.ok(presentation instanceof RushSharedPresentation);assert.ok(shared instanceof TouhouBossPresentation);
  assert.notEqual(shared.banks.effect,battle.sharedPlayer.effectBank);
  battle.boss.x=40;battle.boss.y=140;battle.sharedPlayer.setPosition(-30,120);battle.update();
  assert.deepEqual([presentation.proxyBoss.x,presentation.proxyBoss.y],[40,84]);
  assert.deepEqual([presentation.proxyPlayer.x,presentation.proxyPlayer.y],[-30,344]);
  assert.deepEqual(shared.view,RUSH_BOSS_VIEW);
  assert.equal(shared.view.x+shared.view.scale*presentation.proxyBoss.x,540);
  assert.equal(shared.view.y+shared.view.scale*presentation.proxyBoss.y,150);
  assert.deepEqual(shared.snapshot().auraScripts,[99,108]);
  assert.deepEqual(shared.snapshot().effectScripts,[4,5]);assert.deepEqual(shared.snapshot().openingScripts,[13]);
  assert.equal(shared.distortion.mesh.viewOffsetX,320);assert.equal(shared.distortion.radius,160);
  assert.equal(shared.hud.panels[0].target,1);assert.equal(shared.spell.duration,3600);assert.equal(shared.spell.bonus,battle.spellBonus);
  f.dispose();
});

test('original mesh samples a 1:1 complete backdrop and no Rush shader or substitute spell texture is loaded',{skip:!available},()=>{
  const f=fixture();for(let i=0;i<80;i++)f.battle.update();
  const draw=new DrawList();f.graphics.draw(draw,f.battle);assertRenderScopes(draw.commands);
  const backdrop=draw.commands.find(command=>command[0]==='sprite'&&command[1]===f.graphics.background);
  assert.deepEqual(backdrop.slice(2,6),[480,360,960,720]);
  const mesh=draw.commands.find(command=>command[0]==='mesh'&&command[1]===f.graphics.background);
  assert.equal(mesh[2].length,17*16*2,'Original grid submits paired strip vertices');assert.ok(draw.commands.indexOf(backdrop)<draw.commands.indexOf(mesh));
  assert.ok(!draw.commands.some(command=>command[0]==='shaderBegin'));
  assert.ok(!f.calls.some(call=>call[0]==='createShader'||call[0]==='loadTexture'&&/spell-common|src_lifebar|src_ascii/.test(call[1])));
  assert.ok(f.graphics.snapshot().spellCommonTextures>0);
  const before=JSON.stringify(f.battle.presentation.snapshot());f.graphics.draw(draw,f.battle);
  assert.equal(JSON.stringify(f.battle.presentation.snapshot()),before,'Rendering is read-only');f.dispose();
});

test('business attack charge uses public shrinking/radial cohorts rather than entry Point151 and preserves player RNG',{skip:!available},()=>{
  const f=fixture(),presentation=f.battle.presentation,random=f.battle.sharedPlayer.effectBank.rng.state;
  const effect={frame:1,alive:true,storetimes:2,blast:true};presentation.addCharge(effect,f.battle.boss);
  presentation.update();const charge=presentation.charges[0];
  assert.equal(charge.display,presentation.shared.charges[0]);
  assert.deepEqual(charge.animations.map(vm=>vm.scriptId),[72]);
  assert.deepEqual(charge.animations[0].children.map(vm=>vm.scriptId),[71,62]);
  const queue=new TouhouRenderQueue(),draw=new DrawList();presentation.draw(queue);queue.flush(draw);
  assert.ok(draw.commands.some(command=>command[0]==='mesh3d'),'Source radial particles render actual projected textured quads');
  for(let frame=2;frame<=25;frame++){effect.frame=frame;presentation.update();}
  assert.deepEqual(charge.animations.map(vm=>vm.scriptId),[72,72]);
  assert.equal(f.battle.sharedPlayer.effectBank.rng.state,random);
  const children=charge.animations.flatMap(vm=>vm.children);effect.alive=false;presentation.update();
  assert.equal(charge.display.stopped,true);assert.ok(children.some(vm=>vm.alive),'Canceling the business trigger preserves particles already in flight');
  for(let i=0;i<140;i++)presentation.update();assert.equal(presentation.charges.length,0);assert.ok(children.every(vm=>!vm.alive));f.dispose();
});

test('capture result and history are shared while score, bonus decay and phase progression remain business owned',{skip:!available},()=>{
  const f=fixture(),{battle}=f;for(let i=0;i<320;i++)battle.update();
  assert.equal(battle.presentation.shared.spell.bonus,battle.spellBonus);
  const score=battle.score,playerScore=battle.sharedPlayer.score,bonus=battle.spellBonus;
  battle.completePhase('defeated');
  assert.equal(battle.score,score+bonus);assert.equal(battle.sharedPlayer.score,playerScore);
  assert.equal(battle.presentation.shared.spell.result.bonus,bonus);assert.equal(battle.presentation.shared.spell.result.captured,true);
  assert.deepEqual(battle.presentation.shared.spell.records[3].captures,[1,0]);
  const banks=Object.values(battle.presentation.banks);f.dispose();assert.ok(banks.every(bank=>bank.disposed&&bank.instances.length===0));
});

test('a headless Boss uses identical pure battle rules without requiring animation resources',()=>{
  const battle=new RushBattle([phase],{practice:true,invincible:true});assert.equal(battle.presentation.shared,null);
  for(let i=0;i<400;i++)battle.update(i<200?Keys.SHOOT:0);
  assert.equal(battle.frame,400);assert.equal(battle.presentation.frame,400);assert.ok(battle.statistics.shotDamage>0);
  battle.presentation.dispose();battle.bulletVisuals.dispose();battle.playerAdapter.dispose();
});
