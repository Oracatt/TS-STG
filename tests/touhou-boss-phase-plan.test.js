import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TouhouBossPhasePlan } from '../packages/thlib/src/touhou/boss-phase-plan.js';
import { TouhouBossHud } from '../packages/thlib/src/touhou/boss-hud.js';
import { AnmBank } from '../packages/thlib/src/touhou/anm.js';
import { DrawList } from '../packages/thlib/src/render.js';
import { TOUHOU_BOSS_SCREEN_VIEW } from '../packages/thlib/src/touhou/boss-presentation.js';

const data = (name, original = false) => JSON.parse(fs.readFileSync(new URL(
  `../${original ? 'games/touhou20/assets' : 'packages/thlib/assets/touhou-common'}/anm/${name}.json`, import.meta.url)));
const bank = (name, original = false) => new AnmBank(data(name, original), { loadTexture: () => 1 });
const boss = () => ({ x: 0, y: 128, hp: 12000, maximumHp: 12000, alive: true });
const hud = options => new TouhouBossHud({ bank: bank('front'), textBank: bank('ascii_960'), ...options });
const sourcePhases = [
  { hp: 12000 }, { hp: 2200, spell: true },
  { hp: 12000 }, { hp: 2000, spell: true }, { hp: 2500, spell: true },
];

test('fractional display weights use the same boundary as full-health spell state',()=>{
  const plan=new TouhouBossPhasePlan([{hp:450,healthWeight:.85},{hp:1000,healthWeight:.15,spell:true}]);
  const ending=plan.hudState(0,{hp:0}).healthBars[0],starting=plan.hudState(1).healthBars[0];
  assert.equal(ending.current,starting.current);assert.equal(starting.markers[0],Math.fround(starting.current/starting.maximum));
  const display=hud(),enemy=boss();display.update({bosses:[enemy],...plan.hudState(1)});
  for(let i=0;i<50;i++)display.update({bosses:[enemy],...plan.hudState(1)});
  assert.equal(display.panels[0].animations[3].visible,false);display.destroy();
});

test('a survival phase can hide only its health ring while retaining countdown and identity',()=>{
  const display=hud(),enemy=boss(),state={bosses:[enemy],remainingFrames:1200,name:'Survival',remainingSpells:1,
    healthBars:[{current:1500,maximum:1500,visible:true}]};
  display.update(state);assert.equal(display.panels[0].animations.length,7);
  state.healthBars[0].visible=false;display.update(state);
  assert.equal(display.panels[0].animations.length,0);assert.equal(display.timerVisible,true);
  assert.equal(display.name,'Survival');assert.equal(display.remainingSpells,1);display.destroy();
});

test('ECL-style plan shares nonspell/spell health and counts only later cards, matching st01bs 14200/2200 and 2,1,0 stars', () => {
  const phases = structuredClone(sourcePhases), frozen = JSON.stringify(phases), plan = new TouhouBossPhasePlan(phases);
  assert.deepEqual(plan.groups.map(g => [g.start, g.end, g.maximum]), [[0, 1, 14200], [2, 3, 14000], [4, 4, 2500]]);
  const before = plan.hudState(0, { hp: 6000 }), boundary = plan.hudState(0, { hp: 0 }), spell = plan.hudState(1);
  assert.equal(before.healthBars[0].current, 8200);
  assert.equal(before.healthBars[0].markers[0], Math.fround(2200 / 14200));
  assert.deepEqual(boundary.healthBars[0], { ...spell.healthBars[0], phaseHealth: 0 });
  assert.deepEqual(phases.map((_, i) => plan.hudState(i).remainingSpells), [2, 2, 1, 1, 0]);
  assert.equal(plan.hudState(4).healthBars[0].current, 2500);
  assert.deepEqual(plan.hudState(4).healthBars[0].markers, []);
  assert.equal(JSON.stringify(phases), frozen, 'presentation never mutates logical phase data');
});

test('explicit adjacent groups and health weights change presentation without changing damage or phase definitions', () => {
  const phases = [
    { hp: 300, healthWeight: 800, healthGroup: 'a' },
    { hp: 600, healthWeight: 100, healthGroup: 'a' },
    { hp: 100, healthWeight: 100, healthGroup: 'a', spell: true },
    { hp: 400, healthGroup: 'solo' }, { hp: 200, spell: true },
  ];
  const plan = new TouhouBossPhasePlan(phases);
  assert.deepEqual(plan.groups.map(g => [g.start, g.end, g.maximum]), [[0, 2, 1000], [3, 3, 400], [4, 4, 200]]);
  assert.equal(plan.hudState(0, { hp: 150, maximumHp: 300 }).healthBars[0].current, 600);
  assert.deepEqual(plan.groups[0].markers, [Math.fround(.2), Math.fround(.1)]);
  const custom = new TouhouBossPhasePlan([{ life: 50, kind: 'spell' }], { isSpell: p => p.kind === 'spell', weight: p => p.life });
  assert.equal(custom.hudState(0, { hp: 25, maximumHp: 50 }).healthBars[0].current, 25);
  assert.equal(custom.hudState(0).remainingSpells, 0);
});

