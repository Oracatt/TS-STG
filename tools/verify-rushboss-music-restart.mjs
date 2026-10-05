// Local private-demo audio integration. A real device and paced graphical host
// are essential: never replace these runs with --headless or --benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
let output = 'reports/rushboss/music-restart', executable = 'build/Release/ts-stg.exe', prepare = false, selected = null;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--out') output = args[++index];
  else if (args[index] === '--exe') executable = args[++index];
  else if (args[index] === '--scene') selected = args[++index];
  else if (args[index] === '--prepare') prepare = true;
  else throw new Error('Unknown argument: ' + args[index]);
}
const scenes = [{ name: 'transport', frames: 480 }, { name: 'application', frames: 360 }, { name: 'continuation', frames: 300 }];
if (selected) assert.ok(scenes.some(scene => scene.name === selected), 'Unknown scene ' + selected);
const out = path.resolve(root, output), scratch = path.join(root, 'build/rushboss-music-restart');
const binary = path.resolve(root, executable), fixtures = [], results = [];
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(scratch, { recursive: true });
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'games/rushboss/assets/manifest.json'), 'utf8'));
const files = ['native/src/host.cpp', 'native/include/tsstg/music_stream.hpp', 'games/rushboss/src/music.js', 'games/rushboss/src/graphics-portrait.js',
  'games/rushboss/src/portrait-application.js', 'packages/thlib/src/touhou/application.js',
  'packages/thlib/src/touhou/music.js', 'packages/thlib/src/touhou/game-over.js',
  'tests/fixtures/rushboss-music-restart-native.js', 'tools/verify-rushboss-music-restart.mjs'];
const hashes = () => Object.fromEntries(files.map(file => [file, hash(path.join(root, file))]));
const sourceHashes = hashes();
const musicHashes = Object.fromEntries(Object.entries(manifest.music).map(([name, track]) => [name, {
  file: track.file, sha256: hash(path.join(root, 'games/rushboss/assets', track.file)),
  loopBeginSeconds: track.loopBegin / (track.sampleRate * track.channels),
}]));
const scope = 'Public TouhouMusic through RushMusic and six private WAV streams; stopped and paused time, seek, cached cross-track and same-track restarts. Actual Rush portrait application returns from paused/active gameplay, switches to Player\'s Score on failure, restores the saved stage cursor on Continue and preserves music at completed results. Silent real audio device, serial V8/QuickJS graphical runs at normal pacing. Each required stream must advance more than 0.1 seconds; no-device/all-zero clocks fail. Tests transport position, not recorded audio waveforms or original-executable equivalence.';
try {
  for (const scene of scenes.filter(scene => !selected || selected === scene.name)) {
    const entry = path.join(scratch, scene.name + '.js'), runs = [];
    fs.writeFileSync(entry, `import {createRushMusicRestartFixture} from '../../tests/fixtures/rushboss-music-restart-native.js';\n` +
      `globalThis.__tsstg_game=createRushMusicRestartFixture(tsstg,${JSON.stringify({ scene: scene.name })});\n`);
    for (const backend of ['v8', 'quickjs']) {
      const prefix = path.join(out, backend + '-' + scene.name);
      const command = [path.relative(root, entry), '--root', root, '--backend', backend,
        '--frames', String(scene.frames), '--snapshot', prefix + '.json'];
      fixtures.push({ scene: scene.name, backend, binary, args: command });
      if (prepare) continue;
      const child = spawnSync(binary, command, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
      fs.writeFileSync(prefix + '.log', (child.stdout ?? '') + (child.stderr ?? ''));
      if (child.error) throw child.error;
      assert.equal(child.status, 0, `${backend}/${scene.name}: ${child.stderr || child.stdout}`);
      const state = JSON.parse(fs.readFileSync(prefix + '.json', 'utf8'));
      assert.equal(state.passed, true); assert.equal(state.realAudioAdvanced, true);
      assert.equal(state.frame, scene.frames); assert.equal(state.scene, scene.name);
      assert.equal(state.titleHandleReused, true);
      const expectedTracks=scene.name==='transport'?6:scene.name==='continuation'?3:2;
      assert.equal(state.completedTracks.length, expectedTracks);
      assert.equal(state.handleCount, expectedTracks);
      runs.push({ backend, state }); console.log('PASS ' + backend + '/' + scene.name);
    }
    if (!prepare) {
      // Device time is deliberately nondeterministic. Compare coverage, not
      // real-time sample values or unrelated native resource handle numbers.
      assert.deepEqual(runs[0].state.trace.map(item => item.label), runs[1].state.trace.map(item => item.label));
      assert.deepEqual(runs[0].state.completedTracks, runs[1].state.completedTracks);
      results.push({ scene: scene.name, runs });
    }
  }
  assert.deepEqual(hashes(), sourceHashes, 'Production source changed during verification');
  fs.writeFileSync(path.join(out, prepare ? 'fixtures.json' : 'report.json'), JSON.stringify(prepare ?
    { sourceHashes, musicHashes, fixtures, scope } :
    { passed: true, sourceHashes, musicHashes, binarySha256: hash(binary), results, originalExecutableRun: false, scope }, null, 2) + '\n');
} catch (error) {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed: false, error: String(error), sourceHashes,
    musicHashes, results, originalExecutableRun: false, scope }, null, 2) + '\n');
  throw error;
}
