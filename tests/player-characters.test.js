import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, Weapon, PlayerShot, Bomb, World, Game, Stage, Enemy, Bullet, Laser, Item, Effect,
  SpriteAtlas, DrawList, Keys, PlayerPresentation, createPlayerCharacter, createOrbBomb,
  createBeamBomb, beamIntersectsCircle, beamIntersectsEntity } from '@ts-stg/thlib';

function characterGame(character, options = {}) {
  const game = new Game({ stageFactory: () => new Stage({ autoFinish: false }) }).start();
  game.player.destroy('replace'); game.world.flush();
  game.player = game.world.spawn(createPlayerCharacter(character, { x: 200, y: 500, invulnerableFrames: 0, ...options }));
  game.world.flush();
  return game;
}

test('public character templates create genuine configurable Player, Weapon and Bomb entities', () => {
  for (const [name, weaponType, bombShape] of [['reimu', 'homing', 'orb'], ['marisa', 'laser', 'beam']]) {
    const game = characterGame(name, { speed: 7, power: 4, weapon: { damage: 9 }, bomb: { duration: 12 } });
    const player = game.player;
    assert.ok(player instanceof Player); assert.ok(player.weapon instanceof Weapon);
    assert.equal(player.character, name); assert.equal(player.speed, 7);
    assert.equal(player.weapon.type, weaponType); assert.equal(player.weapon.damage, 9);
    game.update(Keys.SHOOT | Keys.FOCUS);
    const shots = game.world.query('playerShot');
    assert.equal(player.options.length, 4); assert.equal(shots.length, 6);
    assert.ok(shots.every(shot => shot instanceof PlayerShot));
    if (name === 'reimu') assert.equal(shots.filter(shot => shot.homing).length, 4);
    else assert.equal(shots.filter(shot => shot.length && shot.piercing).length, 4);
    assert.equal(player.useBomb(game), true);
    assert.ok(player.activeBomb instanceof Bomb); assert.equal(player.activeBomb.shape, bombShape);
    assert.equal(player.activeBomb.duration, 12); assert.equal(game.stats.bombsUsed, 1);
  }
  const custom = new Weapon({ type: 'piercing' });
  assert.equal(createPlayerCharacter('reimu', { weapon: custom }).weapon, custom);
  assert.throws(() => createPlayerCharacter('unavailable'), RangeError);
  assert.equal(new Player().weapon.type, 'spread');
  const ordinary = new Bomb();
  assert.equal(ordinary.shape, 'orb'); assert.equal(ordinary.duration, 150);
  assert.equal(ordinary.maxRadius, 950); assert.equal(ordinary.expansion, 24);
});

test('character homing shots steer toward enemies while laser shots deal real piercing damage', () => {
  const reimu = characterGame('reimu', { power: 1 });
  reimu.world.spawn(new Enemy({ x: 400, y: 350, hp: 1000 }));
  reimu.update(Keys.SHOOT);
  const shot = reimu.world.query('playerShot').find(s => s.homing), initial = shot.angle;
  for (let i = 0; i < 8; i++) reimu.update(0);
  assert.ok(shot.angle > initial); assert.ok(shot.x > 200);
  const marisa = characterGame('marisa', { power: 1 });
  const near = marisa.world.spawn(new Enemy({ x: 200, y: 350, hp: 1000, radius: 15 }));
  const far = marisa.world.spawn(new Enemy({ x: 200, y: 100, hp: 1000, radius: 15 }));
  marisa.update(Keys.SHOOT); marisa.update(0);
  assert.ok(near.hp < 1000); assert.ok(far.hp < 1000);
});

test('beam contact respects finite endpoints, full width, rotation and rounded corners', () => {
  const beam = { x: 0, y: 0, angle: 0, length: 100, width: 10 };
  for (const [x, y, radius, hit] of [[50, 7, 2, true], [50, 7.001, 2, false],
    [-7, 0, 2, true], [-7.001, 0, 2, false], [107, 0, 2, true], [107.001, 0, 2, false],
    [104, 4, 0, false], [103, 4, 0, true]])
    assert.equal(beamIntersectsCircle(beam, x, y, radius), hit, `${x},${y}`);
  const vertical = { ...beam, angle: Math.PI / 2 };
  assert.equal(beamIntersectsCircle(vertical, 7, 50, 2), true);
  assert.equal(beamIntersectsCircle(vertical, 7.001, 50, 2), false);
});

