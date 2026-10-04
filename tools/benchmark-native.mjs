import { existsSync, mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';

const usage = 'Usage: node tools/benchmark-native.mjs [bullets=2000] [frames=240] [--backend quickjs|v8] [--warmup 30] [--exe path] [--out report.json]';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), positional = [];
let requestedExe, output, warmup = 30, backend = 'quickjs';
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') { console.log(usage); process.exit(0); }
  if (['--warmup', '--exe', '--out', '--backend'].includes(arg)) {
    const value = args[++i];
    if (value === undefined) throw new Error(`Missing value for ${arg}. ${usage}`);
    if (arg === '--warmup') warmup = Number(value);
    else if (arg === '--exe') requestedExe = value;
    else if (arg === '--backend') backend = value;
    else output = value;
  } else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}. ${usage}`);
  else positional.push(arg);
}
if (positional.length > 2) throw new Error(usage);
if (!['quickjs','v8'].includes(backend)) throw new Error('--backend requires quickjs or v8');
const count = Number(positional[0] ?? 2000), frames = Number(positional[1] ?? 240);
for (const [name, value, minimum, maximum] of [
  ['bullets', count, 1, 50000], ['frames', frames, 1, 100000], ['warmup', warmup, 0, 10000],
]) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}. ${usage}`);
}

const explicitBinary = requestedExe ?? process.env.TSSTG_BINARY;
const candidates = explicitBinary ? [explicitBinary] : [
  'build/Release/ts-stg.exe', 'build/RelWithDebInfo/ts-stg.exe',
  'build/ts-stg', 'build/ts-stg.exe', 'build/Debug/ts-stg.exe',
];
const binary = candidates.map(path => resolve(root, path)).find(existsSync);
if (!binary) throw new Error('Native binary missing. Run ./build.ps1 first, or pass --exe / TSSTG_BINARY.');

const build = resolve(root, 'build');
mkdirSync(build, { recursive: true });
const directory = mkdtempSync(resolve(build, 'native-benchmark-'));
const entry = resolve(directory, 'entry.js');
writeFileSync(entry,
  `globalThis.__tsstg_benchmark_config = ${JSON.stringify({ count, frames, warmup })};\n` +
  "await import('../../tools/benchmark-quickjs.js');\n");

let report;
try {
  const started = performance.now();
  const child = spawnSync(binary, [relative(root, entry).split(sep).join('/'), '--root', root,
    '--backend', backend, '--headless', '--frames', String(frames + warmup)], {
    cwd: root, encoding: 'utf8', timeout: Math.min(600000, Math.max(30000, (frames + warmup) * 250)),
    windowsHide: true,
  });
  const wallMs = Math.round((performance.now() - started) * 1000) / 1000;
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Native benchmark failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
  for (const line of child.stdout.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    try {
      const value = JSON.parse(line);
      if (value.kind === 'tsstg-native-benchmark-v1') report = value;
    } catch { /* Native diagnostic lines are not benchmark data. */ }
  }
  if (!report || report.measuredFrames !== frames || report.bullets !== count)
    throw new Error(`Native host did not return the expected complete benchmark:\n${child.stdout}`);
  report = { ...report, wallMs, wallAverageFrameMs: Math.round(wallMs / (frames + warmup) * 1000) / 1000,
    wallScope: 'Entire native process: module startup, warmup, JS, native command decoding, shutdown; headless, no GPU/audio/window',
    environment: { platform: platform(), architecture: arch(), cpu: cpus()[0]?.model ?? 'unknown', binary: relative(root, binary) },
  };
} finally {
  // Remove only the exact generated entry and its now-empty directory.
  unlinkSync(entry);
  rmdirSync(directory);
}

if (output) {
  const path = isAbsolute(output) ? output : resolve(root, output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
