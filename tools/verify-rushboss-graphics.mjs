// Real QuickJS + GPU scene verification. This is not an original-EXE comparison.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspace = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
let root = workspace, binary = 'build/Release/ts-stg.exe', output = 'reports/rushboss/graphics', selection, comparison;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root') root = resolve(workspace, args[++i]);
  else if (args[i] === '--exe') binary = args[++i];
  else if (args[i] === '--out') output = args[++i];
  else if (args[i] === '--scene') selection = args[++i];
  else if (args[i] === '--compare') comparison = resolve(workspace, args[++i]);
  else throw new Error(`Unknown argument ${args[i]}`);
}
const battle = (startBoss, phaseIndex) => ({ startBoss, phaseIndex, difficulty: 3, practice: true, invincible: true });
const scenes = [
  { name: 'title', frames: 720, options: {}, mask: '0', screen: 'title' },
  { name: 'sunny-sc2', frames: 720, options: battle('sunny', 1), mask: '0', screen: 'battle', phase: 'SunnyMilk_SC_2' },
  { name: 'monstone-sc8', frames: 800, options: battle('monstone', 7), mask: '0', screen: 'battle', phase: 'Monstone_SC_8' },
  { name: 'artia-sc8', frames: 800, options: battle('artia', 7), mask: '0', screen: 'battle', phase: 'artia_8' },
  { name: 'artia-sc13', frames: 800, options: battle('artia', 12), mask: '0', screen: 'battle', phase: 'artia_13' },
  { name: 'practice-menu', frames: 900, options: { difficulty: 0 }, screen: 'spell',
    // Initial entry and every original leave/enter actor finish before the next
    // independent press. These fixed frames are also useful for visual review.
    mask: 'frame===90?Keys.DOWN:frame===120?Keys.CONFIRM:frame===210?Keys.RIGHT:frame===270?Keys.CONFIRM:frame===330?Keys.RIGHT:frame===380?Keys.CONFIRM:frame===470||frame===510?Keys.DOWN:frame===550?Keys.CONFIRM:frame===630||frame===670||frame===710?Keys.DOWN:0' },
  { name: 'title-to-difficulty', frames: 147, options: { difficulty: 0 }, screen: 'title',
    mask: 'frame===90?Keys.DOWN:frame===120?Keys.CONFIRM:0',
    transition: { kind:'screen',from:'title',to:'difficulty',age:26,duration:60,direction:0 } },
  { name: 'difficulty-carousel', frames: 216, options: { difficulty: 0 }, screen: 'difficulty',
    mask: 'frame===90?Keys.DOWN:frame===120?Keys.CONFIRM:frame===210?Keys.RIGHT:0',
    transition: { kind:'selection',from:'difficulty',to:'difficulty',age:5,duration:30,direction:1 } },
  { name: 'character-switch', frames: 336, options: { difficulty: 0 }, screen: 'character',
    mask: 'frame===90?Keys.DOWN:frame===120?Keys.CONFIRM:frame===210?Keys.RIGHT:frame===270?Keys.CONFIRM:frame===330?Keys.RIGHT:0',
    transition: { kind:'selection',from:'character',to:'character',age:5,duration:20,direction:1 } },
  { name: 'return-title', frames: 221, options: { difficulty: 0 }, screen: 'difficulty',
    mask: 'frame===90?Keys.DOWN:frame===120?Keys.CONFIRM:frame===210?Keys.BOMB:0',
    transition: { kind:'screen',from:'difficulty',to:'title',age:10,duration:20,direction:0 } },
  { name:'battle-wipe',frames:798,options:{difficulty:0},screen:'spell',
    mask:'frame===90?Keys.DOWN:frame===120?Keys.CONFIRM:frame===210?Keys.RIGHT:frame===270?Keys.CONFIRM:frame===330?Keys.RIGHT:frame===380?Keys.CONFIRM:frame===470||frame===510?Keys.DOWN:frame===550?Keys.CONFIRM:frame===630||frame===670||frame===710?Keys.DOWN:frame===760?Keys.CONFIRM:0',
    transition:{kind:'screen',from:'spell',to:'battle',age:37,duration:82,direction:0} },
  { name: 'pause', frames: 720, options: battle('sunny', 1), mask: 'frame===480?Keys.PAUSE:0', screen: 'battle', phase: 'SunnyMilk_SC_2', paused: true },
].filter(scene => !selection || selection === scene.name);
assert.ok(scenes.length, `Unknown scene ${selection}`);
const exe = resolve(workspace, binary), directory = resolve(workspace, output);
assert.ok(existsSync(exe), `Native executable not found: ${exe}`);
assert.ok(existsSync(join(root, 'games/rushboss/assets/manifest.json')), 'Import the local RushBoss assets first.');
assert.ok(existsSync(join(root, 'packages/thlib/assets/reference-common/manifest.json')), 'The common thlib visual pack is required.');
const fixtures = resolve(root, 'build/rushboss-graphics');
mkdirSync(fixtures, { recursive: true });
mkdirSync(directory, { recursive: true });
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const codePaths = ['games/rushboss/src','packages/thlib/dist','packages/thlib/dist/touhou'].flatMap(directory=>
  readdirSync(join(root,directory)).filter(name=>name.endsWith('.js')).map(name=>`${directory}/${name}`));
