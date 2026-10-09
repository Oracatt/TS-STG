import test from 'node:test';
import assert from 'node:assert/strict';
import { TouhouHealth, TouhouTimer, applyTouhouEnemyDamage } from '../packages/thlib/dist/touhou/index.js';

for (const spell of [false, true]) {
  test(`ECL 515 protects ${spell ? 'spell' : 'normal'} HP through the final positive timer frame`, () => {
    const health = new TouhouHealth(100, { spell }), damageInvulnerability = new TouhouTimer(2);
    const options = { damageInvulnerability };
    // The original damages first and decrements once per actor update. Many
    // overlapping regions cannot consume the protection timer within a frame.
    for (const amount of [21, 7]) assert.equal(applyTouhouEnemyDamage(health, amount, options), 100);
    assert.deepEqual([health.hp, health.scaledHp, health.damageTotal, damageInvulnerability.current], [100, 700, 28, 2]);
    damageInvulnerability.add(-1);
    assert.equal(applyTouhouEnemyDamage(health, 14, options), 100);
    assert.deepEqual([health.hp, health.scaledHp, health.damageTotal, damageInvulnerability.current], [100, 700, 42, 1]);
    damageInvulnerability.add(-1);
    assert.equal(applyTouhouEnemyDamage(health, 7, options), spell ? 99 : 93);
    assert.deepEqual([health.hp, health.scaledHp, health.damageTotal, damageInvulnerability.current], [spell ? 99 : 93, spell ? 693 : 700, 49, 0]);
  });

  test(`source primary flag 0x10 records ${spell ? 'spell' : 'normal'} hits independently of the timer`, () => {
    const health = new TouhouHealth(100, { spell });
    const options = { primaryFlags: 0x10, damageInvulnerability: new TouhouTimer(0) };
    assert.equal(applyTouhouEnemyDamage(health, 49, options), 100);
    assert.deepEqual([health.hp, health.scaledHp, health.damageTotal], [100, 700, 49]);
    options.primaryFlags = 0;
    assert.equal(applyTouhouEnemyDamage(health, 7, options), spell ? 99 : 93);
    assert.equal(health.damageTotal, 56);
  });
}

test('omitting the damage gate preserves ordinary health arithmetic and spell remainders', () => {
  const normal = new TouhouHealth(10), spell = new TouhouHealth(10, { spell: true });
  assert.equal(applyTouhouEnemyDamage(normal, 3), 7);
  assert.equal(applyTouhouEnemyDamage(spell, 1), 9);
  assert.equal(applyTouhouEnemyDamage(spell, 6, { damageInvulnerability: null }), 9);
  assert.deepEqual([spell.hp, spell.scaledHp, spell.damageTotal], [9, 63, 7]);
  assert.equal(applyTouhouEnemyDamage(spell, 7, { damageInvulnerability: { current: -1 } }), 8);
});