test('a selected practice spell has a full ring, no future markers or stars, and invalid groups are rejected', () => {
  const plan = new TouhouBossPhasePlan([sourcePhases[1]]);
  assert.deepEqual(plan.hudState(0), { remainingSpells: 0, healthBars: [{ current: 2200, maximum: 2200, phaseHealth: 2200, markers: [], groupIndex: 0 }] });
  for (const hp of [0, NaN, Infinity, -1, 1e-300]) assert.throws(() => new TouhouBossPhasePlan([{ hp }]), RangeError);
  assert.throws(() => new TouhouBossPhasePlan(Array.from({ length: 6 }, () => ({ hp: 1, healthGroup: 'a' }))), /five sections/);
  assert.throws(() => plan.hudState(-1), RangeError);
  assert.throws(() => plan.hudState(0, { maximumHp: 0 }), RangeError);
});

test('Boss HUD uses whole-group health and original phase thresholds, preserving the ring across nonspell to spell', () => {
  const display = hud(), enemy = boss(), plan = new TouhouBossPhasePlan(sourcePhases);
  const update = (phase, hp) => display.update({ bosses: [enemy], player: { x: 100, y: 400 }, ...plan.hudState(phase, { hp }) });
  for (let i = 0; i < 80; i++) update(0, 12000);
  assert.equal(display.panels[0].fraction, 1);
  assert.equal(display.panels[0].animations[3].visible, true);
  update(0, 0);
  const threshold = Math.fround(2200 / 14200);
  assert.equal(display.panels[0].fraction, threshold);
  assert.equal(display.panels[0].animations[3].visible, false);
  update(1, 2200);assert.equal(display.panels[0].fraction, threshold, 'starting spell does not refill to 100%');
  update(1, 1100);assert.equal(display.panels[0].fraction, Math.fround(1100 / 14200));
  assert.equal(display.panels[0].hp, 1100);
  assert.equal(enemy.hp, 12000, 'HUD projection never changes actual damage state');
  display.destroy();
});

test('full spell rings fill on the first visible frame, follow real damage and clear previous section markers', () => {
  const phases = structuredClone(sourcePhases), original = JSON.stringify(phases);
  const plan = new TouhouBossPhasePlan(phases, { spellRing: 'full' }), source = new TouhouBossPhasePlan(phases);
  const display = hud(), enemy = boss();
  const update = (index, hp) => display.update({ bosses: [enemy], ...plan.hudState(index, { hp }) });
  assert.deepEqual(plan.hudState(0), source.hudState(0), 'nonspell sections still use real group HP');
  for (let i = 0; i < 45; i++) update(0, 12000);
  assert.equal(display.panels[0].animations[3].visible, true);
  update(0, 0);assert.ok(display.panels[0].fraction < .2);
  update(1, 2200);
  const panel = display.panels[0];
  assert.equal(panel.target, 1);assert.equal(panel.fraction, 1, 'first spell HUD update is already a full circle');
  assert.deepEqual(panel.markers, [0, 0, 0, 0]);assert.ok(panel.animations.slice(3).every(vm => !vm.visible));
  update(1, 1100);assert.equal(panel.fraction, .5, 'damage consumes the whole spell ring proportionally');
  update(1, 0);assert.equal(panel.fraction, 0);
  update(2, 12000);assert.equal(panel.fraction, Math.fround(.025), 'next nonspell retains source filling');
  assert.equal(panel.markers[0], Math.fround(2000 / 14000));
  update(3, 2000);assert.equal(panel.fraction, 1);
  enemy.damageInvulnerability = { current: 1 };update(4, 2500);assert.equal(panel.animations.length, 0);
  enemy.damageInvulnerability.current = 0;update(4, 2500);assert.equal(panel.fraction, 1);
  assert.equal(JSON.stringify(phases), original);assert.equal(enemy.hp, 12000);
  display.destroy();
});

test('full spell projection excludes future sections even inside explicit groups and rejects misspelled policies', () => {
  const phases = [{hp:300,healthGroup:'a'}, {hp:200,spell:true,healthGroup:'a'}, {hp:100,spell:true,healthGroup:'a'}];
  const plan = new TouhouBossPhasePlan(phases, {spellRing:'full'});
  const state = plan.hudState(1, {hp:100});
  assert.equal(state.healthBars[0].current,100);assert.equal(state.healthBars[0].maximum,200);
  assert.deepEqual(state.healthBars[0].markers,[]);assert.equal(state.remainingSpells,1);
  assert.throws(() => new TouhouBossPhasePlan(phases, {spellRing:'ful'}), /spellRing/);
});

