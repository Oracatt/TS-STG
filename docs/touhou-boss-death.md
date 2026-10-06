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

The screen shake starts on the frame after the burst. The original screen
callback has update priority 24 and is created during the enemy's priority 36;
the scheduler does not revisit earlier callbacks. Its first sample has an
amplitude of 11.6, and it expires at sample 30. `TouhouBossPresentation`
supplies its fixed-frame `clock` to the death owner so its same-frame visual
update cannot consume the first shake sample. Standalone death owners advance
once per `update()`; an optional `clock` can synchronize their shake with an
external owner. ANM roots continue to use their independent update lifecycle.

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
| `source_reconstruction/platform_window/render_surfaces.cpp:20–32`, `scripts/recovered/anm/text.anm.txt:20–90,122–150,232–310,392–414` | The five surface VMs bind text scripts `[v, v+7, v+4, v+10, v+13]`, where `v` is 0/1/2 at 640/960/1280 width. These are 2D sprite copies; `ins_303(3)` selects replacement blending, not draw type 3. |
| `source_reconstruction/platform_window/graphics_callbacks.cpp:71–127,174–175`, `sprite_renderer/dispatch.cpp:14–37`, `bullet_system/frame.cpp:36–44` | The third copy, at priority 48, does not select or reset a camera. The regular bullet draw selects layer 12 even with no bullets, leaving camera 0's shake offset for this copy. The final copy explicitly selects layer 31 and clears that offset. |

Blend mode 4 is `oneMinusDstColor` / `oneMinusSrcColor`. White fan pixels
invert the previously composed destination. This is executed through the
existing generic blend ABI, not a new full-screen shader or a black/white
flash approximating inversion.

## Camera and composition

The public compositor accepts `cameraOffset` in original game units and uses
full-resolution render targets. It preserves both the individual drawing
offsets and the **third surface copy's inherited offset**. A fixed 3D world
matrix does not imply a fixed background in the final image.

The source surface-copy sequence uses A = `resource_019c` and B =
`resource_01a0`:

| Priority / surface VM | Source copy | Camera behavior |
| --- | --- | --- |
| 15 / `[0]` | A → B | Explicit viewport 3 selection uses `points[2]`, not the mode-1 shake written to `points[0]`. |
| 26 / `[1]` | B → A | The same explicit viewport 3 selection. |
| 48 / `[2]` | A → B | No camera selection or offset reset: the 2D copy inherits camera 0's `points[0]` from the gameplay draws. The previously composed background and gameplay image move together. |
| 67 / `[3]` or `[4]` | B → backbuffer | Layer 31 selects camera 2 and clears the shake offset. Later full-screen frame/HUD callbacks remain fixed. |

`graphics_callbacks.cpp:109–115` calls `draw_animation` directly; the surface
VM's ANM layer number does not reselect a camera. The public compositor
reconstructs this third-copy displacement in its normalized target space,
rather than moving only individual entities. Earlier sprite quads already
contain their own displacement, so the third copy adds to it. Callbacks drawn
after that copy do not retroactively receive its displacement.

Spell-name HUD layers 32/33 (secondary 49/50, priorities 80–83) select camera
5 for playfield clipping but explicitly reset the drawing offset in
`dispatch.cpp`. They remain fixed along with the later full-screen HUD;
clipping to the playfield does not itself imply camera movement.

The individual drawing paths still differ:

- `quad.cpp:42–44` applies the camera offset to sprite quads, including
  projected billboards that call `submit_animation_quad`.
- `projected_draw.cpp` type8 (`p441f00`) submits its world/view/projection
  matrices without reading that quad offset. Its vertices stay fixed at this
  step, but the resulting background image moves in the third surface copy.
- `colored_draw.cpp:15–16,43–51` adds viewport placement only. The inversion
  fans do not receive an extra camera translation.
- `geometry_draw.cpp:12` applies only viewport placement to pretransformed
  strips. `drawDistortion` keeps fixed geometry/UVs and samples the already
  composed surface. That result subsequently receives the third-copy offset;
  scissor rectangles themselves remain fixed.

At 960×720, `text.anm` script 5 samples A's `(276,124,408,472)` region,
scales it by 1.5 and centers it at `(480,360)`. This gives a 612×708 copy,
with 12 original units of margin around the 384×448 playfield, distinct from
camera 0's 16-unit margin. In the public compositor's already scaled target,
the corresponding region is `(view.x−12s, view.y−12s, view.width+24s,
view.height+24s)`, where `s` is the view scale. This region is copied at its
existing size; the source script's 1.5 scale must not be applied a second
time. This reconstruction does not assert that every original intermediate
pixel or sampling-rounding result is reproduced.

`visualRng` may be injected into `TouhouBossPresentation`; the full
`TouhouGame` composition supplies its visual stream. ANM randomness and
gameplay randomness are not consumed by the shake owner.

## Validation

`tests/touhou-boss-death.test.js` covers the source 60-frame prelude,
0/5/25-frame inversion births, exact unfiltered ANM25/57 command equivalence at
14 key frames, the 192-frame tail, the shared player inversion, ordinary-enemy
exclusion, pause/retirement ownership, visual RNG and camera-path behavior.
Native rendering acceptance and its limitations are reported separately by
the end-feedback verification tool. `tools/verify-rushboss-screen-shake.mjs`
compares an actual final explosion with a control that omits only the third
surface displacement, checking native background pixels, the fixed outside
HUD and V8/QuickJS agreement. Node command equivalence is not a claim of
whole-game original-executable pixel equivalence.
