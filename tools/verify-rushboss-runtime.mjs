// Complete phase-duration smoke verification, using the real public-thlib World
// and RushBattle business adapter. This does not execute the original game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { RushBattle } from '../games/rushboss/src/runtime.js';
import { sunnyPhases } from '../games/rushboss/src/sunny.js';
import { monstonePhases } from '../games/rushboss/src/monstone.js';
import { artiaPhases } from '../games/rushboss/src/artia.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'reports/rushboss/runtime.json');
const catalogs=[['sunny',sunnyPhases],['monstone',monstonePhases],['artia',artiaPhases]];
const sourceFiles=['games/rushboss/src/runtime.js','games/rushboss/src/player-adapter.js','games/rushboss/src/random.js',
  'games/rushboss/src/sunny.js','games/rushboss/src/monstone.js','games/rushboss/src/artia.js',
  'games/rushboss/src/bullet-styles.js','packages/thlib/dist/world.js',
  'packages/thlib/dist/bullet-presets.js','packages/thlib/dist/bullets.js',
  'packages/thlib/dist/lasers.js','packages/thlib/dist/math.js','packages/thlib/dist/bomb-geometry.js',
  'games/rushboss/src/bullet-visuals.js',
  ...fs.readdirSync(path.join(root,'packages/thlib/dist/touhou')).filter(file=>file.endsWith('.js')).sort().map(file=>'packages/thlib/dist/touhou/'+file)];
const hashSources=()=>Object.fromEntries(sourceFiles.map(file=>
  [file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const sourceHashes=hashSources();
const started=performance.now(),cases=[],errors=[];
const finiteKeys=['x','y','vx','vy','fx','fy','hp','maxHp','radius','frame','age','alpha','scale',
  'width','length','rotation','angle','delay','lifetime','moveSpeed','slowMoveSpeed','score','graze',
  'speed','focusSpeed','shotSpeed','damage','power','lives','bombs','grazeRadius','pickupRadius',
  'invulnerableFrames','deathbombRemaining','respawnRemaining','deathbombFrames','respawnDuration',
  'respawnInvulnerability','maxRadius','expansion','currentWidth','growFrames','cooldown','turnRate','duration'];
function finiteObject(value,context){
  for(const key of finiteKeys)if(typeof value[key]==='number'&&!Number.isFinite(value[key]))throw Error(`${context}.${key}=${value[key]}`);
  if(typeof value.drag==='number'&&!Number.isFinite(value.drag))throw Error(`${context}.drag=${value.drag}`);
  if(value.drag&&typeof value.drag==='object')finiteObject(value.drag,context+'.drag');
  if(Array.isArray(value.options))for(let i=0;i<value.options.length;i++)finiteObject(value.options[i],context+'.option#'+i);
  if(value.move)for(const [key,n] of Object.entries(value.move))if(typeof n==='number'&&!Number.isFinite(n))throw Error(`${context}.move.${key}=${n}`);
}
for(const [boss,phases] of catalogs){
  for(let difficulty=0;difficulty<4;difficulty++){
    const groupStart=performance.now();
    for(let index=0;index<phases.length;index++){
      const phase=phases[index],label=`${boss}/${phase.number}/${difficulty}`,begin=performance.now();
      const battle=new RushBattle(phases,{boss,difficulty,character:0,seed:5489,practice:true,spellIndex:index,invincible:true});
      const maxUpdates=Math.round(phase.time*60)+(phase.deathDelay??0)+2000;
      let updates=0,checkedEntities=0;
      try{
        while(!battle.finished&&updates<maxUpdates){
          battle.update(0);updates++;
          finiteObject(battle,label);finiteObject(battle.boss,label+'.boss');finiteObject(battle.player,label+'.player');
          // Check all living and newly queued entities every update, including
          // custom projectile forces and fog state; NaN cannot hide in culling.
          for(const entity of battle.world.entities){finiteObject(entity,label+'.entity#'+entity.id);checkedEntities++;}
          for(const entity of battle.world.pending){finiteObject(entity,label+'.pending#'+entity.id);checkedEntities++;}
          const player=battle.sharedPlayer,adapter=battle.playerAdapter;
          finiteObject(player,label+'.restored-player');
          if(player.bomb)finiteObject(player.bomb,label+'.restored-bomb');
          for(const entity of [...player.shots,...player.effects,...player.damageRegions,...(player.bomb?.orbs??[]),...adapter.items.items,...adapter.items.effects]){
            finiteObject(entity,label+'.restored#'+(entity.id??entity.type??'effect'));checkedEntities++;
          }
        }
        if(!battle.finished)throw Error(`phase did not finish in ${maxUpdates} updates`);
        if(battle.results.length!==1)throw Error(`expected one result; got ${battle.results.length}`);
        const result=battle.results[0];
        if(result.number!==phase.number||result.key!==phase.key)throw Error('result identifies a different phase');
        if(result.reason!=='timeout')throw Error(`unattacked phase ended with ${result.reason}`);
        if(result.captured!==!!phase.survival)throw Error(`timeout capture differs from survival=${phase.survival}`);
        if(battle.statistics.spawned<=0)throw Error('phase emitted no projectile');
        if(battle.statistics.misses!==0||battle.statistics.bombs!==0)throw Error('invincible idle fixture unexpectedly missed or bombed');
        const snapshot=battle.snapshot();
        cases.push({boss,key:phase.key,number:phase.number,difficulty,timeSeconds:phase.time,updates,
          phaseFrames:result.frames,spell:!!phase.spell,cardId:phase.cardId,survival:!!phase.survival,
          result,statistics:snapshot.statistics,spawnHash:snapshot.spawnHash,randomCalls:snapshot.randomCalls,
          checkedEntities,elapsedMs:Math.round(performance.now()-begin),passed:true});
      }catch(error){
        const entry={boss,key:phase.key,number:phase.number,difficulty,updates,error:error.message,snapshot:battle.snapshot(),passed:false};
        cases.push(entry);errors.push(entry);console.error(`${label}: ${error.message}`);
      }
    }
    console.log(`${boss} difficulty ${difficulty}: ${phases.length} phases checked (${Math.round(performance.now()-groupStart)} ms)`);
  }
}
const expectedCases=catalogs.reduce((sum,[,phases])=>sum+phases.length*4,0);
assert.deepEqual(hashSources(),sourceHashes,'Simulation source changed during the complete runtime verification.');
const report={scope:'real RushBattle full timeout, all boss phases and four difficulties',
  runtimeBackend:`Node.js ${process.version}`,sourceHashes,sourceStableDuringVerification:true,
  originalExecutableRun:false,originalFullStateEquivalenceVerified:false,
  seed:5489,character:0,practice:true,invincible:true,expectedCases,casesChecked:cases.length,
  simulationUpdates:cases.reduce((sum,c)=>sum+c.updates,0),
  finiteScope:'battle, boss, player facade, all active/pending source entities, restored player/options/shots/Bomb orbs/damage regions/items/effects',
  checkedEntityFrames:cases.reduce((sum,c)=>sum+(c.checkedEntities??0),0),
  elapsedMs:Math.round(performance.now()-started),passed:errors.length===0&&cases.length===expectedCases,cases};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(`${report.passed?'PASS':'FAIL'}: ${cases.length}/${expectedCases} complete cases; ${report.checkedEntityFrames} entity-frames; ${out}`);
if(!report.passed)process.exitCode=1;
