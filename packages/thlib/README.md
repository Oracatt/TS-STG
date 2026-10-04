# @ts-stg/thlib

Portable JavaScript application framework, restored entities, effects and common
assets for Touhou-style STG games.
No Node, DOM or native-global dependency. The application supplies platform adapters,
game-specific rules, configuration, stages, interface skins and resource locations.

The restored common implementation previously developed in the touhou20 demo now
lives in `src/touhou/`, exported by both `@ts-stg/thlib/touhou` and the package root.
Both demos use these same classes and resources. An asset's appearance in TH20
does not make it TH20-exclusive: the common Reimu/Marisa bodies, normal weapons,
Bombs, focus indicator, bullets, lasers, minor enemies and effects belong here.
Magic-stone variants and other actual title-specific content stay in applications.

## Complete reusable application

```js
import { TouhouApplication, createTouhouResources } from '@ts-stg/thlib/touhou';

const resources = createTouhouResources(host);
const application = new TouhouApplication({
  resources,
  pixels: host, // optional framebuffer services for the source pause capture
  gameOptions: {
    stage(game, frame) { /* your stage and specific Boss attacks */ },
    renderBackground(draw, game) { /* your background */ }
  },
  onQuit() { /* close the application's window */ }
});
// Adapter calls application.update(mask), then submits application.render().
```

`TouhouApplication` owns the title/difficulty/character selection, scene changes,
retry and return-to-title lifecycle. `TouhouGame` composes the restored players,
weapons, Bombs, bullets, enemies, items, spell rules, HUD, pause and game-over /
continue controllers. They are independently exported as `TouhouTitleMenu`,
`TouhouHud`, `TouhouBossHud`, `TouhouPause`, and `TouhouGameOver` as well. Menus
accept custom labels, actions, script mappings, layout, banks and backgrounds;
unconfigured application pages are disabled by default. Persistence, BGM,
specific stages and branding are callbacks or injected resources.

The default shared banks include `front`, `text` and `title` alongside both
players, bullets, effects, enemies and bitmap glyphs. Generic frame/menu art is
included; the source title logo, title background/illustration, specific Boss
names and stone UI are filtered out. Source script addresses and retained pixels
are preserved. `TouhouBossPresentation` owns the original entry aura, double
circles, distortion, countdown, spell title and attack announcement. Its
specific Boss/background data stays with the application. Dynamic spell text
uses an injected raw bitmap-text service and the public source typography profile.

`createTouhouPrefabCatalog(resources)` provides the complete manifest-backed
animation inventory and factories for restored players, common enemies, all
standard bullet styles/color rows and effects. Numeric animation presets remain
available as `bank:script`; named presets identify common Boss/spell effects.
The common manifest records every retained asset and source transformation.

## Spell presentation primitives and materials

The root entry exports `PerspectiveCamera`, `PerspectiveSprite`, `TexturedRing`
and binary32 matrix/quaternion helpers. They generate ordinary `DrawList` mesh
commands; the application supplies simulation timing, transforms, colors and
textures. Quaternion angles use radians and left-handed pitch/yaw/roll.
`TexturedRing` retains the requested segment count and can repeat a texture
around the ring; `closedSeam` optionally includes the duplicate closing segment.

`assets/spell-common/manifest.json` is a public `SpriteAtlas` pack with three
textures and seven named strip, ring, aura and charge sprites. Load it through
the same injected host adapter as other sprite packs. It includes no Boss
portraits, spell backgrounds, menu artwork or game timelines. Each texture has
a source hash and a separate resource notice. The primitives never read files
or depend on the native host.

## Restored characters and common resources

