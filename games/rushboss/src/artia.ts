import type {Point,RushPhase,RushEntityOptions} from './types.js';
import type {RushBattle,RushEntity} from './runtime.js';
import { rushBossHealth } from './boss-health-profile.js';
// Artia's complete 13-phase sequence (TouhouRushBoss derivative, GPL-3.0).
// The source of each timeline and custom
// projectile is src/BossSpellCardDeriver.h in TouhouRushBoss-main.
// Positions use the original 640 x 480, positive-Y-up coordinate system;
// velocity/force retain original per-second units. BulletFog delays are 15 frames.
const PI = Math.PI;
const TAU = PI * 2;
const HALF_PI = PI / 2;
const F = Math.fround;
const anchor = (ctx: RushBattle,p: Point) => ctx.anchorPosition?.(p) ?? p;
const edge = (ctx: RushBattle,key: keyof RushBattle['bounds'],fallback: number) => ctx.bounds?.[key] ?? fallback;
const point = (p: Point) => ({ x: p.x, y: p.y });
const plus = (p: Point, v: Point) => ({ x: p.x + v.x, y: p.y + v.y });
const velocityAngle = (b: RushEntity) => Math.atan2(b.vy, b.vx);
function force(ctx: RushBattle, b: RushEntity, angle: number, magnitude: number) {
  const v = ctx.vec(angle, magnitude);
  b.fx = v.x;
  b.fy = v.y;
}
function velocity(ctx: RushBattle, b: RushEntity, angle: number, magnitude: number) {
  const v = ctx.vec(angle, magnitude);
  b.vx = v.x;
  b.vy = v.y;
}
function around(ctx: RushBattle, kind: string, count: number, pos: Point, speed: number, angle = 0, offset = 0, color = 0, configure: ((angle:number,index:number)=>RushEntityOptions)|null = null) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = F(angle + i * TAU / count);
    const opts = configure ? configure(a, i) : {};
    out.push(ctx.spawn(kind, plus(pos, ctx.vec(a, offset)), ctx.vec(a, speed),
      (opts.color ?? color) as number, { delay: 15, ...opts }));
  }
  return out;
}
function aimed(ctx: RushBattle, kind: string, count: number, pos: Point, speed: number, angle: number, delta = 0, offset = 0, color = 0, configure: ((angle:number,index:number)=>RushEntityOptions)|null = null) {
  for (let i = 0; i < count; i++) {
    const a = F(angle - (count - 1) * delta / 2 + delta * i);
    const opts = configure ? configure(a, i) : {};
    ctx.spawn(kind, plus(pos, ctx.vec(a, offset)), ctx.vec(a, speed),
      (opts.color ?? color) as number, { delay: 15, ...opts });
  }
}
function shooter(ctx: RushBattle, pos: Point, update: import('./types.js').RushEntityCallback, options: RushEntityOptions = {}) {
  return ctx.actor({ ...point(pos), cleanOnHit: false, cleanOnBomb: false,
    cleanOnOutOfRange: true, ...options, update });
}
function maple(ctx: RushBattle, count = 1, shake = false) {
  ctx.effect('maple', point(ctx.boss), { color: [0.75, 0.5, 1, 0], storetimes: count, blast: true, shakeScreen: shake });
}
function move(ctx: RushBattle, x: number, y: number) { ctx.moveBoss(anchor(ctx,{ x, y })); }
function moveStep(ctx: RushBattle, positions: [number,number][]) {
  ctx.state.moveStep = (ctx.state.moveStep + 1) % positions.length;
  const [x, y] = positions[ctx.state.moveStep];
  move(ctx, x, y);
}
function pulseLaser(ctx: RushBattle, pos: Point, angle: number, color: number, spec: Omit<typeof PULSE,'end'>&{end?:number}, extra: RushEntityOptions = {}) {
  const { expandStart, expandEnd, grow, checkingStart, checkingEnd, shrink, end } = spec;
  return ctx.laser(point(pos), angle, color, {
    delay: 0, width: 2, length: 1000, checking: false,
    cleanOnHit: false, cleanOnBomb: false, cleanOnOutOfRange: false,
    fog: { scale: 50, frames: checkingEnd },
    ...extra,
    onUpdate(c: RushBattle, b: RushEntity) {
      const f = b.frame;
      if (f > expandStart && f <= expandEnd) b.width = F(b.width + grow);
      if (f === checkingStart) b.checking = true;
      if (f === checkingEnd) b.checking = false;
      if (f > checkingEnd) b.width = F(b.width - shrink);
      if (end ? f === end : (f > 70 && b.width <= 2.1)) b.kill();
    },
  });
}
const PULSE = { expandStart: 60, expandEnd: 80, grow: 1.5, checkingStart: 80, checkingEnd: 140, shrink: 1.5, end: 160 };
function curved(ctx: RushBattle, pos: Point, angle: number, speed: number, color: number, options: RushEntityOptions = {}) {
  const v = ctx.vec(angle, speed);
  return ctx.laser(point(pos), angle, color, {
    curve: true, segments: 90, animFrames: 10, width: 6,
    vx: v.x, vy: v.y, delay: 15, cleanOnHit: false, cleanOnBomb: false,
    ...options,
  });
}
function curvedRing(ctx: RushBattle, pos: Point, count: number, type: number, color: number, turnForce:number) {
  for (let i = 0; i < count; i++) {
    curved(ctx, plus(pos, ctx.vec(F(i * TAU / count), 10)), F(i * TAU / count), 300, color, {
      drag: 0.2,
      onUpdate(c: RushBattle, b: RushEntity) {
        if (b.frame < 60) force(c, b, velocityAngle(b) + (type === 0 ? HALF_PI : -HALF_PI), turnForce);
      },
    });
  }
}
function makePhase(number: number, time: number, bonus:number, cardId:number, name: string, think:(ctx:RushBattle,frame:number)=>void, setup:((ctx:RushBattle)=>void)|null = null, cleanup:((ctx:RushBattle)=>void)|null = null, survival = false): RushPhase {
  const hp = rushBossHealth('artia', number);
  const spell = cardId !== -1;
  return {
    key: `artia_${number}`, sourceClass: `Artia_SC_${number}`, boss: 'artia', number,
    name: name || `Artia 非符 ${Math.ceil(number / 2)}`,
    spell, cardId, hp, time, bonus, survival,
    lifeBar: spell ? { min: 0, max: 0.15, full: true, tag: false } : { min: 0.15, max: 1, full: false, tag: true },
    init(ctx: RushBattle) {
      ctx.state.clock = 0;
      ctx.state.moveStep = 0;
      move(ctx, 0, 100);
      ctx.boss.checking = true;
      if (setup) setup(ctx);
    },
    update(ctx: RushBattle) {
      ctx.state.clock++;
      think(ctx, ctx.state.clock);
    },
    end(ctx: RushBattle) {
      if (cleanup) cleanup(ctx);
      ctx.boss.checking = false;
      if (spell && !(survival && ctx.portrait)) ctx.sound(survival ? 'enep01' : 'enep02');
      if (ctx.cleanAuto) ctx.cleanAuto(number === 13 ? 'final' : spell ? 'spell' : 'nonspell', ctx.boss);
      else ctx.clear();
    },
  };
}

