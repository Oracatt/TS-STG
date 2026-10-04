# Shared Touhou gameplay composition

`TouhouGame` and application adapters use the public
`TouhouGameplayCompositor` with `TouhouRenderQueue`. The application creates and
releases two distinct canvas-sized render targets, then supplies their IDs as
`renderTarget` and `compositeTarget`. The compositor owns no platform resources.

```js
import { DrawList } from '@ts-stg/thlib';
import {
  TouhouGameplayCompositor, TouhouRenderQueue, TOUHOU_OWNER_PRIORITIES
} from '@ts-stg/thlib/touhou';

const compositor = new TouhouGameplayCompositor({
  renderTarget: host.createRenderTarget(960, 720),
  compositeTarget: host.createRenderTarget(960, 720)
});
const queue = new TouhouRenderQueue(), draw = new DrawList();

// Per render: owners and registered ANMs submit into this same queue.
queue.reset(); draw.reset();
player.draw(queue); bullets.draw(queue); bossPresentation.draw(queue);
compositor.draw(draw, queue, {
  drawBackground(target) { /* caller's stage skin, source stage callback 3 */ },
  drawDistortion(target, texture) {
    bossPresentation.drawDistortion(target, texture);
  }
});
// Submit draw.commands. Release both target IDs when their application ends.
```

ANM layers and scheduler priorities are different. An embedded bullet main VM
is drawn by `BulletInf` at `TOUHOU_OWNER_PRIORITIES.bullet` (41), even when its
unregistered template says layer 0. Independently registered spawn, child and
cancellation ANMs keep their original layer callbacks. The common player body
uses 30; items use 35; lasers use 39; graze lines use 42. Player shots, options,
focus effects and Bomb ANMs keep their registered ANM ordering. Do not rewrite
ANM script layers to compensate for application ownership.

The source composition follows these passes:

| Surface / operation | Scheduler priorities | Typical contents |
| --- | --- | --- |
| First target A | 1–13 | Stage skin, spell backgrounds, SpellCardAttack, spell double circles and aura 108 particle child 106 |
| Preserve A RGB, force capture alpha opaque; copy A into B, then deform A | 14 / 15 | Original Boss background mesh |
| Target B | 16–24 | Boss entry circle 99, aura 108 children 105 / 107 and early registered effects |
| Copy B into A; continue A | 25 / 26; 27–46 | Player, options, items, lasers, hostile bullets, graze |
| Copy A into B; continue B | 47 / 48; 49–65 | Playfield effects, Boss label, registered overlays |
| Copy B to canvas; continue canvas | 66 / 67; 68+ | HUD, countdown, spell name, deferred text, later screen effects |

Spell animation 6 creates circles 4 and 5 at layer 5 / priority 13. They are
already in A when the mesh samples it. The persistent Boss entry circle 99 and
aura 108 children 105 / 107 use layer 6 / priority 16, after deformation. Aura
108 particle child 106 instead uses layer 3 / priority 10, in A before deformation.
The spell name uses layer 32 / priority 81; Bonus and History numeric text use
the source deferred text callback 84.

For the default 960×720 canvas, camera 0 / 3 has an extended rectangle
`{x:24,y:0,width:624,height:720}`. The playfield camera 1 / 5 clips to
`{x:48,y:24,width:576,height:672}`. Priorities 10–46 use the extended rectangle;
49–62 and 80–83 use the playfield; screen callbacks use the full canvas.
The viewport and extended camera rectangle can be injected for another layout.
The compositor closes scissor and blend scopes before changing targets and
copies their RGB and alpha with `ONE / ZERO` replacement blending.

Before the first transfer, source callback 14 preserves capture RGB with
`ZERO / ONE` and sets its alpha to 255 with `ONE / ZERO`. This matters even
for additive rings: their RGB has already been blended into the background.
Boss distortion must not multiply that result by the sprite's alpha again.
The original surface strips select vertex alpha; this compositor provides
opaque capture pixels so the portable texture-modulate mesh produces the
same alpha in that region. Applications calling `drawDistortion` directly
must supply this completed opaque background capture.

Source spell circles 4/5 reduce alpha from 255 to 128 during the first eight
frames, then hold 128. From frame 80 their radii shrink from 172/160 to 16
over the supplied spell duration; their final fade starts after that delay
and lasts 20 frames. Radius changes must not be implemented as an ongoing
opacity fade.

`drawBackground` is a stage callback. It deliberately draws the supplied skin
at stage priority 3, even if the caller reused artwork originally authored for
a different scene. Specific spell backgrounds should instead draw their ANMs
into the queue so their retained source layers interleave correctly.

This maps the recovered source pass order and camera clips onto the portable
960×720 host. It does not reproduce D3D's original 416×480 intermediate surface
resolution or device depth buffers. Those resampling
and state differences remain a limit on pixel equivalence to the original
executable. One-target and no-target modes remain available for compatibility;
the two-target mode is the shared application path.

## Music announcements

`TouhouMusicCaption` preserves the common source logo-script music announcement:
60 frames of delay, 60 frames sliding/fading into place, fading out from frame320,
and retirement at340. It accepts text and an injected bitmap-text host, using
`TouhouTextRenderer` to create an independently owned transparent texture. It
contains no song-name image or BGM. Use `codePage:936` for Chinese business text.
The default screen view places the settled strip at x48..624/y672..696 in the
960×720 layout; do not apply the player-space viewport transform to this UI.
Call `update()` once per simulation frame and `destroy()` when replacing a scene;
its texture is also released automatically when the source animation ends.

`TouhouGameOver` likewise requests a semantic `game-over` cue through `onOpen`.
Applications may override its `music` option or map that cue to their own track.
The public library does not select a particular game's BGM file.