```js
import { DrawList } from '@ts-stg/thlib';
import { createTouhouResources, TouhouPlayer } from '@ts-stg/thlib/touhou';

const resources = createTouhouResources(host, {
  basePath: 'packages/thlib/assets/touhou-common'
});
const character = 0; // 0: Reimu, 1: Marisa
const player = new TouhouPlayer({
  character, sht: resources.shots[character],
  bank: resources.banks[character ? 'pl01' : 'pl00'],
  effectBank: resources.banks.effect,
  power: 400, lives: 2, bombs: 2
});
const context = {
  enemies: [],
  sound: (id, x = 0) => resources.audio?.request(id, x),
  stopSound: id => resources.audio?.stop(id)
};
const draw = new DrawList();
const view = { x: 336, y: 24, scale: 1.5, screenScale: 1 };

// Once per simulation frame; mask uses the public Keys bits.
player.update(mask, context);
for (const bank of Object.values(resources.banks)) {
  bank?.updateDetached();
  bank?.collect();
}
resources.audio?.flush();

// Once per render. Player.draw includes its body, shots, options, focus and Bomb.
draw.reset().clear(0x101018ff);
player.draw(draw, view);
for (const bank of Object.values(resources.banks)) bank?.drawDetached(draw, view);
// Submit draw.commands to the renderer. Call resources.dispose() on scene teardown.
```

The application injects `host.readText`, `host.loadTexture` and optional audio
services. Native callers can pass `globalThis.tsstg`; Node/browser callers provide
their own adapters. `basePath` is relative to the host's project root, not the
module file; change it when installing under `node_modules` or copying the pack.
`createTouhouResources()` with no host provides the exact shared simulation data
without textures/audio. It does not substitute prototype weapons.

`TouhouPlayer`, `TouhouShot`, `TouhouReimuBomb` and `TouhouMarisaBomb` retain the
restored frame timings, fixed-point movement, shot records and ANM presentation.
The body animation is included; no application body-skin callback is needed.
Actor-owned animations update with their owners, so do not also call `bank.update()`
on them. `TouhouRenderQueue` orders actors and effects using configurable layer
priorities. `TouhouItems`, `TouhouGrazeEffects`, `TouhouDamageAccumulator`,
`TouhouSpell`, `TouhouEnemy`, `TouhouBulletField`, `TouhouLaserField`, distortion,
font and audio controllers are independently reusable.

`TouhouGameplayCompositor` retains the original background capture, distortion,
gameplay and HUD pass ordering across two application-owned render targets.
`TOUHOU_OWNER_PRIORITIES` distinguishes embedded actor VMs from registered ANM
layers. See [the rendering guide](../../docs/touhou-rendering.md) for composition,
camera clipping, resource ownership and the remaining resampling limits.

A battle context connects `enemies`, `damageEnemy`/`damageRegion`,
`cancelCircle`/`cancelRectangle`, `spawnItem`, `enqueueGraze`, `spell` and event
callbacks to the application's world. The shared owners still compute the actual
weapon/Bomb behavior, damage shapes and cancellation timing. The old demo's
`Th20*` imports are identity aliases of these `Touhou*` classes, not copies.

`getTouhouPlayerData(0 | 1 | 'reimu' | 'marisa')` returns normalized
`ts-stg-touhou-shots` data: baseline patterns 0..14, one normal option profile,
movement speeds and per-target damage caps. Power uses 0..400 units. Title-specific
SHT binary parsing and stone weapon profiles are excluded from the library.

Restored coordinates are Y-down, angles radians and speeds units/frame. Default
player bounds are `{x:-192,y:0,width:384,height:448}` with movement insets
`{left:8,top:32,right:8,bottom:16}`. Its default starting/respawn Y is 400, with
respawn entry at 480. A different canvas can configure all of these explicitly:

```js
const widePlayer = new TouhouPlayer({
  character, sht: resources.shots[character],
  bank: resources.banks[character ? 'pl01' : 'pl00'], effectBank: resources.banks.effect,
  bounds: { x: -320, y: -240, width: 640, height: 480 },
  movementInsets: { left: 8, top: 8, right: 8, bottom: 8 },
  x: 0, y: 200, respawnX: 0, respawnY: 200, respawnStartY: 280,
  power: 400
});
```

The configured player bounds also govern shot retirement, Reimu Bomb edge behavior
and common item placement/retirement. Render views perform scale/translation;
enemy and damage adapters must use the same logical coordinates. A Y-up source
game converts at its application boundary.

