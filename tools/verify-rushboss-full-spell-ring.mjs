import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
// Keep this historical command usable, but verify the Demo's current source
// shared-ring policy and write fresh evidence without replacing the old report.
const out=path.join(root,'reports/rushboss/shared-spell-ring'),scratch=path.join(root,'build/rushboss-shared-spell-ring');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=['packages/thlib/dist/touhou/boss-phase-plan.js','packages/thlib/dist/touhou/boss-hud.js',
  'games/rushboss/src/shared-presentation.js','games/rushboss/src/runtime.js','tools/import-touhou-common-assets.mjs',
  'packages/thlib/assets/touhou-common/anm/front.json','packages/thlib/assets/touhou-common/textures/front/entry-11.png'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(path.join(root,file))]));
const sourceHashes=hashes(),results=[];
for(const scene of [
  {name:'nonspell-sections',index:0,frames:90},
  {name:'spell-first-frame',index:0,frames:91,handoff:true},
  {name:'spell-remaining-section',index:0,frames:180,handoff:true},
  {name:'spell-half',index:0,frames:180,handoff:true,damage:true},
  {name:'next-nonspell',index:2,frames:165},
  {name:'practice-first-frame',index:1,frames:1,practice:true},
  {name:'practice-filled',index:1,frames:41,practice:true},
  {name:'standalone-first-visible',index:6,frames:20},
]){
  const source=`
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {RushBattle} from '../../games/rushboss/src/runtime.js';
const scene=${JSON.stringify(scene)};
// Keep the actual application, HP and HUD; fix the Boss position and disable
// private trajectories so screenshots isolate the transition under test.
const game=createRushPortraitGame(tsstg,{startBoss:'sunny',mode:scene.practice?'spell':'stage',phaseIndex:scene.index,
  invincible:true,skipDialogue:true,store:new SaveStore(),createBattle:(phases,options)=>new RushBattle(
    phases.map(p=>({...p,update(){},init(b){Object.assign(b.boss,{x:0,y:100,vx:0,vy:0,moving:false});}})),options)});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const b=game.battle;let frame=0,handoff=null;
globalThis.__tsstg_game={update(){
  if(scene.handoff&&frame===90){
    b.damage(b.boss.hp+999999);
    handoff={hp:b.boss.hp,maximum:b.boss.maxHp,phase:b.phaseIndex,age:b.phaseFrame};
  }
  if(scene.damage&&frame===179)b.damage(b.boss.maxHp*7/2);
  game.update(0);frame++;
},render:()=>game.render(),snapshot:()=>({scene:scene.name,frame,handoff,hp:b.boss.hp,maximum:b.boss.maxHp,
  phase:b.phaseIndex,age:b.phaseFrame,protection:b.boss.damageInvulnerability.current,
  ringPolicy:b.presentation.phasePlan.spellRing,hud:b.presentation.shared.hud.snapshot(),
  visibleMarkers:b.presentation.shared.hud.panels[0].animations.slice(3).filter(vm=>vm.visible).length,
  ringAnimations:b.presentation.shared.hud.panels[0].animations.length})};
`;
  const entry=path.join(scratch,`${scene.name}.js`);fs.writeFileSync(entry,source);const variants=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,`${backend}-${scene.name}`);
    const p=spawnSync(path.join(root,'build/Release/ts-stg.exe'),[path.relative(root,entry),'--root',root,
      '--backend',backend,'--frames',String(scene.frames),'--benchmark','--screenshot',`${prefix}.png`,
      '--snapshot',`${prefix}.json`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(`${prefix}.log`,(p.stdout??'')+(p.stderr??''));if(p.error)throw p.error;assert.equal(p.status,0,p.stderr);
    const state=JSON.parse(fs.readFileSync(`${prefix}.json`,'utf8')),panel=state.hud.panels[0];
    if(scene.handoff)assert.deepEqual(state.handoff,{hp:3000,maximum:3000,phase:1,age:0},'overkill cannot carry damage into the spell');
    const healthFraction=scene.damage?.5:1;
    const fraction=scene.handoff?Math.fround(3000*healthFraction/23000):1;
    assert.equal(state.ringPolicy,'shared');
    assert.equal(state.hp,state.maximum*healthFraction);assert.equal(panel.target,fraction);
    const firstFill=scene.name==='practice-first-frame'||scene.name==='standalone-first-visible';
    assert.equal(panel.fraction,firstFill?Math.fround(.025):fraction);
    assert.equal(state.ringAnimations,7);assert.equal(state.protection,0);
    if(scene.index===0&&!scene.handoff||scene.index===2)assert.ok(panel.markers[0]>0&&panel.markers[0]<1);
    else if(scene.handoff){
      assert.deepEqual(panel.markers,[Math.fround(3000/23000),0,0,0]);
      assert.equal(state.visibleMarkers,0,'the reached phase boundary is hidden rather than refilled');
    }else assert.deepEqual(panel.markers,[0,0,0,0]);
    variants.push({backend,state,pngSha256:sha(`${prefix}.png`)});
  }
  assert.deepEqual(variants[0].state,variants[1].state,`${scene.name}: state parity`);
  assert.equal(variants[0].pngSha256,variants[1].pngSha256,`${scene.name}: screenshot parity`);
  results.push({scene,backends:variants.map(({backend,pngSha256})=>({backend,pngSha256}))});
  console.log(`PASS ${scene.name}: V8/QuickJS state and image parity`);
}
// A numerical fraction alone misses atlas bugs. Render the same ring primitives
// using immutable source assets and the portable pack, at identical positions.
const atlasResults=[];
for(const backend of ['v8','quickjs']){
  const variants=[];
  for(const common of [false,true]){
    const name=common?'common':'source',entry=path.join(scratch,`atlas-${name}.js`),prefix=path.join(out,`${backend}-atlas-${name}`);
    fs.writeFileSync(entry,`
import {DrawList} from '@ts-stg/thlib';
import {AnmBank} from '@ts-stg/thlib/touhou';
const common=${common},data=JSON.parse(tsstg.readText(common?'packages/thlib/assets/touhou-common/anm/front.json':'games/touhou20/assets/anm/front.json'));
const bank=new AnmBank(data,{loadTexture:p=>tsstg.loadTexture(common?'packages/thlib/assets/touhou-common/'+p:p)});
const cases=[[374,1,1,0],[374,.5,1,0],[374,.25,1,0],[374,1,2,.25],[375,1,2,-.25],[376,1,1,.5]];
const rings=cases.map(([script,fraction,repeats,offset])=>{const vm=bank.create(script);vm.update();
  vm.F(0x38,Math.fround(-Math.fround(Math.PI)*2*fraction));vm.U(0x448,repeats);vm.F(0x7c,offset);return vm;});
const draw=new DrawList();globalThis.__tsstg_game={update(){},render(){draw.reset().clear(0x102030ff);
  rings.forEach((vm,i)=>vm.draw(draw,{x:160+(i%3)*320,y:180+Math.floor(i/3)*360,scale:.8}));return draw.commands;}};
`);
    const p=spawnSync(path.join(root,'build/Release/ts-stg.exe'),[path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames','1','--benchmark','--screenshot',`${prefix}.png`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(`${prefix}.log`,(p.stdout??'')+(p.stderr??''));if(p.error)throw p.error;assert.equal(p.status,0,p.stderr);
    variants.push({name,pngSha256:sha(`${prefix}.png`)});
  }
  assert.equal(variants[0].pngSha256,variants[1].pngSha256,`${backend}: original and common ring pixels differ`);
  atlasResults.push({backend,variants});console.log(`PASS ${backend}: original/common full, half, quarter, repeated and offset ring pixels match`);
}
assert.equal(atlasResults[0].variants[0].pngSha256,atlasResults[1].variants[0].pngSha256);
assert.deepEqual(hashes(),sourceHashes,'Sources changed during verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,sourceHashes,results,
  ringPolicy:'shared',atlasResults,scope:'Actual Rush application with fixed Boss position and disabled private trajectories, plus source/common ring asset rendering in thlib. No original-executable comparison.'},null,2)+'\n');
