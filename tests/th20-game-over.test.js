import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Th20Player } from '../games/touhou20/src/player.js';
import { Th20GameOver, continueTh20Game, insertTh20HighScore, TH20_NAME_CHARACTERS } from '../games/touhou20/src/game-over.js';
import { AnmBank } from '../games/touhou20/src/anm.js';
import { Th20BitmapFont } from '../games/touhou20/src/font.js';
import { DrawList } from '../packages/thlib/dist/render.js';
import { Keys } from '../packages/thlib/dist/input.js';
const read = file => JSON.parse(fs.readFileSync(new URL(`../games/touhou20/assets/${file}.json`, import.meta.url)));
const createPlayer = options => new Th20Player({ sht: read('shots/pl00'), ...options });
const createBank = () => new AnmBank(read('anm/front'), { loadTexture: () => 1 });
const advance = (game, count) => { for (let i = 0; i < count; i++) game.update(0); };
test('last-life failure emits once at death frame30 and continued source state enters normal respawn', () => {
  const player = createPlayer({ lives: 0, bombs: 0, power: 300 }); let events = 0;
  player.hit(); while (!events) player.update(0, { onEvent: name => { if (name === 'gameover') events++; } });
  assert.equal(player.state, 2); assert.equal(player.timer.current, 31); assert.equal(player.lives, -1);
  const session = { credits: 5, continues: 0 }; player.score = 456789; player.deaths = 7; player.extendCount = 4;
  continueTh20Game(player, session); assert.deepEqual([player.lives, player.bombs, player.power, player.score], [2, 3, 400, 0]);
  assert.deepEqual([session.credits, session.continues, player.deaths, player.extendCount, player.timer.current], [4, 1, 7, 4, 31]);
  player.update(0); assert.equal(player.state, 0); assert.equal(player.y, 480); assert.equal(player.invulnerability.current, 279);
});
test('failure opens original result panel after10frame delay and Continue closes after12frames', () => {
  let continued = 0, opened;
  const player = createPlayer(), game = new Th20GameOver({ bank: createBank(), player, onOpen: data => { opened = data; }, onContinue: () => continued++, onExit() {}, onRestart() {} });
  assert.deepEqual(opened,{music:'game-over',pauseMusic:true,savedInput:1,clockScale:1},'The public menu requests a semantic cue, never a game-specific BGM file');
  advance(game, 10); assert.equal(game.phase, 2); assert.equal(game.panel, null);
  game.update(); assert.equal(game.phase, 6); assert.equal(game.panel.scriptId, 0x93); assert.equal(game.session.credits, 5);
  game.update(Keys.CONFIRM); assert.equal(game.phase, 18); assert.equal(continued, 0);
  advance(game, 11); assert.equal(continued, 0); game.update(); assert.equal(continued, 1); assert.equal(game.active, false);
});
test('zero credits excludes continue, and result retry exits directly without pause confirmation', () => {
  let exited = 0, restarted = 0;
  const game = new Th20GameOver({ bank: createBank(), player: createPlayer(), session: { credits: 0 }, onExit: () => exited++, onRestart: () => restarted++ });
  advance(game, 11); assert.equal(game.selection, 1); assert.ok(game.excluded.has(0));
  game.update(0, { retryPressed: true }); assert.equal(game.phase, 18); assert.equal(game.selection, 5);
  advance(game, 12); assert.equal(restarted, 1); assert.equal(exited, 0);
});
test('Extra/practice defaults and replay-after-continue restrictions are source-derived', () => {
  const extra = new Th20GameOver({ bank: createBank(), player: createPlayer(), session: { difficulty: 4 }, onExit() {}, onRestart() {} });
  advance(extra, 11); assert.equal(extra.session.credits, 0); assert.ok(extra.excluded.has(0));
  const practice = new Th20GameOver({ bank: createBank(), player: createPlayer(), session: { mode: 1 }, onExit() {}, onRestart() {} });
  advance(practice, 11); assert.equal(practice.panel.scriptId, 0x94); assert.equal(practice.selection, 5);
  const continued = new Th20GameOver({ bank: createBank(), player: createPlayer(), session: { continues: 1 }, onReplay() {}, onExit() {} });
  advance(continued, 11); assert.ok(continued.excluded.has(2));
});
test('original score ranking tie insertion and name entry persist before result menu', () => {
  const records = Array.from({ length: 10 }, (_, i) => ({ score: 100 - i * 10, name: '        ', timestamp: 0 }));
  const player = createPlayer(); player.score = 100;
  assert.equal(insertTh20HighScore(records, player, { stage: 2, continues: 3 }), 0); assert.equal(records[1].score, 100);
  let saved;
  const game = new Th20GameOver({ bank: createBank(), font: new Th20BitmapFont(read('anm/ascii_960'), { loadTexture: () => 1 }),
    player, rankings: records, onExit() {}, onSaveRanking: value => { saved = value; } });
  advance(game, 11); assert.equal(game.phase, 15); advance(game, 10);
  game.update(Keys.CONFIRM); assert.equal(game.playerName, 'A       '); game.update(0);
  const draw = new DrawList(); game.draw(draw); assert.ok(draw.commands.length > 50);
  game.nameCursor = TH20_NAME_CHARACTERS.length - 1; game.update(Keys.CONFIRM);
  assert.equal(game.phase, 6); assert.equal(saved.name, 'A       '); assert.equal(records[0].name, 'A       ');
});
