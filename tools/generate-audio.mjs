// Original procedural audio. Shared cues belong to thlib; the score belongs to
// the Moonlit Archive application. No third-party audio assets.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const soundRoot = fileURLToPath(new URL('../packages/thlib/assets/', import.meta.url));
const soundDirectory = soundRoot + 'audio/';
const musicDirectory = fileURLToPath(new URL('../examples/danmaku/assets/', import.meta.url));
mkdirSync(soundDirectory, { recursive: true });mkdirSync(musicDirectory, { recursive: true });
const sounds = {};
const rate = 22050;
function wav(name, seconds, sample, directory = soundDirectory) {
  const count = Math.floor(rate * seconds), bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; ++i) bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample(i / rate, seconds))) * 24000), 44 + i * 2);
  writeFileSync(directory + name + '.wav', bytes);
  if (directory === soundDirectory) sounds[name] = { file: `audio/${name}.wav`, format: 'pcm-s16le', channels: 1,
    sampleRate: rate, frames: count, sha256: createHash('sha256').update(bytes).digest('hex') };
}
const sine = (t, hz) => Math.sin(t * hz * Math.PI * 2);
wav('shot', .09, t => sine(t, 1450 - t * 8000) * Math.exp(-t * 48) * .25);
wav('graze', .10, t => (sine(t, 2200) + sine(t, 3400)) * Math.exp(-t * 44) * .12);
wav('pickup', .16, t => sine(t, t < .07 ? 880 : 1320) * Math.exp(-t * 20) * .24);
wav('hit', .35, t => (sine(t, 90 + 40 * sine(t, 31)) + sine(t, 123)) * Math.exp(-t * 10) * .35);
wav('bomb', 1.2, t => (sine(t, 60) + sine(t, 120 + 120 * t) + sine(t, 400 - 200 * t)) * Math.exp(-t * 3) * .24);
wav('select', .1, t => sine(t, 660) * Math.exp(-t * 35) * .3);
// Twelve-second loop in D minor. Whole-cycle sine bass and a gentle boundary fade.
const melody = [74, 77, 81, 77, 72, 76, 79, 76, 70, 74, 77, 74, 69, 72, 76, 72, 74, 77, 81, 84, 82, 81, 77, 76, 74, 72, 70, 72, 69, 72, 76, 77];
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
wav('moonlit', 12, (t, duration) => {
  const beat = t / .375, i = Math.floor(beat), local = (beat - i) * .375;
  const note = hz(melody[i % melody.length]);
  const envelope = Math.min(local * 180, 1) * Math.exp(-local * 8);
  const lead = (sine(t, note) + .28 * sine(t, note * 2)) * envelope;
  const bassNote = hz([38, 36, 34, 33][Math.floor(t / 3) % 4]);
  const bass = sine(t, bassNote) * .25;
  const arp = sine(t, hz([62, 65, 69, 72][Math.floor(beat * 2) % 4])) * Math.exp(-(beat * 2 % 1) * 5) * .16;
  const fade = Math.min(1, t * 30, (duration - t) * 30);
  return (lead * .30 + bass + arp) * fade * .6;
}, musicDirectory);
writeFileSync(soundRoot + 'manifest.json', JSON.stringify({ format: 'ts-stg-builtin-sounds-v1', license: 'MIT',
  origin: 'Original procedural synthesis created for TS-STG; contains no imported game audio.', sounds }, null, 2) + '\n');
console.log('Generated 6 shared thlib sound cues and the Moonlit Archive music loop.');