const phase1 = makePhase(1, 40, 0, -1, '', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 40) move(ctx, 0, 100);
  if (f === 240) move(ctx, 185, 110);
  if (f === 440) move(ctx, -50, 80);
  if (f === 640) move(ctx, -200, 140);
  if (f % 200 === 100 || f % 200 === 180) {
    const type = f % 200 === 100 ? 0 : 1;
    for (let i = 0; i < 3; i++) {
      const pos = plus(ctx.boss, ctx.vec((type === 0 ? HALF_PI : HALF_PI * 3) + i * TAU / 3, 75));
      shooter(ctx, pos, (c: RushBattle, a: RushEntity) => {
        if (a.frame % 3 === 0) {
          around(c, 'ZhaDan', 3 + d, a, 100 + 5 * d,
            F(a.frame / (12 + 2 * d) * (type === 0 ? 1 : -1)), 60 - a.frame, type === 0 ? 5 : 8);
          c.sound('tan00');
        }
        if (a.frame === 50) a.kill();
      });
    }
  }
  if (f === 800) ctx.state.clock = 0;
}, (ctx: RushBattle) => maple(ctx));

function iceFence(ctx: RushBattle, type: number) {
  const d = ctx.difficulty;
  shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
    if (a.frame <= 60) {
      const rows = 5 + Math.trunc(d / 2);
      for (let i = 0; i < rows; i++) {
        const sign = type === 0 ? 1 : -1;
        const angle = type === 0 ? -PI / 4 : -PI * 3 / 4;
        // Rebase the 45-degree fence to the field edges. Equal X/Y sweep
        // distances preserve the diagonals instead of squeezing a wide image.
        const width=edge(c,'maxX',320)-edge(c,'minX',-320),height=edge(c,'maxY',240)-edge(c,'minY',-240);
        const position=c.profile==='portrait'?{
          x:sign*(edge(c,'minX',-320)-height-10+a.frame*(height+20)/60+(i+1)*(width+height)/(rows+1)),
          y:edge(c,'maxY',240)+10-a.frame*(height+20)/60,
        }:{x:sign*(-810+a.frame*500/60+(i+1)*1120/(rows+1)),y:250-a.frame*500/60};
        c.spawn('ZhenDan', position, { x: 0.0001 * sign, y: -0.0001 }, 5, {
          delay: 15, cleanOnHit: false, cleanOnBomb: false,
          onUpdate(cc, b: RushEntity) {
            if (b.frame === 300) {
              b.drag = 0.2;
              force(cc, b, angle + cc.random(-0.18 - 0.01 * d, 0.18 + 0.01 * d),
                50 * (cc.randomInt(0, 1) === 1 ? 1 : -1));
            }
          },
        });
      }
      c.sound('tan00');
    }
    if (a.frame === 60) a.kill();
  }, { cleanOnOutOfRange: false });
}
const phase2 = makePhase(2, 48, 4000000, 10, '冰符「冰魔法封印」', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 1) maple(ctx);
  if (f === 100) {
    for (let i = 0; i < 8 + 2 * d; i++) {
      around(ctx, 'ZhenDan', 12 + 4 * d, ctx.boss, Math.sqrt(4000 + 4000 * i),
        F(TAU / (12 + 4 * d) / 3.5 * i), 10, 8, (angle: number) => {
          const normal = ctx.vec(angle, 1);
          return {
            fx: normal.x * -150, fy: normal.y * -150,
            rotation: angle - HALF_PI, autoRotateMode: 0,
            onUpdate(c: RushBattle, b: RushEntity) {
              if (b.frame === 90) { b.fx = normal.x * 75; b.fy = normal.y * 75; }
              else if (Math.hypot(b.vx, b.vy) < 2 && b.frame < 90) {
                b.vx = b.vy = b.fx = b.fy = 0;
              }
            },
          };
        });
    }
    ctx.sound('tan00');
  }
  if (f === 190) { iceFence(ctx, 0); iceFence(ctx, 1); }
  if (f === 330 || f === 350 || f === 370) {
    const pos = plus(ctx.boss, f === 330 ? { x: -50, y: 0 } : f === 350 ? { x: 0, y: -50 } : { x: 50, y: 0 });
    for (let i = 0; i < 4 + d; i++) {
      const speed = f === 330 ? Math.sqrt((2500 + 500 * d) * (1 + i)) : Math.sqrt(6000 + 6000 * i);
      around(ctx, 'ZhaDan', 16 + 8 * d, pos, speed, 0, 10, 5, (angle: number) => ({
        ...(() => { const v = ctx.vec(angle, -135 + 5 * d); return { fx: v.x, fy: v.y }; })(),
        outOfRangeTolerance: 80, rotation: angle - HALF_PI,
      }));
    }
    ctx.sound('tan01');
  }
  if (f === 490) moveStep(ctx, [[0, 100], [-50, 75], [88, 89], [64, 127]]);
  if (f === 800) ctx.state.clock = 0;
});

