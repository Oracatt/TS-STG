import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnmBank } from '../packages/thlib/dist/touhou/anm.js';
import { TouhouBossHud } from '../packages/thlib/dist/touhou/boss-hud.js';
import { TouhouSpell } from '../packages/thlib/dist/touhou/spell.js';
import { TouhouBossPresentation, TOUHOU_BOSS_PROFILES, TOUHOU_BOSS_SCREEN_VIEW, createTouhouBossAuraView } from '../packages/thlib/dist/touhou/boss-presentation.js';
import { projectedAnmGeometry } from '../packages/thlib/dist/touhou/anm-projection.js';
import { TouhouRenderQueue } from '../packages/thlib/dist/touhou/render-queue.js';
import { DrawList } from '../packages/thlib/dist/render.js';
import { TouhouBitmapFont } from '../packages/thlib/dist/touhou/font.js';
import { TouhouGame } from '../packages/thlib/dist/touhou/game.js';
import { createTouhouResources } from '../packages/thlib/dist/touhou/resources.js';

const data = name => JSON.parse(fs.readFileSync(new URL(`../packages/thlib/assets/touhou-common/anm/${name}.json`, import.meta.url)));
const bank = name => new AnmBank(data(name), { loadTexture: () => 11 });
function fixture(options = {}) {
  const banks = { effect: bank('effect'), front: bank('front'), ascii_960: bank('ascii_960') };
  const player = { x: 80, y: 400, score: 0, bomb: null }, boss = { x: 0, y: 128, hp: 8000, maximumHp: 8000, alive: true };
  const owner = new TouhouBossPresentation({ banks, player, spellOptions: { playback: true }, ...options });
  owner.enter(boss); return { banks, player, boss, owner };
}

test('original Boss combat profile explicitly attaches effect99/108 and ECL621 radius160/color0xf00f80', () => {
  const { owner, boss } = fixture();
  assert.equal(owner.auraPending, true); assert.deepEqual(owner.aura, []);
  assert.deepEqual(owner.snapshot().distortion, { columns: 17, rows: 17, radius: 160, currentRadius: 16,
    color: 0x00f00f80, phaseX: 0, phaseY: 0, ready: false });
  owner.startCombat(); owner.update();
  assert.deepEqual(owner.snapshot().auraScripts, [99, 108]);
  assert.equal(owner.aura[0].renderType, 8, 'source99 uses the original projected magic-square ANM');
  assert.equal(owner.aura[0].time, 1, 'creation executes frame0 exactly once');
  assert.equal(owner.distortion.currentRadius, 18);
  assert.equal(owner.distortion.mesh.positions[0].x, 224 - 16 - 20);
  assert.equal(owner.distortion.mesh.positions[0].y, 16 + boss.y - 16 - 20);
  assert.equal(owner.distortion.mesh.vertices[0].color >>> 24, 0);
  const original = owner.distortion; owner.beginSpell({ duration: 1800, id: 2 });
  owner.update(); assert.strictEqual(owner.distortion, original); assert.equal(original.currentRadius, 20);
  owner.destroy();
  const mid = fixture({ profile: 'midboss' }).owner;
  mid.startCombat(); mid.update();
  assert.deepEqual(mid.snapshot().auraScripts, [99]); assert.equal(mid.distortion.radius, 128); assert.equal(mid.distortion.color, 0x008080ff); mid.destroy();
  assert.deepEqual(TOUHOU_BOSS_PROFILES.boss.auraScripts, [99, 108]);
});

test('appearance and attack start are independent; dialogue never advances the combat aura or warp', () => {
  for (const entranceMode of [null, 'flyIn']) {
    const { owner, banks } = fixture();
    if (entranceMode) owner.beginEntrance({ mode: entranceMode, readyFrame: 40 });
    const random = banks.effect.rng.state;
    for (let frame = 0; frame < 360; frame++) owner.update({ dialogue: true, remainingFrames: 1800 });
    assert.equal(owner.entranceReady, true); assert.equal(owner.bossVisible, true);
    assert.equal(owner.combatActive, false); assert.equal(owner.bossEffectsVisible, false);
    assert.deepEqual(owner.aura, []); assert.equal(owner.distortion.currentRadius, 16);
    assert.equal(owner.distortionReady, false); assert.equal(banks.effect.rng.state, random);
    assert.equal(owner.hud.timerVisible, false); assert.deepEqual(owner.hud.panels[0].animations, []);
    const draw = new DrawList(); owner.drawAura(draw); owner.drawDistortion(draw, 77);
    assert.deepEqual(draw.commands, []); assert.equal(banks.effect.rng.state, random);
    owner.startCombat(); assert.deepEqual(owner.aura, []);
    owner.update({ remainingFrames: 1800 });
    assert.deepEqual(owner.aura.map(vm => vm.scriptId), [99, 108]); assert.equal(owner.distortion.currentRadius, 18);
    owner.destroy();
  }
});

