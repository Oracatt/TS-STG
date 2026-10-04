import { rushBossHealth } from './boss-health-profile.js';
// Source: TouhouRushBoss-main/src/BossSpellCardDeriver.h, SunnyMilk_SC_1..7.
// Positions and velocities retain the source's centered, Y-up coordinate system.
const PI = Math.PI;
const TAU = PI * 2;
const f32 = Math.fround;
const loc = (x, y) => ({ x, y });
const copy = p => ({ x: p.x, y: p.y });
const anchor = (ctx,p) => ctx.anchorPosition?.(p) ?? p;
const edge = (ctx,key,fallback) => ctx.bounds?.[key] ?? fallback;
const outside = (ctx,p,tolerance=10) => ctx.outside?.(p,tolerance) ?? (Math.abs(p.x)>320+tolerance||Math.abs(p.y)>240+tolerance);
const setVector = (b, v, prefix = 'v') => { b[`${prefix}x`] = v.x; b[`${prefix}y`] = v.y; };
const tick = ctx => ++ctx.state.tick;
function maple(ctx, blast = true) {
  ctx.effect('maple', ctx.boss, { color: [1, 1, 0.35, 0], storetimes: 1, blast, shakeScreen: false, follow: ctx.boss });
}
function start(ctx, position = loc(0, 100)) {
  ctx.state.tick = 0;
  ctx.state.moveStep = 0;
  ctx.state.type = 0;
  ctx.boss.checking = true;
  ctx.moveBoss(anchor(ctx,position));
}
function end(ctx, spell, final = false) {
  if (spell && !(final && ctx.portrait)) ctx.sound(final ? 'enep01' : 'enep02');
  ctx.boss.checking = false;
  if (ctx.cleanAuto) ctx.cleanAuto(final ? 'final' : spell ? 'spell' : 'nonspell', ctx.boss);
  else ctx.clear();
}
function stepMove(ctx, positions) {
  ctx.state.moveStep = (ctx.state.moveStep + 1) % positions.length;
  ctx.moveBoss(anchor(ctx,positions[ctx.state.moveStep]));
}
function phase(number, time, name, cardId = -1, bonus = 0, options = {}) {
  const hp = rushBossHealth('sunny', number);
  const spell = cardId >= 0;
  return { key: `SunnyMilk_SC_${number}`, boss: 'sunny', number, name, spell, cardId, hp, time, bonus, survival: false,
    lifeBar: spell ? { min: 0, max: .15, startFull: true, showTag: false } : { min: .15, max: 1, startFull: false, showTag: true },
    init: start, end: ctx => end(ctx, spell), ...options };
}

function spiralShooter(ctx, type) {
  const startrad = ctx.random(0, TAU);
  ctx.actor({ ...copy(ctx.boss), type, startrad, update(c, a) {
    c.ring('ZhenDan', 6 + 2 * c.difficulty, a, (.7 + .1 * c.difficulty) * (30 + 11 * a.frame),
      (a.startrad + a.frame / 9) * (a.type === 0 ? 1 : -1), 20, 13);
    c.sound('tan00');
    if (a.frame === 18 + 2 * c.difficulty) a.kill();
  }});
}

const sunny1 = phase(1, 40, '非符一', -1, 0, {
  update(ctx) {
    const f = tick(ctx);
    if (f === 1 && ctx.state.moveStep === 0) maple(ctx);
    if (f === 75) { spiralShooter(ctx, ctx.state.type); ctx.state.type = (ctx.state.type + 1) % 2; }
    if (f === 120) stepMove(ctx, [loc(0,100),loc(-24,92),loc(-8,110),loc(28,115),loc(44,98),loc(10,88),loc(-16,114)]);
    if (f === 140 + (ctx.state.moveStep === 0 ? 30 : 0)) ctx.state.tick = 0;
  }
});

