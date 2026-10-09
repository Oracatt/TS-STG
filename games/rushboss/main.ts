// SPDX-License-Identifier: GPL-3.0-only
import { createRushPortraitGame } from './src/portrait-application.js';
declare global {var __RUSH_PORTRAIT_OPTIONS:import('./src/portrait-application.js').RushPortraitOptions|undefined;}
globalThis.__tsstg_game=createRushPortraitGame(globalThis.tsstg,{clock:()=>Date.now()/1000,...globalThis.__RUSH_PORTRAIT_OPTIONS});
