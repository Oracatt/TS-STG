import type { Player, PlayerOptions } from './index.js';

/** Configurable, version-independent Reimu homing/orb and Marisa laser/beam archetypes. */
export function createPlayerCharacter(character: 'reimu' | 'marisa', options?: PlayerOptions): Player;