const sourceHashes = () => Object.fromEntries(codePaths.map(name => [name, hash(join(root,name))]));
const results = [];
const reportPath = join(directory, 'report.json');
const report = () => writeFileSync(reportPath, JSON.stringify({
  format: 'ts-stg-rushboss-graphics-v1', verifiedAt: new Date().toISOString(), binary: exe,
  binarySha256: hash(exe), root, scope: 'Actual QuickJS and GPU; every benchmark frame updates and renders. These captures verify loading and rendering of the port, not pixel equality to the original executable.',
  commonManifestSha256: hash(join(root, 'packages/thlib/assets/reference-common/manifest.json')),
  restoredManifestSha256: hash(join(root,'packages/thlib/assets/touhou-common/manifest.json')), comparisonBaseline: comparison ?? null, results,
}, null, 2));

for (const scene of scenes) {
  const entry = join(fixtures, `${scene.name}.js`), prefix = join(directory, scene.name);
  writeFileSync(entry, `import {Keys} from '@ts-stg/thlib';
import {createRushGame} from '../../games/rushboss/src/game.js';
const game=createRushGame(tsstg,${JSON.stringify(scene.options)});
game.soundVolume=0;game.bgmVolume=0;tsstg.playMusic(game.musicId,0);
let frame=0;
globalThis.__tsstg_game={update(){game.update(${scene.mask});frame++;},render(){return game.render();},snapshot(){return{hostFrames:frame,...game.snapshot()};}};
`, 'utf8');
  const code = sourceHashes();
  const child = spawnSync(exe, [relative(root, entry), '--root', root, '--frames', String(scene.frames), '--benchmark',
    '--profile', `${prefix}-profile.json`, '--profile-warmup', '60', '--snapshot', `${prefix}-state.json`, '--screenshot', `${prefix}.png`,
  ], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 300000 });
  writeFileSync(`${prefix}-output.txt`, `${child.stdout ?? ''}${child.stderr ?? ''}`, 'utf8');
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `${scene.name}: ${child.stdout}\n${child.stderr}`);
  assert.ok(existsSync(`${prefix}.png`), `${scene.name}: screenshot missing`);
  const state = JSON.parse(readFileSync(`${prefix}-state.json`, 'utf8'));
  const profile = JSON.parse(readFileSync(`${prefix}-profile.json`, 'utf8'));
  assert.equal(state.format, 'ts-stg-rushboss-v1');
  assert.equal(state.hostFrames, scene.frames); assert.equal(state.frame, scene.frames);
  assert.equal(state.screen, scene.screen); assert.ok(state.assets.textures > 0, 'Original scene textures must be loaded');
  assert.equal(profile.headless, false); assert.equal(profile.benchmark, true);
  assert.equal(profile.simulationFrames, scene.frames); assert.equal(profile.renderFrames, scene.frames);
  assert.ok(profile.metrics.commandCount.max > 0);
  if(scene.transition){assert.deepEqual(state.transition,scene.transition);assert.equal(state.inputLocked,true);assert.equal(state.battle,null);}
  if (scene.screen === 'battle') {
    assert.equal(state.battle.phase, scene.phase); assert.equal(state.paused, !!scene.paused);
    assert.equal(state.battle.frame, scene.paused ? 480 : scene.frames);
    assert.equal(state.battle.difficulty, 3); assert.equal(state.battle.finished, false);
    assert.ok(state.graphics.commonTextures > 0, 'Common thlib textures must be loaded by gameplay');
    assert.equal(state.graphics.playerPresentation.implementation,'@ts-stg/thlib/touhou TouhouPlayer.draw');
    assert.equal(state.graphics.playerPresentation.bank,'pl00');
    assert.equal(state.graphics.bulletPresentation.implementation,'@ts-stg/thlib/touhou AnmBank');
    if(scene.name==='artia-sc13'){
      assert.ok(state.battle.statistics.lasers>0,'The final Artia phase must emit its lasers');
      assert.ok(state.graphics.commonSprites.some(name=>name.startsWith('laser.straight.')),'Lasers must use the shared strip materials');
    }else assert.ok(state.graphics.bulletPresentation.types.length>=1,'Standard bullets must execute the complete public ANM');
    assert.ok(state.graphics.fallbacks.every(name => ['YanDan', 'XinDan', 'freezingFog'].includes(name)), 'Only source visuals absent from the common pack may use application materials');
  }
  if (scene.name === 'practice-menu') {
    assert.equal(state.difficulty, 1); assert.equal(state.character, 1);
    assert.equal(state.bossIndex, 2); assert.equal(state.spellIndex, 3); assert.equal(state.battle, null);
  }
  assert.deepEqual(sourceHashes(), code, `${scene.name}: source changed during the capture; rerun this scene`);
  let compared;
  if (comparison) {
    const oldPrefix = join(comparison, scene.name);
    const oldState = JSON.parse(readFileSync(`${oldPrefix}-state.json`, 'utf8'));
    const oldProfile = JSON.parse(readFileSync(`${oldPrefix}-profile.json`, 'utf8'));
    const previousPng = hash(`${oldPrefix}.png`), currentPng = hash(`${prefix}.png`);
    assert.equal(currentPng, previousPng, `${scene.name}: screenshot changed from the baseline`);
    assert.deepEqual(state, oldState, `${scene.name}: game snapshot changed from the baseline`);
    const beforeMs = oldProfile.metrics.frameWorkMs.mean, afterMs = profile.metrics.frameWorkMs.mean;
    compared = { identicalScreenshot: true, identicalSnapshot: true, pngSha256: currentPng,
      beforeFrameWorkMeanMs: beforeMs, afterFrameWorkMeanMs: afterMs, reductionPercent: (beforeMs - afterMs) / beforeMs * 100,
      beforeFrameWorkP95Ms: oldProfile.metrics.frameWorkMs.p95, afterFrameWorkP95Ms: profile.metrics.frameWorkMs.p95 };
  }
  results.push({ scene: scene.name, frames: scene.frames, screenshot: `${prefix}.png`, snapshot: `${prefix}-state.json`,
    profile: `${prefix}-profile.json`, codeSha256: code, assets: state.assets, graphics: state.graphics,
    battle: state.battle ? { phase: state.battle.phase, frame: state.battle.frame, spawned: state.battle.statistics.spawned, peak: state.battle.statistics.peak, hash: state.battle.spawnHash } : null,
    menu:scene.screen==='battle'?null:{screen:state.screen,inputLocked:state.inputLocked,transition:state.transition},
    performance: { device: profile.gpuDevice, gpuTimer: profile.gpuTimer, frameWorkMs: profile.metrics.frameWorkMs, gpuMs: profile.metrics.gpuMs }, compared,
  });
  report();
  console.log(JSON.stringify({ scene: scene.name, frames: scene.frames, commonTextures: state.graphics.commonTextures,
    screenshot: `${prefix}.png`, frameWorkMeanMs: profile.metrics.frameWorkMs.mean, frameWorkP95Ms: profile.metrics.frameWorkMs.p95, compared }));
}
console.log(`RushBoss GPU verification passed: ${results.length} scenes. Report: ${reportPath}`);