test('beam cancellation uses rotated capsule/box and crossing segmented laser geometry', () => {
  const beam = { x: 0, y: 0, angle: 0, length: 100, width: 10 };
  const capsule = { x: 50, y: 18, angle: Math.PI / 2, hitbox: 'capsule', halfLength: 10, halfWidth: 3 };
  assert.equal(beamIntersectsEntity(beam, capsule), true);
  assert.equal(beamIntersectsEntity(beam, { ...capsule, y: 18.001 }), false);
  assert.equal(beamIntersectsEntity(beam, { ...capsule, alive: false }), false);
  const box = { x: 50, y: 10, angle: 0, hitbox: 'box', halfLength: 8, halfWidth: 5 };
  assert.equal(beamIntersectsEntity(beam, box), true);
  assert.equal(beamIntersectsEntity(beam, { ...box, y: 10.001 }), false);
  const corner = { x: 109, y: 9, angle: 0, hitbox: 'box', halfLength: 5, halfWidth: 5 };
  assert.equal(beamIntersectsEntity(beam, corner), false, 'inflated rectangles would falsely cancel this corner');
  const rotated = { ...box, halfLength: 5, angle: Math.PI / 4, y: 5 + Math.sqrt(50) };
  assert.equal(beamIntersectsEntity(beam, { ...rotated, y: rotated.y - 0.00001 }), true);
  assert.equal(beamIntersectsEntity(beam, { ...rotated, y: rotated.y + 0.00001 }), false);
  const crossing = { x: 50, y: 40, width: 2, segments: () => [[50, -40, 50, 40]] };
  assert.equal(beamIntersectsEntity(beam, crossing), true, 'laser origin lies outside the Bomb');
  const tangent = { x: 20, y: 8, currentWidth: 6, segments: () => [[20, 8, 80, 8]] };
  assert.equal(beamIntersectsEntity(beam, tangent), true);
  assert.equal(beamIntersectsEntity(beam, { ...tangent, hitboxScale: 0.5 }), false);
});

test('beam Bomb damages and cancels only intersecting geometry, including pending bullets', () => {
  const game = characterGame('marisa', { x: 100, y: 250,
    bomb: { width: 20, length: 100, growFrames: 0, offsetY: 0, damage: 7 } });
  const hit = game.world.spawn(new Enemy({ x: 100, y: 200, radius: 3, hp: 100 }));
  const behind = game.world.spawn(new Enemy({ x: 100, y: 300, radius: 3, hp: 100 }));
  const side = game.world.spawn(new Enemy({ x: 120, y: 200, radius: 3, hp: 100 }));
  const active = game.world.spawn(new Bullet({ x: 100, y: 200, speed: 0 }));
  const outside = game.world.spawn(new Bullet({ x: 130, y: 200, speed: 0 }));
  const immune = game.world.spawn(new Bullet({ x: 100, y: 200, speed: 0, cancelable: false }));
  const crossing = game.world.spawn(new Laser({ x: 40, y: 200, angle: 0, length: 120,
    width: 4, warning: 100, grow: 0 }));
  game.world.flush();
  const pending = game.world.spawn(new Bullet({ x: 100, y: 210, delay: 100, speed: 0 }));
  game.player.useBomb(game); const bomb = game.player.activeBomb;
  bomb.update(game.world);
  assert.equal(hit.hp, 93); assert.equal(behind.hp, 100); assert.equal(side.hp, 100);
  assert.equal(active.alive, false); assert.equal(pending.alive, false);
  assert.equal(outside.alive, true); assert.equal(immune.alive, true); assert.equal(crossing.phase, 'fade');
  assert.equal(game.world.pending.filter(entity => entity instanceof Item).length, 3);
  assert.equal(game.cancelBeam(bomb), 0, 'one reward per cancellation');
  game.player.x = 110; game.player.y = 260; bomb.update(game.world);
  assert.equal(bomb.x, 110); assert.equal(bomb.y, 260);
  assert.deepEqual(bomb.getAABB(), { x: 100, y: 150, width: 20, height: 120 });
});

