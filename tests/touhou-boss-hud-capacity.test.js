import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnmBank } from '../packages/thlib/dist/touhou/anm.js';
import { TouhouBossHud } from '../packages/thlib/dist/touhou/boss-hud.js';
import { TouhouBossPhasePlan } from '../packages/thlib/dist/touhou/boss-phase-plan.js';
import { DrawList } from '../packages/thlib/dist/render.js';

const data = name => JSON.parse(fs.readFileSync(new URL(`../packages/thlib/assets/touhou-common/anm/${name}.json`, import.meta.url)));
const bank = name => new AnmBank(data(name), { loadTexture: () => 1 });
const create = options => new TouhouBossHud({ bank: bank('front'), textBank: bank('ascii_960'), ...options });
const enemy = (x = 0, y = 128) => ({ x, y, hp: 700, maximumHp: 700, alive: true });
const frame = (hud, state, count = 90) => { for (let i = 0; i < count; i++) hud.update(state); };
const render = hud => hud.draw(new DrawList()).commands;
const renderAnimation = vm => { const draw = new DrawList(); vm.draw(draw); return draw.commands; };
const geometry = commands => commands.filter(command => ['mesh', 'quad', 'statefulQuad'].includes(command[0]));

test('three configured Boss panels render independent rings and all six section markers', () => {
  const hud = create({ panelCount: 3, markerCount: 6 });
  const bosses = [enemy(-100, 100), enemy(0, 180), enemy(100, 260)], markers = [.15, .3, .45, .6, .75, .9];
  const state = { bosses, player: { x: -180, y: 440 }, remainingFrames: -1,
    healthBars: bosses.map(() => ({ current: 700, maximum: 700, markers, animateFill: false })) };
  try {
    frame(hud, state);
    assert.equal(hud.panels.length, 3);
    for (let index = 0; index < 3; index++) {
      const panel = hud.panels[index];
      assert.equal(panel.animations.length, 9); assert.equal(panel.fraction, 1);
      assert.ok(panel.animations.slice(3).every(vm => vm.visible && vm.scriptId === 377));
      assert.deepEqual(panel.animations.slice(0, 3).map(vm => [vm.x, vm.y]), Array(3).fill([bosses[index].x * 2, bosses[index].y * 2]));
    }
    const withAll = geometry(render(hud));
    const third = hud.panels[2].animations.slice();
    hud.update({ ...state, bosses: bosses.slice(0, 2) });
    const withTwo = geometry(render(hud));
    assert.ok(withAll.length > withTwo.length, 'the third configured panel adds real ANM geometry');
    assert.equal(hud.panels[2].animations.length, 0); assert.ok(third.every(vm => !vm.alive));
    assert.equal(hud.panels[0].animations.length, 9); assert.equal(hud.panels[1].animations.length, 9);
    const fifth = hud.panels[0].animations[7], sixth = hud.panels[0].animations[8];
    for (const vm of [fifth, sixth]) {
      const drawn = geometry(renderAnimation(vm));
      assert.ok(drawn.length, 'markers beyond the source four submit geometry');
    }
  } finally { hud.destroy(); }
});

test('custom star layout renders above the source ten and owns every retiring root', () => {
  const created = [], hud = create({ starCapacity: 12, createStar(index, front) {
    const vm = front.create(58); vm.F(0x2c, 36 + index * 10); vm.F(0x30, 25 + Math.trunc(index / 6) * 12);
    created.push({ index, front, vm }); return vm;
  } });
  const state = { bosses: [enemy()], remainingFrames: -1, remainingSpells: 99 };
  try {
    frame(hud, state);
    assert.equal(hud.remainingSpells, 12); assert.equal(created.length, 12);
    assert.deepEqual(created.map(entry => entry.index), Array.from({ length: 12 }, (_, i) => i));
    assert.ok(created.every(entry => entry.front === hud.bank));
    const starCommands = created.map(({ vm }) => geometry(renderAnimation(vm)));
    assert.ok(starCommands.every(commands => commands.length > 0));
    assert.notDeepEqual(starCommands[10], starCommands[11], 'the custom factory controls distinct star positions');
    const withStars = geometry(render(hud)).length;
    frame(hud, { ...state, remainingSpells: 0 }, 24);
    assert.equal(hud.remainingSpells, 0); assert.equal(hud.retiringStars.length, 0);
    assert.ok(created.every(entry => !entry.vm.alive));
    assert.ok(geometry(render(hud)).length < withStars);
    hud.update({ ...state, remainingSpells: 12 });
    assert.equal(created.length, 24, 'retired roots are replaced, never resurrected');
    hud.destroy(); assert.ok(created.every(entry => !entry.vm.alive));
  } finally { hud.destroy(); }
});

