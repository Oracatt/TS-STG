# Rush demo content boundary

Rush contributes the three Boss identities/artwork, stage artwork, 29 attack
trajectories, 16 spell names and dialogue. Its private music is loaded from the
unchanged files extracted from `TouhouRushBoss-main/src/thsrc.smx`. The title,
pre-combat and three battle tracks retain `LevelResources.cpp` loop points;
those values count interleaved channel samples, not PCM frames.

Music announcements use `TouhouMusicCaption` with Rush dialogue text. They no
longer load the TH20 stage-logo song-name pictures. The public template retains
the source announcement timeline and screen-space geometry while the business
layer supplies the song title, encoding and BGM selection.

The demo does not define player bullet hitboxes, repeated graze rules, laser
collision/splitting, Bomb cleanup immunity, damage resistance ramps or spell
bonus decay. It translates coordinates and routes these operations to the
public original-style thlib owners. The earlier Rush `cleanOnHit/cleanOnBomb`
fields no longer grant immunity to ordinary projectiles. Non-spell and spell HP
are documented in `rushboss-source-health.md`. The portrait demo uses the public
HP-based phase plan with its default `spellRing:'shared'`: a nonspell and its
following spell share a ring. Reaching the section marker starts the spell at
that remaining section rather than refilling the ring. A new group receives a
new ring, and spell practice uses a standalone group containing the selected card.

`TouhouSpell` is the sole owner of bonus, capture eligibility and settlement.
Rush attack timers continue to schedule the authored bullet patterns. The source
spell frame count starts at one, independently of the zero-based attack timer.
Boss appearance and combat start are separate: a revealed Boss can wait through
dialogue without creating its attack aura or background distortion.

Phase cancellation uses source drop mode0 and creates no items at removed bullet
positions. Boss rewards use the stage/card mapping in `boss-drop-profile.js`
and `TouhouItems.spawnBossDrops`: counts remain business data, while timeout and
spell-practice suppression, local scatter, upward velocity and pickup rules belong
to thlib. Survival-card timeout still permits configured rewards; losing the bonus
through a miss or Bomb does not suppress rewards on defeat. Whole Rush Life/Bomb
rewards are not substituted for original center fragments. A zero-delay nonspell
handoff initializes its following spell in the same damage pass without carrying
over batch damage. The following spell immediately keeps the shared ring's
remaining section, subject to the existing damage-protection visibility gate.

Explicit ECL515 protection comes from the private source profile. Both the common
HUD and `applyTouhouEnemyDamage` receive the same public timer; protected hits
still score and accumulate recorded damage without reducing HP. Ordinary
nonspell-to-spell handoffs do not install a new blanket invulnerability period.

Replay revision 5 rejects older recordings because collision, HP, attack gates,
settlement, phase handoffs, item RNG and damage-protection timing have changed.
The shared-ring presentation leaves HP, damage, protection, win/loss rules and
replay revision unchanged. Both demos and all BGM remain outside the default
engine/thlib SDK. The shared audio pack contains common `se_*.wav` effects only.
