# Public title-to-game scene transition

`TouhouSceneTransition`, exported from `@ts-stg/thlib/touhou`, owns the original four sliding panels, scrolling mask and optional “Now Loading” animation. The effect and its generic textures belong to thlib. Game title artwork, stage backgrounds, selection pages and music remain injectable application content.

## Source contract

The read-only reference is `Touhou20Reconstruction/source_reconstruction`:

- `title_system/loadout_environment.cpp:20–24` and `stage_select_environment.cpp:34` create effect 0, signal 7, and create loading text at `(480,392)`.
- `title_system/loadout.cpp:46–47` and `stage_select.cpp:25` create the effect at selection age 10 and request gameplay at age 40: 30 frames of covering before scene replacement.
- `effect_system/transition_panels.cpp:14–20` binds `screenswitch:3–6` at `(320,240)`, together with mask 11. Interrupt 1 replaces the four panels with scripts 7–10; it does not reverse or fade the old sprites. Each panel carries its original rotation, trajectory and five-frame stagger. The last outgoing panel retires at script time 55; the source callback has a 60-frame safety limit.
- `transition_panels.cpp:27–46` preserves the scene RGB while clearing destination alpha, draws the panel silhouettes, then combines the scrolling texture with destination alpha. The implementation uses existing `DrawList` blend factors and ANM commands. `masked:false` selects the source's plain-panel XRGB fallback.
- `text_renderer/text.cpp:88–91` doubles loading text coordinates before spawning `ascii_960:17`, whose half-resolution mode produces the correct final position. Scripts 14–16 provide its lettering and particles.
- `gameplay/activation.cpp:44–51` activates gameplay and signals the outgoing transition in the same frame. Gameplay continues during the reveal; it is not held for an extra fade delay.

The original program can spend a variable amount of real time loading resources between the title's request and gameplay activation. thlib's resources are already available synchronously, so its default application replaces the scene after the 30-frame cover and starts the reveal. A standalone owner can remain in cover after `ready` until its consumer calls `reveal()`.

## Application integration

```js
const app = new TouhouApplication({ resources, gameOptions, menuOptions });
// The default menu onStart already calls this:
app.startTransition({ character: 0, difficulty: 1, mode: 'normal' });
```

`start(selection)` and `autostart` retain immediate construction for direct launches, retries, replay verification and other programmatic callers. A custom menu or stage-selection callback calls `startTransition(selection)` explicitly. `transitionOptions:false` disables interactive transitions. `transitionOptions` can supply alternative ANM banks, script indices, viewport and loading skin; no title identity is embedded in the application.

`TouhouStageSelect.onTransition(entry,index)` fires at confirmation age 10. Connect that callback to `app.startTransition`, retaining the list while it is covered. The application's 30 cover ticks then replace the scene at age 40. Starting the effect from the later `onSelect` callback would incorrectly add a second 30-frame delay. Standalone lists retain `onSelect` at age 40 when no application owns their transition. The base character page retains its own original 14-frame exit animation; the TH20 stone/loadout page is deliberately omitted from the reusable default flow.

`app.transition` is the current owner. Its phase is `cover` or `reveal`. During cover, the previous scene stays visible and receives no input or simulation updates. `app.sceneUpdated` is false, including the cover-to-game replacement tick. During reveal, the game updates normally and the transition draws above its final composed frame. Record replay input only for actual gameplay updates; scene transition time is not a simulation frame.

The application allocates separate transition banks and disposes them after the reveal or cancellation. Caller-supplied banks remain caller owned. A direct start, return to title or application destruction cancels and cleans up the current transition. Standalone users call `owner.update()` and `owner.draw(draw)` and must not additionally update its ANM roots through `bank.update()`.

This restores the generic original transition. It does not restore TH20 stone/loadout selection, preload original game executable code, or add TH20-specific loading illustrations to the public SDK. Native source-data/pack render comparisons establish fidelity of this implemented effect, not equivalence of every original menu state.
