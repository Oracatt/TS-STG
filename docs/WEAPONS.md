# Player weapon presets

The public `@ts-stg/thlib/touhou` entry provides eight weapon families for both Reimu and Marisa. They share the usual player movement, collision, death, power, shooting, Bomb and damage owners. Selection belongs to the application; no equipment menu, stone drops, meter, passive stat bonuses or automatic special-ability activation is installed.

| Selection | Index | Reimu | Marisa |
| --- | --- | --- | --- |
| `standard` | 0 | Needles | Lasers |
| `spread` | 1 | Spreading amulets | Explosive missiles |
| `frost` | 2 | Homing amulets | Icicle shots |
| `rear` | 3 | Rear-targeting amulets | Forward/backward icicles |
| `contact` | 4 | Contact-damage options | Contact-damage options |
| `purification` | 5 | Drifting bullet-cancelling options | Drifting bullet-cancelling options |
| `beast` | 6 | Eagle projectiles | Wolf projectiles |
| `wind` | 7 | Right-angle snake projectiles | Explosive frog projectiles |

`TOUHOU_WEAPON_NAMES[character][index]` contains the original Japanese shot names. English labels above describe behavior, rather than introducing new translated proper names.

## Use

```ts
import {
  TouhouPlayer, createTouhouWeaponPreset, createTouhouPrefabCatalog,
} from '@ts-stg/thlib/touhou';

// Original blue-family Reimu homing shots, with the original Reimu Bomb.
const preset = createTouhouWeaponPreset('reimu', 'frost');
const player = new TouhouPlayer({
  ...preset,
  bank: resources.banks.pl00,
  effectBank: resources.banks.effect,
  power: 400,
  rng,
  visualRng,
});

// The same selection through the resource-bound prefab catalogue.
const otherPlayer = createTouhouPrefabCatalog(resources)
  .createWeaponPlayer('reimu', 2, {power: 400, rng, visualRng});

// Inside TouhouGame, pass the preset through its normal system options:
// systemOptions: {player: createTouhouWeaponPreset(0, 2)}
```

Construct one owner per player. Call the player's normal update/draw/destroy methods; the weapon and its option effects follow that lifecycle. The original default `getTouhouPlayerData` and default character profiles remain unchanged. The game must use the matching player animation bank. Custom games can override the same player profile/factory hooks without importing a demo.

## Data and timing

`getTouhouWeaponData(character, index)` returns deeply frozen source data. Each table contains 20 local patterns: `0..4` main fire, `5..9` unfocused options, `10..14` focused options, `15..19` source enhanced emitters. The final group and its required callbacks/animations are retained for explicit composition with `fireTouhouPattern`; it does not implement the separate stone special-ability controller. In particular, selecting a weapon does not grant its stone's active or passive abilities.

The blue-family Reimu preset retains its rotating options, five-frame option cadence and distinct unfocused/focused launch behavior. Homing selects eligible enemies, turns during the first 60 projectile frames and retains the original acceleration and target-loss rules. Other families retain source scattering, rear aiming, straight-angle turns, explosions, contact-ring damage and drifting option cancellation. Contact and purification rings are the original procedural geometry from `effect_system/rings.cpp`; all textured projectiles use the extracted player ANM animations.

Replays must change their application revision when switching loadouts. Player snapshots include weapon state, option phases, homing targets, turn timers and detached explosion regions. Gameplay randomness uses the player's seeded RNG; procedural ring noise uses `visualRng` when supplied.

## Evidence and resources

Reference: `Touhou20Reconstruction/source_reconstruction/player_entity/{shot_callbacks,shot_hit,option_frame,movement}.cpp`, `overlay_system/{weapon,basic_weapons,shield_weapon,yellow_weapon,ring_weapon}.cpp` and `effect_system/rings.cpp`. SHT hashes, source pattern ranges, texture crop provenance and original audio hashes are retained in the common pack. Resource ownership and notices remain unchanged.

`tools/import-touhou-weapon-data.mjs --check` verifies the generated TypeScript tables; `tools/import-touhou-common-assets.mjs --check` verifies the extracted pack against the local reference inputs. Package-local tests check portable data, targeting, cadence, impact lifetimes, option movement, cleanup and included assets. These checks are not a claim that an entire original game has been reproduced.
