import { mul, trunc32 } from './math.js';

/** gameplay/enemy_damage_helpers.cpp; spell HP retains the remainder across hits. */
export class TouhouHealth {
  constructor(hp = 1, { spell = false, threshold = 0 } = {}) {
    this.hp = hp | 0; this.maximum = this.hp; this.scaledHp = Math.imul(this.hp, 7);
    this.threshold = threshold | 0; this.damageTotal = 0; this.flags = spell ? 1 : 0;
  }
  set(hp, spell = !!(this.flags & 1)) { this.hp = hp | 0; this.maximum = this.hp; this.scaledHp = Math.imul(this.hp, 7); this.flags = (this.flags & ~1) | (spell ? 1 : 0); return this; }
  apply(amount) {
    amount |= 0; this.damageTotal = (this.damageTotal + amount) | 0;
    if (!(this.flags & 1)) this.hp = (this.hp - amount) | 0;
    else { this.scaledHp = (this.scaledHp - amount) | 0; this.hp = (Math.trunc(((this.scaledHp - Math.imul(this.threshold, 7)) | 0) / 7) + this.threshold) | 0; }
    return this.hp;
  }
  record(amount) { this.damageTotal = (this.damageTotal + (amount | 0)) | 0; }
}

/** gameplay/enemy_damage.cpp:110. Protected enemies still record incoming
 * damage; neither visible nor scaled spell HP changes. The owner advances the
 * ECL 515 timer after its damage pass (enemy_update.cpp), never per hit. */
export function applyTouhouEnemyDamage(health, amount, { primaryFlags = 0, damageInvulnerability = null } = {}) {
  if ((primaryFlags & 0x10) || (damageInvulnerability?.current ?? 0) > 0) health.record(amount);
  else health.apply(amount);
  return health.hp;
}

/** Common per-target arithmetic from damage_regions/damage.cpp and enemy_damage.cpp.
 * Geometry, damage-region lifetime and hit callbacks occur before add(); custom
 * regions must supply their original group/target rules at that boundary. */
export class TouhouDamageAccumulator {
  constructor({ player, spell = null } = {}) { this.player = player; this.spell = spell; this.pending = new Map(); }
  add(enemy, amount, source = null) {
    if (enemy.alive === false || enemy.invulnerable || ((enemy.primaryFlags ?? 0) & 0x21)) return;
    const entry = this.pending.get(enemy) ?? { amount: 0, sources: [], groups: new Map() };
    const group = source?.damageGroup ?? 0;
    if (group > 0 && group < 5) {
      const previous = entry.groups.get(group); if (previous !== undefined && amount < previous) return;
      if (previous !== undefined) entry.amount = (entry.amount - previous) | 0;
      entry.groups.set(group, amount | 0);
    }
    const position=source?.hitPosition??source?.damagePosition??source;
    if(Number.isFinite(position?.x)&&Number.isFinite(position?.y))entry.hitPosition={x:position.x,y:position.y,z:position.z??0};
    entry.amount = (entry.amount + (amount | 0)) | 0; entry.sources.push(source); this.pending.set(enemy, entry);
  }
  flush(context = {}) {
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
      if (p.bomb?.alive && (enemy.bombScale ?? 1) < 1) amount = trunc32(mul(amount, enemy.bombScale));
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
  clear() { this.pending.clear(); }
}
