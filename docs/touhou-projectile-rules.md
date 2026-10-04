# Original projectile rules

The public `@ts-stg/thlib/touhou` implementation owns player contact, bullet
hitboxes, repeated grazing, cancellation and laser splitting. Game code supplies
attack trajectories, positions, palettes and explicit attack timing. None of
these public modules imports a demo or selects rules by game name.

`TouhouBulletField` and `TouhouPlayer` share the functions in
`bullet-collision.js`. For externally moved bullets, retain one
`TouhouBulletCollision` per bullet and update its source-space position each
frame. Resolve its radius from the **same original style** used by its body ANM;
do not substitute the lightweight customizable root-level bullet templates.

```js
const style = touhouStyle(resources.styles, 8, 1);
const contact = new TouhouBulletCollision({ radius: style.radius });
// Every simulation tick, after the application's trajectory update:
contact.x = position.x;
contact.y = position.y;
contact.update(player, context, { onHit: retireWithHitAnimation });
```

The original coordinate space is x −192…192, y 0…448. The default Reimu and
Marisa hit radius is 3 in both movement modes. Circular contact uses
`distance² < playerRadius² + bulletRadius²`, with a strict boundary. Grazing
uses the separately restored expanded radius. All fifty original ordinary
bullet styles use their source circular radius; a long sprite is not implicitly
a capsule. Explicit collision scaling remains available separately from the
trajectory.

The shared ordinary-bullet owner permits three grazes at 60-frame intervals,
then rearms after 60 frames outside the graze area. The player owns deathbomb,
invulnerability and state eligibility. In particular, circular contact during
invulnerability still reports a hit for bullet retirement; laser rectangle
contact reports no hit. Applications must not skip the entire collision pass
merely because the player is invulnerable.

`TouhouLaserField` owns straight, infinite and curved lasers, including their
original trimmed rectangles, head exclusion, whole-beam eight-frame graze clock,
and cancellation samples/splitting. `spawnDriven` permits externally supplied
trajectories without replacing these rules. The visual samples of a curve are
not independent collision or graze owners. `laser-collision.js` and
`laser-cancellation.js` are the shared policy implementations, also available
for applications that supply their own entity storage.

For a driven curve, use `updateDrivenCurve(laser, newestFirstSamples)` rather
than assigning `samples` and reducing `p.count` to the visible trail length.
The original type2 initializes its entire sample buffer at birth; missing
pre-birth history stays at the birth position with the initial angle/speed and
zero velocity vector. This makes delayed or not-yet-visible curves cancellable.
The method retains sample metadata and respects the permanently reduced sample
capacity after a local cut. A cancelled owner cannot be revived by another
history update.

`spawnDriven(2, {autoBounds:true, ...parameters})` also delegates offscreen
retirement to the original full-history test and 30-frame grace. Keep supplying
the moving head and its complete trail while only the head is outside; do not
delete visible history nodes individually. When every sample is outside the
source viewport, the field retires the owner. This option defaults to false
for applications that explicitly manage their own lifetime.

Straight and infinite lasers change their body color while grazing, using the
source secondary-color mode; the tint resets on departure. Curve mesh vertices
remain white, preserving the texture's palette. Laser command 33 can disable
the straight/infinite tint without disabling graze. The tests use the actual
shared ANM bank and check the final rendered vertex colors.

Circle/rectangle Bomb cancellation is distinct from player hit testing. Ordinary
bullets use the original cancellation radius and viewport eligibility (also in
the public `touhouBulletInCancelRectangle` helper); lasers use the original sample
masks and splitting rules. Natural offscreen/lifetime retirement does not request
a cancellation effect.

Sources: `player_entity/collision.cpp`, `bullet_system/{shoot,player_collision,
cancellation}.cpp`, and `laser_system/type{0,1,2}_{collision,cancellation}.cpp` in
the read-only TH20 reconstruction. `tests/touhou-collision-boundary.test.js`
records original source hashes and independently transcribed boundary vectors.
The LuaSTG THlib `laser/bent laser.lua` was also consulted for the separation
between a single curve owner and user-authored trajectories; TH20 numerical
rules remain authoritative here.

## Boss phase handoff

Use `clearTouhouBossPhase` for an ordinary attack handoff, including a normal
spell's capture or timeout followed by another attack. It runs synchronously:
stop the old attack, clear within radius 640, remove child enemies, then clear
within radius 640 again. The second pass catches projectiles emitted by child
death scripts. It schedules no continuing clear that could erase the next
attack's new projectiles.

```js
clearTouhouBossPhase({
  x: boss.x, y: boss.y,
  stopAttack: () => attackTasks.clear(),
  clearEnemies: () => removeAttackChildren(),
  cancelCircle(x, y, radius, options) {
    bullets.cancelNearbyCircle(x, y, radius, options);
    lasers.cancelCircle(x, y, radius, options);
  },
});
```

The callback receives `nearby:true, dropMode:0, check:true, reason:'bonus'`.
Ordinary bullets ignore temporary cancellation protection, retain their prior
cancel kind, and include birth-fog or delayed bullets within the radius, even
outside the visible field. Lasers retain their own protection checks and sample
splitting rules. A local cancellation can shorten an infinite laser without
destroying its source. An attached laser or emitter's owning attack must stop
it explicitly when that owner is removed; use `TouhouLaserField.erase` for this
terminal lifecycle event instead of changing Bomb circle cancellation.

There are three distinct exit paths:

| Exit | Clearing policy |
| --- | --- |
| Ordinary phase followed by another attack | `clearTouhouBossPhase`: two nearby radius-640 passes around child cleanup |
| Final Boss defeat | `TouhouBossDefeat`: expanding radius-16/+6 wave, then whole-field ECL613 clear at frame 60 |
| Practiced spell timeout escape | Stop attack tasks and children, settle the spell, withdraw the Boss; existing projectiles may continue moving until the results page |

Do not invoke the ordinary clear on either of the latter two routes. The final
whole-field clear cancels every remaining eligible bullet and erases lasers
with `check:false`; unlike a local circle it also retires zero-length lasers.
See [Boss defeat](touhou-boss-defeat.md) for its independent visual tails.

Source references, relative to the read-only reconstruction root:

- `source_reconstruction/gameplay/enemy_damage.cpp`, `phase_script`: clears
  existing script tasks before selecting and immediately running the next one.
- `scripts/recovered/ecl/st01bs.ecl.txt`, `Boss2` (lines 216–239): the two
  ECL615/616 passes around ECL573 child cleanup; `BossDead` (lines 909–928):
  final wave, then ECL613 at frame 60.
- `scripts/recovered/ecl/default.ecl.txt`, `BossInterval` (lines 60–92),
  `BossDead2` (lines 2–19), `BossEscapeSpell` (lines 40–56), and
  `Ecl_EtBreak2_ni` (lines 239–255).
- `source_reconstruction/gameplay/enemy_shot.cpp` and
  `enemy_shot_adapter.cpp`: ECL615/616 use nearby bullet cancellation and
  checked laser circle cancellation; ECL613 uses unrestricted laser erase.
- `source_reconstruction/bullet_system/player_cancellation.cpp` and
  `source_reconstruction/laser_system/type{0,1,2}_cancellation.cpp`: the distinct
  protection, birth state, sample and terminal erase rules.
