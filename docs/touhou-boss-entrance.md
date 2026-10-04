# Boss appearance presets

`@ts-stg/thlib/touhou` provides `TouhouBossEntrance` and
`TouhouBossPresentation.beginEntrance()`. Appearance is an explicit stage
operation. Attaching a Boss with `enter()`, updating it, or starting another
attack does not replay its entrance.

## Original source

The read-only reference is `D:/AIWorkspace/Touhou20Reconstruction`:

- `scripts/recovered/ecl/st02bs.ecl.txt` through `st07bs.ecl.txt`, `Boss()`:
  set the center to `(0,128)`, call `EffChargePoint2` twice, wait 101 frames,
  attach the concrete Boss body, then execute **ECL519**, which waits for the
  dialogue's combat signal. Only after that wait and the following ECL `+1`
  do they attach common aura99/108 and enable ECL621 distortion. The `+1`
  line is not an unconditional appearance-age102 deadline.
- `source_reconstruction/gameplay/enemy_opcode_state.cpp`, opcode519:
  while the HUD has a dialogue whose `field_100` is zero, return `-1` and
  retry the instruction. `hud_system/dialogue_script.cpp`, opcode12, sets
  `field_100=1` for one frame; opcode0 ends the dialogue, and
  `hud_system/update.cpp` then clears `collecting`. Either releases ECL519.
  In `st02r0.msg.utf8.txt` entry0, `@58` opcode12 releases the stage's first
  wait (`st02.ecl.txt`, `MainBoss`) so it can create the Boss and its mist.
  The one-frame signal has expired when that Boss finishes its101-frame
  appearance and reaches its own ECL519. The dialogue's later `@270`
  opcode0 releases this second wait; its remaining input waits can last
  arbitrarily many real frames. Only then do aura99/108 and distortion
  start. A MSG12 pulse is therefore a general synchronization signal,
  not an unconditional combat-start instruction.
- `scripts/recovered/ecl/default.ecl.txt`, `EffChargePoint2()`:
  ECL303 attaches script `151 + color`, ECL319 sets its direction, and ECL516
  requests sound54. The two invocations produce streams
  `(153,π/2)`, `(157,0)`, `(158,π/2)`, `(154,π)`.
  The public entrance requests sound54 once; the source's two same-frame
  requests resolve to the same pending sound in the original audio system.
- `scripts/recovered/anm/effect.anm.txt`, scripts149–192, and
  `source_reconstruction/effect_system/converging_particles.cpp`:
  each stream emits four particles per frame for 50 frames, 200 total.
  Three particles use script149 with reverse-subtract blending, while the
  fourth uses script150 with additive blending and the source complementary
  color. Four default streams therefore create 800 particles. Each follows
  the original two Hermite segments; neither a dark circle nor a shader
  replaces the fog.
- Script149 uses layer7/priority18 or layer11/priority24; script150 uses
  layer6/priority16 or layer11/priority24. These retain the source ANM's
  registration, color, scale, random choice, alpha envelope, and texture.
  Fog is drawn after the first background capture/distortion pass.
- The ordinary stage Boss body0 in `st01enm`–`st06enm` selects layer7 at
  frame0, overriding the provisional layer8 passed by the enemy attachment.
  `enemy_opcode_animation.cpp` passes named-spawn flags2; `pool.cpp` therefore
  prepends the body, whereas the mist's named spawns append their particles.
  The resulting order is **layer6 additive rear glow → layer7 body → layer7
  reverse-subtract mist → layer11 foreground mist/glow**. The body is not
  above all of the mist. Extra's `st07enm` body0 explicitly uses layer8;
  that is a supported per-actor variation, not the ordinary-body default.
  The discarded Rush priorities28/29 incorrectly placed its entire body and
  trails above all fog through priority24.