test('combat start is idempotent; pause retains roots and stop/clear cancel combat without consuming death tails', () => {
  const { owner, boss } = fixture();
  owner.beginEntrance({ mode: 'flyIn', readyFrame: 100 }); owner.startCombat(); owner.update();
  assert.equal(owner.entranceReady, false, 'a stage may explicitly fight during a midboss fly-in');
  assert.equal(owner.distortionReady, true);
  const aura = owner.aura.slice(), warp = owner.distortion;
  owner.startCombat(); owner.enter(boss); owner.update({ combatActive: true });
  assert.deepEqual(owner.aura, aura); assert.strictEqual(owner.distortion, warp);
  const paused = JSON.stringify(owner.snapshot()); owner.update({ paused: true, combatActive: false });
  assert.equal(JSON.stringify(owner.snapshot()), paused, 'paused update cannot stop or reset combat presentation');
  const charge = owner.beginCharge(), death = owner.beginDeath({ delayFrames: 0 });
  owner.update({ combatActive: false });
  assert.equal(owner.combatActive, false); assert.ok(aura.every(vm => !vm.alive));
  assert.equal(charge.alive, true, 'stopping combat leaves the independent charge tail alive');
  owner.clearCharges(); assert.equal(charge.alive, false); assert.equal(death.alive, true);
  assert.equal(owner.distortionReady, false); assert.equal(owner.distortion.currentRadius, 16);
  owner.update({ combatActive: true });
  assert.equal(owner.aura[0].time, 1); assert.equal(owner.distortion.currentRadius, 18);
  assert.notStrictEqual(owner.aura[0], aura[0]);
  owner.enter({ x: 20, y: 160, hp: 900 }); owner.update();
  assert.equal(owner.combatActive, false); assert.deepEqual(owner.aura, []);
  owner.startCombat(); owner.clearBoss();
  assert.equal(owner.combatActive, false); assert.equal(owner.distortion, null); assert.equal(death.alive, true);
  assert.throws(() => owner.startCombat(), /Attach a Boss/);
  owner.destroy(); assert.equal(death.alive, false);
});

test('spell uses unmodified source32-segment ANM double rings and source10 strip/four circle attack cohort', () => {
  const { owner } = fixture(); owner.beginSpell({ duration: 1800 });
  const [inner, outer] = owner.spell.effect.children;
  assert.deepEqual([inner.scriptId, outer.scriptId], [4, 5]);
  assert.deepEqual([inner.U(0x444), outer.U(0x444)], [32, 32]);
  assert.deepEqual([inner.U(0x44c), outer.U(0x44c)], [1800, 1800]);
  const attack = owner.spell.visuals[0]; assert.equal(attack.scriptId, 13);
  assert.deepEqual(attack.children.slice(0, 4).map(vm => vm.scriptId), [9, 10, 11, 12]);
  assert.equal(attack.children.filter(vm => vm.scriptId === 7).length, 5);
  assert.equal(attack.children.filter(vm => vm.scriptId === 8).length, 5);
  assert.deepEqual(attack.children.slice(4, 8).map(vm => vm.F(0x488)), [48, 80, 112, 144]);
  for (let frame = 0; frame < 150; frame++) owner.update();
  assert.equal(attack.alive, false); assert.equal(owner.spell.effect.alive, true);
  owner.destroy();
});