function artia3Sword(ctx: RushBattle, angle: number, type: number, location: Point) {
  const d = ctx.difficulty;
  const n = 3 + Math.trunc(d / 2);
  const pos = point(location);
  shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
    aimed(c, 'ZhenDan', 3, pos, 240 - 2 * a.frame,
      angle + (a.frame / (n * 2) - 0.5) * (0.28 * n / 7) * (type === 0 ? 1 : -1), 0.28, 0, 4);
    if (a.frame === n * 2) a.kill();
  });
}
const phase3 = makePhase(3, 40, 0, -1, '', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 70) {
    for (let type = 0; type < 2; type++) shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
      a.x = c.boss.x; a.y = c.boss.y;
      if (a.frame % 5 === 0) {
        around(c, 'ZhaDan', 3 + d, a, (120 + 5 * d) * (type === 0 ? 0.85 : 1.15),
          a.frame / 18 * (type === 0 ? 1 : -1), 25, type === 0 ? 5 : 8);
        c.sound('tan00');
      }
    });
  }
  if (f === 500) move(ctx, 120, 90);
  if (f === 1000) move(ctx, 50, 120);
  if (f === 1500) move(ctx, -90, 80);
  if (f === 2000) move(ctx, -30, 135);
  if (f % 250 === 0) {
    shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
      if (a.frame === 25 || a.frame === 50 || a.frame === 75 || a.frame === 100) {
        const angle = c.angle(c.boss, c.player);
        const type = a.frame === 25 || a.frame === 75 ? 0 : 1;
        for (let i = 0; i < 6; i++) artia3Sword(c, F(angle + i * TAU / 6), type, c.boss);
        c.sound('slash');
      }
      if (a.frame === 75 + 25 * Math.trunc(d / 2)) a.kill();
    });
  }
}, (ctx: RushBattle) => maple(ctx));

