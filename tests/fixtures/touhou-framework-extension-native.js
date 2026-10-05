import { Keys } from '@ts-stg/thlib';
import { TouhouApplication, TouhouItems, TouhouLaserField, TouhouPhaseSequence,
  TouhouPlayer, TouhouWorld, createTouhouResources } from '@ts-stg/thlib/touhou';

// Portable fixture: no host, ANM bank, texture, sound, renderer or window is
// needed. The same 120 updates run in Node and both embedded native backends.
export function createTouhouFrameworkExtensionFixture() {
  const resources = createTouhouResources(), world = new TouhouWorld({ bounds: { x: 100, y: 50, width: 480, height: 560 } });
  const trace = [], checkpoints = [], collections = [], shooting = { normal: 0, focused: 0, secondary: 0 }, bomb = { created: 0, updated: 0, destroyed: 0 };
  let frame = 0, closed = false, normalAttacks = 0, normalCleanup = 0, completed = 0, cancelledAttacks = 0, cancelledCleanup = 0;
  const context = { onEvent(name, data) { if (name === 'itemCollect') collections.push({ type: data.item.type, amount: data.amount, frame }); } };
  const profile = { id: 'fixture-player', rules: { maxPower: 600, powerPerLevel: 150, initialPower: 300,
    maxLives: 9, initialLives: 4, maxBombs: 8, initialBombs: 3, normalRadius: 5, focusRadius: 2, deathbombFrames: 12 },
    shoot(player, _clock, secondary) { shooting[player.focused ? 'focused' : 'normal']++; if (secondary) shooting.secondary++; },
    bombFactory() {
      bomb.created++; let remaining = 6;
      return { alive: true, update() { bomb.updated++; if (--remaining === 0) this.alive = false; }, draw() {},
        destroy() { bomb.destroyed++; this.alive = false; } };
    } };
  const player = new TouhouPlayer({ sht: resources.shots[0], profile, world, x: 340, y: 420 });
  const items = new TouhouItems({ player, world, context, definitions: [['medal', {
    collect(_item, owner) { owner.medals = (owner.medals ?? 0) + 1; owner.score = (owner.score ?? 0) + 75; return 75; },
  }]] });
  const lasers = new TouhouLaserField({ styles: resources.styles, world, capacity: 700 });
  const inside = lasers.spawnStraight({ x: 300, y: 150, length: 40, initialLength: 40, speed: 0 });
  const outside = lasers.spawnStraight({ x: 0, y: 150, length: 40, initialLength: 40, speed: 0 });
  const retained = lasers.spawnStraight({ x: 0, y: 150, length: 40, initialLength: 40, speed: 0, autoBounds: false });
  const local = lasers.spawnStraight({ x: 0, y: 150, length: 40, initialLength: 40, speed: 0,
    bounds: { x: -192, y: 0, width: 384, height: 448 } });
  const normal = new TouhouPhaseSequence([{
    enter: function* () { trace.push(['phase-enter', frame]); yield 4; },
    run: function* () {
      try { yield (function* () { for (let i = 0; i < 10; i++) { normalAttacks++; yield 1; } })(); }
      finally { normalCleanup++; trace.push(['phase-run-cleanup', frame]); }
    },
    leave: function* () { trace.push(['phase-leave', frame]); yield 3; },
  }], { onComplete() { completed++; trace.push(['phase-complete', frame]); } });
  const cancelled = new TouhouPhaseSequence([{
    run: function* () { try { while (true) { cancelledAttacks++; yield 1; } } finally { cancelledCleanup++; trace.push(['phase-cancel', frame]); } },
    leave() { throw new Error('Cancelled phase must not enter its leave hook'); },
  }], { onComplete() { throw new Error('Cancelled phase must not report completion'); } });
  const scenes = { opening: { updates: 0, destroyed: 0 }, ending: { updates: 0, destroyed: 0 } }, changes = [];
  const scene = name => ({ data }, app) => {
    trace.push(['scene-enter:' + name, frame, data?.token ?? 0]);
    return {
      update() {
        scenes[name].updates++;
        if (name === 'opening' && scenes.opening.updates === 20 || name === 'ending' && scenes.ending.updates === 40) {
          const target = name === 'opening' ? 'ending' : 'opening';
          trace.push(['scene-request:' + target, frame]); app.switchScene(target, { data: { token: name === 'opening' ? 7 : 9 } });
          trace.push(['scene-after-request:' + app.mode, frame]);
        }
      },
      render() { return []; },
      destroy() { scenes[name].destroyed++; trace.push(['scene-destroy:' + name, frame]); },
    };
  };
  const app = new TouhouApplication({ resources, initialScene: 'opening', scenes: { opening: scene('opening'), ending: scene('ending') },
    onSceneChange: ({ mode, previousMode }) => changes.push({ mode, previousMode, frame }) });
  const sample = () => ({ frame, x: player.x, y: player.y, power: player.power, bombs: player.bombs,
    medals: player.medals ?? 0, lasers: lasers.count, normalPhase: normal.state, cancelledPhase: cancelled.state, scene: app.mode });
  const close = () => { if (closed) return; closed = true; normal.destroy(); cancelled.destroy(); player.destroy(); app.destroy(); resources.dispose(); };
  return {
    update() {
      if (closed) return;
      if (frame === 12) cancelled.destroy();
      normal.update(); cancelled.update();
      const mask = Keys.SHOOT | (frame < 30 ? Keys.RIGHT : frame < 60 ? Keys.LEFT | Keys.FOCUS : frame < 90 ? Keys.UP : Keys.DOWN | Keys.FOCUS);
      player.update(mask, context);
      if (frame === 15) player.triggerBomb(context);
      if (frame === 20 || frame === 70) items.spawn({ type: 'medal', x: player.x, y: player.y, speed: 0 });
      if (frame === 50) { player.setPower(599); items.collect({ type: 1, x: player.x, y: player.y, state: 1 }); }
      items.update(); lasers.update(); app.update(mask);
      frame++; if (frame % 30 === 0) checkpoints.push(sample());
      if (frame === 120) close();
    },
    render() { return []; },
    snapshot() { return { frames: frame, closed, hostFree: resources.manifest === null && resources.banks.pl00 === null,
      resourcesDisposed: resources.disposed, world: { bounds: world.bounds, frozen: Object.isFrozen(world) && Object.isFrozen(world.bounds),
        shared: player.world === world && items.world === world && lasers.world === world && inside.world === world,
        localOverride: local.world !== world && local.bounds.left === -192 },
      player: { character: player.character, x: player.x, y: player.y, power: player.power, powerLevel: player.powerLevel,
        maxPower: player.maxPower, lives: player.lives, bombs: player.bombs, maxLives: player.maxLives, maxBombs: player.maxBombs,
        normalRadius: player.normalRadius, focusRadius: player.focusRadius, deathbombFrames: player.deathbombFrames,
        medals: player.medals ?? 0, score: player.score ?? 0, destroyed: player.destroyed },
      shooting, bomb, items: { pending: items.items.length, collections },
      lasers: { capacity: lasers.capacity, count: lasers.count, inside: inside.alive, outside: outside.alive, retained: retained.alive, local: local.alive },
      phases: { normal: normal.snapshot(), cancelled: cancelled.snapshot(), normalAttacks, normalCleanup, completed,
        cancelledAttacks, cancelledCleanup, remainingTasks: normal.tasks.size + cancelled.tasks.size },
      application: { mode: app.mode, disposed: app.disposed, scenes, changes }, checkpoints, trace }; },
    destroy: close,
  };
}

if (typeof globalThis.tsstg !== 'undefined') globalThis.__tsstg_game = createTouhouFrameworkExtensionFixture();
