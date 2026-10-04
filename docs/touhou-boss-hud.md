# Boss phases, health sections and remaining spell stars

The public `@ts-stg/thlib/touhou` entry exports `TouhouBossPhasePlan` and
`TouhouBossHud`. The plan is a presentation policy: it neither runs attacks nor
changes damage, spell awards or phase transitions. Consumers retain their own
phase executor and pass its current health to the plan.

```js
const plan = new TouhouBossPhasePlan([
  { hp: 12000 },
  { hp: 2200, spell: true },
  { hp: 12000 },
  { hp: 2000, spell: true },
  { hp: 2500, spell: true },
]);

presentation.update({
  boss, name: 'My Boss', remainingFrames,
  ...plan.hudState(phaseIndex, { hp: boss.hp, maximumHp: boss.maximumHp }),
});
```

The default `spellRing:'shared'` groups consecutive nonspells with the following spell. A spell
without preceding nonspells gets its own full ring. All phase weights in a group
are added; the current ring is the remaining current-phase weight plus all later
weights in that group. Reaching the spell retains the remaining section rather
than refilling the ring. At a new group, the original HUD fills toward its new
health fraction at float32 `0.025` per frame.

An enemy's `damageInvulnerability.current > 0` suppresses its ring, matching
ECL515 and source `boss_panels`. Pass the same timer used for damage protection;
do not substitute the broad `invulnerable` collision flag. Public
`applyTouhouEnemyDamage(health, amount, enemy)` records protected hits without
changing HP. The entity owner advances its timer after the damage pass. The
HUD resumes drawing once that timer reaches zero, using the source fill rate by
default or the immediate health fraction when `animateFill:false` is supplied.

This shared ring is the literal TH20 default, including the small remaining arc
at spell start. It must not be mistaken for damage carried into the next spell:
the spell's logical HP can be full while its share of the entire ring is small.

For an independent full ring at each spell start, use
`new TouhouBossPhasePlan(phases, { spellRing:'full' })`. Nonspells retain their
HP-based sections; spells display their own `hp / maximumHp`, clear the section
markers and return `animateFill:false` so the visible ring immediately reflects
their actual health. Rush's portrait demo retains the default `shared` policy. `full` is an optional
presentation choice, not TH20's ordinary shared-ring behavior. Neither policy
changes logical HP, damage, protection, phase transitions or win/loss rules.

`healthGroup` supplies an explicit group key; adjacent equal non-null keys form
one group. `healthWeight` changes a phase's visual share without changing its
logical HP. Constructor `isSpell`, `weight` and `group` selectors accept existing
application data models. The original profile has four markers and thus at most
five sections per group. Applications with a different HUD can consume the phase
data using their own renderer instead. For spell practice, create a plan from
the selected spell alone, giving it a full ring and no future stars.

`hudState()` returns `{ remainingSpells, healthBars }`. Each health bar contains
`current`, `maximum`, `phaseHealth`, `markers` (fractions) and `groupIndex`.
The HUD also accepts `visible:false` on a health bar for a survival phase,
independently of the countdown, name and stars.
Set `animateFill:false` on any health bar to skip the upward fill animation;
the default retains the source fill rate. Damage-protection visibility still
applies, and the first visible frame uses the current health fraction.
`TouhouBossHud` accepts those display values independently of `boss.hp`;
`phaseHealth` continues to drive the bottom pointer's original low-health
warning thresholds. A consumer using source-style whole-group health can omit
the plan and use the ordinary Boss health and `setMarkers()` API directly.

Stars represent cards after the current or immediately upcoming spell; that
spell is already represented by the current health ring. A three-card Boss
therefore shows two, one and zero stars across its three groups. The stock HUD
retains the source maximum of ten stars. A star reduction interrupts the outgoing
ANM and keeps it alive for its 20-frame enlarge/fade animation.

`name` draws a dynamic application-supplied name at the source label anchor with
the source alpha timeline. `new TouhouBossHud({ drawName, nameStyle, ... })` allows
a custom name renderer/skin; a caller can inject that HUD into
`TouhouBossPresentation`. Original concrete Boss-name pictures remain demo
resources. The generic bitmap-font fallback does not claim to reproduce the
letter shapes in any concrete Boss's prerendered name artwork.

## Ring texture repeat period

The ring primitives created by ANM `600/601/602` use the full texture height as
their V repeat period. The common asset importer therefore preserves the
`front/lifebar` source height of 32 pixels, at `y:0` with `paddingY:0`. Its two-pixel
X gutters copy the source texture's wrapped neighboring pixels, recorded as
`edgeSampling:'source'`, rather than extending the sprite's own edge. Those
neighbors participate in the original linear sampling. Ordinary UI and the
section-marker sprite185 still extend their own edges; sprite185 keeps
`paddingY:2`. Expanding the ring texture from 32×32 to 32×64
would make half of each V period sample blank pixels, leaving a visually broken
ring even when its health fraction is 1. Preserve the repeat axis in imported
assets instead of changing the generic renderer's original repeating-UV rules.

## Read-only source evidence

- `source_reconstruction/gameplay/enemy_opcode_state.cpp`: ECL 511 sets HP and
  maximum (line 47); 514 configures life/time thresholds without changing either
  health value (lines 28, 50–57). Spell-start 522/528/531–533 sets the spell flag
  and sevenfold damage accumulator, not the maximum (lines 63–73). 527 writes a
  marker as `threshold / maximum`; 534 sets star count.
- `source_reconstruction/gameplay/enemy_damage.cpp`: `enemy_life_phase`
  (lines 35–47) clamps current HP to the phase threshold and returns the next
  script, preserving maximum HP. `enemy_time_phase` (lines 49–65) likewise only
  changes current HP. `phase_script` (lines 21–25) executes the next script in
  the same damage pass. A phase transition by itself neither refills the ring
  nor delays spell start; a later ECL 511 is what resets the maximum.
- `source_reconstruction/hud_system/update.cpp`: `boss_panels` uses whole-group
  HP, original fill rate, marker visibility and ANM 374–377. The star loop creates
  front 58–67 and sends interrupt 1 when the count decreases.
- `scripts/recovered/ecl/st01bs.ecl.txt`: first group HP 14200, spell threshold
  2200 and two stars; second group HP 14000, threshold 2000 and one star; final
  standalone spell HP 2500 and zero stars. The nonspell-to-spell transition does
  not issue another HP/maximum reset. These are reference fixtures, not embedded
  concrete Boss definitions in thlib.
- `scripts/recovered/anm/front.anm.txt`: 58–67 use sprite 38, layer 22 (callback
  priority 60), source coordinates `(-376 + 20*i, 18)`. At 960×720 this anchors
  stars at `(54 + 15*i, 37.5)`. Entry waits 60 frames then fades in over 20;
  interrupt 1 scales to 2 and fades out over 20. Name scripts 150–165 use the same
  alpha timeline at source y=0; the generic name carrier uses public script58's
  timeline without drawing its sprite. Source-name artwork stays excluded.
- Local LuaSTG thlib `enemy/boss_system.lua` and `boss_ui.lua` were consulted for
  separation of card-list logic and configurable UI. Their default 0.15 spell
  ratio and custom health-bar drawing were not substituted for the TH20 profile.

Validation: `tests/touhou-boss-phase-plan.test.js` checks the source health
thresholds, nonspell/spell continuity, future-star semantics, explicit groups,
practice, ANM entry/removal, name position/alpha and nonmutation of combat data.