function artia4RainShooter(ctx: RushBattle) {
  const d = ctx.difficulty;
  const startAngle = ctx.random(0, TAU);
  let x = edge(ctx,'maxX',320)-16;
  const spawnLight = (c: RushBattle, bx:number) => c.spawn('GuangYuL', { x: bx, y: edge(c,'maxY',240) }, { x: 0, y: -300 }, 3, {
    delay: 15, cleanOnHit: false,
    onUpdate(cc, b: RushEntity) {
      if (b.frame % (5 - Math.trunc(d / 2)) === 0) {
        const angle = b.frame / 5 + startAngle;
        cc.spawn('HuanYu', point(b), { x: 0, y: 0 }, 5, {
          delay: 15, drag: 1,
          onUpdate(c3, ring) { if (ring.frame === 60) force(c3, ring, angle, 60 + 5 * d); },
        });
        cc.sound('tan00');
      }
    },
  });
  shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
    if (a.frame % 10 === 0) {
      spawnLight(c, x);
      if (Math.abs(x) > 0.1) { spawnLight(c, -x); x = F(x - (2*edge(c,'maxX',320)-32) / (5 + d)); }
    }
    if (a.frame === [30, 40, 40, 50][d]) a.kill();
  });
}
const phase4 = makePhase(4, 36, 3400000, 11, '冻符「冰土下的千年枯骨」', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 1) maple(ctx);
  if (f === 75) artia4RainShooter(ctx);
  const spawnFalling = (kind: string, forceMin:number, forceMax:number, speed: number, color: number) => {
    const pos = { x: ctx.random(edge(ctx,'minX',-320)+10,edge(ctx,'maxX',320)-10), y: edge(ctx,'maxY',240)+5 };
    const a = -HALF_PI + ctx.random(-0.3, 0.3);
    const v = ctx.vec(a, ctx.random(forceMin, forceMax) + 5 * d);
    ctx.spawn(kind, pos, ctx.vec(a, speed + 5 * d), color, { delay: 15, fx: v.x, fy: v.y, drag: 0.05 });
  };
  if (f >= 270 && f <= 330 && f % (3 - Math.trunc(d / 2)) === 0) {
    spawnFalling('ZhongYu', 30, 50, 120, 3); ctx.sound('tan01');
  }
  if (f >= 300 && f <= 330 && f % (6 - 2 * Math.trunc(d / 2)) === 0) spawnFalling('DaYu', 20, 40, 110, 1);
  if (f === 480) ctx.state.clock = 0;
});

const phase5 = makePhase(5, 45, 0, -1, '', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 1) maple(ctx);
  if ([80, 300, 520, 740].includes(f)) {
    let offset = 80;
    shooter(ctx, ctx.boss, (c: RushBattle, a: RushEntity) => {
      if (a.frame % 6 === 0) {
        around(c, 'ZhaDan', 12 + 4 * d, a, 120, a.frame * 0.05 * TAU / (12 + 4 * d), offset, 5);
        c.sound('tan00'); offset -= 10;
        if (offset === -90) a.kill();
      }
    });
  }
  if ([200, 420, 640, 860].includes(f)) {
    moveStep(ctx, [[0, 100], [-135, 79], [22, 88], [100, 111]]);
    shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
      if (a.frame % 10 === 0) {
        around(c, 'ZhenDan', 18 + 6 * d, c.boss, 190 - a.frame, 0, 10, 4);
        c.sound('tan00');
      }
      if (a.frame === 60) a.kill();
    });
  }
  if (f === 990) ctx.state.clock = 0;
});

function artia6StarShooter(ctx: RushBattle, type: number) {
  const d = ctx.difficulty;
  shooter(ctx, ctx.boss, (c: RushBattle, a: RushEntity) => {
    if (a.frame % (3 - Math.trunc(d / 2)) === 0) {
      const angle = a.frame / 5 * (type === 0 ? 1 : -1);
      c.spawn('XingDanL', point(a), c.vec(angle, 200), type === 0 ? 6 : 5, {
        delay: 15, drag: 1,
        onUpdate(cc, b: RushEntity) {
          const sign = type === 0 ? 1 : -1;
          if (b.frame === 30) force(cc, b, angle + sign * PI / 3, 220);
          if (b.frame > 60 && b.frame < 120) force(cc, b, velocityAngle(b) + sign * PI / 3, 220);
          if (b.frame === 120) { b.fx = b.fy = b.drag = 0; }
        },
      });
      c.sound('tan00');
    }
    if (a.frame === 120) a.kill();
  });
}
const phase6 = makePhase(6, 39, 4300000, 12, '流光「流影寒星」', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 1) maple(ctx);
  if (f === 75 || f === 275) artia6StarShooter(ctx, 0);
  if (f === 135 || f === 335) artia6StarShooter(ctx, 1);
  if (f === 150 || f === 380) {
    curvedRing(ctx, ctx.boss, 12 + 4 * d, 0, 6, 150);
    curvedRing(ctx, ctx.boss, 12 + 4 * d, 1, 4, 150);
    ctx.sound('lazer00');
  }
  if (f === 230) {
    pulseLaser(ctx, ctx.boss, ctx.angle(ctx.boss, ctx.player), 4, PULSE);
    ctx.sound('lazer01');
  }
  if (f === 210 || f === 230 || f === 250) {
    around(ctx, 'XingDanS', 24 + 8 * d, ctx.boss, 100 + d * 10, 0, 10, 0,
      () => ({ color: ctx.randomInt(0, 15) }));
    ctx.sound('tan01');
  }
  if (f === 450) moveStep(ctx, [[0, 100], [35, 120]]);
  if (f === 600) ctx.state.clock = 0;
});

