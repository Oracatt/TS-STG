// SPDX-License-Identifier: GPL-3.0-only
import { createRushPortraitGame } from './src/portrait-application.js';
globalThis.__tsstg_game=createRushPortraitGame(globalThis.tsstg,{clock:()=>Date.now()/1000,...globalThis.__RUSH_PORTRAIT_OPTIONS});
