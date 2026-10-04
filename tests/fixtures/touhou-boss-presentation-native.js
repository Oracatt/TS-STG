import { AnmBank, TouhouBitmapFont, TouhouBossPresentation, TouhouRenderQueue, TouhouTextRenderer,
  createTouhouResources, TOUHOU_BOSS_SCREEN_VIEW } from '../../packages/thlib/src/touhou/index.js';
import { DrawList } from '../../packages/thlib/src/render.js';

// Draw the same common presentation with unfiltered extracted ANM or the public
// asset pack. The checkerboard is authored diagnostic input, not a Boss skin.
// This fixture never executes the original game or any specific Boss attack.
export function createTouhouBossPresentationFixture(host, { assets = 'shared', profile = 'boss', warpOnly = false, shifted = false } = {}) {
  let resources, banks, font;
  if (assets === 'shared') {
    resources = createTouhouResources(host); banks = resources.banks; font = resources.font;
  } else if (assets === 'original') {
    const textures = new Map(), dynamic = new Map(), adapter = {
      loadTexture(file, width, height) { if (!textures.has(file)) textures.set(file, host.loadTexture(file, width, height)); return textures.get(file); },
      resolveTexture(entry) {
        const key = `${entry.name}:${entry.width}:${entry.height}`;
        if (!dynamic.has(key)) dynamic.set(key, host.createTexture(entry.width, entry.height, new Uint8Array(entry.width * entry.height * 4)));
        return dynamic.get(key);
      },
    };
    const files = Object.fromEntries(['front', 'effect', 'ascii_960', 'text'].map(name => [name,
      JSON.parse(host.readText(`games/touhou20/assets/anm/${name}.json`))]));
    banks = Object.fromEntries(Object.entries(files).map(([name, data]) => [name, new AnmBank(data, adapter)]));
    const text = new TouhouTextRenderer({ host, bank: banks.text });
    banks.text.environment = { ...banks.text.environment, createNameAnimation: (name, options) => text.createNameAnimation(name, options) };
    font = new TouhouBitmapFont(files.ascii_960, adapter);
  } else throw new RangeError('Unknown fixture asset source');
  const player = { x: 144, y: 400, score: 0, bomb: null }, boss = { x: 0, y: 128, hp: 7200, maximumHp: 8000, alive: true };
  const view = { x: shifted ? 480 : 336, y: 24, scale: 1.5, screenScale: 1 };
  const owner = new TouhouBossPresentation({ banks, player, font, profile, view, spellOptions: { playback: true },
    screenView: { ...TOUHOU_BOSS_SCREEN_VIEW, x: shifted ? 144 : 0 },
    distortion: { viewOffsetX: shifted ? 320 : 224 } });
  owner.enter(boss); if (!warpOnly) owner.beginSpell({ id: 1, name: '霊符「夢想封印」', duration: 1800 });
  const pixels = new Uint8Array(960 * 720 * 4);
  for (let y = 0; y < 720; y++) for (let x = 0; x < 960; x++) {
    const p = (y * 960 + x) * 4, tile = (Math.floor(x / 24) + Math.floor(y / 24)) & 1;
    pixels[p] = tile ? 85 : 28; pixels[p + 1] = tile ? 102 : 41; pixels[p + 2] = tile ? 115 : 63; pixels[p + 3] = 255;
    if (x % 96 < 2 || y % 96 < 2) { pixels[p] = 132; pixels[p + 1] = 148; pixels[p + 2] = 159; }
  }
  const pattern = host.createTexture(960, 720, pixels), target = host.createRenderTarget(960, 720);
  const draw = new DrawList(), queue = new TouhouRenderQueue(); let frame = 0;
  return {
    update() { owner.update({ remainingFrames: 1800 - ++frame }); },
    render() {
      draw.reset().clear(0x10121aff); queue.reset();
      draw.targetBegin(target, 0x10121aff).sprite(pattern, 480, 360, 960, 720).targetEnd();
      if (!warpOnly) owner.draw(queue);
      queue.flush(draw, { maximumPriority: 9 });
      draw.scissor(shifted ? 192 : 48, 24, 576, 672).sprite(target, 480, 360, 960, 720);
      owner.drawDistortion(draw, target);
      queue.flush(draw, { minimumPriority: 10, maximumPriority: 62 }); draw.scissorEnd(); queue.flush(draw);
      return draw.commands;
    },
    snapshot() { return { frame, profile, warpOnly, shifted, presentation: owner.snapshot(),
      aura: owner.aura.map(vm => vm.snapshot()), rings: owner.spell.effect?.snapshot() ?? null,
      opening: owner.spell.visuals.map(vm => vm.snapshot()), text: owner.spell.info[1]?.snapshot() ?? null }; },
    destroy() { owner.destroy(); resources?.dispose(); host.unloadTexture(pattern); host.unloadTexture(target); },
  };
}