const phase7 = makePhase(7, 53, 0, -1, '', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 1) maple(ctx);
  if (f === 75) {
    for (let i = 0; i < 3; i++) {
      const offset = ctx.vec(HALF_PI + i * TAU / 3, 75);
      shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
        a.x = c.boss.x + offset.x; a.y = c.boss.y + offset.y;
        if (a.frame % 5 === 0) {
          around(c, 'ZhaDan', 3 + d, a, 100 + 5 * d, a.frame / (12 + 2 * d), 30, 5);
          c.sound('tan00');
        }
      });
    }
  }
  if (f === 300) {
    moveStep(ctx, [[0, 100], [-24, 143], [35, 129], [101, 85], [44, 78], [-53, 105], [-94, 113]]);
    ctx.state.clock = 100;
  }
});

function artiaMirror(ctx: RushBattle, angle: number, subAngle:number) {
  const d = ctx.difficulty;
  const lights: RushEntity[] = [];
  const beams: RushEntity[] = [];
  const center = point(ctx.boss);
  let radius = 0, distance = 0;
  // Mirror is attached before its children in the source. Its movement must run
  // before the child GuangYuL trail samples and the six laser checks.
  const mirror = shooter(ctx, center, (c: RushBattle, a: RushEntity) => {
    subAngle = F(subAngle + 0.05); angle = F(angle - 0.05);
    if (a.frame <= 120) { radius = F(radius + 0.5); distance = F(distance + 1); }
    const loc = plus(c.boss, c.vec(angle, distance));
    a.x = loc.x; a.y = loc.y;
    for (let i = 0; i < 3; i++) {
      const p = plus(loc, c.vec(subAngle + i * TAU / 3, radius));
      lights[i].x = p.x; lights[i].y = p.y;
    }
    for (let i = 0; i < 6; i++) {
      const src = lights[Math.trunc(i / 2)];
      const dst = lights[(Math.trunc(i / 2) + (i % 2 === 0 ? 1 : 2)) % 3];
      const beam = beams[i];
      beam.x = src.x; beam.y = src.y;
      beam.length = Math.hypot(dst.x - src.x, dst.y - src.y);
      beam.width = F(1 + radius / 60 * 19);
      beam.angle = c.angle(src, dst);
    }
  }, { cleanOnOutOfRange: false });
  for (let i = 0; i < 3; i++) {
    let last = { x: 0, y: 0 };
    lights.push(ctx.spawn('GuangYuL', center, { x: 0, y: 0 }, 4, {
      delay: 0, cleanOnHit: false, cleanOnBomb: false, cleanOnOutOfRange: false,
      onUpdate(c: RushBattle, b: RushEntity) {
        if (b.frame > 90 && b.frame % (8 - d) === 0) {
          const dx = b.x - last.x, dy = b.y - last.y;
          const length = Math.hypot(dx, dy);
          const normal = length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
          c.spawn('XingDanS', point(b), { x: 0, y: 0 }, c.randomInt(0, 15), {
            delay: 15, drag: 1,
            onUpdate(cc, star) {
              if (star.frame === 30) { star.fx = normal.x * 180; star.fy = normal.y * 180; }
            },
          });
          c.sound('tan00');
        }
        last = point(b);
      },
    }));
  }
  for (let i = 0; i < 6; i++) {
    beams.push(ctx.laser(center, 0, 4, {
      delay: 0, width: 1, length: 0, checking: true,
      owner: mirror,
      cleanOnHit: false, cleanOnBomb: false, cleanOnOutOfRange: false,
    }));
  }
  return mirror;
}
function artia8RayShooter(ctx: RushBattle, angle: number, type: number) {
  const d = ctx.difficulty;
  let spawn = 0;
  shooter(ctx, ctx.boss, (c: RushBattle, a: RushEntity) => {
    if (a.frame === 1) {
      pulseLaser(c, a, angle, 4, PULSE); c.sound('lazer00');
    }
    if (type === 0 && a.frame > 80 && a.frame % 2 === 0) {
      spawn++;
      const pos = plus(a, c.vec(angle, (30 - 3 * d) * spawn));
      const v = c.vec(c.random(0, TAU), 50);
      c.spawn('YanDan', pos, { x: 0, y: 0 }, 1, { delay: 15, fx: v.x, fy: v.y, drag: 0.3 });
      if (c.outside?.(pos,10) ?? (Math.abs(pos.x)>330||Math.abs(pos.y)>250)) a.kill();
    }
    if (type === 1 && a.frame === 30) {
      for (let t = 0; t < 2; t++) curved(c, a, angle, 0, t === 0 ? 4 : 6, {
        width: 8,
        onUpdate(cc, b: RushEntity) { velocity(cc, b, angle + 0.36 * Math.cos(b.frame / 10) * (t === 0 ? 1 : -1), 350); },
      });
      a.kill();
    }
  });
}
const phase8 = makePhase(8, 44, 4500000, 13, '异光「异世界棱镜」', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 60) maple(ctx, 3);
  if (f === 135) for (let i = 0; i < 3; i++) artiaMirror(ctx, F(i * TAU / 3), F(i * TAU / 3));
  if (f === 210) for (let i = 0; i < 6 + 2 * d; i++) artia8RayShooter(ctx, F(TAU * i / (6 + 2 * d)), 0);
  if (f === 420 || f === 770) moveStep(ctx, [[0, 100], [-35, 105], [33, 88]]);
  if (f === 560) {
    const angle = ctx.angle(ctx.boss, ctx.player);
    for (let i = 0; i < 6 + 2 * d; i++) artia8RayShooter(ctx, F(angle + TAU * i / (6 + 2 * d)), 1);
  }
  if (f === 810) maple(ctx);
  if (f === 860) ctx.state.clock = 180;
});

