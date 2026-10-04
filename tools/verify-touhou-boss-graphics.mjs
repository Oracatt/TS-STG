// Actual QuickJS/GPU equality of unfiltered original extraction and the public
// common pack. It is not an original-executable comparison.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { decodeRgbaPng } from './import-touhou-common-assets.mjs';

const root = resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
let output = 'reports/touhou-boss', executable = 'build/Release/ts-stg.exe', filter = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') output = args[++i]; else if (args[i] === '--exe') executable = args[++i];
  else if (args[i] === '--scene') filter = args[++i]; else throw Error(`Unknown option ${args[i]}`);
}
const folder = resolve(root, output), fixtures = resolve(root, 'build/touhou-boss-graphics'), exe = resolve(root, executable);
mkdirSync(folder, { recursive: true }); mkdirSync(fixtures, { recursive: true });
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const scenes = [
  ...[1, 20, 40, 60, 80, 120, 150].map(frames => ({ name: `spell-${String(frames).padStart(3, '0')}`, frames })),
  ...[1, 36, 72, 120].map(frames => ({ name: `warp-${String(frames).padStart(3, '0')}`, frames, warpOnly: true })),
  { name: 'midboss-060', frames: 60, profile: 'midboss' }, { name: 'shifted-060', frames: 60, shifted: true },
].filter(scene => !filter || scene.name === filter);
assert.ok(scenes.length, 'No matching scene'); const results = [];
for (const scene of scenes) {
  const artifacts = {};
  for (const assets of ['original', 'shared']) {
    const prefix = join(folder, `${scene.name}-${assets}`), entry = join(fixtures, `${scene.name}-${assets}.js`);
    writeFileSync(entry, `import {createTouhouBossPresentationFixture} from '../../tests/fixtures/touhou-boss-presentation-native.js';
globalThis.__tsstg_game=createTouhouBossPresentationFixture(tsstg,${JSON.stringify({ ...scene, assets })});\n`);
    const child = spawn(exe, [relative(root, entry), '--root', root, '--frames', String(scene.frames), '--benchmark',
      '--screenshot', prefix + '.png', '--snapshot', prefix + '.json'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let messages = ''; child.stdout.on('data', data => messages += data); child.stderr.on('data', data => messages += data);
    const code = await new Promise((done, reject) => { child.on('close', done); child.on('error', reject); });
    assert.equal(code, 0, `${scene.name}/${assets}: ${messages}`);
    artifacts[assets] = { screenshot: prefix + '.png', snapshot: prefix + '.json', pngSha256: sha(prefix + '.png') };
  }
  const original = JSON.parse(readFileSync(artifacts.original.snapshot)), shared = JSON.parse(readFileSync(artifacts.shared.snapshot));
  assert.deepEqual(shared, original, `${scene.name}: complete presentation state differs`);
  const left = decodeRgbaPng(readFileSync(artifacts.original.screenshot)), right = decodeRgbaPng(readFileSync(artifacts.shared.screenshot));
  assert.equal(left.width, right.width); assert.equal(left.height, right.height);
  assert.deepEqual(right.rgba, left.rgba, `${scene.name}: original/shared pixels differ`);
  results.push({ ...scene, completeStateIdentical: true, changedPixels: 0, artifacts }); console.log(`${scene.name}: original/shared RGBA and complete state identical`);
}
writeFileSync(join(folder, 'report.json'), JSON.stringify({ format: 'ts-stg-touhou-boss-graphics-v1', passed: true,
  scope: 'Same recovered original Boss presentation with unfiltered extraction versus public common pack; does not run the original executable',
  binarySha256: sha(exe), results }, null, 2) + '\n');
