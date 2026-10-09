import type {TouhouBossPresentation, TouhouBulletField, TouhouEnemy, TouhouGame, TouhouLaserField, TouhouPlayer, TouhouRNG} from '@ts-stg/thlib/touhou';

/** The example's authoring context is assembled by its consumer, not the VM. */
export interface SpellContext {
  boss: TouhouEnemy;
  player: TouhouPlayer;
  bullets: TouhouBulletField;
  lasers: TouhouLaserField;
  game: TouhouGame;
  random: TouhouRNG;
  presentation?: TouhouBossPresentation;
  sound?: (id: number, x?: number) => void;
  clear(): void;
}