- There is no generic body alpha fade at age101. Ordinary body0 is opaque
  immediately and the foreground fog naturally obscures it while dispersing.
  `st02enm` script9 adds its own 80-frame hidden interval and rotating poses;
  those are a concrete Boss animation, not part of the reusable black-fog preset.
- `st01bs.ecl.txt` uses outer angles `π/6` and `5π/6` instead of `0` and `π`.
  `streams` permits that source variant or the other scripts151–192.
- `st01mbs.ecl.txt` shows why appearance and motion must be independent:
  its body is present immediately, it flies from `(-224,64)` to `(0,128)`
  over 100 frames using ECL401 mode4, and it starts a three-stream effect
  after 40 frames. The entrance preset does not hardcode those stage actions
  or any concrete Boss identity. That midboss has no dialogue wait and
  explicitly enables its aura/warp before moving; a stage can call
  `startCombat()` during a fly-in when reproducing such a script.

## Public ownership and timing

The black-fog preset starts with the body hidden. At age101,
`revealed === true` and `ready === true`; `onReveal` fires once. The common
aura and distortion remain inactive until the stage calls `startCombat()`.
The particles continue after the body appears. With the unchanged source scripts, the last particles
finish and `onComplete` fires at age192. `alive` means that the entrance
still has a waiting interval or a visual tail; it must not be used as the
combat-start gate. `ready` / `presentation.entranceReady` only means the
appearance has reached the stage-defined readiness point; it does not
mean that dialogue has ended or an attack has started.

`enter()` binds the Boss and marks its aura pending. It does not construct
the aura until the first eligible **update after `startCombat()`**. A black
fog entry also holds it through the body's reveal tick, so age102 is the
earliest possible activation if the stage starts combat immediately. A
longer dialogue delays creation correspondingly. This is significant because aura108
immediately creates child105, whose frame-zero instructions consume three
ANM random values. Creating an invisible aura early would change every mist
trajectory. The creation tick runs each new root's frame zero once; later
ticks advance it normally. Rendering never creates an animation or consumes
random values, so skipped frames and screenshot masks cannot change a replay.

`flyIn` shows the body immediately and creates no mist or sound. Its default
ready frame is zero. A stage may set `readyFrame` to the duration of its own
movement. `follow` updates the mist's center if the Boss moves; it does not
move the Boss. `revealFrame`, `readyFrame`, `streams`, and the two callbacks
allow timing and appearance variants without copying the implementation.

The public presentation assigns `presentation.entrance` before delivering
age-zero callbacks. A callback may cancel or replace the entrance; the outer
call does not overwrite that replacement, and cancellation suppresses the
old owner's pending `onComplete`. `beginEntrance()` returns the instance it
created, which may already be cancelled if a callback replaced it. For a
standalone `new TouhouBossEntrance(...)`, `ready` is immediately readable,
while zero-duration callbacks are delivered by its first `update()` at age0;
an owning framework can explicitly call `dispatchEvents()` after assigning
the instance. Constructors do not call user lifecycle callbacks before the
caller can store the object.

The owner advances its four ANM roots and only their own detached particles.
New particles already execute frame zero at creation and are not advanced
again that frame. They are removed from the bank's `updateDetached` and
`drawDetached` paths, preventing a consumer's ordinary detached-effect pass
from advancing or drawing them twice. Do not also call `bank.update()` on a
bank whose actors/presentation owners are advanced individually.

`clearBoss()` cancels that Boss's unfinished entrance; `destroy()` releases
all its roots and particles. It does not release unrelated bank instances.
An explicitly started death animation continues according to its separate
owner. Pausing the presentation also pauses the entrance.

`startCombat()` is idempotent: starting successive nonspells and spells on
the same Boss preserves the same aura roots, distortion radius and phase.
`beginSpell()` and `beginCharge()` are explicit attack operations and also
start combat. `update({combatActive:true/false})` can synchronize a stage's
own lifecycle instead. `stopCombat()` removes the aura, resets distortion
to its initial radius and cancels pending charges; it does not award or
fail a spell and does not cancel independent death effects. Call
`finishSpell()` for the intended result before ending a spell encounter.
`beginEntrance()`, attaching a different Boss, and `clearBoss()` stop the
previous combat presentation. A paused update ignores combat-state changes
as well as elapsed time; normal pause therefore retains existing roots.