test('future-card stars retain source sprite38, position, layer, 60+20 entry and 20-frame removal', () => {
  const display = hud(), enemy = boss(), state = { bosses: [enemy], remainingSpells: 3 };
  display.update(state);
  const stars = display.stars.filter(Boolean);
  assert.deepEqual(stars.map(vm => [vm.scriptId, vm.spriteIndex, vm.drawPriority]), [[58, 38, 60], [59, 38, 60], [60, 38, 60]]);
  assert.deepEqual(stars.map(vm => vm.worldPosition(TOUHOU_BOSS_SCREEN_VIEW)), [{ x: 54, y: 37.5, z: 0 }, { x: 69, y: 37.5, z: 0 }, { x: 84, y: 37.5, z: 0 }]);
  for (let i = 1; i < 59; i++) display.update(state);
  assert.equal(stars[0].alpha, 0);
  for (let i = 0; i < 22; i++) display.update(state);
  assert.equal(stars[0].alpha, 255);
  state.remainingSpells = 2;display.update(state);
  assert.strictEqual(display.retiringStars[0], stars[2]);assert.equal(stars[2].alive, true);
  for (let i = 0; i < 10; i++) display.update(state);
  assert.ok(stars[2].alpha > 0 && stars[2].alpha < 255);
  assert.ok(stars[2].scaleX > 1, 'source removal enlarges the departing star');
  for (let i = 0; i < 12; i++) display.update(state);
  assert.equal(stars[2].alive, false);assert.equal(display.retiringStars.length, 0);
  assert.equal(display.stars.filter(Boolean).length, 2);
  display.destroy();assert.ok(stars.every(vm => !vm.alive));
});

test('custom Boss names use the original label alpha timeline and position without importing concrete Boss art', () => {
  const calls = [], display = hud({ drawName: (draw, name, options) => calls.push({ name, ...options }) });
  const source = bank('front', true).create(150), enemy = boss(), state = { bosses: [enemy], name: 'Custom Boss', remainingSpells: 1 };
  display.setName(state.name);
  assert.equal(data('front').scripts[150].excluded, true);
  for (let frame = 0; frame < 90; frame++) {
    assert.equal(display.nameAnimation.alpha, source.alpha);
    display.update(state);source.update();
  }
  display.draw(new DrawList(), TOUHOU_BOSS_SCREEN_VIEW);
  assert.equal(calls.length, 1);assert.equal(calls[0].name, 'Custom Boss');
  assert.deepEqual([calls[0].x, calls[0].y, calls[0].drawPriority, calls[0].color], [36, 16, 60, 0xffffffff]);
  display.update({ bosses: [] });assert.equal(display.nameAnimation, null);
  assert.equal(display.remainingSpells, 0);assert.equal(display.retiringStars.length, 1);
  display.destroy();source.destroy();
});

test('explicit visual HP controls the source placeholder gate independently of logical damage HP', () => {
  const display = hud(), enemy = { ...boss(), hp: 1000000, maximumHp: 1000000 };
  const plan = new TouhouBossPhasePlan([{ hp: 1000000, healthWeight: 1000 }]);
  display.update({ bosses: [enemy] });assert.equal(display.panels[0].animations.length, 0);
  display.update({ bosses: [enemy], ...plan.hudState(0) });
  assert.equal(display.panels[0].animations.length, 7);assert.equal(display.panels[0].target, 1);
  assert.equal(display.panels[0].hp, 1000);assert.equal(enemy.hp, 1000000);
  display.destroy();
});

test('hidden and cleared Boss labels/stars keep no immortal or resurrected animation roots', () => {
  const names = [], display = hud({ drawName: (...args) => names.push(args) }), enemy = boss();
  const state = { bosses: [enemy], name: 'Boss', remainingSpells: 3 };
  for(let i = 0; i < 90; i++) display.update(state);
  const stars = display.stars.filter(Boolean), label = display.nameAnimation;
  const hiddenDraw = new DrawList();
  display.update({ ...state, hidden: true });display.draw(hiddenDraw, TOUHOU_BOSS_SCREEN_VIEW);
  assert.equal(hiddenDraw.commands.length, 0, 'hidden also suppresses pre-existing ring and pointer roots');
  assert.ok(stars.every(vm => !vm.visible));assert.equal(names.length, 0);
  display.update(state);assert.ok(stars.every(vm => vm.visible));
  const shownDraw = new DrawList();display.draw(shownDraw, TOUHOU_BOSS_SCREEN_VIEW);assert.ok(shownDraw.commands.length > 0);
  display.update({ bosses: [] });assert.equal(label.alive, false);assert.equal(display.nameAnimation, null);
  assert.equal(display.stars.filter(Boolean).length, 0);assert.equal(display.retiringStars.length, 3);
  for(let i = 0; i < 24; i++) display.update({ bosses: [] });
  assert.equal(display.retiringStars.length, 0);assert.ok(stars.every(vm => !vm.alive));
  display.update({ ...state, remainingSpells: 1 });
  assert.equal(display.stars.filter(Boolean).length, 1);assert.notStrictEqual(display.stars[0], stars[0]);
  const recreated = display.stars[0];display.destroy();assert.equal(recreated.alive, false);
});
