# Complete shared Touhou resources

`touhou-common/` is the bundled resource pack for `@ts-stg/thlib/touhou` and is versioned with the library.
It carries complete animation instructions and their dependency trees, including
Reimu/Marisa bodies, options, baseline weapons, Bombs and focus indicators. It
also includes ordinary bullets/lasers, cancellation, common items, fairy enemies,
particles/death/charge effects, scene-cover/reveal transitions, the NowLoading
indicator, bitmap glyphs and the original common sound effects.

A fresh checkout or installed package already contains these files. To rebuild from local reference inputs, use `node tools/import-touhou-common-assets.mjs`. The default input is the
existing local import at `games/demo/assets`; that directory is only an import
source, never a runtime dependency. Use `--source` for another existing import,
`--out` to relocate the result, or `--check` to verify every generated file.

```js
import {createTouhouResources, TouhouPlayer} from '@ts-stg/thlib/touhou';
const resources = createTouhouResources(host, {basePath: 'assets/touhou-common'});
const player = new TouhouPlayer({
  character: 0, sht: resources.shots[0],
  bank: resources.banks.pl00, effectBank: resources.banks.effect,
});
```

`createTouhouResources()` without a host supplies the exact same baseline numeric
shot tables for headless simulation, with null animation banks. `getTouhouPlayerData`
returns these immutable tables directly. Rendering requires the bundled pack and
the injected texture loader. Animation timing, transformations, blending, child
spawning and sound metadata are retained; this is not a static-sprite substitute.

Use `resources.createBank(name)` for a new scene or retry. Dispose each retired
bank to release its animation instances and remove it from the owner's registry;
shared textures remain valid for other banks. Call `resources.dispose()` once the
resource owner is finished to release its remaining banks, textures and sounds.
Disposal is idempotent, sets `resources.disposed`, and prevents new banks or loads.

Only profile 0 and normal/focused shot patterns 0–14 are kept. Stone profiles,
stone icons and enemies, named Bosses, portraits, title/stage/background artwork,
game-specific HUD and loading illustrations are omitted. Selected regions of mixed
atlases are copied losslessly into otherwise transparent canvases without changing
their dimensions or coordinates. Each region retains the one-pixel source border
required by bilinear sampling at the original UV boundaries. The manifest records exact rectangles, input
hashes and output hashes. Unselected script/sprite IDs are explicit excluded entries.

Static UI cells in `front`, `ascii_960` and `title` are the documented exception:
their complete source RGBA is repacked with two-pixel gutters extended from each
cell's own edge. This prevents neighbouring atlas content from bleeding into UI
without removing original black outlines. Sprite IDs, dimensions, pivots and ANM
instructions remain unchanged; UV origins and texture sizes are remapped. Full-width
horizontal repeat strips retain wrapping; dynamic text/capture surfaces are not
repacked. The manifest records every source rectangle and destination mapping.

`screenswitch:0..11` and its two source PNGs are retained without any atlas
repacking. Their sprite rectangles intentionally exceed the texture dimensions;
source wrapped UV sampling supplies the repeated scene-cover/reveal pattern.
`ascii_960:17` and children `14..16` use the generic `ascii/loading.png` indicator,
with original source sampling margins, texture dimensions, UVs and animation timing. These common motifs are
distinct from game-specific loading illustrations.

All imported graphics and sounds remain original resources by Team Shanghai Alice /
ZUN, with their own provenance and rights, not the engine's MIT artwork. They are
ignored local inputs; do not publish them without the relevant rights. Common here
means reusable game functionality, not a claim of byte-identical files across all
Touhou releases. SDK distribution and resource rights are separate concerns.