## Stage integration

```js
import { TouhouBossPresentation } from '@ts-stg/thlib/touhou';

const presentation = new TouhouBossPresentation({ banks, player, context });
presentation.enter(boss);
presentation.beginEntrance({ mode: 'blackFog' });

function update() {
  presentation.update({ boss, player });
  if (presentation.entranceReady) updateDialogue();
  if (presentation.combatActive) updateAttacks();
}

// Called by the dialogue's attack-start event, or directly by a stage
// without dialogue. Readiness alone must never invoke this automatically.
function beginAttacks() { presentation.startCombat(); }

function draw(queue) {
  presentation.drawBody(queue, target => drawBossBody(target, boss));
  presentation.draw(queue);
}
```

`presentation.draw()` already includes the entrance. Applications that
assemble the source render queue by individual public parts call
`drawEntrance(queue)` once alongside `drawAura`, `drawCharge`, `drawDeath`, and the HUD.
The public gameplay compositor then handles their source priorities.
For external sprites, `drawBody(queue, callback)` supplies the common layer7
and insertion order0, between prepended ANMs (negative registration order)
and appended particles (positive order). It applies the body visibility gate
and leaves the caller's alpha and geometry untouched. A callback can draw
trails followed by the live body. The optional `layer`, `order`, and `view`
support other body presets. This callback bridge does not reproduce arbitrary
ordering among several separately registered front ANMs: an ANM-backed Boss
should use its own `vm.draw(queue)` to preserve its exact registration order.
On a plain DrawList the callback executes immediately; use the shared queue
and compositor when interleaving bodies, mist, bullets and player animations.
The caller remains responsible for collision/attack readiness; visibility
does not change health, damage eligibility, dialogue, or phase progression.
For the composed `TouhouGame`, `enterBoss(boss, {entrance:{mode:'blackFog'}})`
wires drawing, body visibility and damage/contact protection automatically.
Stage callbacks still decide when attacks run using `entranceReady`.

For a visible fly-in, a stage can instead call:

```js
presentation.enter(boss);
presentation.beginEntrance({ mode: 'flyIn', readyFrame: 100 });
// Move boss with the stage's selected trajectory each update; the public
// entrance neither chooses nor overwrites that movement.
// At the stage's actual attack-start event: presentation.startCombat().
```

The isolated regression `tests/touhou-boss-entrance.test.js` compares the
entire emitted command stream against the unfiltered source ANM bank at
key frames through240, including a moving center. It also checks the
101-frame body boundary, an explicit combat signal, all800 births, reverse-subtract/additive
mixing, single-update ownership, pause/cancel behavior, and fly-in mode.
An independent full-bank oracle constructs the four source fog roots and
only creates source99/108 at the combat signal (frame102 or frame320 after a
longer dialogue), then compares every frame's ANM RNG, all live fog geometry,
and aura state through140 subsequent frames. Direct attachment and fly-in
also wait360 frames without constructing aura or advancing distortion.
Additional tests
exercise immediate and delayed callback cancellation/replacement, including
destroying the presentation from the real black-fog age101 reveal callback.
This is source-data equivalence, not a claim of comparison against running
the original executable.

`tests/touhou-boss-entrance-order.test.js` additionally pins SHA-256 for all
seven original Boss ANM archives, verifies the source layer/registration
instructions and compares the complete fog-plus-body command stream through
age192 against an independent original `st03enm` body. The real Rush artwork
integration test follows all three pre-Boss dialogues through ages50,100,101,
120,192, checking visibility, unchanged alpha, and mist drawn over each body.
