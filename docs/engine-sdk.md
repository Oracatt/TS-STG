# TS-STG Engine SDK

This distribution contains the Windows x64 native engine and `@ts-stg/thlib`,
including its common visual/sound materials, API documentation and licenses.
Demo games, their game-specific code and title-specific resources are excluded.
Common Reimu/Marisa characters, weapons, Bombs, bullets, lasers, minor enemies,
effects, application/menu/HUD/pause/result controllers, Boss entry circles,
distortion, countdown and spell announcements belong to thlib, with
each pack's source and license recorded separately from the code license.
Being sourced from TH20 does not make a common asset exclusive to that title.

Create `main.js` next to `ts-stg.exe` and run `Run.cmd`:

```js
import { TouhouApplication, createTouhouResources } from '@ts-stg/thlib/touhou';
const host = globalThis.tsstg;
const resources = createTouhouResources(host);
globalThis.__tsstg_game = new TouhouApplication({
  resources, pixels: host, ownResources: true,
  onQuit: () => host.quit(),
  gameOptions: {
    onSound: (id, x) => resources.audio?.request(id, x),
    onStopSound: id => resources.audio?.stop(id),
    // Supply stage(game, frame) and renderBackground(draw, game) for your game.
  },
  onAfterUpdate: () => resources.audio?.flush()
});
```

For a separate project, install or copy `packages/thlib` into that project's
`node_modules/@ts-stg/thlib` or `packages/thlib`. Run:

```powershell
.\ts-stg.exe main.js --root C:\Path\To\YourGame
```

The engine defaults to the project's `main.js` when no entry is supplied.
It supports relative application modules, the public `@ts-stg/thlib` entry and
module subpaths such as `@ts-stg/thlib/touhou`.
The native runtime needs no Node.js. Node/npm is optional for managing dependencies.
Windows x64 builds normally contain both V8 JIT and QuickJS-NG, embedded in the
executable. Auto selects V8 when available. Pass `--backend quickjs` or
`--backend v8` to select explicitly; a QuickJS-only build rejects V8 with a
diagnostic. `tsstg.backend` and the window title identify the actual runtime.
The backend does not change thlib, common assets or the drawing API.
The Microsoft Visual C++ x64 runtime may be required on another machine.

The default application provides common title/difficulty/character selection,
actual Reimu/Marisa controls, weapons and Bombs, frame HUD, pause and result/continue
flow. It uses the same public controllers as the demos. Pages requiring your
replay/profile/music data are disabled until you supply their handlers. Configure
`menuOptions`, `gameOptions`, scene factories and event callbacks to customize it.
Title logo/background art, specific Boss attacks, stages and music are supplied by
your application. `pixels: host` enables the original pause capture/noise.

`TouhouTitleBackground` supplies the common animated title mesh, with your own
artwork rendered through the menu background's `drawCapture` hook. Use a valid
render target for this capture, or `textureId: null` for a background that draws
directly. `TouhouStageSelect` supplies practice-list transitions and paging;
your application supplies entries and owns the animation bank.
`TouhouDialogue` owns its dialogue boxes, text surfaces and character animation;
provide dialogue steps, events and optional portraits. Simplified Chinese text
uses an explicit `codePage: 936`; the default remains CP932.
See `docs/thlib-guide.md`, `docs/touhou-dialogue.md` and `docs/touhou-prefabs.md`
for lifecycle ownership, resource boundaries and the source-backed inventory.

Individual restored owners can also be composed directly:

```js
import { createTouhouResources, TouhouPlayer } from '@ts-stg/thlib/touhou';
const resources = createTouhouResources(globalThis.tsstg, {
  basePath: 'packages/thlib/assets/touhou-common'
});
const player = new TouhouPlayer({
  character: 0, sht: resources.shots[0],
  bank: resources.banks.pl00, effectBank: resources.banks.effect,
  power: 400, lives: 2, bombs: 2
});
// A scene calls player.update(mask, context) and player.draw(draw, view).
// The player owns its actual shots, options, focus effects and Bomb animation.
```

The common weapon data contains baseline patterns 0..14 in the portable
`ts-stg-touhou-shots` format, with no binary SHT importer or stone variants.
Default coordinates are Y-down in a 384×448 field centered on X=0; player bounds,
movement insets and respawn coordinates are configurable. The complete native
self-contained scene example is in `docs/thlib-guide.md`. Installing the package
under `node_modules` requires passing the corresponding material-pack path.

thlib contains both lightweight templates and the complete reusable restored
application controllers, common visual/sound packs and authored sound cues.
`createTouhouPrefabCatalog(resources)` exposes every retained animation, all
standard bullet type/color rows, common enemy animations, effects and both player
presets. The common manifest is the authoritative inventory and includes source
hashes and every filtering operation. Public `TouhouBossPresentation` provides
the source Boss black-fog appearance (or a visible fly-in), persistent aura,
double circles, background distortion, countdown and spell announcements;
its background and Boss identity are injected. `TouhouBossPhasePlan` supplies
configurable nonspell/spell health groups and future-card stars to the public
HUD. See `docs/touhou-boss-entrance.md` and `docs/touhou-boss-hud.md`.
Your application owns specific Boss attacks, stages, rules unique to a game,
branding, BGM, resource locations and platform adapters. Specific demo content never
becomes a reverse dependency of thlib. See `packages/thlib/README.md`,
`packages/thlib/assets/README.md` and `docs/native-api.md`.

The repository's Touhou 20 application is a development and regression demo,
not part of the engine or thlib release. A separately generated private demo
bundle may contain locally imported original resources and must not be published.
