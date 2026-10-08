# Shared point-value scoring

`pointValue` is the player's point-item value in displayed score units. `graze`
counts accepted grazes; `pointItems` counts collected ordinary point items.
The HUD reads these player fields. Games select the public scoring rules and do
not maintain another point-value counter or redraw their own numbers.

```js
import {TouhouGame, TOUHOU_POINT_VALUE_PROFILES} from '@ts-stg/thlib/touhou';

const game = new TouhouGame({
  // Shared banks, font, shots, styles and other options.
  systemOptions: {
    player: {rules: {...TOUHOU_POINT_VALUE_PROFILES.classic}},
  },
});
```

The same `rules` option works when constructing `TouhouPlayer` directly, or in
an injected player profile's `rules`. `TouhouItems` reads the resulting player
rules; it requires no second selection. Existing custom item definitions remain
usable and can call the exported point-value calculators.

## Presets and defaults

| Preset | `pointValueGrazeStep` | `pointValueGrazeGain` | `pointItemDivisor` |
| --- | --- | --- | --- |
| `classic` | 10 | 10 | 1 |
| `reference` | 0 | 0 | 2 |

`TOUHOU_PLAYER_RULES` retains `reference` as the compatibility default. Selecting
`classic` is explicit. This protects the existing recovered numerical vectors
while providing a complete reusable point-value rule for games without stones.
Neither preset contains game names, character checks, seasons, stones, faith
items or automatically invented cancellation rewards.

With `classic`, a new player starts at 10000. Graze 9 still gives 10000, graze 10
gives 10010, graze 11 remains 10010, and graze 20 gives 10020. Growth is applied
inside `TouhouPlayer.addGraze`, before its existing graze event, using the number
of crossed integer buckets. There is no second owner, timer or private remainder.
The existing graze collision, repeated-graze quotas, effects, sounds and RNG
ordering remain unchanged. The point value saturates at `pointValueMaximum`
(default 1000000); a graze counter already at its own cap crosses no new bucket.

A full-value ordinary blue point awards the current `pointValue` with `classic`.
Collection at or above `collectLine`, or with the existing automatic-attraction
state 3, gives full value. Below that line the shared recovered non-stone height
attenuation remains: start from 90% of the full value and subtract a proportion
of the distance below the line over 450 units, truncate the integer operations,
then round down to tens with a minimum reward of 10. At the default 10000 point
value and line y=128, collection at y=128/129/200/400 gives 10000/8980/7560/3560.
An attracted item gives 10000 even at y=400. Collecting an ordinary blue point
increases `pointItems` and score; it does not increase the point value itself.

The shared stored score remains displayed score divided by ten. Ordinary item
rewards retain their ten-point rounding. Custom point rules should use multiples
of ten when their displayed point value must equal the rounded award exactly.

`reference` preserves the earlier restored no-stone arithmetic: no automatic
point-value growth, and a full ordinary point is `pointValue /2` before rounding.
This is a numerical compatibility profile, not an assertion that its 10000 field
means a 10000-point blue pickup. It deliberately preserves the historical 5000
reward at its default 10000 field. Games displaying the conventional maximum
point-item value should select `classic`.

## Public calculation and lifecycle

All three rules are nonnegative safe integers; `pointItemDivisor` must be positive.
A zero graze step or gain disables graze growth. The existing minimum/maximum
point-value rules remain injectable. For example, a game can select a different
graze bucket or award without replacing the player or item owner.

- `clampTouhouPointValue(value, rules)` retains the original signed32 input
  normalization followed by the configured minimum/maximum.
- `addTouhouPointValueForGraze(player, previousGraze)` applies crossed buckets
  after the public counter changes. The player owner already calls it once.
- `touhouPointItemValue(player)` clamps the point value and returns its full
  ordinary-point base before height attenuation and ten-point rounding.

An ordinary Miss does not reset the accumulated point value, graze or collected
point count. The existing shared Continue policy resets score and replenishes
stock while preserving those fields. Stage cover/resume and `resetForStage`
also preserve them, including a partially completed graze bucket. Constructing
a fresh player for a new run resets all four score fields. These lifecycle choices
are explicit properties of this common preset, not claims about every original
game's death/Continue rules.

Player snapshots include `score`, `pointValue`, `pointItems` and `graze`. Growth
uses integer counters and no extra randomness; identical accepted graze/pickup
inputs produce identical snapshots. Pause stops the normal game update and does
not advance a separate scoring owner. Consumers changing scoring rules must also
advance their replay compatibility revision.

## Numerical sources and limits

The official [Ten Desires description](https://store.steampowered.com/app/1043230/)
and its [original manual](https://cdn.steamstatic.com/steam/apps/1043230/manuals/th13_manural.pdf?t=1562315082)
state that every ten grazes increase the maximum point-item value by ten. This
supports the `classic` graze rate; it does not establish a single identical scoring
system for the entire series. The classic preset combines that reusable rate
with full-value blue points and the existing common height attenuation.

The checked LuaSTG [THlib item code](https://github.com/Legacy-LuaSTG-Engine/Bundle-After-Ex-Plus/blob/082c22727cb9099037fdf6629eeaf84d6a11dc35/game/packages/thlib-scripts/THlib/item/item.lua#L458)
computes `10000 + floor(graze /10)*10 + floor(faith /10)*10`, and its player system
refreshes the result each frame. Its cancellation collectible adds faith and
score. Only the independently supported graze part and separation of point-value
rules inform this preset; its faith collectibles and their values are not imported.

The local TH20 reconstruction has a real Player field at +0x40, initialized 10000
and clamped 10000..1000000. Its point reward additionally depends on stone resource
fields +0x44/+0x48; its graze rewards grow that special resource rather than +0x40.
The original HUD displays the special resource instead of a maximum-point row.
Removing the stone part leaves the earlier `base /2` common reward, preserved by
`reference`. New classic growth must not be described as recovered TH20 behavior.

Sources: `game_session/session.cpp`, `gameplay/player_state.cpp`,
`player_entity/events.cpp`, `item_system/rewards.cpp`,
`bullet_system/drop_items.cpp`, and `hud_system/draw.cpp` under the read-only
`Touhou20Reconstruction/source_reconstruction` directory. Original type 15 is a
difficulty-counted ordinary point drop, not a green point-value collectible.
This change adds no green collectible and does not change phase cancellation.
