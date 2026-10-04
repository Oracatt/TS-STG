# Common Boss death preset

`@ts-stg/thlib/touhou` exports `TouhouBossDeath`,
`TOUHOU_BOSS_DEATH_PRESET`, and `TouhouScreenShake`. The composed
`TouhouBossPresentation.beginDeath()` owns the same death preset. It is an
explicit **final Boss defeat** operation: `finishSpell()`, `clearBoss()`,
ordinary enemy defeat and disappearance do not implicitly start it.

The death owner only presents the effect. The application still owns damage,
bullet cancellation, item drops, Boss retirement and stage progression.
`onBurst` can retire the Boss body. Animations survive removal of that body and
continue until their own source scripts end; `hasDeathEffects` lets a session
defer its results overlay until the complete tail has finished.

```js
const death = presentation.beginDeath({
  // Default: original 60-frame BossDead prelude, followed by the burst.
  delayFrames: 60,
  onBurst: () => { boss.alive = false; },
});

// Continue normal updates and drawing even after the Boss is retired.
presentation.update({ boss: boss.alive ? boss : null });
presentation.draw(queue);
compositor.draw(draw, queue, {
  cameraOffset: presentation.cameraOffset,
  drawBackground,
  drawDistortion,
});
```

An application that already completed its authored death prelude can pass
`delayFrames: 0`. This starts the explosion immediately and emits its sound
only once. `follow` is sampled at the burst and does not drag already emitted
particles. Pass `follow: null` with explicit `x/y/z` for a fixed location.

## Source evidence

References below are within the read-only `Touhou20Reconstruction` tree.

| Source | Restored behavior |
| --- | --- |
| `scripts/recovered/ecl/default.ecl.txt:2–18`, `st01bs.ecl.txt:909–929` and corresponding `BossDead` routines in `st02bs` through `st07bs` | Sound ID 5 at the beginning; wait 60 frames; ECL 517 `(30,12,0)`; ECL 307 effect 25 and 57; sound ID 5 and Boss removal. Source ID 5 is `se_enep01.wav`. |
| `source_reconstruction/gameplay/enemy_opcode_animation.cpp:53–63` | ECL 307 creates position-sampled roots with named-spawn flags 2 (front registration). |
| `scripts/recovered/anm/effect.anm.txt:646–748` | Effect 25 creates a center effect26 at burst frame 0, four offset effects at frame 5, another center effect26 at frame 25, and retires all inversion children at frame 75. Children retain layer 21, original 50-segment fan geometry, easing and blend mode 4. |
| `source_reconstruction/sprite_renderer/dispatch.cpp` and callback table | ANM **layer 21** means draw **priority 50**, after the 47/48 surface switch. It is not priority 21. |
| `scripts/recovered/anm/effect.anm.txt:1256–1272`, effect59 following it | Effect57 emits 60 particles at frame 1 and another 60 at frame 2. Individual particles retire 90 frames after birth; the controller retires at burst frame 192. |
| `source_reconstruction/player_entity/death_state_adapter.cpp:12–14`, `effect.anm.txt:548–568` | Player death is effect21, which creates the exact same effect25 inversion owner. Player hit effect22 is a different effect. |
| `source_reconstruction/gameplay/enemy_defeat.cpp:14–16`, `enemy_spawn.cpp` | Ordinary enemies use their configured death sound and base-animation-dependent particle effect. They do not use Boss effect25. |
| `source_reconstruction/gameplay/enemy_opcode_state_adapter.cpp:31`, `screen_effect/update.cpp:35–40`, `screen_effect/environment.cpp:11–23` | ECL 517 uses screen effect mode 1. Its timer ticks before evaluating amplitude; 30 frames interpolate 12 to 0. Each axis independently chooses zero, positive amplitude or negative amplitude using visual RNG stream 1 modulo 3. The final parameter is the ending amplitude, not a mode selector. |

Blend mode 4 is `oneMinusDstColor` / `oneMinusSrcColor`. White fan pixels
invert the previously composed destination. This is executed through the
existing generic blend ABI, not a new full-screen shader or a black/white
flash approximating inversion.

## Camera and composition

The public compositor accepts `cameraOffset` in original game units. Source
quad paths receive the scaled offset; full-screen frame/HUD callbacks remain
fixed. The implementation preserves the source differences between drawing
paths:

- `quad.cpp:42–44` applies the camera offset to sprite quads, including
  projected billboards that call `submit_animation_quad`.
- `projected_draw.cpp` type8 (`p441f00`) submits its world/view/projection
  matrices without reading that quad offset. Its `mesh3d` output stays fixed.
- `colored_draw.cpp:15–16,43–51` adds viewport placement only. The inversion
  fans do not receive an extra camera translation.
- `geometry_draw.cpp:12` applies only viewport placement to pretransformed
  strips. `drawDistortion` keeps fixed geometry/UVs and samples the already
  composed surface; surface copies and scissor rectangles are not shifted.

`visualRng` may be injected into `TouhouBossPresentation`; the full
`TouhouGame` composition supplies its visual stream. ANM randomness and
gameplay randomness are not consumed by the shake owner.

## Validation

`tests/touhou-boss-death.test.js` covers the source 60-frame prelude,
0/5/25-frame inversion births, exact unfiltered ANM25/57 command equivalence at
14 key frames, the 192-frame tail, the shared player inversion, ordinary-enemy
exclusion, pause/retirement ownership, visual RNG and camera-path behavior.
Native rendering acceptance and its limitations are reported separately by
the end-feedback verification tool; Node command equivalence is not a claim
of whole-game original-executable pixel equivalence.