test('full source presentation draws real texture/mesh3d commands and owns only its animation roots', () => {
  const { owner, banks } = fixture(), unrelated = banks.effect.create(14);
  owner.beginSpell({ duration: 600 });
  for (let frame = 0; frame < 80; frame++) owner.update({ remainingFrames: 600 - frame });
  const frozen = JSON.stringify(owner.snapshot()), random = banks.effect.rng.state, queue = new TouhouRenderQueue(), draw = new DrawList();
  owner.draw(queue); queue.flush(draw); owner.drawDistortion(draw, 77);
  assert.ok(draw.commands.some(command => command[0] === 'mesh3d'));
  assert.ok(draw.commands.some(command => command[0] === 'mesh' && command[1] === 77));
  assert.ok(draw.commands.some(command => command[0] === 'sampler' && command[1] === 77));
  assert.ok(!draw.commands.some(command => command[0] === 'shaderBegin'));
  owner.update({ paused: true }); assert.equal(JSON.stringify(owner.snapshot()), frozen); assert.equal(banks.effect.rng.state, random);
  owner.destroy(); owner.destroy(); assert.equal(unrelated.alive, true);
  assert.equal(banks.effect.instances.filter(vm => vm.alive).length, 1);
});

test('projected magic-square centers follow configured playfield instead of fixed framebuffer center', () => {
  const { owner } = fixture(); owner.startCombat();
  for (let frame = 0; frame < 60; frame++) owner.update();
  const vm = owner.aura[0];
  for (const view of [{ x: 336, y: 24, scale: 1.5, screenScale: 1 }, { x: 480, y: 24, scale: 1.5, screenScale: 1 }]) {
    const configured = createTouhouBossAuraView(view), m = projectedAnmGeometry(vm, configured).mvp;
    const x = (m[12] / m[15] + 1) * 480, y = (1 - m[13] / m[15]) * 360;
    assert.ok(Math.abs(x - view.x) < 0.001); assert.ok(Math.abs(y - (view.y + 128 * 1.5)) < 0.001);
  }
  owner.destroy();
});

test('adopted spell/HUD tick once and business visual state does not alter health or score', () => {
  const banks = { effect: bank('effect'), front: bank('front'), ascii_960: bank('ascii_960') };
  const player = { x: 0, y: 400, score: 1234, bomb: null }, boss = { x: 1, y: 128, hp: 8500, maximumHp: 8500 };
  const spell = new TouhouSpell({ player, textBank: banks.ascii_960, effectBank: banks.effect, playback: true });
  const hud = new TouhouBossHud({ bank: banks.front, textBank: banks.ascii_960 });
  const owner = new TouhouBossPresentation({ banks, player, spell, hud }); owner.enter(boss); owner.beginSpell({ duration: 1200 });
  spell.update(); hud.update({ bosses: [boss], player, remainingFrames: 1199 });
  const age = spell.age.current, numberTime = hud.numbers[0].time;
  owner.update({ spellState: { bonus: 7654321, captureEligible: false }, remainingFrames: 1199 });
  assert.equal(spell.age.current, age); assert.equal(hud.numbers[0].time, numberTime); assert.equal(spell.bonus, 7654321);
  assert.equal(spell.captureEligible, false); assert.equal(player.score, 1234); assert.equal(boss.hp, 8500);
  owner.destroy(); assert.equal(spell.effect.alive, true); spell.destroy(); hud.destroy();
});

test('rapid card replacement preserves the outgoing title until its original exit completes', () => {
  const { owner } = fixture(); owner.beginSpell({ duration: 600 });
  for (let i = 0; i < 90; i++) owner.update();
  const previous = owner.spell.info.filter(Boolean); owner.finishSpell(); owner.beginSpell({ duration: 600 });
  assert.equal(owner.spell.retiredInfo.length, previous.length);
  for (let i = 0; i < 50; i++) owner.update();
  assert.ok(previous.every(vm => !vm.alive)); assert.equal(owner.spell.retiredInfo.length, 0); owner.destroy();
});

test('countdown hundredths and spell bonus follow the same shifted screen view as their ANM', () => {
  const calls = [], font = { screenScale: 1.5, draw: (_draw, text, options) => calls.push({ text, options }) };
  const { owner } = fixture({ font, screenView: { ...TOUHOU_BOSS_SCREEN_VIEW, x: 144 } });
  owner.beginSpell({ duration: 600 }); for (let i = 0; i < 120; i++) owner.update();
  owner.draw(new DrawList()); const dot = calls.find(call => call.text === '.');
  const first = owner.hud.numbers[0]; assert.equal(dot.options.x, first.F(0x2c) + 16 + 96);
  const bonus = calls.find(call => call.text.trim() === String(owner.spell.bonus)); assert.equal(bonus.options.x, owner.spell.presentation.bonusX + 96); owner.destroy();
});

