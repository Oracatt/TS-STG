import assert from 'node:assert/strict';
import { register } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
register(new URL('./resolve-thlib.mjs', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const backend = process.env.TSSTG_BACKEND ?? 'quickjs';
assert.ok(['quickjs','v8'].includes(backend),'TSSTG_BACKEND must be quickjs or v8');
const { createFixture } = await import('../tests/fixtures/full-game.js');
const frames = 7200;
function runJS() {
  const fixture = createFixture();
  for (let i = 0; i < frames; i++) { fixture.update(); fixture.render(); }
  return fixture.snapshot();
}
const start = performance.now(), first = runJS(), second = runJS();
assert.deepEqual(first, second, 'Repeated full-stage simulation must be identical');
assert.equal(first.events.phaseStarts, 4, 'All four boss phases should run');
assert.equal(first.events.phaseEnds, 4, 'All four boss phases should finish');
assert.equal(first.events.clear, 1, 'Stage must reach clear');
assert.ok(first.peakBullets >= 100, 'Demo must exercise a real barrage');
assert.ok(first.peakLasers >= 1, 'Demo must exercise laser entities');
const report = { frames, repeatedNodeDeterminism: true, nodeTwoRunsMs: Math.round(performance.now() - start),
  events: first.events, peakBullets: first.peakBullets, peakLasers: first.peakLasers };
const candidates = [process.env.TSSTG_BINARY, 'build/Release/ts-stg.exe', 'build/RelWithDebInfo/ts-stg.exe', 'build/Debug/ts-stg.exe', 'build/ts-stg.exe', 'build/ts-stg']
  .filter(Boolean).map(path => resolve(root, path));
const binary = candidates.find(existsSync);
if (!binary) throw new Error('Native binary missing. Build with ./build.ps1 before integration verification.');
const output = resolve(root, 'build/integration-native.json');
mkdirSync(dirname(output), { recursive: true });
const nativeStart = performance.now();
const child = spawnSync(binary, ['tests/fixtures/full-game.js', '--root', root, '--backend', backend, '--headless', '--frames', String(frames), '--snapshot', output],
  { cwd: root, encoding: 'utf8', timeout: 120000 });
if (child.error) throw child.error;
assert.equal(child.status, 0, `Native integration failed:\n${child.stdout}\n${child.stderr}`);
const native = JSON.parse(readFileSync(output, 'utf8'));
function compare(a, b, path = '$') {
  if (typeof a === 'number' && typeof b === 'number') {
    const tolerance = Number.isInteger(a) && Number.isInteger(b) ? 0 : 1e-7 * Math.max(1, Math.abs(a));
    assert.ok(Math.abs(a - b) <= tolerance, `${path}: Node=${a}, ${backend}=${b}`);
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `Keys differ at ${path}`);
    for (const key of Object.keys(a)) compare(a[key], b[key], `${path}.${key}`);
  } else assert.equal(a, b, path);
}
compare(first, native);
report.backend = backend; report.nativeParity = true; report.nativeMs = Math.round(performance.now() - nativeStart);
if (backend === 'quickjs') { report.quickjsParity = true; report.quickjsMs = report.nativeMs; }
const replayOutput = resolve(root, 'build/replay-verification.json');
const replayChild = spawnSync(binary, ['tests/fixtures/replay-native.js', '--root', root, '--backend', backend, '--headless', '--frames', '1800', '--snapshot', replayOutput],
  { cwd: root, encoding: 'utf8', timeout: 30000 });
if (replayChild.error) throw replayChild.error;
assert.equal(replayChild.status, 0, `Native replay failed: ${replayChild.stdout}\n${replayChild.stderr}`);
report.nativeReplay = JSON.parse(readFileSync(replayOutput, 'utf8'));
assert.equal(report.nativeReplay.verified, true);
writeFileSync(resolve(root, 'build/verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
