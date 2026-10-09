import type {TouhouApplication} from '@ts-stg/thlib/touhou';
// Deterministic visual fixture for the actual original capture + pause panel.
globalThis.__TH20_DEMO_OPTIONS={autostart:true,character:0};
await import('./main.js');
const game=globalThis.__tsstg_game as TouhouApplication;let frame=0;
globalThis.__tsstg_game={update(){game.update(frame++===120?128:0);},render:()=>game.render(),snapshot:()=>game.snapshot()};
