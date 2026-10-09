import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnmBank } from '../packages/thlib/dist/touhou/anm.js';
import { TouhouSpell } from '../packages/thlib/dist/touhou/spell.js';
import { DrawList } from '../packages/thlib/dist/render.js';

const effectData = JSON.parse(fs.readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/effect.json', import.meta.url)));
function fixture(duration = 600) {
  const bank = new AnmBank(effectData, { loadTexture: () => 11 });
  const spell = new TouhouSpell({ effectBank: bank, player: { x: 120, y: 400, bomb: null }, playback: true });
  spell.begin({ duration, boss: { x: 0, y: 128 } });
  return { spell, rings: spell.effect.children, updates: 0 };
}
function advance(scene, target) {
  while (scene.updates < target) { scene.spell.update(); scene.updates++; }
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00005, `${actual} should be ${expected}`);

test('source spell double rings keep alpha128 throughout countdown while their radii shrink', () => {
  // effect.anm script4/5: ins_409(8,0,128), then no alpha instruction until
  // ins_6([10002]) has delayed the final fade. At ANM time80 their radius
  // interpolation starts at172/160 and reaches16 after the card duration.
  const scene = fixture(600);
  assert.deepEqual(scene.rings.map(vm => vm.scriptId), [4, 5]);
  assert.equal(scene.spell.effect.alpha, 0, 'invisible owner does not fade its ring children');
  advance(scene, 7);
  for (const vm of scene.rings) assert.equal(vm.alpha, 128);
  advance(scene, 79);
  close(scene.rings[0].scaleY, 172); close(scene.rings[1].scaleY, 160);
  for (const updates of [120, 300, 379, 599, 600, 679]) {
    advance(scene, updates);
    for (const vm of scene.rings) {
      assert.equal(vm.alpha, 128, `ring ${vm.scriptId} remains visible after ${updates} updates`);
      const before = vm.snapshot(), draw = new DrawList(); vm.draw(draw);
      const mesh = draw.commands.find(command => command[0] === 'mesh');
      assert.ok(mesh, 'countdown ring emits textured geometry');
      assert.ok(mesh[2].every(vertex => (vertex[4] & 255) === 128), 'drawn vertex alpha remains128');
      assert.deepEqual(vm.snapshot(), before, 'rendering does not accumulate a fade');
    }
    if (updates === 379) {
      close(scene.rings[0].scaleY, 94); close(scene.rings[1].scaleY, 88);
      for (const vm of scene.rings) close(vm.scaleX, 15);
    }
  }
  for (const vm of scene.rings) { close(vm.scaleY, 16); close(vm.scaleX, 14); }
  scene.spell.destroy();
});

test('source ring fade lasts20 frames only after its duration-delayed final instruction', () => {
  // Frame-zero execution happens on creation. 679 updates put the VM clock
  // back at80 after its duration600 wait; the next20 updates run128 ->0.
  const scene = fixture(600); advance(scene, 679);
  assert.ok(scene.rings.every(vm => vm.alpha === 128));
  let previous = 128;
  for (let step = 1; step <= 20; step++) {
    advance(scene, 679 + step);
    assert.equal(scene.rings[0].alpha, scene.rings[1].alpha);
    const alpha = scene.rings[0].alpha;
    assert.ok(alpha < previous, 'final source fade progresses each frame');
    assert.equal(alpha, Math.trunc(128 - 128 * step / 20));
    previous = alpha;
  }
  assert.equal(previous, 0);
  advance(scene, 730);
  assert.ok(scene.rings.every(vm => vm.alive && vm.alpha === 0), 'source ins_3 holds until card owner retires');
  scene.spell.destroy();
});

test('finishing a card retires both rings and the next card starts with fresh opacity', () => {
  const scene = fixture(600); advance(scene, 600);
  const old = scene.rings.slice(); assert.ok(old.every(vm => vm.alpha === 128));
  scene.spell.finish(); assert.ok(old.every(vm => !vm.alive));
  scene.spell.begin({ duration: 1800, boss: { x: 0, y: 128 } });
  const next = scene.spell.effect.children;
  assert.ok(next.every(vm => vm.alive && vm.alpha > 128));
  for (let i = 0; i < 1800; i++) scene.spell.update();
  assert.ok(next.every(vm => vm.alpha === 128), 'later cards do not inherit opacity from a retired ring');
  scene.spell.destroy();
});
