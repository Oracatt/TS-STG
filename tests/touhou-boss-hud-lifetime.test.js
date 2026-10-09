import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DrawList } from '@ts-stg/thlib';
import { AnmBank, TouhouBossPresentation, TouhouGame, createTouhouResources } from '@ts-stg/thlib/touhou';

const hudState = () => ({ name: 'Persistent Boss', remainingSpells: 3, remainingFrames: 1800,
  healthBars: [{ current: 5200, maximum: 8000, markers: [.4] }] });
const drawHud = hud => {
  const draw = new DrawList(); hud.draw(draw); return draw.commands;
};
const remember = hud => ({ fraction: hud.panels[0].fraction, markers: hud.panels[0].markers.slice(),
  rings: hud.panels[0].animations.slice(), name: hud.nameAnimation, stars: hud.stars.slice() });
function assertSameHud(hud, before) {
  assert.equal(hud.panels[0].fraction, before.fraction, 'combat suspension must not reset the shared health ring');
  assert.deepEqual(hud.panels[0].markers, before.markers);
  assert.equal(hud.panels[0].animations.length, before.rings.length);
  for (let index = 0; index < before.rings.length; index++) {
    assert.strictEqual(hud.panels[0].animations[index], before.rings[index]);
    assert.equal(before.rings[index].alive, true);
  }
  assert.equal(hud.name, 'Persistent Boss'); assert.strictEqual(hud.nameAnimation, before.name);
  assert.equal(before.name.alive, true); assert.equal(hud.remainingSpells, 3);
  for (let index = 0; index < before.stars.length; index++) assert.strictEqual(hud.stars[index], before.stars[index]);
  assert.ok(hud.stars.filter(Boolean).every(vm => vm.alive));
  assert.deepEqual(hud.retiringStars, [], 'hiding the HUD must not start removal animations for surviving cards');
}

function assertStopResume({ hud, update, stop, start, setHidden }) {
  for (let frame = 0; frame < 50; frame++) update();
  const before = remember(hud);
  assert.equal(before.fraction, Math.fround(5200 / 8000));
  assert.equal(before.rings.length, 7); assert.ok(before.name);
  assert.equal(before.stars.filter(Boolean).length, 3); assert.ok(drawHud(hud).length > 0);
  for (let cycle = 0; cycle < 3; cycle++) {
    stop();
    for (let frame = 0; frame < 5; frame++) {
      update(); assert.equal(hud.state.hidden, true); assertSameHud(hud, before);
      assert.deepEqual(drawHud(hud), [], 'no name, stars, ring, pointer or timer is drawn while combat is stopped');
    }
    start(); update(); assert.equal(hud.state.hidden, false);
    assertSameHud(hud, before); assert.ok(drawHud(hud).length > 0);
  }
  setHidden(true); update();
  assert.equal(hud.state.hidden, true); assertSameHud(hud, before); assert.deepEqual(drawHud(hud), []);
  setHidden(false); update(); assertSameHud(hud, before); assert.ok(drawHud(hud).length > 0);
}

test('standalone presentation hides its HUD during stopped combat without resetting shared health, stars or name', () => {
  const bank = name => new AnmBank(JSON.parse(fs.readFileSync(new URL(
    `../packages/thlib/assets/touhou-common/anm/${name}.json`, import.meta.url))), { loadTexture: () => 11 });
  const owner = new TouhouBossPresentation({ banks: { effect: bank('effect'), front: bank('front'), ascii_960: bank('ascii_960') },
    player: { x: 0, y: 400, bomb: null } });
  const state = hudState();
  owner.enter({ x: 0, y: 128, hp: 8000, maximumHp: 8000, alive: true }); owner.startCombat();
  try {
    assertStopResume({ hud: owner.hud, update: () => owner.update(state), stop: () => owner.stopCombat(),
      start: () => owner.startCombat(), setHidden: hidden => { state.hidden = hidden; } });
  } finally { owner.destroy(); }
});

test('TouhouGame preserves the same HUD owners and shared health fraction across repeated combat stops', () => {
  const resources = createTouhouResources({ readText: file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), loadTexture: () => 11 });
  const game = new TouhouGame({ banks: resources.banks, font: resources.font, sht: resources.shots[0], styles: resources.styles });
  const boss = game.spawnEnemy({ x: 0, y: 128, hp: 8000, damageInvulnerability: 0, directional: false });
  game.beginSpell({ boss, duration: 1800 }); game.setBossHud(hudState());
  try {
    assertStopResume({ hud: game.bossHud, update: () => game.update(), stop: () => game.stopBossCombat(),
      start: () => game.startBossCombat(), setHidden: hidden => game.setBossHud({ hidden }) });
    assert.strictEqual(game.context.boss, boss); assert.strictEqual(game.bossPresentation.boss, boss);
  } finally { game.destroy(); resources.dispose(); }
});
