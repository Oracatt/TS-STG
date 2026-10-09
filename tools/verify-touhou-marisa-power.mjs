// Common-player continuous-power-up coverage. Runs native backends serially.
// --prepare only writes entries/commands; it never starts a native process.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
let output = 'reports/touhou/marisa-power', executable = 'build/Release/ts-stg.exe', selected = null, prepare = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--out') output = args[++index];
  else if (args[index] === '--exe') executable = args[++index];
  else if (args[index] === '--scene') selected = args[++index];
  else if (args[index] === '--prepare') prepare = true;
  else throw new Error('Unknown argument: ' + args[index]);
}
const scenes = [false, true].flatMap(focused => [100, 200, 300, 400].map(capturePower => ({
  name: (focused ? 'focused' : 'unfocused') + '-p' + capturePower, focused, capturePower,
  frames: (capturePower / 100 - 1) * 90 + 80,
})));
if (selected) assert.ok(scenes.some(scene => scene.name === selected), 'Unknown scene ' + selected);
const out = path.resolve(root, output), scratch = path.join(root, 'build/touhou-marisa-power');
const binary = path.resolve(root, executable), results = [], fixtures = [];
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(scratch, { recursive: true });
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = ['packages/thlib/dist/touhou/player.js', 'packages/thlib/dist/touhou/shots.js',
  'tests/fixtures/touhou-marisa-power-native.js'];
const hashes = () => Object.fromEntries(files.map(file => [file, hash(path.join(root, file))]));
const sourceHashes = hashes();
for (const scene of scenes.filter(scene => selected ? selected === scene.name : scene.capturePower === 400)) {
  const entry = path.join(scratch, scene.name + '.js'), runs = [];
  fs.writeFileSync(entry, `import {createTouhouMarisaPowerFixture} from '../../tests/fixtures/touhou-marisa-power-native.js';\n` +
    `globalThis.__tsstg_game=createTouhouMarisaPowerFixture(tsstg,${JSON.stringify({ focused: scene.focused, capturePower: scene.capturePower })});\n`);
  for (const backend of ['v8', 'quickjs']) {
    const prefix = path.join(out, backend + '-' + scene.name), command = [path.relative(root, entry), '--root', root,
      '--backend', backend, '--frames', String(scene.frames), '--benchmark', '--screenshot', prefix + '.png', '--snapshot', prefix + '.json'];
    fixtures.push({ scene: scene.name, backend, binary, args: command });
    if (prepare) continue;
    const child = spawnSync(binary, command, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    fs.writeFileSync(prefix + '.log', (child.stdout ?? '') + (child.stderr ?? ''));
    if (child.error) throw child.error;
    assert.equal(child.status, 0, `${backend}/${scene.name}: ${child.stderr}`);
    const state = JSON.parse(fs.readFileSync(prefix + '.json', 'utf8'));
    assert.equal(state.frozen, true); assert.equal(state.current.frame, scene.frames);
    assert.equal(state.current.power, scene.capturePower); assert.equal(state.current.focused, scene.focused);
    assert.equal(state.violationCount, 0, JSON.stringify(state.violations));
    assert.equal(state.current.activeCount, scene.capturePower / 100);
    assert.equal(state.current.registered.length, state.current.activeCount);
    assert.ok(state.current.groups.every(group => group.activeCount === 1 && group.registeredOwner === group.activeIds[0]));
    assert.ok(state.current.lasers.filter(shot => shot.state === 1).every(shot => shot.width >= 512 && shot.animationAlive));
    assert.deepEqual(state.history.filter(point => (point.frame - 1) % 90 === 79).map(point => point.power),
      [100, 200, 300, 400].filter(power => power <= scene.capturePower), 'All earlier power levels must use this same player');
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
  scope: 'One shared TouhouPlayer continuously shoots and moves through power 100/200/300/400, separately unfocused/focused. Per-frame laser group ownership and stable full-length beams; serial V8/QuickJS screenshot and state equality. Not an original-executable pixel comparison or performance benchmark.',
}, null, 2) + '\n');
