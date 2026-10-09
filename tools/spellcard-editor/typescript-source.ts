import {createSpellSource} from './source.js';

/** New documents use thlib's public types; only the native VM executes the body. */
export function createTypeScriptSpellSource(): string {
  return `import type {TouhouBossPresentation, TouhouBulletField, TouhouEnemy, TouhouGame, TouhouLaserField, TouhouPlayer, TouhouRNG} from '@ts-stg/thlib/touhou';

interface SpellContext {
  boss: TouhouEnemy;
  player: TouhouPlayer;
  bullets: TouhouBulletField;
  lasers: TouhouLaserField;
  game: TouhouGame;
  random: TouhouRNG;
  presentation: TouhouBossPresentation;
  sound?: (id: number, x?: number) => void;
  clear(): void;
}

${createSpellSource()
    .replace('ordinary JavaScript', 'ordinary TypeScript')
    .replace('createSpell(context)', 'createSpell(context: SpellContext)')
    .replace('fireRing(angle)', 'fireRing(angle: number)')}`;
}
