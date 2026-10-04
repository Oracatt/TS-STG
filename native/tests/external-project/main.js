import { DrawList } from '@ts-stg/thlib';
import { TouhouPlayer, AnmBank } from '@ts-stg/thlib/touhou';
if(typeof TouhouPlayer!=='function'||typeof AnmBank!=='function')throw new Error('Public library namespace did not resolve');
import { createBusinessEntity } from './business.js';
const entity=createBusinessEntity();
let escaped = false;
try { tsstg.readText('node_modules/@ts-stg/thlib/src/index.js'); escaped = true; } catch {}
// A real npm file dependency may be a symlink: module trust must not grant resource access.
if (globalThis.testLibraryIsSymlink && escaped) throw new Error('Library module root exposed as a resource root');
globalThis.__tsstg_game = {
  update() { entity.update(); }, render() { return new DrawList().clear(0x101020ff).commands; },
  snapshot() { return { imported: true, businessRelative: true, position: entity.x, linkedLibrary: !!globalThis.testLibraryIsSymlink }; }
};