const phase9 = makePhase(9, 48, 0, -1, '', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 1) maple(ctx);
  if (f === 75) shooter(ctx, ctx.boss, (c: RushBattle, a: RushEntity) => {
    if (a.frame % 6 === 0) {
      const angle = 0.27 * TAU * a.frame / 6 / (6 + 2 * d);
      for (let i = 3 + Math.trunc(d / 2); i >= 0; i--)
        around(c, 'ZhaDan', 6 + 2 * d, a, 210 + 10 * d, angle, 68 - 12 * i, 5);
      around(c, 'XiaoYu', 6 + 2 * d, a, 210 + 10 * d, angle, 80, 5);
      c.sound('tan00');
    }
  });
});

const phase10 = makePhase(10, 46, 4800000, 14, '刺骨「舞动的冰锥」', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 1) maple(ctx);
  if (f === 75) shooter(ctx, ctx.boss, (c: RushBattle, a: RushEntity) => {
    around(c, 'ZhenDan', [6, 7, 9, 9][d], a, 100 + 10 * d, 1.1 * Math.sin(a.frame / 12), 10, 6);
    c.sound('tan00');
  });
});

const phase11 = makePhase(11, 39, 0, -1, '', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 240) move(ctx, 0, 100);
  if (f === 540) move(ctx, 45, 104);
  if (f === 840) move(ctx, -81, 98);
  if (f === 1140) move(ctx, 102, 107);
  if (f === 75) {
    for (const x of [-50, 0, 50]) shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
      a.x = c.boss.x + x; a.y = c.boss.y - 50;
      if (a.frame % 5 === 0) {
        around(c, 'ZhaDan', 3 + d, a, 400, c.random(0, TAU), 20, 5, () => ({
          onUpdate(cc, b: RushEntity) { if (b.frame === 20 + d) velocity(cc, b, velocityAngle(b), 80); },
        }));
        c.sound('tan00');
      }
    });
  }
  if (f === 1400) ctx.state.clock = 200;
}, (ctx: RushBattle) => maple(ctx));

