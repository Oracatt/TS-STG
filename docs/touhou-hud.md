# Public Touhou status framework

`TouhouHud` is the default status owner used by `TouhouGame`. It owns the frame,
bitmap image labels, bitmap numeric values, stock animations, difficulty label,
Boss pointer and result/Extend messages. A game supplies its artwork and optional
layout/colors through `systemOptions.hud`; it does not replace the root animation's
`draw` method or implement another set of status labels.

```js
const game = new TouhouGame({
  // banks, font, sht, styles, and other game options
  systemOptions: {
    hud: {
      skin: {
        drawFrame(draw, {view, state, hud, layout}) {
          // Draw custom borders/sidebar artwork. This is a plain DrawList.
          // Coordinates here are actual render pixels; the source screen is
          // 640x480 with view.screenScale === 1.5.
        },
        drawBranding(draw, context) {
          // Fit and position the game's own logo/artwork.
        },
      },
      palette: {
        score: {color: 0xfff0f0ff, shadowColor: 0xff102030},
        stock: {color: 0xffeeeeee, shadowColor: 0xff102030},
      },
      layout: {graze: {y: 230}},
      replay: false,
    },
  },
});
```

Both skin callbacks are optional. `drawFrame` replaces only the original
`front:2..5` frame subtrees; all status image labels, underlines, stock icons and
numbers remain owned by thlib. Without it, the original common frame is drawn.
`drawBranding` runs after the frame, including when the default frame is used.
Setting `hud.skin = null` restores the default frame without replacing or
recreating the status owner.
The library assigns both artwork callbacks priority 73, ahead of the image rows
at priority 74 and numeric rows at 75. The callbacks receive a plain `DrawList`,
so they cannot accidentally enqueue a background above the status values.
Keep graphics scopes balanced and keep these drawing callbacks free of simulation
or animation updates. No game name, background file, logo fitting or logo position
is embedded in the public skin contract.

## Default rows and public state

Coordinates below are the original 640x480 screen units. `TOUHOU_HUD_LAYOUT`
exports immutable row origins. A partial `layout[row] = {x, y}` override translates
the entire row: original image label, underline, related stock icons, fragment
fraction and numbers. Supplying only `x` or `y` leaves the other coordinate at its
default. Row overrides do not change animation memory or advance animation time.

| Row | Origin | Data | Label source |
| --- | --- | --- | --- |
| `highScore` | 428, 42 | `highScore`, `highScoreDigit` | Original `front:6`, sprite 4 |
| `score` | 428, 64 | `score`, `continues` | Original `front:7`, sprite 5 |
| `lives` | 428, 96 | `lives`, `lifeFragments` | Original `front:8/9`, sprites 6/7 |
| `bombs` | 428, 134 | `bombs`, `bombFragments` | Original `front:10/11`, sprites 8/7 |
| `power` | 444, 182 | `power` and configured power rules | Original `front:12`, sprite 11 |
| `pointValue` | 444, 204 | `pointValue` | Supplemental common bitmap image |
| `graze` | 444, 226 | `graze` | Supplemental common bitmap image |
| `replay` | 440, 274 | `state.replay ?? options.replay` | Original `ascii_960` font 6 glyphs spelling `Replay` |

The two numeric rows below power are maximum point-item value (`pointValue`) and
Graze (`graze`). `pointItems` is not a status row. The point value and Graze numbers
are displayed integers, grouped with commas; unlike the stored score they are not
multiplied by ten. Missing values use the configured `pointValueMinimum` and zero
Graze. These fields are already provided by `TouhouPlayer`.

`TOUHOU_HUD_LABEL_SCRIPTS` exports the shared supplementary point-value and Graze label script IDs.
They are additions to thlib, **not recovered TH20 image labels**. TH20's original
`front:13` labels its title-specific anomaly resource and is excluded from the
common root. The other apparent label rectangles for these rows are empty in the
original atlas; they cannot supply a maximum-point or Graze image by removing a
resource filter. Original label artwork remains covered by its common-pack rights
notice; supplementary artwork has its own provenance in that pack.

Character-name artwork is omitted by default. Opt in explicitly with
`characterScript: 101` (original Reimu label), `102` (Marisa), or a custom script;
`null` omits it. `difficultyScript` retains the original automatic known-ID
selection and accepts an explicit script or `null`. The Boss pointer always stays
at `hud.roots[1]`, independently of these optional labels.

## Colors, pause and ownership