test('layer32 spell information adds viewport5 center/top; layer30 countdown and numeric text keep full-screen origin', () => {
  const { owner } = fixture({ screenView: { ...TOUHOU_BOSS_SCREEN_VIEW, x: 144 } });
  owner.beginSpell({ duration: 600 }); for (let i = 0; i < 150; i++) owner.update();
  const views = [];
  for (const vm of owner.spell.info.filter(Boolean)) vm.draw = (_draw, view) => views.push({ layer: vm.layer, view });
  for (const vm of owner.hud.numbers) vm.draw = (_draw, view) => views.push({ layer: vm.layer, view });
  owner.draw(new DrawList());
  assert.ok(views.filter(item => item.layer === 32).length === 2);
  for (const item of views) assert.deepEqual([item.view.x,item.view.y], item.layer === 32 ? [480,24] : [144,0]);
  owner.destroy();
});

test('spell numeric values retain Renderer default left alignment and follow their Bonus/History labels', () => {
  // text_renderer/text.cpp initializes fields_1a1d4[8/9] to 1; card_system
  // draw changes font/layer only. Right alignment overlaps the label artwork.
  const calls = [], actual = new TouhouBitmapFont(data('ascii_960'), { loadTexture: () => 11 });
  const font = { screenScale: actual.screenScale, draw: (_draw, text, options) => calls.push({ text, options,
    glyphs: actual.layout(text, options) }) };
  const { owner } = fixture({ font }); owner.beginSpell({ id: 2, duration: 600 });
  for (let i = 0; i < 150; i++) owner.update();
  owner.draw(new DrawList());
  const bonus = calls.find(call => call.text.trim() === String(owner.spell.bonus));
  const history = calls.find(call => call.text === '00/00');
  assert.equal(bonus.options.alignX, 1); assert.equal(history.options.alignX, 1);
  assert.ok(bonus.glyphs.every(glyph => glyph.x >= 399));
  assert.equal(history.glyphs[0].x, 540);
  assert.equal(history.glyphs[0].y, 55.5);
  calls.length = 0; owner.spell.fail(); owner.draw(new DrawList());
  const failed = calls.find(call => call.text === '$');
  assert.equal(failed.options.alignX, 1); assert.equal(failed.glyphs[0].x, 423);
  owner.destroy();
});