function reboundOnce(c, b) {
  if (b.bounced) return;
  // The original uses four separate conditions, allowing a corner to reflect both axes.
  if (b.x < edge(c,'minX',-320)) { b.vx = Math.abs(b.vx); b.color = 3; b.bounced = true; }
  if (b.x > edge(c,'maxX',320)) { b.vx = -Math.abs(b.vx); b.color = 3; b.bounced = true; }
  if (b.y < edge(c,'minY',-240)) { b.vy = Math.abs(b.vy); b.color = 3; b.bounced = true; }
  if (b.y > edge(c,'maxY',240)) { b.vy = -Math.abs(b.vy); b.color = 3; b.bounced = true; }
}
const sunny2 = phase(2, 40, '火符「火精灵跃动」', 1, 2500000, {
  update(ctx) {
    const f = tick(ctx);
    if (f === 1) maple(ctx);
    if (f === 25) ctx.actor({ update(c, a) {
      if (a.frame % (65 - 5 * c.difficulty) !== 0) return;
      const angle = c.random(0, TAU);
      for (let i = 0; i < 7 + c.difficulty; i++) c.ring('ZhenDan', 8 + c.difficulty, c.boss, (.7 + .1 * c.difficulty) * 150, angle + .03 * i, 15, 13);
      c.ring('YanDan', 5 + 2 * c.difficulty, c.boss, (.7 + .1 * c.difficulty) * 100, c.random(0, TAU), 20, 0, { bounced: false, onUpdate: reboundOnce });
      c.sound('tan00');
    }});
    if (f === 200) stepMove(ctx, [loc(0,100),loc(112,110),loc(88,88),loc(-21,105),loc(-76,94),loc(-10,125)]);
    if (f === 250) ctx.state.tick = 50;
  }
});

const sunny3 = phase(3, 42, '非符二', -1, 0, {
  update(ctx) {
    const f = tick(ctx);
    if (f === 1 && ctx.state.moveStep === 0) maple(ctx);
    if (f === 75) {
      ctx.actor({ ...copy(ctx.boss), type: ctx.state.type, startrad: 0, update(c, a) {
        if (a.frame % 5 === 0 && a.frame <= 150) {
          c.ring('ZhenDan', 8 + 4 * c.difficulty, a, (.7 + .1 * c.difficulty) * 200, a.startrad * (a.type === 0 ? 1 : -1), 20, 13);
          c.sound('tan00'); a.startrad = f32(a.startrad + Math.min(f32(a.frame / 1000), f32(.15)));
        }
        if (a.frame > 160) {
          for (let i = 0; i < c.difficulty + 1; i++) c.spawn('YanDan', a, c.vec(c.random(0, TAU), (.7 + .1 * c.difficulty) * (350 - 5 * (a.frame - 160))), 0);
          c.sound('tan00');
        }
        if (a.frame === 190) a.kill();
      }});
      ctx.state.type = (ctx.state.type + 1) % 2;
    }
    if (f === 240) stepMove(ctx, [loc(0,100),loc(25,115),loc(-43,130)]);
    if (f === 260 + (ctx.state.moveStep === 0 ? 30 : 0)) ctx.state.tick = 0;
  }
});

function scatter(ctx, p, flameCount, pointCount, orbCount) {
  const scale = .8 + .2 * ctx.difficulty;
  for (let i = 0; i < flameCount; i++) ctx.spawn('YanDan', p, ctx.vec(ctx.random(0, TAU), scale * ctx.random(120, 150)), 0);
  for (let i = 0; i < pointCount; i++) ctx.spawn('DianDan', p, ctx.vec(ctx.random(0, TAU), scale * ctx.random(150, 185)), 0);
  for (let i = 0; i < orbCount; i++) ctx.spawn('DaYu', p, ctx.vec(ctx.random(0, TAU), scale * ctx.random(80, 120)), 0);
}
const sunny4 = phase(4, 41, '日符「阳炎三角」', 2, 3200000, {
  position: loc(0,120),
  init(ctx) { start(ctx, loc(0,120)); ctx.state.position = 0; },
  update(ctx) {
    let f = tick(ctx);
    if (f === 1) { maple(ctx); ctx.boss.animationIndex = 0; }
    if (f >= 100 && f < 1000) {
      if (!ctx.boss.moving) {
        ctx.state.position++;
        if (ctx.state.position === 1) ctx.moveBoss(anchor(ctx,loc(100,-20)), 120, 120);
        if (ctx.state.position === 2) ctx.moveBoss(anchor(ctx,loc(-100,-20)), 120, 120);
        if (ctx.state.position === 3) ctx.moveBoss(anchor(ctx,loc(0,120)), 120, 120);
        if (ctx.state.position === 4) f = ctx.state.tick = 1000;
      }
      if (f !== 1000) {
        if (f % 20 === 0) scatter(ctx, ctx.boss, 4 + 2 * ctx.difficulty, 4 + 2 * ctx.difficulty, 2 + ctx.difficulty);
        if (f % 10 === 0) {
          ctx.spawn('GuangYuL', ctx.boss, loc(0,0), 1, { drag: 1, cleanOnHit: false, localFrame: -360 + f,
            onUpdate(c, b) {
              if (++b.localFrame >= 60) { scatter(c, b, 2 + c.difficulty, 0, 1 + Math.floor(c.difficulty / 2)); c.sound('tan00'); b.kill(); }
            } });
          ctx.sound('tan00');
        }
      }
    }
    if (f === 1060) ctx.boss.animationIndex = 5;
    if (f === 1250) { ctx.state.position = 0; ctx.state.tick = 0; }
  }
});