test('standalone beam Bomb works without a Game and Bomb factories preserve deathbomb lifecycle', () => {
  const world = new World();
  const bullet = world.spawn(new Bullet({ x: 40, y: 30, speed: 0 }));
  const bomb = world.spawn(createBeamBomb({ x: 0, y: 30, angle: 0, length: 80, width: 10, growFrames: 0, duration: 1 }));
  world.update();
  assert.equal(bullet.alive, false); assert.equal(bomb.alive, false);
  assert.equal(world.query('item').length, 1);
  const game = characterGame('reimu', { bombFactory: (_p, _g, options) => createBeamBomb({ ...options, duration: 20 }) });
  const player = game.player;
  player.receiveHit(game); assert.equal(player.state, 'dying');
  const lives = player.lives; assert.equal(player.useBomb(game), true);
  assert.equal(player.state, 'normal'); assert.equal(player.lives, lives); assert.equal(player.bombs, 2);
  assert.equal(player.invulnerableFrames, 80); assert.equal(player.activeBomb.shape, 'beam');
  assert.equal(player.useBomb(game), false, 'active Bomb blocks another use');
  const invalid = characterGame('reimu', { bombFactory: () => ({}) }).player;
  assert.throws(() => invalid.useBomb(invalid.world.game), /return a Bomb/);
  assert.equal(invalid.bombs, 3);
  assert.throws(() => new Bomb({ shape: 'invalid' }), RangeError);
});

function presentationFixture() {
  const aliases = ['bullet.amulet.red', 'bullet.amulet.rose', 'bullet.star.yellow', 'laser.straight.light-cyan',
    'effect.focus.red', 'effect.focus.green', 'bomb.orb', 'bomb.beam', 'bomb.beam-shell', 'bomb.radiant-orb',
    'effect.particle', 'effect.death-ring.blue'];
  const sprites = Object.fromEntries(aliases.map((name, i) => [name, { texture: 'common', x: i * 16, y: 0, width: 16, height: 16 }]));
  const loads = [], unloads = [], host = { loadTexture: path => { loads.push(path); return 7; }, unloadTexture: id => unloads.push(id) };
  const atlas = new SpriteAtlas({ format: 'ts-stg-sprite-pack-v1', textures: { common: { file: 'common.png', width: 256, height: 16 } }, sprites }, host);
  let lookups = 0; const original = atlas.getSprite.bind(atlas);
  atlas.getSprite = name => { lookups++; return original(name); };
  return { atlas, presentation: new PlayerPresentation(atlas), loads, unloads, lookupCount: () => lookups };
}

test('presentation uses shared weapon/option/focus/Bomb aliases and separate frontmost focus layer', () => {
  const { presentation, loads, unloads, lookupCount } = presentationFixture();
  for (const character of ['reimu', 'marisa']) {
    const game = characterGame(character, { power: 1 });
    game.update(Keys.SHOOT | Keys.FOCUS); game.player.useBomb(game); game.update(Keys.FOCUS);
    const draw = new DrawList(), bodies = [], view = { scale: 1.5, offsetX: 480, offsetY: 360,
      body: (_draw, player, info) => bodies.push([player, info]) };
    presentation.drawShots(draw, game.world, view);
    presentation.drawPlayer(draw, game.player, view);
    assert.equal(bodies[0][0], game.player);
    assert.deepEqual(bodies[0][1], { x: 780, y: 1110, scale: 1.5, alpha: 1 });
    assert.equal(presentation.snapshot().usedSprites.includes(`effect.focus.${character === 'reimu' ? 'red' : 'green'}`), false);
    draw.rect(0, 0, 1, 1, 0xffffffff); // Represents an application enemy layer.
    presentation.drawBombs(draw, game.world, view);
    presentation.drawFocus(draw, game.player, view);
    const focusPoint = draw.commands.at(-1);
    assert.deepEqual(focusPoint.slice(0, 4), ['circle', 780, 1110, game.player.radius * 1.5]);
    const previous = lookupCount();
    presentation.drawShots(draw, game.world, view); presentation.drawBombs(draw, game.world, view);
    presentation.drawFocus(draw, game.player, view);
    assert.equal(lookupCount(), previous, 'sprite rectangles are cached outside repeated draws');
  }
  const used = presentation.snapshot().usedSprites;
  for (const alias of ['bullet.amulet.red', 'bullet.amulet.rose', 'bullet.star.yellow', 'laser.straight.light-cyan',
    'effect.focus.red', 'effect.focus.green', 'bomb.orb', 'bomb.beam', 'bomb.beam-shell', 'bomb.radiant-orb'])
    assert.ok(used.includes(alias), alias);
  assert.equal(loads.length, 1); assert.equal(unloads.length, 0, 'presentation does not own atlas handles');
});