test('shared Boss presentation commands equal original unfiltered ANM on the audited common atlas layout through entry, card and exit', () => {
  const manifest=JSON.parse(fs.readFileSync(new URL('../packages/thlib/assets/touhou-common/manifest.json',import.meta.url)));
  function fromRoot(assetRoot, options) {
    const files = Object.fromEntries(['effect', 'front', 'ascii_960', 'text'].map(name => [name,
      JSON.parse(fs.readFileSync(new URL(`${assetRoot}/anm/${name}.json`, import.meta.url)))]));
    if(assetRoot==='../games/touhou20/assets'){
      // The atlas isolation intentionally changes UV origins and texture size.
      // Put the INDEPENDENT, UNFILTERED source ANM on that same physical atlas
      // layout before comparing every draw command; do not copy any animation,
      // geometry, state, blending or sprite-selection logic from the shared bank.
      // touhou-common-resources.test.js separately compares EVERY packed source
      // RGBA pixel and gutter against original PNGs, including repeat strips.
      for(const name of ['front','ascii_960']){
        const source=files[name],common=data(name);
        for(const texture of manifest.textures.filter(t=>t.source.archive===`${name}.anm`&&t.spriteMappings)){
          const entry=source.entries[texture.source.entry],packed=common.entries[texture.source.entry];
          assert.equal(texture.source.archiveSha256,source.source.sha256);
          assert.equal(texture.source.pngSha256,entry.texture.sha256);
          for(const mapping of texture.spriteMappings){
            const sprite=source.sprites[mapping.sprite],s=mapping.source,d=mapping.destination;
            assert.deepEqual([sprite.x,sprite.y,sprite.width,sprite.height],[s.x,s.y,s.width,s.height]);
            assert.deepEqual(common.sprites[mapping.sprite],{...sprite,x:d.x,y:d.y},'Atlas mapping must not alter source sprite IDs, entries, scale, rotation, pivot or dimensions');
            sprite.x=d.x;sprite.y=d.y;
          }
          // Only the two dimensions consumed by UV normalization are remapped.
          // Original entry flags, lowResScale, source instructions and geometry
          // remain independently loaded from the original archive metadata.
          entry.width=packed.width;entry.height=packed.height;
          entry.texture.width=packed.texture.width;entry.texture.height=packed.texture.height;
        }
      }
    }
    const banks = Object.fromEntries(Object.entries(files).map(([name, value]) => [name,
      new AnmBank(value, { loadTexture: () => 11, resolveTexture: () => 12 })]));
    banks.text.environment.createNameAnimation = (_name, { script, interrupt }) => banks.text.create(script).interruptNow(interrupt);
    const font = new TouhouBitmapFont(files.ascii_960, { loadTexture: () => 11 });
    return new TouhouBossPresentation({ banks, font, player: { x: 120, y: 400, bomb: null }, spellOptions: { playback: true }, ...options });
  }
  for (const options of [{}, { profile: 'midboss' }, { view: { x: 480, y: 24, scale: 1.5, screenScale: 1 },
    screenView: { ...TOUHOU_BOSS_SCREEN_VIEW, x: 144 }, distortion: { viewOffsetX: 320 } }]) {
    const source = fromRoot('../games/touhou20/assets', options), shared = fromRoot('../packages/thlib/assets/touhou-common', options);
    const boss = { x: -48, y: 128, z: 0, hp: 8000, maximumHp: 8000 }; source.enter(boss); shared.enter(boss);
    for (const owner of [source, shared]) owner.beginSpell({ id: 42, name: 'Reusable spell', duration: 1800 });
    for (let frame = 1; frame <= 181; frame++) {
      if (frame === 150) for (const owner of [source, shared]) owner.finishSpell({ captured: true });
      if (frame === 151) for (const owner of [source, shared]) owner.beginSpell({ duration: 1800 });
      for (const owner of [source, shared]) owner.update({ remainingFrames: 1800 - frame });
      if (![1, 8, 20, 40, 60, 80, 120, 140, 150, 151, 181].includes(frame)) continue;
      const capture = owner => {
        const draw = new DrawList(), queue = new TouhouRenderQueue(); owner.draw(queue); queue.flush(draw); owner.drawDistortion(draw, 77);
        return { commands: draw.commands, state: owner.snapshot(), aura: owner.aura.map(vm => vm.snapshot()),
          rings: owner.spell.effect?.snapshot() ?? null, attack: owner.spell.visuals.map(vm => vm.snapshot()) };
      };
      assert.deepEqual(capture(shared), capture(source), `source/shared ANM profile ${options.profile ?? 'boss'} frame ${frame}`);
    }
    source.destroy(); shared.destroy();
  }
});

test('public full Game adopts the identical Boss prefab and advances spell/HUD only once', () => {
  const root = new URL('../', import.meta.url), resources = createTouhouResources({
    readText: file => fs.readFileSync(new URL(file, root), 'utf8'), loadTexture: () => 11,
  });
  const game = new TouhouGame({ banks: resources.banks, font: resources.font, sht: resources.shots[0], styles: resources.styles, renderTarget: 77 });
  const boss = game.spawnEnemy({ x: 0, y: 128, hp: 8000, script: 0 }); game.beginSpell({ boss, duration: 1800 });
  assert.ok(game.bossPresentation instanceof TouhouBossPresentation);
  assert.strictEqual(game.bossPresentation.spell, game.spell); assert.strictEqual(game.bossPresentation.hud, game.bossHud);
  game.update(); assert.equal(game.spell.age.current, 1); assert.equal(game.bossPresentation.distortion.currentRadius, 18);
  assert.equal(game.bossPresentation.frame, 1); assert.equal(game.bossPresentation.aura[0].time, 1);
  const commands = game.render(); assert.ok(commands.some(command => command[0] === 'mesh' && command[1] === 77));
  game.setBoss(null); assert.equal(game.bossPresentation.aura.length, 0);
  game.destroy(); resources.dispose();
});
