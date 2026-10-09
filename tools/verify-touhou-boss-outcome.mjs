// Public TouhouGame scene ownership: HP zero -> caller dialogue -> retreat,
// or an explicitly selected original explosion. Both native backends run
// serially; no original executable or existing game process is controlled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
let output = 'reports/touhou/boss-outcome', executable = 'build/Release/ts-stg.exe', selected = null, prepare = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--out') output = args[++index];
  else if (args[index] === '--exe') executable = args[++index];
  else if (args[index] === '--scene') selected = args[++index];
  else if (args[index] === '--prepare') prepare = true;
  else throw new Error(`Unknown argument: ${args[index]}`);
}
const out = path.resolve(root, output), scratch = path.join(root, 'build/touhou-boss-outcome');
const binary = path.resolve(root, executable), results = [], fixtures = [];
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(scratch, { recursive: true });
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = ['packages/thlib/dist/touhou/game.js', 'packages/thlib/dist/touhou/enemy.js',
  'packages/thlib/dist/touhou/boss-escape.js', 'packages/thlib/dist/touhou/boss-defeat.js',
  'packages/thlib/dist/touhou/boss-presentation.js', 'tests/fixtures/touhou-boss-outcome-native.js'];
const hashes = () => Object.fromEntries(files.map(file => [file, hash(path.join(root, file))]));
const sourceHashes = hashes();
const scenes = [{ name: 'held', frames: 60 }, { name: 'flight', frames: 90 },
  { name: 'finished', frames: 130 }, { name: 'exploded', frames: 90 }];
if (selected) assert.ok(scenes.some(scene => scene.name === selected), 'Unknown scene ' + selected);
for (const scene of scenes.filter(scene => !selected || scene.name === selected)) {
  const entry = path.join(scratch, scene.name + '.js'), runs = [];
  fs.writeFileSync(entry, `import {createTouhouBossOutcomeFixture} from '../../tests/fixtures/touhou-boss-outcome-native.js';\n` +
    `globalThis.__tsstg_game=createTouhouBossOutcomeFixture(tsstg,${JSON.stringify({ scene: scene.name })});\n`);
  for (const backend of ['v8', 'quickjs']) {
    const prefix = path.join(out, backend + '-' + scene.name), command = [path.relative(root, entry), '--root', root,
      '--backend', backend, '--frames', String(scene.frames), '--benchmark', '--screenshot', prefix + '.png', '--snapshot', prefix + '.json'];
    fixtures.push({ scene: scene.name, backend, binary, args: command });
    if (prepare) continue;
    const child = spawnSync(binary, command, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180000 });
    fs.writeFileSync(prefix + '.log', (child.stdout ?? '') + (child.stderr ?? ''));
    if (child.error) throw child.error;
    assert.equal(child.status, 0, `${backend}/${scene.name}: ${child.stderr}`);
    const state = JSON.parse(fs.readFileSync(prefix + '.json', 'utf8')), current = state.current;
    assert.equal(state.frozen, true, 'The semantic capture point must be reached');
    assert.equal(current.outcomes, 1); assert.equal(current.outcomeFrame, 20);
    assert.equal(current.attacks, 20, 'The exhausted phase must stop before actor attacks tick again');
    assert.equal(current.items, 0);
    if (scene.name === 'held' || scene.name === 'flight') {
      assert.equal(state.presentation.auraActive, true); assert.equal(state.presentation.distortionActive, true);
      assert.deepEqual(state.presentation.auraScripts, [99, 108]); assert.equal(state.presentation.distortion.ready, true);
      assert.equal(current.hudHidden, true);
    } else {
      assert.equal(state.presentation.auraActive, false); assert.equal(state.presentation.distortionActive, false);
      assert.deepEqual(state.presentation.auraScripts, []);
      if (scene.name === 'finished') assert.equal(state.presentation.distortion, null);
      else assert.equal(state.presentation.distortion?.ready ?? false, false, 'an exploded body cannot keep rendering its disabled warp');
    }
    if (scene.name === 'exploded') {
      assert.equal(current.sequence.age, 60); assert.equal(current.sequence.burst, true);
      assert.equal(current.boss.alive, false); assert.equal(current.boss.bodyAlive, false);
      assert.equal(current.minorAlive, false); assert.ok(![1, 2].includes(current.bulletState));
      assert.equal(current.ordinaryDefeats, 1); assert.equal(current.deaths.length, 1);
      assert.equal(current.deaths[0].burst, true); assert.ok(current.deaths[0].scripts.includes(25));
      assert.ok(current.deaths[0].scripts.includes(57));
      assert.equal(state.events.filter(event => event.name === 'bossburst').length, 1);
      assert.equal(state.sounds.filter(id => id === 5).length, 2);
    } else {
      assert.equal(current.minorAlive, true, 'Holding/escaping must not retire unrelated enemies');
      assert.ok([1, 2].includes(current.bulletState), 'Holding/escaping must not cancel caller projectiles');
      assert.equal(current.ordinaryDefeats, 0); assert.equal(current.deaths.length, 0);
      assert.equal(current.combatActive, false); assert.equal(current.spellActive, false);
      assert.equal(state.events.some(event => event.name === 'bossburst'), false);
      assert.equal(state.sounds.includes(5), false);
      if (scene.name === 'held') {
        assert.equal(current.frame - 1 - current.outcomeFrame, 30); assert.equal(current.held, true);
        assert.equal(current.boss.alive, true); assert.equal(current.boss.bodyAlive, true);
        assert.equal(current.boss.x, 0); assert.equal(current.boss.y, 128); assert.equal(current.sequence, null);
      } else {
        const start = state.trace.find(point => point.point === 'before-escape');
        assert.equal(start.frame - current.outcomeFrame, 40); assert.equal(start.bossAlive, true);
        if (scene.name === 'flight') {
          assert.equal(current.sequence.age, 20); assert.equal(current.sequence.alive, true);
          assert.equal(current.boss.alive, true); assert.equal(current.boss.bodyAlive, true);
          assert.equal(current.boss.direction, -1); assert.ok(current.boss.x < 0 && current.boss.x > -224);
          assert.equal(state.events.some(event => event.name === 'bossescape'), false);
        } else {
          assert.equal(current.sequence.age, 60); assert.equal(current.sequence.escaped, true);
          assert.equal(current.boss.x, -224); assert.equal(current.boss.y, -80);
          assert.equal(current.boss.alive, false); assert.equal(current.boss.bodyAlive, false);
          assert.equal(state.events.filter(event => event.name === 'bossescape').length, 1);
        }
      }
    }
    runs.push({ backend, state, screenshot: prefix + '.png', pngSha256: hash(prefix + '.png') });
  }
  if (prepare) continue;
  assert.deepEqual(runs[0].state, runs[1].state, scene.name + ': backend state mismatch');
  assert.equal(runs[0].pngSha256, runs[1].pngSha256, scene.name + ': backend image mismatch');
  results.push({ scene: scene.name, runs }); console.log('PASS ' + scene.name);
}
assert.deepEqual(hashes(), sourceHashes, 'Production source changed during verification');
fs.writeFileSync(path.join(out, prepare ? 'fixtures.json' : 'report.json'), JSON.stringify(prepare ? { sourceHashes, fixtures } : {
  passed: true, sourceHashes, binarySha256: hash(binary), results, originalExecutableRun: false,
  scope: 'Public TouhouGame with common resources. HP exhaustion is caller-owned: dialogue hold30, hold40 then retreat20/60, and explicit original explosion60. Serial V8/QuickJS image and state equality; no original-executable pixel equivalence claim.',
}, null, 2) + '\n');
