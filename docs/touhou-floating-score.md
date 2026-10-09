# Pickup value presentation

`TouhouGame` now passes its shared bitmap font to `TouhouItems`. The item owner
creates `TouhouFloatingScores` by default, records the existing pickup display
notifications, advances their visual clock once per unpaused frame and submits
the original ASCII atlas regions. No game-specific renderer, system font or
generated texture is needed.

```js
const game = new TouhouGame({banks, font, sht, styles,
  systemOptions: {items: {floatingScores: {capacity: 10, scale: 1}}},
});
```

For standalone items, pass `font` together with the usual player/banks. The
legacy `itemsFactory(player, banks)` signature remains unchanged; applications
using it supply the font themselves, or use the public `factories.items` option
which receives all default options. `floatingScores: false` disables the public
visual owner while retaining the existing `context.floatingScore` notification
for applications with an established custom renderer. The notification is an
observer when the default owner is enabled; it should not draw a second copy.

`TouhouFloatingScores` is also exported from the root, `/touhou`, and
`/touhou/floating-score` entries. Its options provide borrowed `font` and
`player`, `capacity`, `lifetime`, `initialSpeed`, `drag`, atlas-pixel `scale` and
`drawPriority`. `spawn({x,y,amount,color})` uses world coordinates, nominal display
score units and ARGB color. `items.floatingScore(item, amount, color, context)`
lets a custom item definition explicitly reuse the same presentation. Returning
a value from a custom collection callback alone does not create a popup.

The default conditions remain those in the reconstructed
`item_system/rewards.cpp`: ordinary blue points are yellow at full value and
white below the collection line; small power displays white score only when
already at maximum power; crossing a power level uses the original `POWER UP`
image; a maximum-power large item displays gray 20000; maximum-power full power
displays green score. Fragment, life and Bomb pickups use their existing stock
notifications. A normal power pickup which does not cross a level has no popup.
The selected scoring profile still determines the awarded/displayed value.

The presentation follows `small_score/state.cpp::spawn` and
`small_score/frame.cpp::{update,draw}`: ten circular overwrite slots, initial
speed1, float32 rise with speed multiplied by0.95 per update, and retirement
only when age exceeds60. Update occurs before collection, corresponding to
source update priorities25 and39. New entries therefore start at age0 and age1
on the following frame. The original age0 `8 / age.value` spacing has no finite
quad; the JS owner skips that frame instead of sending Infinity to the host.
Frames1–7 retain that source expression; from frame8 spacing is8 game units.

ASCII sprites289–298 are the initial digits,299 is `POWER UP`,300–309 and310–319
are the subsequent per-digit disappearance stages. For digit position
`remaining` (leftmost first), their upper age bounds are respectively
`lifetime - 8 - 2*remaining`, `lifetime - 4 - 2*remaining`, and
`lifetime - 2*remaining`. `POWER UP` stays visible until the entry retires. The
default digit quad is10×10 atlas pixels; the full power-up image is70×10. World
coordinate placement uses the supplied view, while glyph size does not receive
that coordinate scale again.

The source replaces the popup alpha with opacity based on squared distance to
the player:128 within64 world units, the recovered integer interpolation until
128 units, then255 outside. The exact128-unit boundary retains the original
byte conversion from256 to0. RGB comes from the collection notification. Drawing
uses the original normal alpha blend and bilinear atlas sampling. Owner priority
51, publicly named `TOUHOU_OWNER_PRIORITIES.floatingScore`, is after bullets and
Bombs and receives the compositor's playfield clip and camera movement.

The owner reads positions and never awards score, runs gameplay callbacks or
uses simulation/visual RNG. Its standalone `snapshot()` is available for visual
inspection; it is deliberately excluded from `TouhouItems.snapshot()` and
`TouhouGame.snapshot()`. Pause freezes the clock. Repeated draw calls do not
advance it. `clear()`/`destroy()` retire entries without disposing the borrowed
font or common resources. No deterministic replay revision change is required.