function freezingFogs(ctx: RushBattle, speed: number) {
  for (let i = 0; i < 12; i++) {
    const v = ctx.vec(i * TAU / 12, speed);
    let entered = false;
    const fog = shooter(ctx, ctx.boss, (c: RushBattle, a: RushEntity) => {
      if (a.frame <= 128) a.scale = F(256 * Math.pow(a.frame / 128, 0.3));
      const distance = Math.hypot(c.player.x - a.x, c.player.y - a.y);
      if (!entered && distance < a.scale / 2) {
        entered = true;
        c.player.moveSpeed /= 1.8; c.player.slowMoveSpeed /= 1.8;
      } else if (entered && distance > a.scale / 2) {
        entered = false;
        c.player.moveSpeed *= 1.8; c.player.slowMoveSpeed *= 1.8;
      }
      if (a.frame >= 300) a.alpha = F(a.alpha - 0.05);
      if (a.frame === 320) {
        if (entered) {
          entered = false;
          c.player.moveSpeed *= 1.8; c.player.slowMoveSpeed *= 1.8;
        }
        a.kill();
      }
    }, { vx: v.x, vy: v.y, visualKind: 'freezingFog', scale: 0, alpha: 1,
      cleanOnOutOfRange: false,
      onDestroy(c: RushBattle) {
        if (entered) {
          entered = false;
          c.player.moveSpeed *= 1.8; c.player.slowMoveSpeed *= 1.8;
        }
      } });
    ctx.state.fogs.push(fog);
  }
}
function artia12NeedleSpokes(ctx: RushBattle, type: number) {
  const d = ctx.difficulty;
  shooter(ctx, ctx.boss, (c: RushBattle, a: RushEntity) => {
    if (a.frame < 25) {
      const start = type === 0 ? 1 : -1;
      const angle = start * ((0.37 + 0.02 * d) * TAU * a.frame / 6 / (24 + 8 * d));
      around(c, 'ZhenDan', 24 + 8 * d, a, 0.01, angle, a.frame * 20, 6, direction => ({
        onSpawn(cc, b: RushEntity) { if (Math.hypot(b.x - cc.player.x, b.y - cc.player.y) < 20) b.kill(); },
        // Each bullet's private C++ frame starts at the shooter's frame.
        onUpdate: ((initialFrame) => (cc, b: RushEntity) => {
          if (b.frame + initialFrame === 35) force(cc, b, direction, 120 + 20 * d);
        })(a.frame),
      }));
      c.sound('tan00');
    } else a.kill();
  });
}
function artia12TwistRings(ctx: RushBattle) {
  const d = ctx.difficulty;
  for (let type = 0; type < 2; type++) around(ctx, 'ZhenDan', 24 + 8 * d, ctx.boss, 120,
    type === 0 ? 0 : PI / (24 + 8 * d), 10, 4, () => ({
      drag: 2,
      onUpdate(c: RushBattle, b: RushEntity) { if (b.frame === 60) force(c, b, velocityAngle(b) + (type === 0 ? 0.5 : -0.5), 450); },
    }));
  ctx.sound('tan00');
}
const phase12 = makePhase(12, 40, 5200000, 15, '极寒「亘古寒霜」', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 70) maple(ctx);
  if (f === 80 || f === 305) freezingFogs(ctx, 100);
  if (f === 100 || f === 335) freezingFogs(ctx, 92);
  if (f === 120) freezingFogs(ctx, 84);
  if (f === 155) artia12NeedleSpokes(ctx, 0);
  if (f === 305 || f === 330 || f === 355) artia12TwistRings(ctx);
  if (f === 390) artia12NeedleSpokes(ctx, 1);
  if (f === 500) { maple(ctx); freezingFogs(ctx, 75); }
  if (f === 575) shooter(ctx, ctx.boss, (c: RushBattle, a: RushEntity) => {
    if (a.frame % (6 - d) === 0) {
      around(c, 'HuanYu', 3, a, 125, a.frame / 12, 10, 6);
      around(c, 'HuanYu', 3, a, 110, a.frame / 12, 10, 6);
      c.sound('tan01');
    }
    if (a.frame === 120) a.kill();
  });
  if (f === 660) {
    for (const [x, y] of [[220, 160], [-220, 160], [140, 40], [-140, 40]]) {
      const angle = ctx.random(0, TAU);
      for (const speed of [120, 80]) around(ctx, 'ZhenDan', 12 + 4 * d, anchor(ctx,{ x, y }), speed, angle, 10, 6,
        direction => ({ drag: 1, onUpdate(c: RushBattle, b: RushEntity) { if (b.frame === 60) force(c, b, direction, 180); } }));
    }
    ctx.sound('tan00');
  }
  if (f === 800) ctx.state.clock = 0;
}, (ctx: RushBattle) => {
  ctx.state.originalMoveSpeed = ctx.player.moveSpeed;
  ctx.state.originalSlowMoveSpeed = ctx.player.slowMoveSpeed;
  ctx.state.fogs = [];
}, (ctx: RushBattle) => {
  for (const fog of ctx.state.fogs) fog.kill();
  ctx.player.moveSpeed = ctx.state.originalMoveSpeed;
  ctx.player.slowMoveSpeed = ctx.state.originalSlowMoveSpeed;
});