`assets/touhou-common/` contains curated full ANM animations and common image,
font and sound data. Mixed atlases preserve selected original pixels and clear
exclusive regions; excluded script/sprite IDs throw instead of silently drawing
a replacement. The material pack has its own provenance, hashes and rights notice,
separate from MIT source code. Tests compare both characters' shared and original
bank snapshots/render commands frame by frame; see repository verification reports
for the measured scope. They do not establish untested whole-game equivalence.

## Lightweight game templates

```js
import { Game, Player, Boss, Patterns, DrawList, RepeatingInput } from '@ts-stg/thlib';

const game = new Game({ seed: 42, title: 'My game', stageFactory: createStage });
// Your adapter calls game.update(inputMask) and submits game.render().
```

The library includes bullets, lasers, weapons, bombs, enemies, boss phases, items,
effects, frame tasks, collision, configurable menus, stages and a library replay
format. Sprite animation, resource caches, binary32 arithmetic, configurable input
repeat, ordered draw queues, grid meshes, radial distortion, SpriteAtlas and SpriteClip are reusable services.
Angles are radians; time and velocity use simulation frames.

`StandardBulletPresets` and `getBulletPreset(name)` provide the library's shared
visual sizes and collision shapes. These are thlib defaults, rather than a
historical hitbox table from a particular game. Round bullets use a radius of
one quarter of their visual size. Slender bullets use rotated capsules; talismans
use rotated boxes. The geometry is independent of a sprite's colour and texture.
All entries and the table are frozen. Existing `new Bullet()` defaults stay the
same; applications explicitly select these presets when they want shared rules.

```js
import { getBulletPreset, bulletIntersectsCircle } from '@ts-stg/thlib';

const preset = getBulletPreset('rice');
const pose = { x: 100, y: 200, angle: Math.PI / 4, scale: 1 };
const hit = bulletIntersectsCircle(preset, pose, player.x, player.y, player.radius);
// Draw the sprite with width/height = preset.size * pose.scale.
// Both objects use the same logical coordinates; screen scaling stays in the adapter.
```

The preset fields are `size`, `radius`, `hitbox`, optional `halfLength` and
`halfWidth`, plus `rotation`, `colors` and `additive` presentation metadata.
For a capsule, `halfLength` is half its centre segment and `halfWidth` is the cap
radius, so its total length is `2 * (halfLength + halfWidth)`. Ordinary capsules
use `halfLength = radius * 1.15`; needles, knives and lightning have explicitly
elongated geometry. For a box, the two fields are its half extents. `scale`
changes the bullet geometry without changing the target circle. Tangency counts
as a hit; an inactive or destroyed pose cannot hit. The helper uses the same
collision implementation as `Bullet.collidesCircle`. `rotation` describes the
intended sprite orientation policy; the application supplies the current angle.

Available geometry names are `pellet`, `orb`, `ring`, `rice`, `kunai`, `needle`,
`amulet`, `star`, `capsule`, `oval-ring`, `glow`, `orb-medium`, `heart-ring`,
`knife`, `oval`, `star-large`, `ring-medium`, `orb-large`, `lightning`, `diamond`,
`droplet`, `orb-patterned`, `flame`, `linked`, `micro-orb` and `heart`. Visual sizes
are 8, 16, 32 or 64 logical units. Some geometry names need application-supplied
artwork when the shared image pack has no matching motif. Unknown names,
including colour-qualified names such as `orb.gray`, throw `RangeError`.

Shared bullet, laser, Bomb and effect sprites are organized as a data-only pack in
`assets/reference-common/`. This local pack selects complete reusable atlases and
excludes title artwork, HUD, backgrounds, character sheets and atlases mixed with
title-specific objects. Its manifest supplies named sprites and animation clips,
source hashes and original resource provenance; its NOTICE is separate from the
code's MIT license. `SpriteAtlas` loads this pack through an injected host and
`SpriteClip` plays its named animation frames without ANM or a game dependency.
This describes the lightweight pack only; restored character sheets and selected
regions from mixed atlases are provided by `assets/touhou-common/` above.

