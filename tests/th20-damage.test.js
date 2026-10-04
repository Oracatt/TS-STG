import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Th20DamageAccumulator, Th20Health } from '../games/touhou20/src/damage.js';
import { Th20Spell } from '../games/touhou20/src/spell.js';
import { Th20Enemy } from '../games/touhou20/src/enemy.js';
import { continueTh20Game } from '../games/touhou20/src/game-over.js';
const vectors = JSON.parse(fs.readFileSync(new URL('./fixtures/th20-player-vectors.json', import.meta.url)));
const sht = JSON.parse(fs.readFileSync(new URL('../games/touhou20/assets/shots/pl00.json', import.meta.url)));

test('death direction uses last region hit position and hidden targets give no damage score',()=>{
  const bank={create(scriptId,options={}){return {scriptId,...options,alive:true,destroy(){this.alive=false;}};}},player={state:1,score:0,sht};
  const queue=new Th20DamageAccumulator({player}),enemy=new Th20Enemy({bank,hp:10,x:5,y:40,damageInvulnerability:0});
  queue.add(enemy,7,{x:1,y:40});queue.add(enemy,7,{x:8,y:40});queue.flush({effectBank:bank});
  assert.deepEqual(enemy.lastHitPosition,{x:8,y:40,z:0});assert.equal(enemy.effects[0].rotation,Math.fround(Math.PI));
  const score=player.score,hidden=new Th20Enemy({bank,primaryFlags:0x20});queue.add(hidden,50);assert.deepEqual(queue.flush(),[]);assert.equal(player.score,score);
});
test('source per-enemy cap, score reward and integer damage divisions match C++', () => {
  for (const [input, state, flags, nominal, amount, score] of vectors.damage) {
    const player = { state, score: 0, sht }, spell = new Th20Spell(); spell.flags = flags;
    const queue = new Th20DamageAccumulator({ player, spell }), enemy = { alive: true, hp: 500, damage(value) { this.hp -= value; } };
    queue.add(enemy, input); const [result] = queue.flush(); assert.deepEqual([result.nominal, result.amount, player.score], [nominal, amount, score]);
  }
});
test('spell suppression applies after accumulation, and source spell HP retains seventh fractions', () => {
  const spell = new Th20Spell(); spell.flags = 33; const player = { state: 1, score: 0, sht };
  const health = new Th20Health(100, { spell: true }), enemy = { alive: true, damage(value) { health.apply(value); } };
  const queue = new Th20DamageAccumulator({ player, spell });
  queue.add(enemy, 15); queue.add(enemy, 15); assert.equal(queue.flush()[0].amount, 1);
  assert.equal(health.scaledHp, 699); assert.equal(health.hp, 99);
  health.apply(1); assert.equal(health.hp, 99); assert.equal(health.scaledHp, 698);
});
test('original damage helper and Continue reset vectors compare to C++', () => {
  let health, key;
  for (const [hp, threshold, amount, ...expected] of vectors.spellHealth) {
    const next = `${hp},${threshold}`; if (key !== next) { key = next; health = new Th20Health(hp, { spell: true, threshold }); }
    health.apply(amount); assert.deepEqual([health.hp, health.scaledHp, health.damageTotal], expected);
  }
  for (const [unit, maximum, count, credits, ...expected] of vectors.continueGame) {
    const p = { startingPower: unit, maxBombs: maximum }, session = { continues: count, credits };
    continueTh20Game(p, session); assert.deepEqual([p.bombs, p.power, session.continues, session.credits], expected);
  }
});