function artia13RotatingLaserShooter(ctx: RushBattle) {
  const d = ctx.difficulty;
  let angle = HALF_PI, nextShoot = 0;
  shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
    if (nextShoot <= 0) {
      const pos = c.vec(angle, 400);
      pulseLaser(c, pos, c.angle({ x: 0, y: 0 }, pos) + PI, 4, {
        expandStart: 20, expandEnd: 25, grow: 5, checkingStart: 25,
        checkingEnd: 70 + 10 * d, shrink: 5,
      });
      c.sound('lazer00');
      nextShoot = Math.max(60 - Math.trunc(a.frame / 4), 4);
      angle = F(angle - 0.1295);
    }
    nextShoot--;
    if (a.frame === 672) a.kill();
  });
}
function artia13GridShooter(ctx: RushBattle, horizontal: boolean) {
  const d = ctx.difficulty;
  shooter(ctx, { x: 0, y: 0 }, (c: RushBattle, a: RushEntity) => {
    if (a.frame % 60 === 1) {
      const count = 4 + d;
      for (let i = 0; i < count; i++) {
        const pos = horizontal
          ? { x: edge(c,'minX',-320)-80, y: edge(c,'minY',-240)+c.random(0,(edge(c,'maxY',240)-edge(c,'minY',-240))/count)+i*(edge(c,'maxY',240)-edge(c,'minY',-240))/count }
          : { x: edge(c,'minX',-320)+c.random(0,(edge(c,'maxX',320)-edge(c,'minX',-320))/count)+i*(edge(c,'maxX',320)-edge(c,'minX',-320))/count, y: edge(c,'maxY',240)+160 };
        pulseLaser(c, pos, horizontal ? 0 : -HALF_PI, 4, {
          expandStart: 30, expandEnd: 40, grow: 2, checkingStart: 40,
          checkingEnd: 90, shrink: 1, end: 110,
        }, { fog: { scale: 50, frames: 120 } });
      }
      c.sound('lazer00');
    }
    if (a.frame === 601) a.kill();
  });
}
function artia13FinalShooter(ctx: RushBattle) {
  const d = ctx.difficulty;
  let angle = 0, nextShoot = 12;
  shooter(ctx, ctx.boss, (c: RushBattle, a: RushEntity) => {
    if (nextShoot === 0) {
      around(c, 'XingDanS', 6 + 3 * d, a, 120 + Math.trunc(a.frame / 50), angle, 10, 0,
        () => ({ color: c.randomInt(0, 15) }));
      angle = F(angle + TAU / (6 + 3 * d) * 0.37);
      c.sound('tan00');
      nextShoot = 12 - Math.trunc(a.frame / 200);
    }
    nextShoot--;
    if (a.frame % 30 === 0) {
      const start = a.frame;
      shooter(c, a, (cc, child) => {
        around(cc, 'ZhenDan', 12, child, 180, start + child.frame * 0.02, 20 - 2 * child.frame, 4);
        if (child.frame === 5 + d) child.kill();
      });
    }
  });
}
const phase13 = makePhase(13, 60, 5000000, 16, '必杀「阿媂娅之怒」', (ctx: RushBattle, f) => {
  const d = ctx.difficulty;
  if (f === 75) { curvedRing(ctx, ctx.boss, 18 + 6 * d, 0, 6, 170); ctx.sound('lazer00'); }
  if (f === 150) {
    curvedRing(ctx, ctx.boss, 18 + 6 * d, 1, 4, 170);
    for (let i = 0; i < 12 + 4 * d; i++) {
      pulseLaser(ctx, ctx.boss, TAU * i / (12 + 4 * d), 2, {
        expandStart: 60, expandEnd: 80, grow: 1.2, checkingStart: 70,
        checkingEnd: 120, shrink: 1.2, end: 140,
      });
      ctx.sound('lazer01');
    }
  }
  if (f === 245 || f === 1140) maple(ctx);
  if (f === 320) artia13RotatingLaserShooter(ctx);
  if (f === 1215) { artia13GridShooter(ctx, false); artia13GridShooter(ctx, true); }
  if (f === 1860) maple(ctx, 3, true);
  if (f === 1965) artia13FinalShooter(ctx);
}, (ctx: RushBattle) => {
  ctx.boss.invulnerable = true;
  ctx.boss.checking = false;
  maple(ctx);
}, (ctx: RushBattle) => { ctx.boss.invulnerable = false; }, true);
phase13.finalSpell = true;
phase13.deathDelay = 60;

export const artiaPhases = [phase1, phase2, phase3, phase4, phase5, phase6, phase7,
  phase8, phase9, phase10, phase11, phase12, phase13];
