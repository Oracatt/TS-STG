# Common enemy and Boss item drops

`TouhouItems.spawnEnemyDrops` implements the ordinary enemy reward distribution from
`source_reconstruction/gameplay/enemy_drop.cpp` and `enemy_drop_adapter.cpp`.
An application supplies reward types, counts, and the enemy's original-space position;
thlib owns the scatter, initial velocity, falling movement, collection, and ANM effects.
`spawnBossDrops` adds the source `BossItem` reward conditions around that same owner.

```js
game.items.spawnBossDrops(
  {x: boss.x, y: boss.y},
  {counts: {power: 15, point: 15}, centerType: 'lifeFragment',
    timedOut: false, survival: false, mode: 0},
  game.context,
);
```

Quantities in this example are application data. The library does not choose a
particular game's stage rewards. `centerType: 0` omits the single center item.
Life and Bomb fragments are types 4 and 6; whole Life and Bomb items are types 5 and 7.

Boss drops default to radius64. Ordinary timeouts (`timedOut && !survival`) and spell
practice (`mode === 2`) return no drops and consume no RNG or animation allocations.
Successful survival expiry remains eligible. Other eligible results reuse
`spawnEnemyDrops` without changing quantities or scatter. This follows the timeout
flag checked by `default.ecl` `BossItem` and the session-mode check in ECL509;
`enemy_damage.cpp` clears that timeout flag for an active survival card. Capture
bonus success is separate from item eligibility.

The optional center item is emitted first. Configured counts then follow numeric
item-type order. The source consumes one initial random angle even with no counted
drops, then a random radius multiplier in `[0.5, 1]` and a quarter-turn plus random
angular offset for each drop. The default ellipse radius is 32; the reference
`default.ecl` `BossItem` helper selects `(64, 64)`. An application can supply a single
radius or `{x, y}`. Every enemy reward starts upward at 2.2 units per tick, independently
of its scatter position. `spawnMany` retains the separate source helper's same-position,
±10-degree, speed-2 behavior and is not the Boss reward distribution.

Items retain the original pickup rules. Full attraction starts when the player is
above the collection line (`y < 128`), during the first 60 Bomb ticks, or while
`context.bossCollecting` is true. In the reconstruction, the latter reads the HUD's
active dialogue pointer; it is not an automatic victory or phase-transition flag.
Proximity attraction and pickup use the player's configured radii. A player hit
releases active pursuit through the existing item state machine.

Phase cancellation and Boss rewards are separate operations. Reference ECL613,
615/616 and 627/628 cancel bullets with drop mode 0. They do not scatter point items
at the removed bullets' positions. `BossItem` independently uses ECL506–510 to emit
the local reward group. Explicit cancellation mode 1 requests a magic-stone item,
which the common library excludes; it must not be substituted with another reward.

`COUNTED_POINT` / `countedPoint` names original type 15: a difficulty-dependent
counter that occasionally emits an ordinary type-2 point item. It has normal falling
and pickup behavior. The old `CANCEL_POINT` / `cancelPoint` aliases are retained for
compatibility and do not represent a small automatically collected cancellation point.

Ordinary point rewards and graze-driven point-value growth are selected through
the player's shared [point-value rules](touhou-point-value.md). The opt-in
`classic` preset gives full displayed point value above the collection line and
increases it by10 per10 grazes; the default `reference` preset retains the
earlier recovered no-stone reward arithmetic. Neither choice changes type15,
enemy drop geometry or phase cancellation into a green-point system.

Source references: `gameplay/enemy_drop.cpp`, `gameplay/enemy_drop_adapter.cpp`,
`gameplay/enemy_damage.cpp`, `gameplay/enemy_reads.cpp`, `gameplay/enemy_opcode_state.cpp`,
`gameplay/enemy_shot_adapter.cpp`, `item_system/spawn.cpp`, `item_system/frame.cpp`,
`item_system/environment.cpp`, and `scripts/recovered/ecl/default.ecl.txt`.
