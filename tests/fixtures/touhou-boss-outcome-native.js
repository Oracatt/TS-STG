import { TouhouGame, createTouhouResources } from '@ts-stg/thlib/touhou';

// A generic caller-owned encounter. The fairy is a common-resource stand-in,
// and the diagnostic background/dialogue do not belong to any specific game.
export function createTouhouBossOutcomeFixture(host, { scene = 'held' } = {}) {
  if (!['held', 'flight', 'finished', 'exploded'].includes(scene)) throw new RangeError('Unknown Boss outcome scene');
  const resources = createTouhouResources(host), target = host.createRenderTarget(960, 720);
  const composite = host.createRenderTarget(960, 720), events = [], sounds = [], trace = [];
  let boss, minor, bullet, outcomeFrame = null, outcomes = 0, attacks = 0, ordinaryDefeats = 0;
  let sequence = null, frozen = false;
  const game = new TouhouGame({ banks: resources.banks, font: resources.font,
    sht: resources.shots[0], styles: resources.styles, seed: 37,
    renderTarget: target, compositeTarget: composite,
    onSound: id => sounds.push(id),
    onEvent: name => events.push({ name, frame: game.frame }),
    renderBackground(draw) {
      draw.rect(24, 0, 624, 720, 0x183040ff);
      for (let y = 0; y < 720; y += 48) for (let x = 24; x < 648; x += 48)
        if (((x - 24) / 48 + y / 48) % 2) draw.rect(x, y, 48, 48, 0x274755ff);
    },
    stage(owner, frame) {
      owner.player.invulnerability.set(1000);
      if (frame === 20) boss.damage(70, { type: 'fixture-hit' }, owner.context);
      if (scene !== 'exploded' && outcomeFrame !== null && frame - outcomeFrame === 40) {
        trace.push({ point: 'before-escape', frame, attacks, bossAlive: boss.alive,
          minorAlive: minor.alive, bulletState: bullet.state });
        sequence = owner.beginBossEscape(boss, { target: { x: -224, y: -80 }, duration: 60 });
      }
    },
  });
  boss = game.spawnEnemy({ x: 0, y: 128, hp: 10, script: 25, directional: true,
    damageInvulnerability: 0, onUpdate: () => attacks++, onDefeat: () => ordinaryDefeats++ });
  minor = game.spawnEnemy({ x: 80, y: 260, hp: 100, script: 5, directional: false });
  bullet = game.bullets.emit({ x: 100, y: 180, speed: 0, shotSound: -1 })[0];
  game.enterBoss(boss, { onDefeated: ({ game: owner, boss: defeated, source }) => {
    outcomes++; outcomeFrame = owner.frame;
    trace.push({ point: 'outcome', frame: owner.frame, attacks, held: owner.isBossHeld(defeated), source: source.type });
    if (scene === 'exploded') sequence = owner.beginBossDefeat(defeated, { source });
    else { owner.spell.capture(owner.context); owner.stopBossCombat(); }
  } });
  game.beginSpell({ boss, id: 12, name: 'Caller-owned conclusion', duration: 600 });
  game.setBossEffects({ aura: true, distortion: true });
  const checkpoint = () => scene === 'held' ? outcomeFrame !== null && game.frame - 1 - outcomeFrame === 30
    : scene === 'flight' ? sequence?.age === 20
      : scene === 'finished' ? sequence?.escaped === true : sequence?.burst === true;
  const sample = () => ({ frame: game.frame, outcomeFrame, outcomes, attacks, ordinaryDefeats,
    held: game.isBossHeld(boss), boss: { x: boss.x, y: boss.y, alive: boss.alive,
      bodyAlive: boss.animation.alive, script: boss.animation.scriptId, direction: boss.direction },
    minorAlive: minor.alive, bulletState: bullet.state,
    spellActive: game.spell.active, combatActive: game.bossPresentation.combatActive, hudHidden: game.bossHud.state.hidden,
    sequence: sequence?.snapshot() ?? null,
    deaths: game.bossPresentation.deaths.map(death => ({ age: death.age, burst: death.burst,
      scripts: death.roots.map(vm => vm.scriptId) })), items: game.items.items.length });
  return {
    update() { if (frozen) return; game.update(); if (checkpoint()) frozen = true; },
    render() {
      game.render();
      const draw = game.drawList;
      draw.rect(660, 440, 286, 194, 0x10202fee).text('THLIB OUTCOME FIXTURE', 674, 454, 18)
        .text('Scene: ' + scene, 674, 488, 20).text('HP-zero callback: ' + outcomes, 674, 520, 17)
        .text('Body: ' + (boss.alive ? 'retained' : 'retired'), 674, 550, 17)
        .text('Death roots: ' + game.bossPresentation.deaths.length, 674, 580, 17);
      if (outcomeFrame !== null && !sequence) {
        draw.rect(66, 485, 540, 84, 0x081a29e8)
          .text('BOSS: Let us talk before I leave.', 84, 499, 22)
          .text('The stage chooses when the dialogue ends.', 84, 535, 18);
      }
      return draw.commands;
    },
    snapshot() { return { scene, frozen, current: sample(), events, sounds, trace,
      game: game.snapshot(), presentation: game.bossPresentation.snapshot() }; },
    destroy() { game.destroy(); resources.dispose(); host.unloadTexture(target); host.unloadTexture(composite); },
  };
}
