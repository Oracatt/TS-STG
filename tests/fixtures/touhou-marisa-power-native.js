import { DrawList, Keys } from '@ts-stg/thlib';
import { TouhouPlayer, TouhouRenderQueue, createTouhouResources } from '@ts-stg/thlib/touhou';

// One continuous owner per capture: upgrading never releases the shoot key.
// Both modes move horizontally so orphaned beams cannot hide behind one another.
export function createTouhouMarisaPowerFixture(host, { focused = false, capturePower = 400 } = {}) {
  if (![100, 200, 300, 400].includes(capturePower)) throw new RangeError('Unknown Marisa capture power');
  const resources = createTouhouResources(host), draw = new DrawList(), queue = new TouhouRenderQueue();
  const player = new TouhouPlayer({ character: 1, sht: resources.shots[1], bank: resources.banks.pl01,
    effectBank: resources.banks.effect, power: 100, x: -40, y: 400, seed: 23 });
  const context = { enemyReady: true }, history = [], violations = [];
  let frame = 0, frozen = false, violationCount = 0;
  const sample = () => {
    const lasers = player.shots.filter(shot => shot.alive && shot.row.type === 2);
    const expectedGroups = player.sht.patterns[(player.focused ? 10 : 5) + player.powerLevel]
      .filter(row => row.type === 2).map(row => row.group).sort((a, b) => a - b);
    const groups = expectedGroups.map(group => {
      const active = lasers.filter(shot => shot.row.group === group && shot.state === 1);
      return { group, activeCount: active.length, activeIds: active.map(shot => shot.id),
        registeredOwner: player.laserGroups.get(group)?.id ?? null };
    });
    return { frame, power: player.power, focused: player.focused, x: player.x, y: player.y,
      expectedGroups, groups, registered: [...player.laserGroups].map(([group, shot]) => ({ group, id: shot.id,
        alive: shot.alive, state: shot.state, inShots: player.shots.includes(shot) })),
      activeCount: lasers.filter(shot => shot.state === 1).length,
      retiringCount: lasers.filter(shot => shot.state === 2).length,
      lasers: lasers.map(shot => ({ id: shot.id, group: shot.row.group, state: shot.state,
        x: shot.x, y: shot.y, angle: shot.angle, width: shot.width,
        animationAlive: shot.animation?.alive ?? false, registered: player.laserGroups.get(shot.row.group) === shot })) };
  };
  const verifyOwnership = state => {
    const faults = [];
    for (const group of state.groups) {
      if (group.activeCount > 1) faults.push('duplicate group ' + group.group);
      if (group.activeCount === 1 && group.registeredOwner !== group.activeIds[0]) faults.push('lost owner ' + group.group);
    }
    for (const entry of state.registered)
      if (!entry.alive || entry.state !== 1 || !entry.inShots) faults.push('stale registry ' + entry.group);
    if ((frame - 1) % 90 >= 50) {
      if (state.activeCount !== state.expectedGroups.length) faults.push('incomplete stable laser set');
      if (state.lasers.some(shot => shot.state === 1 && (!shot.animationAlive || shot.width < 512))) faults.push('incomplete stable beam');
    }
    if (faults.length) { violationCount++; if (violations.length < 20) violations.push({ frame, faults, state }); }
  };
  return {
    update() {
      if (frozen) return;
      if (frame > 0 && frame % 90 === 0) player.setPower(100 + Math.trunc(frame / 90) * 100);
      const movement = Math.trunc(frame / 16) % 2 ? Keys.LEFT : Keys.RIGHT;
      player.update(Keys.SHOOT | movement | (focused ? Keys.FOCUS : 0), context);
      frame++;
      const state = sample(); verifyOwnership(state);
      if ([1, 2, 12, 32, 80].includes((frame - 1) % 90 + 1)) history.push(state);
      if (player.power === capturePower && (frame - 1) % 90 === 79) frozen = true;
    },
    render() {
      draw.reset().clear(0x0b1220ff).rect(48, 24, 576, 672, 0x172536ff);
      for (let y = 24; y < 696; y += 48) draw.rect(48, y, 576, 1, 0x314254ff);
      for (let x = 48; x <= 624; x += 48) draw.rect(x, 24, 1, 672, 0x314254ff);
      draw.scissor(48, 24, 576, 672); queue.reset();
      player.draw(queue, { x: 336, y: 24, scale: 1.5, screenScale: 1 }); queue.flush(draw); draw.scissorEnd();
      const state = sample();
      draw.text('MARISA POWER UPGRADE', 650, 50, 18).text('Continuous shooting', 650, 92, 18)
        .text(focused ? 'FOCUSED + MOVING' : 'UNFOCUSED + MOVING', 650, 128, 18)
        .text('Power: ' + player.power, 650, 174, 24).text('Active beams: ' + state.activeCount, 650, 215, 18)
        .text('Registry faults: ' + violationCount, 650, 248, 18);
      state.groups.forEach((group, index) => draw.text('Group ' + group.group + ': ' + group.activeCount + ' / owner ' + group.registeredOwner,
        650, 306 + index * 34, 16));
      draw.text('100 -> 200 -> 300 -> 400', 650, 530, 17).text('No enemy / full beam length', 650, 564, 16);
      return draw.commands;
    },
    snapshot() { return { focused, capturePower, frozen, current: sample(), violationCount, violations, history }; },
    destroy() { for (const shot of player.shots) shot.destroy(); resources.dispose(); },
  };
}
