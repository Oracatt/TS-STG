// Pure simulation only. Embedded backends run sequentially with --headless;
// no window, graphics initialization, screenshot, audio or original EXE runs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { register } from 'node:module';

register(new URL('./resolve-thlib.mjs', import.meta.url));
const root = path.resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
let executable = process.env.TSSTG_BINARY ?? 'build/Release/ts-stg.exe', output = 'reports/touhou/framework-extension';
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--exe' && args[index + 1]) executable = args[++index];
  else if (args[index] === '--out' && args[index + 1]) output = args[++index];
  else throw new Error('Unknown or incomplete argument: ' + args[index]);
}
const binary = path.resolve(root, executable), out = path.resolve(root, output), frames = 120;
assert.ok(fs.existsSync(binary), 'Build the native host with both backends first'); fs.mkdirSync(out, { recursive: true });
const fileHash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources = ['phase-sequence', 'world', 'player', 'player-profile', 'player-rules', 'items', 'lasers', 'application', 'resources']
  .map(name => 'packages/thlib/dist/touhou/' + name + '.js');
const fixture = 'tests/fixtures/touhou-framework-extension-native.js'; sources.push(fixture);
const hashes = () => Object.fromEntries(sources.map(file => [file, fileHash(path.join(root, file))]));
const sourceHashes = hashes(), binarySha256 = fileHash(binary), runs = [];
const { createTouhouFrameworkExtensionFixture } = await import('../' + fixture);
const node = createTouhouFrameworkExtensionFixture();
for (let frame = 0; frame < frames; frame++) { node.update(); assert.deepEqual(node.render(), []); }
const expected = JSON.parse(JSON.stringify(node.snapshot())); node.destroy();
function validate(state) {
  assert.equal(state.frames, 120); assert.equal(state.closed, true); assert.equal(state.hostFree, true); assert.equal(state.resourcesDisposed, true);
  assert.equal(state.world.shared, true); assert.equal(state.world.localOverride, true); assert.equal(state.world.frozen, true);
  assert.deepEqual([state.world.bounds.left, state.world.bounds.right, state.world.bounds.top, state.world.bounds.bottom], [100, 580, 50, 610]);
  assert.deepEqual([state.player.character, state.player.power, state.player.powerLevel, state.player.maxPower], ['fixture-player', 600, 4, 600]);
  assert.deepEqual([state.player.lives, state.player.bombs, state.player.maxLives, state.player.maxBombs], [4, 2, 9, 8]);
  assert.deepEqual([state.player.normalRadius, state.player.focusRadius, state.player.deathbombFrames], [5, 2, 12]);
  assert.equal(state.player.destroyed, true); assert.equal(state.player.medals, 2); assert.equal(state.player.score, 160, 'two custom medals plus the source power pickup reward');
  assert.ok(state.shooting.normal > 0 && state.shooting.focused > 0); assert.deepEqual(state.bomb, { created: 1, updated: 6, destroyed: 1 });
  assert.equal(state.items.pending, 0); assert.equal(state.items.collections.filter(item => item.type === 'medal').length, 2);
  assert.deepEqual(state.lasers, { capacity: 700, count: 3, inside: true, outside: false, retained: true, local: true });
  assert.equal(state.phases.normal.state, 'complete'); assert.equal(state.phases.normal.completed, true);
  assert.equal(state.phases.cancelled.state, 'cancelled'); assert.equal(state.phases.cancelled.completed, false);
  assert.deepEqual([state.phases.normalAttacks, state.phases.normalCleanup, state.phases.completed,
    state.phases.cancelledAttacks, state.phases.cancelledCleanup, state.phases.remainingTasks], [10, 1, 1, 12, 1, 0]);
  assert.equal(state.application.mode, 'opening'); assert.equal(state.application.disposed, true);
  assert.deepEqual(state.application.scenes, { opening: { updates: 80, destroyed: 2 }, ending: { updates: 40, destroyed: 1 } });
  assert.deepEqual(state.application.changes.map(change => change.mode), ['opening', 'ending', 'opening']);
  assert.deepEqual(state.checkpoints.map(point => point.frame), [30, 60, 90, 120]);
  assert.deepEqual(state.trace.filter(entry => entry[0].startsWith('scene-after-request:')).map(entry => entry[0]),
    ['scene-after-request:opening', 'scene-after-request:ending'], 'switch requests must wait until the active scene callback returns');
}
validate(expected); fs.writeFileSync(path.join(out, 'node.json'), JSON.stringify(expected, null, 2) + '\n');
for (const backend of ['v8', 'quickjs']) {
  const snapshot = path.join(out, backend + '.json'), command = [fixture, '--root', root, '--backend', backend,
    '--headless', '--frames', String(frames), '--input', '0', '--snapshot', snapshot];
  const child = spawnSync(binary, command, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  fs.writeFileSync(path.join(out, backend + '.log'), (child.stdout ?? '') + (child.stderr ?? ''));
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `${backend}: ${child.stdout}\n${child.stderr}`);
  const state = JSON.parse(fs.readFileSync(snapshot, 'utf8')); validate(state); assert.deepEqual(state, expected, backend + ': Node state mismatch');
  runs.push({ backend, frames, snapshot: path.relative(root, snapshot), snapshotSha256: fileHash(snapshot), exactNodeParity: true });
  console.log('PASS headless ' + backend + ': 120 frames match Node exactly');
}
assert.deepEqual(hashes(), sourceHashes, 'Source changed during backend comparison'); assert.equal(fileHash(binary), binarySha256);
const report = { passed: true, frames, runs, sourceHashes, binarySha256, nodeSnapshot: path.relative(root, path.join(out, 'node.json')),
  headless: true, gpuUsed: false, originalExecutableRun: false,
  scope: 'Custom player/rules/Bomb/items, shared world and laser bounds, phase completion/cancellation, deferred custom application scenes and owned cleanup. Exact Node/V8/QuickJS state equality.' };
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS framework extension: ' + path.relative(root, path.join(out, 'report.json')));