function curvedNeedle(c, b) {
  const scale = .7 + .1 * c.difficulty;
  if (b.frame === 60) { b.drag = 1; setVector(b, c.vec(b.angle + (b.type === 0 ? PI / 2 : -PI / 2), scale * 200)); }
  if (b.frame >= 60) setVector(b, c.vec(b.angle + (b.type === 0 ? PI / 2 + b.dangle : -PI / 2 - b.dangle), scale * 300), 'f');
}
const sunny5 = phase(5, 40, '非符三', -1, 0, {
  update(ctx) {
    const f = tick(ctx);
    if (f === 1 && ctx.state.moveStep === 0) maple(ctx);
    if (f === 75) ctx.actor({ update(c, a) {
      a.x = c.boss.x; a.y = c.boss.y;
      const d = c.difficulty;
      if (a.frame % 144 === 0) {
        const dnum = 12 + 2 * d, cnum = [2,3,4,4][d], step = PI * 4 / 3 / (dnum - 1);
        for (let i = 0; i < dnum; i++) {
          const angle = f32(-PI / 6 + f32(step) * i);
          for (let j = 0; j < cnum; j++) {
            const velocity = c.vec(angle, Math.sqrt(12000 + 12000 * j));
            for (let type = 0; type < 2; type++) c.spawn('ZhenDan', c.boss, velocity, 13, { angle, dangle: f32(PI / 6 * (j + 1)), type, fx: -velocity.x, fy: -velocity.y, onUpdate: curvedNeedle });
          }
        }
        c.sound('kira00');
      }
      if (a.frame % 24 === 0) {
        const angle = c.random(0, TAU);
        for (const turn of [PI / 6, -PI / 6]) c.ring('YanDan', 6 + 2 * d, c.boss, (.7 + .1 * d) * 180, angle, 20, 0, { drag: .5,
          setup(c2, b) { setVector(b, c2.vec(Math.atan2(b.vy,b.vx) + turn, (.7 + .1 * c2.difficulty) * 200), 'f'); } });
        c.sound('tan00');
      }
    }});
    if (f === 120) stepMove(ctx, [loc(0,100),loc(24,110),loc(15,92)]);
    if (f === 300) ctx.state.tick = 100;
  }
});