`TOUHOU_HUD_PALETTE` exports the original numeric colors. Partial overrides accept
`highScore`, `score`, `stock`, `power`, `pointValue` and `graze`, each with `color`
and `shadowColor` in ARGB notation. As in the recovered numeric renderer, the
stock animation supplies the current alpha to both the foreground and shadow;
the palette supplies RGB. Set `shadowColor: null` to disable a numeric shadow.
Image labels retain their own original animation colors and alpha.

`hud.draw(draw, state, {hideNumbers: true})` hides numeric status values for pause
composition. It keeps image labels, stock animations, optional Replay image and
independent result/Extend messages. `state.replay` can override the default Replay
visibility on each draw. It uses the original variable-width ASCII bitmap font
(font 6, shadow font 8) at priority 74, with the same stock alpha as the status
values. It does not use a generated image, a menu's `Replays` title, an additional
ANM owner or a system text renderer. `draw` never advances any animation. The existing game owner calls
`update` once per simulation frame, and does not update the HUD while paused.

Resource rules remain injectable: maximum stocks, fragment thresholds, maximum
power and power-per-level retain their current APIs. Seven genuine stock icons
are kept, with the existing numeric fallback when custom rules exceed the source
artwork. The skin does not replace these mechanisms or take ownership of their
update/destroy lifecycle.

## Shared resource languages

Language selection belongs to the public resource loader. The loader selects
archive descriptors without rewriting animation code or changing the skin
contract:

```js
const resources = createTouhouResources(host, {locale: 'zh-CN'});
```

`ja` is the base resource pack and the default. Other language keys must be
declared by that pack's manifest, for example:

```json
{
  "locales": {
    "zh-CN": {
      "archives": {
        "front": {"file": "locales/zh-CN/anm/front.json", "sha256": "..."}
      }
    }
  }
}
```

This is a descriptor extension, not a second HUD implementation. Missing
localized banks fall back individually to `manifest.archives`; explicitly
decoded `options.archives` overrides take precedence over both. A locale may
also declare additional banks. All descriptor files and texture paths inside
the decoded ANM are relative to the pack root, as in the base resource format.
The loader exposes the selected `resources.locale` as read-only. Unknown
languages and malformed selected locale descriptors fail explicitly. With no
`host.readText`, only the default `ja` can be validated; callers can still supply
already-decoded banks with that existing headless API.

Selecting a locale does not replace its rules, player data, resource owner or
texture caches. Separate resource instances own separate native handles;
fresh banks created inside one instance continue sharing its immutable static
textures and retain independent VM/dynamic-surface lifecycles. Actual translated
artwork must have its own source and rights records in the resource pack; this
loader feature is not evidence that any particular language artwork is present.

The shipped `zh-CN` pack uses the user-supplied TH16 fan translation by 喵玉汉化组
and THB学园 for matching generic UI images. It supplies localized `front`, `title`
and `ascii_960` descriptors. Status, fragment, character-name, pause/result,
confirmation and matching selection-heading images come from audited original
PNG crops. The animation scripts, timing, interrupts, gameplay data and all
untranslated banks retain the base pack. `ascii_960` deliberately retains the
original glyph sprites, metrics and textures. Source rectangles, hashes,
uniform geometry scaling and exceptions are recorded in the locale manifest and
[`NOTICE.md`](../packages/thlib/assets/touhou-common/NOTICE.md).

A game opts in when constructing its shared resources, before constructing its
application or scenes. Its HUD `skin`, `layout` and `palette` options stay the same;
the game does not copy or translate the common label images privately. Omitting
`locale` continues selecting the Japanese baseline for existing callers.

English artwork already present in the original/translation source remains
English: `Spell Card`, `Graze`, bitmap ASCII `Replay`, result/bonus notices, loading
text, and difficulty names. The original `少女祈祷中` loading image and `終` control
glyph also remain unchanged; the patch does not supply a separate simplified
control glyph. The generic English `Option`, `Achievement` and `SubWeapon Select`
headings are retained where the patch has no semantically matching Chinese
heading. Source title-specific subtitles are omitted in those fallbacks. The
music selector retains its generic English heading and the Chinese `音乐室`
substring while omitting TH16's four-seasons qualifier. Character selection keeps
the common Chinese names; title-specific character biographies and seasonal
mechanics are not imported into the reusable pack. These exceptions are explicit
in `manifest.locales['zh-CN'].untranslated` and `.retained`; this is not a claim that
every visible glyph has been translated.
