import { marker } from './smoke-module.js';
if (marker !== 42 || !['quickjs','v8'].includes(tsstg.backend)) throw new Error('Module or API setup failed');
tsstg.writeText('native-smoke.txt', 'resource round trip');
if (tsstg.readText('userdata/native-smoke.txt') !== 'resource round trip') throw new Error('Resource round trip failed');
for (const name of ['../escape.txt', '/absolute.txt', 'nested/../../escape.txt']) {
  let rejected = false;
  try { tsstg.writeText(name, 'forbidden'); } catch { rejected = true; }
  if (!rejected) throw new Error(`Unsafe path accepted: ${name}`);
}
let readRejected = false;
try { tsstg.readText('../outside.txt'); } catch { readRejected = true; }
if (!readRejected) throw new Error('Unsafe read path accepted');
let missingRejected = false;
try { tsstg.playSound(987654); } catch { missingRejected = true; }
if (!missingRejected) throw new Error('Invalid resource handle accepted');
await Promise.resolve();
await Promise.reject(new Error('Handled rejection')).catch(() => {});
let frames = 0;
globalThis.__tsstg_game = {
  update(mask) { if (mask !== 16) throw new Error('Input mask mismatch'); frames++; },
  render() { return [
    ['clear', 0x101020ff], ['circle', 20, 20, 3, 0xffffffff],
    ['ring', 30, 30, 2, 4, 0xffffffff], ['line', 10, 10, 50, 50, 1, 0xffffffff],
    ['rect', 10, 10, 40, 40, 0xffffffff], ['text', 'TS-STG', 20, 20, 20, 0xffffffff],
    ['triangle', 0, 0, 10, 0, 5, 10, 0xffffffff], ['scissor', 0, 0, 200, 200], ['scissorEnd'],
    ['blend', 'add'], ['circle', 70, 70, 10, 0xff3366ff], ['blendEnd']
  ]; },
  snapshot() { if (frames !== 4) throw new Error('Fixed frame count mismatch'); return {frames, marker}; }
};