Six authored sound effects also ship in `assets/audio/`. `assets/manifest.json` contains
paths relative to the asset directory. The application chooses or copies that
directory and passes paths to its resource adapter; the library never guesses an
installed filesystem location. See `assets/README.md` for provenance and usage.

`createPlayerCharacter('reimu' | 'marisa', options)` creates a prototype `Player`
with its normal movement, hit/deathbomb/respawn, items and weapon lifecycle. Reimu
uses the configurable homing weapon and orb Bomb archetypes; Marisa uses the laser
weapon and beam Bomb archetypes. `options.weapon`, `options.bomb` and
`options.bombFactory(player, game, bombOptions)` customize these templates. These
are reusable defaults; faithful shared characters use `TouhouPlayer` above.
Ordinary `new Player()` and `new Bomb()` retain their existing defaults.

`Bomb.shape` selects `orb` or `beam`; `createOrbBomb()` and `createBeamBomb()` are
convenience constructors. Beam geometry is a capsule from `x/y` along `angle`,
with full `width`, `length`, optional `growFrames` and owner tracking. Damage and
cancellation use that geometry. `intersectsEntity()` handles circles, rotated
capsules/boxes and segmented lasers, including tangency. `Game.cancelBeam()`
cancels both active and pending projectiles and produces the ordinary cancel
items. A custom game adapter can supply `cancelBeam(bomb, {reward, force})` to
bridge its own world; the Bomb falls back to the public World when none exists.

`PlayerPresentation(atlas)` uses the supplied `SpriteAtlas` and shared focus,
amulet/star, laser, orb and beam sprites. It owns no textures and reads no files.
All simulation coordinates are Y-down; a view supplies `scale`, `offsetX` and
`offsetY`. `drawShots`, `drawItems`, `drawPlayer`, `drawBombs`, `drawEffects` and
`drawFocus` let the application place these layers around its enemy rendering.
`drawPlayer` draws options and calls `body(draw, player, {x,y,alpha,scale})` for an
application body skin. The default body is the generic geometric skin. The focus
point uses the actual `player.radius` and can be drawn after hostile bullets.
`drawWorld` is a convenience with an optional `groups` filter; `snapshot()` lists
the shared sprite aliases used. Death effects and dropped items are included.

```js
const player = createPlayerCharacter('marisa', { x: 200, y: 400, power: 4 });
const presentation = new PlayerPresentation(atlas);
const view = { scale: 1.5, offsetX: 0, offsetY: 0, body: drawBodySkin };
presentation.drawShots(draw, world, view);
presentation.drawPlayer(draw, player, view);
// Draw the application's hostile bullets here.
presentation.drawBombs(draw, world, view);
presentation.drawEffects(draw, world, view);
presentation.drawItems(draw, world, view);
presentation.drawFocus(draw, player, view);
```

The reusable menu/HUD layouts and application flow belong to thlib. Title
artwork, specific Boss identities, backgrounds, BGM, stages and exclusive
mechanics such as magic stones remain in the demo applications.
`TouhouBossPresentation` exposes an explicit black-fog/fly-in entrance;
`TouhouBossPhasePlan` converts caller-owned attack phases into source-style
segmented health rings and remaining-card stars. Custom names, appearance
timing, movement, phase groups and visual weights do not require copying thlib.
Common character shot records and their animation behavior are included in thlib.
The repository's private `games/touhou20/` and `games/rushboss/` demos depend on this
package and never ship in the default SDK. The former `@ts-stg/thlib/th20` subpath
remains removed; the shared restored entry is `@ts-stg/thlib/touhou`.

Local installation: `npm install ../TS-STG/packages/thlib`.
The root ESM entry includes TypeScript declarations. Native QuickJS-NG hosts load
`@ts-stg/thlib` and its public module subpaths from the project or its installed `node_modules` package.
Windows hosts also support the V8 backend. No publication is performed by local packaging.