test('zero markers and stars retain the ring while capacity overflow is rejected before changing markers', () => {
  const hud = create({ panelCount: 1, markerCount: 0, starCapacity: 0 });
  try {
    frame(hud, { bosses: [enemy()], remainingSpells: 100, healthBars: [{ current: 700, maximum: 700, markers: [] }] });
    assert.equal(hud.panels[0].animations.length, 3); assert.deepEqual(hud.panels[0].markers, []);
    assert.equal(hud.stars.length, 0); assert.equal(hud.remainingSpells, 0); assert.ok(geometry(render(hud)).length);
    hud.setMarkers(0, []);
    assert.throws(() => hud.setMarkers(0, [.5]), /capacity/);
    assert.throws(() => hud.setMarkers(1, []), /capacity/); assert.throws(() => hud.setMarkers(-1, []), /capacity/);
    assert.deepEqual(hud.panels[0].markers, []);
    assert.throws(() => hud.setRemainingSpells(Infinity), /finite/);
  } finally { hud.destroy(); }
  const front = bank('front'), text = bank('ascii_960'), options = { bank: front, textBank: text }, before = front.instances.length + text.instances.length;
  for (const value of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => new TouhouBossHud({ ...options, panelCount: value }), /capacities/);
  for (const key of ['markerCount', 'starCapacity']) for (const value of [-1, 1.5, Infinity])
    assert.throws(() => new TouhouBossHud({ ...options, [key]: value }), /capacities/);
  assert.throws(() => new TouhouBossHud({ ...options, starCapacity: 11 }), /createStar/);
  assert.throws(() => new TouhouBossHud({ ...options, createStar: 1 }), /createStar/);
  assert.equal(front.instances.length + text.instances.length, before, 'invalid capacities allocate no ANM owners');
});

test('seven-section phase plans render six markers and preserve every phase boundary through the shared ring', () => {
  const phases = Array.from({ length: 7 }, (_, index) => ({ hp: 100, spell: index === 6, healthGroup: 'long' }));
  const before = JSON.stringify(phases), plan = new TouhouBossPhasePlan(phases, { maxSections: 7 }), hud = create({ markerCount: 6 });
  const boss = enemy(), state = index => ({ bosses: [boss], player: { x: 180, y: 440 }, ...plan.hudState(index) });
  try {
    assert.equal(plan.groups.length, 1); assert.equal(plan.groups[0].maximum, 700); assert.equal(plan.groups[0].markers.length, 6);
    frame(hud, state(0));
    assert.equal(hud.panels[0].animations.slice(3).filter(vm => vm.visible).length, 6);
    assert.ok(geometry(render(hud)).length);
    for (let index = 0; index < 6; index++) {
      const ending = plan.hudState(index, { hp: 0 }), starting = plan.hudState(index + 1);
      assert.equal(ending.healthBars[0].current, starting.healthBars[0].current);
      hud.update({ bosses: [boss], ...ending }); const atBoundary = hud.panels[0].fraction;
      hud.update(state(index + 1)); assert.equal(hud.panels[0].fraction, atBoundary);
      assert.equal(hud.panels[0].animations.slice(3).filter(vm => vm.visible).length, 5 - index);
    }
    assert.equal(JSON.stringify(phases), before); assert.equal(boss.hp, 700);
    const tooSmall = create();
    try { assert.throws(() => tooSmall.update(state(0)), /capacity/); }
    finally { tooSmall.destroy(); }
  } finally { hud.destroy(); }
});

test('maxSections is inclusive and explicit split groups remain valid at smaller capacities', () => {
  const phases = count => Array.from({ length: count }, () => ({ hp: 100, healthGroup: 'same' }));
  assert.equal(new TouhouBossPhasePlan(phases(5)).groups[0].markers.length, 4);
  assert.throws(() => new TouhouBossPhasePlan(phases(6)), /5 sections/);
  assert.equal(new TouhouBossPhasePlan(phases(7), { maxSections: 7 }).groups[0].markers.length, 6);
  assert.throws(() => new TouhouBossPhasePlan(phases(8), { maxSections: 7 }), /7 sections/);
  assert.equal(new TouhouBossPhasePlan([{ hp: 100 }, { hp: 100, spell: true }], { maxSections: 2 }).groups.length, 1);
  assert.throws(() => new TouhouBossPhasePlan([{ hp: 100 }, { hp: 100, spell: true }], { maxSections: 1 }), /1 sections/);
  const solo = new TouhouBossPhasePlan(Array.from({ length: 8 }, (_, index) => ({ hp: 100, healthGroup: index })), { maxSections: 1 });
  assert.equal(solo.groups.length, 8); assert.ok(solo.groups.every(group => group.markers.length === 0));
  for (const maxSections of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => new TouhouBossPhasePlan(phases(1), { maxSections }), /positive integer/);
});
