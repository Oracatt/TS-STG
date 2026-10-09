import type {TouhouDamageSource,TouhouPlayer,TouhouPlayerContext,TouhouDamageTarget} from './player.js';
import type {TouhouSpell} from './spell.js';
export interface TouhouEnemyDamageOptions{primaryFlags?:number;damageInvulnerability?:{readonly current:number}|null;}
import { mul, trunc32 } from './math.js';

/** gameplay/enemy_damage_helpers.cpp; spell HP retains the remainder across hits. */
export class TouhouHealth {
  hp:number;
  maximum:number;
  scaledHp:number;
  threshold:number;
  damageTotal:number;
  flags:number;

  constructor(hp: number = 1, { spell = false, threshold = 0 }: {spell?:boolean;threshold?:number} = {}) {
    this.hp = hp | 0; this.maximum = this.hp; this.scaledHp = Math.imul(this.hp, 7);
    this.threshold = threshold | 0; this.damageTotal = 0; this.flags = spell ? 1 : 0;
  }
  set(hp: number, spell: boolean = !!(this.flags & 1)): this { this.hp = hp | 0; this.maximum = this.hp; this.scaledHp = Math.imul(this.hp, 7); this.flags = (this.flags & ~1) | (spell ? 1 : 0); return this; }
  apply(amount: number): number {
    amount |= 0; this.damageTotal = (this.damageTotal + amount) | 0;
    if (!(this.flags & 1)) this.hp = (this.hp - amount) | 0;
    else { this.scaledHp = (this.scaledHp - amount) | 0; this.hp = (Math.trunc(((this.scaledHp - Math.imul(this.threshold, 7)) | 0) / 7) + this.threshold) | 0; }
    return this.hp;
  }
  record(amount: number): void { this.damageTotal = (this.damageTotal + (amount | 0)) | 0; }
}

/** gameplay/enemy_damage.cpp:110. Protected enemies still record incoming
 * damage; neither visible nor scaled spell HP changes. The owner advances the
 * ECL 515 timer after its damage pass (enemy_update.cpp), never per hit. */
export function applyTouhouEnemyDamage(health: TouhouHealth, amount: number, { primaryFlags = 0, damageInvulnerability = null }: TouhouEnemyDamageOptions = {}): number {
  if ((primaryFlags & 0x10) || (damageInvulnerability?.current ?? 0) > 0) health.record(amount);
  else health.apply(amount);
  return health.hp;
}

/** Common per-target arithmetic from damage_regions/damage.cpp and enemy_damage.cpp.
 * Geometry, damage-region lifetime and hit callbacks occur before add(); custom
 * regions must supply their original group/target rules at that boundary. */
interface DamageEntry {amount:number;sources:unknown[];groups:Map<number,number>;hitPosition?:{x:number;y:number;z:number}}
export class TouhouDamageAccumulator {
  declare destroy?:()=>void;
  pending:Map<TouhouDamageTarget,DamageEntry>;
  player: TouhouPlayer;
  spell: TouhouSpell | null;

  constructor({ player, spell = null }: {player:TouhouPlayer;spell?:TouhouSpell|null} = {} as {player:TouhouPlayer}) { this.player = player; this.spell = spell; this.pending = new Map(); }
  add(enemy: TouhouDamageTarget, amount: number, source: unknown | null = null): void {
    if (enemy.alive === false || enemy.invulnerable || ((enemy.primaryFlags ?? 0) & 0x21)) return;
    const descriptor=source as TouhouDamageSource|null;
    const entry:DamageEntry = this.pending.get(enemy) ?? { amount: 0, sources: [], groups: new Map() };
    const group = descriptor?.damageGroup ?? 0;
    if (group > 0 && group < 5) {
      const previous = entry.groups.get(group); if (previous !== undefined && amount < previous) return;
      if (previous !== undefined) entry.amount = (entry.amount - previous) | 0;
      entry.groups.set(group, amount | 0);
    }
    const position=descriptor?.hitPosition??descriptor?.damagePosition??descriptor;
    if(Number.isFinite(position?.x)&&Number.isFinite(position?.y))entry.hitPosition={x:position!.x!,y:position!.y!,z:position!.z??0};
    entry.amount = (entry.amount + (amount | 0)) | 0; entry.sources.push(source); this.pending.set(enemy, entry);
  }
  flush(context: TouhouPlayerContext&{spell?:TouhouSpell;playerDamageScale?:number;addScore?:(amount:number,source:unknown)=>void;applyEnemyDamage?:(enemy:TouhouDamageTarget,amount:number,source:unknown)=>void} = {}): Array<{enemy:TouhouDamageTarget;nominal:number;amount:number}> {
    const p = this.player, results = [];
    for (const [enemy, entry] of this.pending) {
      if (enemy.alive === false || enemy.invulnerable || ((enemy.primaryFlags ?? 0) & 0x21)) continue;
      if (p.timer && p.timer.current === p.timer.previous) continue;
      const profile = p.sht?.damageCaps?.[0];
      if (!profile) throw new Error('Damage accumulator requires current imported SHT damage caps');
      const total = Math.min(entry.amount, p.focused ? profile.focus : profile.normal) | 0;
      if (total !== 0) {
        const nominal = (Math.trunc(total / 10) + 10) | 0;
        if (context.addScore) context.addScore(nominal, { type: 'damage', enemy });
        else p.score = Math.min(999999999, (p.score ?? 0) + Math.trunc((nominal >>> 0) / 10));
      }
      let amount = trunc32(mul(total, context.playerDamageScale ?? 1));
      if (p.state === 0 || p.state === 2) amount = Math.trunc(amount / 5) | 0;
      if (context.bossSuppressed) amount = 0;
      if (p.bomb?.alive && (enemy.bombScale ?? 1) < 1) amount = trunc32(mul(amount, enemy.bombScale!));
      const hitDetected = amount !== 0;
      if (hitDetected) amount = (context.spell ?? this.spell)?.scaleDamage(amount) ?? amount;
      if (hitDetected) {
        const source = { type: 'damageBatch', sources: entry.sources, nominal: total, hitDetected, hitPosition:entry.hitPosition };
        if (context.applyEnemyDamage) context.applyEnemyDamage(enemy, amount, source);
        else enemy.damage?.(amount, source, context);
      }
      results.push({ enemy, nominal: total, amount });
    }
    this.pending.clear(); return results;
  }
  clear(): void { this.pending.clear(); }
}