test('presentation covers actual miss particles/drops and transforms Item/Effect primitives', () => {
  const { presentation } = presentationFixture(), game = characterGame('reimu');
  game.player.power = 3; game.player.miss(game); game.world.flush();
  assert.equal(game.world.query('item').length, 5); assert.ok(game.world.query('effect').length >= 25);
  game.world.spawn(new Effect({ x: 10, y: 20, text: 'test', style: 'text', size: 12 })); game.world.flush();
  const draw = new DrawList(), view = { scale: 2, offsetX: 5, offsetY: 7, groups: ['effect', 'item'] };
  presentation.drawWorld(draw, game.world, view);
  assert.equal(draw.commands.filter(command => command[0] === 'rect').length, 5);
  assert.deepEqual(draw.commands.find(command => command[0] === 'text' && command[1] === 'test').slice(0, 5), ['text', 'test', 25, 47, 24]);
  assert.ok(presentation.snapshot().usedSprites.includes('effect.particle'));
  assert.ok(presentation.snapshot().usedSprites.includes('effect.death-ring.blue'));
  const hidden = new DrawList(); presentation.drawPlayer(hidden, game.player, view); presentation.drawFocus(hidden, game.player, view);
  assert.equal(hidden.commands.length, 0, 'respawning body and focus remain hidden');
  assert.throws(() => presentation.drawItems(draw, game.world, { scale: NaN }), RangeError);
});

test('ordinary orb Bomb keeps strict radial damage boundary and the existing cancellation path', () => {
  const world = new World(), cancelled = [];
  world.game = { cancelBullets: (...args) => cancelled.push(args) };
  const hit = world.spawn(new Enemy({ x: 23.99, y: 0, radius: 0, hp: 100 }));
  const tangent = world.spawn(new Enemy({ x: 24, y: 0, radius: 0, hp: 100 }));
  const bomb = world.spawn(createOrbBomb({ x: 0, y: 0 }));
  world.update();
  assert.equal(bomb.radius, 24); assert.equal(hit.hp, 98); assert.equal(tangent.hp, 100);
  assert.deepEqual(cancelled[0], [0, 0, 24, { reward: true }]);
});

test('Bomb glow scopes restore blending and orb artwork remains bounded independently of cancellation radius', () => {
  const { presentation, atlas } = presentationFixture(), world = new World();
  const bomb = world.spawn(createOrbBomb()); bomb.radius = 950; world.flush();
  const draw = new DrawList(); presentation.drawBombs(draw, world, { scale: 1.5 });
  assert.deepEqual(draw.commands[0], ['blend', 'add']); assert.deepEqual(draw.commands.at(-1), ['blendEnd']);
  const images = draw.commands.filter(command => command[0] === 'spriteRegion');
  assert.ok(images.every(command => command[8] <= 144 && command[9] <= 144), 'no full-screen enlarged low-resolution orb');
  const ring = draw.commands.find(command => command[0] === 'ring');
  assert.equal(ring[4], 1425, 'the influence ring still follows full simulation radius');
  atlas.dispose();
  const failed = new DrawList(); assert.throws(() => presentation.drawBombs(failed, world), /disposed/);
  assert.deepEqual(failed.commands.at(-1), ['blendEnd'], 'resource errors also restore blend state');
});
