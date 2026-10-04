import { compareDistortion } from './distortion-compare.js';
const records = JSON.parse(tsstg.readText('build/distortion-oracle.json'));
const comparison = compareDistortion(records);
console.log(JSON.stringify({ backend: tsstg.backend, ...comparison }));
globalThis.__tsstg_game = { update() {}, render() { return []; }, snapshot() { return comparison; } };
