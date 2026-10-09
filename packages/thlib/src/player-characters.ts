import type { Bomb } from './player.js';
import type { PlayerOptions } from './api-types.js';


import { Player, Weapon, createOrbBomb, createBeamBomb } from './player.js';

/** Reusable character archetypes, with ordinary Player/Weapon/Bomb lifecycle.
 * These configurable defaults do not reproduce a particular game's shot tables. */
export function createPlayerCharacter(character: 'reimu' | 'marisa', options: PlayerOptions = {}): Player {
  if (character !== 'reimu' && character !== 'marisa') throw new RangeError(`Unknown player character: ${character}`);
  const reimu = character === 'reimu';
  const weaponDefaults = reimu ? { type: 'homing', shotSprite: 'bullet.amulet.red', optionSprite: 'bullet.amulet.rose' } :
    { type: 'laser', shotSprite: 'bullet.star.yellow', laserSprite: 'laser.straight.light-cyan' };
  const bombDefaults = reimu ? { maxRadius: 320, expansion: 12, color: 0xffffffc0 } : { color: 0xffffffff };
  return new Player({ ...options, character,
    weapon: options.weapon instanceof Weapon ? options.weapon : new Weapon({ ...weaponDefaults, ...options.weapon }),
    bomb: { ...bombDefaults, ...options.bomb },
    bombFactory: options.bombFactory ?? ((_player, _game, bombOptions) =>
      reimu ? createOrbBomb(bombOptions) : createBeamBomb(bombOptions)) });
}