function boundaryFlameShooter(ctx, p, angle) {
  ctx.actor({ ...copy(p), angle, played: false, update(c, a) {
    const count = 16 + 8 * c.difficulty;
    if (a.frame < count) {
      const force = c.vec(a.angle, -50);
      c.spawn('YanDan', a, c.vec(a.angle + c.random(-.1,.1), (190 + 20 * c.difficulty) * a.frame / count), 3, { fx: force.x, fy: force.y, drag: .2 });
      if (!a.played) { a.played = true; c.sound('lazer01'); }
    } else a.kill();
  }});
}
const sunny6 = phase(6, 46, '光符「极光冲击」', 3, 3500000, {
  update(ctx) {
    const f = tick(ctx);
    if (f === 1) maple(ctx);
    if (f === 75) {
      const angle = ctx.angle(ctx.boss, ctx.player), count = 7 + ctx.difficulty;
      for (let i = 0; i < count; i++) {
        const a = angle + TAU * i / count, offset = ctx.vec(a, 10), force = ctx.vec(a, 100);
        ctx.laser(loc(ctx.boss.x + offset.x,ctx.boss.y + offset.y), a, 13, { curve: 60, speed: 50, width: 10, fx: force.x, fy: force.y, delay: 15, cleanOnOutOfRange: true });
      }
      ctx.ring('FangDan', count, ctx.boss, 50, angle, 10, 6, { cleanOnHit: false, cleanOnBomb: false,
        setup(c,b) { setVector(b, c.vec(Math.atan2(b.vy,b.vx),100), 'f'); },
        onUpdate(c,b) {
          let direction;
          if (b.x < edge(c,'minX',-320)) direction = 0;
          else if (b.x > edge(c,'maxX',320)) direction = PI;
          else if (b.y < edge(c,'minY',-240)) direction = PI / 2;
          else if (b.y > edge(c,'maxY',240)) direction = PI * 3 / 2;
          if (direction !== undefined) { boundaryFlameShooter(c,b,direction); b.kill(); }
        } });
      ctx.sound('lazer00');
    }
    if (f === 200) ctx.state.tick = 0;
  }
});

function fireWall(ctx, p, angle, type) {
  ctx.actor({ ...copy(p), angle, type, update(c,a) {
    if (a.frame === 1) {
      const force = c.vec(a.angle,-300);
      for (let i = 0; i < 20; i++) c.spawn('YanDan', a, c.vec(a.angle + c.random(-.05,.05),(400 + 20 * c.difficulty) * i / 20), 0, { fx: force.x, fy: force.y, drag: .2 });
    }
    if (a.frame === 3) {
      const offset = c.vec(a.angle + PI / 2 * (a.type === 0 ? 1 : -1),20), target = loc(a.x + offset.x,a.y + offset.y);
      if (!outside(c,target)) fireWall(c,target,a.angle,a.type);
      a.kill();
    }
  }});
}
const sunny7 = phase(7, 60, '地炎「无端之火」', 4, 4000000, {
  final: true, finalSpell: true, deathDelay: 60, lifeBar: { min: 0, max: 1, startFull: false, showTag: false }, end: ctx => end(ctx,true,true),
  update(ctx) {
    const f = tick(ctx);
    if (f === 1) maple(ctx);
    if (f === 75) {
      ctx.actor({ update(c,a) {
        a.x = c.boss.x; a.y = c.boss.y;
        if (a.frame % 5 === 0) {
          const step = PI * 4 / 3 / 23;
          for (let i = 0; i < 24; i++) c.spawn('ZhenDan', c.boss, c.vec(f32(step) * i - PI / 6 + (.25 + .05 * c.difficulty) * Math.sin(f32(a.frame / 20)),150),13);
          c.sound('tan00');
        }
      }});
      ctx.actor({ update(c,a) {
        a.x = c.boss.x; a.y = c.boss.y;
        if (a.frame % 60 === 0) { c.ring('DaYu',6 + 3 * c.difficulty,c.boss,100,c.random(0,TAU),10,0); c.sound('kira00'); }
      }});
    }
    if (f === 200) {
      ctx.boss.animationIndex = 5;
      ctx.laser(ctx.boss, -PI / 2, 1, { width: 2, length: 1000, checking: false, delay: 0, fogSize: 50, fogFrames: 120,
        onUpdate(c,b) {
          if (b.frame === 40) { fireWall(c,loc(b.x-10,edge(c,'minY',-240)),PI/2,0); fireWall(c,loc(b.x+10,edge(c,'minY',-240)),PI/2,1); }
          if (b.frame > 40 && b.frame <= 60) b.width += 1.5;
          if (b.frame === 60) b.checking = true;
          if (b.frame === 120) b.checking = false;
          if (b.frame > 120) b.width -= 1.5;
          if (b.frame === 140) b.kill();
        } });
      ctx.sound('lazer00');
    }
    if (f === 400) stepMove(ctx,[loc(0,100),loc(-44,100),loc(-20,100),loc(26,100),loc(61,100),loc(16,100)]);
    if (f === 500) ctx.state.tick = 150;
  }
});

export const sunnyPhases = [sunny1,sunny2,sunny3,sunny4,sunny5,sunny6,sunny7];
