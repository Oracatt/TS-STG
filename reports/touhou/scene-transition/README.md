# Source scene transition verification

This authored note is tracked by Git. Its generated JSON reports and PNG captures
remain local ignored files; rerun the verifier below to recreate them.

The public `TouhouSceneTransition` now supplies the original four staggered panels, destination-alpha scrolling mask and “Now Loading” ANMs. `TouhouApplication` owns the cover, scene replacement and reveal. The generic effect is included in thlib; application branding and stages remain outside it.

Source: `effect_system/transition_panels.cpp`, `title_system/{loadout,loadout_environment,stage_select,stage_select_environment}.cpp`, `gameplay/activation.cpp`, `text_renderer/text.cpp`, `screenswitch.anm` and `ascii_960.anm` in the read-only reconstruction.

The stage/practice list starts the effect at confirmation age 10 and replaces the scene at age 40. The old page remains visible beneath the cover. Gameplay and replay simulation do not tick during cover, but do tick during the outgoing panels, as in original gameplay activation. Direct `start`/autostart/retry APIs retain immediate construction.

Validation:

- 26 relevant public application, stage-selection and Rush application tests passed.
- `tools/verify-touhou-scene-transition.mjs` passed 36 serial native renders: nine cover/hold/reveal times, original/common resource data, V8/QuickJS. Every pair has identical snapshots and PNG hashes. See [report.json](report.json) for source hashes.
- Source ANM state is checked throughout cover, an extended loading hold and all outgoing frames. Native images verify mask coverage and unchanged base scene RGB at start/end.
- Screenshots were inspected for cover geometry, full loading coverage, outgoing panels and loading text position. Source/common loading texture coordinates remain unchanged to avoid atlas UV quantization differences.

Examples: [cover at frame 15](v8-common-cover-moving.png), [loading hold](v8-common-cover-loading-hold.png), [outgoing frame 40](v8-common-reveal-tail.png), [finished](v8-common-reveal-finished.png).

This is a source-code audit and native thlib comparison using original decoded ANM data versus the public resource pack. The original executable was not run; the diagnostic background intentionally makes masks visible. Original asynchronous file-loading duration is not emulated by the already-loaded synchronous resource owner.
