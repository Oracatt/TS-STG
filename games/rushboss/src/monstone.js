import { rushBossHealth } from './boss-health-profile.js';
// Direct port of BossSpellCardDeriver.h Monstone_SC_1..9.
const PI = Math.PI;
const TAU = PI * 2;
const f32 = Math.fround;
const loc = (x,y) => ({ x,y });
const copy = p => loc(p.x,p.y);
const tick = ctx => ++ctx.state.tick;
const anchor = (ctx,p) => ctx.anchorPosition?.(p) ?? p;
const edge = (ctx,key,fallback) => ctx.bounds?.[key] ?? fallback;
const outside = (ctx,p,tolerance=10) => ctx.outside?.(p,tolerance) ?? (Math.abs(p.x)>320+tolerance||Math.abs(p.y)>240+tolerance);
const vector = (b,v,prefix = 'v') => { b[`${prefix}x`] = v.x; b[`${prefix}y`] = v.y; };
const shadow = { shadowInterval: 2, shadowAlpha: .5 };
function maple(ctx,blast = true) {
  ctx.effect('maple',ctx.boss,{ color: [.25,.75,.75,0], storetimes: 1, blast, shakeScreen: false, follow: ctx.boss });
}
function start(ctx,charge = false) {
  ctx.state.tick = 0; ctx.state.moveStep = 0;
  ctx.boss.checking = true;
  ctx.moveBoss(anchor(ctx,loc(0,100)));
  if (charge) maple(ctx);
}
function end(ctx,spell,final = false) {
  if (spell && !(final && ctx.portrait)) ctx.sound(final ? 'enep01' : 'enep02');
  ctx.boss.checking = false;
  if (ctx.cleanAuto) ctx.cleanAuto(final ? 'final' : spell ? 'spell' : 'nonspell', ctx.boss);
  else ctx.clear();
}
function phase(number,time,name,cardId = -1,bonus = 0,options = {}) {
  const hp = rushBossHealth('monstone', number);
  const spell = cardId >= 0;
  return { key: `Monstone_SC_${number}`, boss: 'monstone', number, hp, time, name, spell, cardId, bonus, survival: false,
    lifeBar: spell ? { min: 0, max: .15, startFull: true, showTag: false } : { min: .15, max: 1, startFull: false, showTag: true },
    init: ctx => start(ctx,!spell), end: ctx => end(ctx,spell), ...options };
}
function stepMove(ctx,positions) {
  ctx.state.moveStep = (ctx.state.moveStep + 1) % positions.length;
  ctx.moveBoss(anchor(ctx,positions[ctx.state.moveStep]));
}
const smallMoves = [loc(0,100),loc(35,108),loc(12,94),loc(-20,103)];

function firstShooter(ctx,type,angle) {
  ctx.actor({ type, angle, update(c,a) {
    a.x = c.boss.x; a.y = c.boss.y;
    if (a.frame % (3 - c.difficulty % 2) === 0) {
      const offset = c.vec(a.angle,30);
      c.spawn('MiDan',loc(c.boss.x+offset.x,c.boss.y+offset.y),c.vec(a.angle,300),6,{ type: a.type,
        onUpdate(c2,b) { if (b.frame === 45) vector(b,c2.vec(Math.atan2(b.vy,b.vx) + .5 * (b.type === 0 ? 1 : -1),70 + 10 * c2.difficulty)); } });
      a.angle = f32(a.angle + (f32(.11) - .01 * c.difficulty) * (c.difficulty % 2 === 0 ? 1.5 : 1));
      c.sound('tan00');
    }
  }});
}
const monstone1 = phase(1,36,'非符一',-1,0,{
  update(ctx) {
    const f = tick(ctx);
    if (f === 75) {
      firstShooter(ctx,1,0);
      firstShooter(ctx,ctx.difficulty < 2 ? 0 : 1,PI);
      if (ctx.difficulty >= 2) { firstShooter(ctx,0,PI/2); firstShooter(ctx,0,PI*3/2); }
    }
    if (f % 200 === 0) stepMove(ctx,smallMoves);
  }
});

function smallFragment(c,b) {
  b.vx *= .96; b.vy *= .96;
  if (b.frame === 60) { c.ring('DianDan',6+c.difficulty,b,120,c.random(0,TAU),10,13); c.sound('kira00'); b.kill(); }
}
function middleFragment(c,b) {
  b.vx *= .96; b.vy *= .96;
  if (b.frame === 60) {
    c.ring('XiaoYu',6+c.difficulty,b,200,c.random(0,TAU),10,13,{ cleanOnHit: false, cleanOnBomb: false, onUpdate: smallFragment });
    c.sound('kira00'); b.kill();
  }
}
const monstone2 = phase(2,40,'石符「小碎石」',5,3200000,{
  update(ctx) {
    const f = tick(ctx);
    if (f === 1) maple(ctx);
    if (f === 75) {
      ctx.ring('ZhongYu',6+ctx.difficulty,ctx.boss,200,ctx.random(0,TAU),10,6,{ cleanOnHit: false, cleanOnBomb: false, onUpdate: middleFragment });
      ctx.sound('tan00');
    }
    if (f === 280) stepMove(ctx,[loc(0,100),loc(50,118),loc(104,108),loc(64,100),loc(-29,110),loc(-130,105),loc(-71,130)]);
    if (f === 360) ctx.state.tick = 0;
  }
});

function orbitShooter(ctx,angle) {
  ctx.actor({ angle, update(c,a) {
    const offset = c.vec(a.angle,90);
    a.x = c.boss.x + offset.x; a.y = c.boss.y + offset.y;
    if (a.frame % (6-c.difficulty) === 0) {
      c.spawn('MiDan',a,c.vec(a.angle-PI/2,120),6);
      c.spawn('MiDan',a,c.vec(a.angle-PI/2-.1,100),13);
      c.sound('tan00'); a.angle = f32(a.angle + f32(f32(.05) * (6-c.difficulty)));
    }
  }});
}
const monstone3 = phase(3,39,'非符二',-1,0,{
  update(ctx) {
    const f = tick(ctx);
    if (f === 75) { orbitShooter(ctx,0); orbitShooter(ctx,PI); }
    if (f % 200 === 0) stepMove(ctx,smallMoves);
    if (f % 50 === 0 && f > 80) {
      ctx.ring('ZhongYu',12+4*ctx.difficulty,ctx.boss,500,ctx.random(0,TAU),10,6,{ onUpdate(c,b) {
        if (b.frame === 22+c.difficulty) vector(b,c.vec(Math.atan2(b.vy,b.vx),75));
      }});
      ctx.sound('tan01');
    }
  }
});

function spiralStoneShooter(ctx,position,velocity) {
  ctx.actor({ ...copy(position), vx: velocity.x, vy: velocity.y, drag: .5, update(c,a) {
    vector(a,c.vec(Math.atan2(a.vy,a.vx)+PI/4,300),'f');
    if (a.frame % (6-c.difficulty) === 0) {
      if (Math.hypot(a.x-c.player.x,a.y-c.player.y)>20) c.spawn('XiaoYu',a,loc(0,0),13,{ angle: a.frame/9 + Math.atan2(a.vy,a.vx), onUpdate(c2,b) {
        if (b.frame === 60) { b.drag = .4; vector(b,c2.vec(b.angle,50),'f'); }
      }});
      c.sound('tan00');
    }
    if (outside(c,a)) a.kill();
  }});
}
const monstone4 = phase(4,44,'力符「蛮石怪力」',6,3200000,{
  update(ctx) {
    const f = tick(ctx);
    if (f === 1) { ctx.moveBoss(anchor(ctx,loc(0,0))); maple(ctx); }
    if (f === 100) {
      const angle = ctx.random(0,TAU), count = 6+ctx.difficulty;
      for (let i=0;i<count;i++) spiralStoneShooter(ctx,ctx.boss,ctx.vec(angle+TAU*i/count,250));
    }
    if (f === 360) ctx.state.tick = 0;
  }
});

const monstone5 = phase(5,45,'非符三',-1,0,{
  update(ctx) {
    const f = tick(ctx);
    if (f === 75) ctx.actor({ startrad: 0, update(c,a) {
      a.x = c.boss.x; a.y = c.boss.y;
      const d = c.difficulty, scale = .7 + .1*d;
      if (a.frame % (27-3*d) === 0) {
        for (let i=0;i<4;i++) {
          c.ring('MiDan',8+d,c.boss,scale*(200-5*i),a.startrad-.02*i,10,13);
          c.ring('MiDan',8+d,c.boss,scale*(200-5*i),a.startrad+.02*i,10,13);
        }
        a.startrad = f32(a.startrad + f32(f32(.01)*(27-3*d))); c.sound('tan00');
      }
      if (a.frame % (81-9*d) === 0) {
        for (let i=0;i<24+12*d;i++) {
          const angle = TAU*i/(24+12*d), offset=c.vec(angle+a.startrad,80);
          const quarter = (angle%TAU)%(PI/2)/(PI/2);
          c.spawn('MiDan',loc(c.boss.x+offset.x,c.boss.y+offset.y),c.vec(angle+a.startrad,scale*(60+150*Math.pow(Math.abs(quarter-.5),2))),6);
        }
      }
    }});
  }
});

function overheadShooter(ctx,p) {
  ctx.actor({ ...copy(p), update(c,a) {
    if (a.frame%2===0) {
      const angle=c.angle(a,c.player), force=c.vec(angle,50);
      c.spawn('XiaoYu',a,c.vec(angle+a.frame/60*c.random(-.3,.3),20*c.difficulty+180-a.frame),13,{ fx:force.x,fy:force.y,drag:.1 });
      c.sound('tan00');
    }
    if (a.frame===54+12*c.difficulty) a.kill();
  }});
}
function launchUp(ctx) {
  for (let i=0;i<3;i++) ctx.spawn('ZhongYu',ctx.boss,loc(-150+120*i,20),6,{ fx:0,fy:150,cleanOnHit:false,cleanOnBomb:false,onUpdate(c,b) {
    if (b.y>edge(c,'maxY',240)) { overheadShooter(c,b); b.kill(); }
  }});
  ctx.sound('tan00');
}
function rollingShooter(ctx,p,v) {
  ctx.actor({ ...copy(p),vx:v.x,vy:v.y,update(c,a) {
    if (a.frame%2===0) {
      if (Math.hypot(c.player.x-a.x,c.player.y-a.y)>20) {
        const offset=c.vec(c.random(0,TAU),c.random(0,30));
        c.spawn('XiaoYu',loc(a.x+offset.x,a.y+offset.y),loc(0,0),8,{ onUpdate(c2,b) { if (b.frame===200) b.kill(); } });
      }
      c.sound('tan00');
    }
    if (outside(c,a)) a.kill();
  }});
}
function rockBurst(c,b) {
  b.vx*=.95; b.vy*=.95;
  if (b.frame===90) {
    for (let i=0;i<12+6*c.difficulty;i++) c.spawn('MiDan',b,c.vec(PI/2+c.random(-.5,.5),c.random(100,240)),13,{ outOfRangeTolerance:70,fx:0,fy:-120-20*c.difficulty,drag:loc(0,.25) });
    c.sound('kira00'); b.kill();
  }
}
function rotatingRockShooter(ctx,p,type,offset) {
  ctx.actor({ ...copy(p),type,offset,update(c,a) {
    if (a.frame%10===1) {
      const step=Math.floor(a.frame/10);
      const angle=a.offset+PI/8+(a.type===0?step:4-step)*3*PI/16;
      c.spawn('ZhongYu',a,c.vec(angle,350),6,{ cleanOnHit:false,cleanOnBomb:false,onUpdate:rockBurst });
      c.sound('tan01');
    }
    if (a.frame===41) a.kill();
  }});
}
const monstone6 = phase(6,48,'乱石「破空」',7,3600000,{
  update(ctx) {
    const f=tick(ctx);
    if (f===1) maple(ctx);
    if (f===80||f===600) launchUp(ctx);
    if (f===260||f===780) {
      const count=6+2*ctx.difficulty;
      for(let i=0;i<count;i++) rollingShooter(ctx,ctx.boss,ctx.vec(TAU*i/count,300));
    }
    if (f===280) ctx.moveBoss(anchor(ctx,loc(80,50)));
    if (f===400) rotatingRockShooter(ctx,ctx.boss,1,.3);
    if (f===800) ctx.moveBoss(anchor(ctx,loc(-35,70)));
    if (f===920) rotatingRockShooter(ctx,ctx.boss,0,-.3);
    if (f===1000) ctx.moveBoss(anchor(ctx,loc(0,100)));
    if (f===1060) ctx.state.tick=0;
  }
});

function curlingRice(c,b) {
  if (b.frame<60) { b.vx*=.95; b.vy*=.95; }
  if (b.frame===60) {
    const strength=(.7+.1*c.difficulty)*b.strength;
    vector(b,c.vec(b.angle+(b.type===0?PI/4:-PI/4),strength),'f');
    vector(b,c.vec(b.angle,strength));
  }
}
const monstone7 = phase(7,44,'非符四',-1,0,{
  update(ctx) {
    const f=tick(ctx);
    if (f===75) ctx.actor({ angle:0,update(c,a) {
      a.x=c.boss.x; a.y=c.boss.y;
      a.angle=f32(a.angle+f32(.04));
      if (a.frame%(7-c.difficulty)===0) {
        for(let type=0;type<2;type++) c.ring('MiDan',6,c.boss,500,type===0?-a.angle:a.angle,10,type===0?6:13,{ type,drag:.5,strength:50+3*(a.frame%30),setup(c2,b) { b.angle=Math.atan2(b.vy,b.vx); },onUpdate:curlingRice });
        c.sound('tan00');
      }
      if (a.frame===200) a.kill();
    }});
    if (f===280) { stepMove(ctx,[loc(0,100),loc(50,108),loc(20,124),loc(-40,103)]); ctx.state.tick=0; }
  }
});

function ghostUpdate(c,b) {
  b.orbitLength=f32(b.orbitLength+f32(f32(b.targetLength-b.orbitLength)*f32(.02)));
  b.angle=f32(b.angle+f32(f32(.04)*f32(b.orbitLength/b.targetLength)));
  const offset=c.vec(b.angle,b.orbitLength);
  b.x=c.boss.x+offset.x; b.y=c.boss.y+offset.y;
  if (b.frame===900) b.targetLength=150;
  if (b.frame>=1800) b.targetLength=f32(200+20*Math.sin(f32((b.frame-1800)/20)));
  if (b.frame<=60) return;
  const d=c.difficulty, scale=.7+.1*d;
  if (b.type===0&&b.frame%60===0) {
    c.ring('MiDan',6+3*d,b,scale*150,c.random(0,TAU),10,13,shadow); c.sound('tan00');
  }
  if (b.type===1&&Math.floor(b.frame/30)%2===0&&b.frame%2===0&&b.frame%30<=12+6*d) {
    if (b.frame%30===0) { b.playerLoc=copy(c.player); c.sound('slash'); }
    c.fan('XiaoYu',1,b,scale*200,c.angle(b,b.playerLoc),0,0,1,shadow);
  }
  if (b.type===2&&b.frame%(7-d)===0) { c.fan('MiDan',1,b,scale*200,c.angle(b,c.boss),0,0,8,shadow); c.sound('tan01'); }
  if (b.type===3&&b.frame%90===0) { c.ring('DaYu',4+d,b,scale*120,c.random(0,TAU),10,1,shadow); c.sound('kira00'); }
}
const monstone8 = phase(8,40,'幻石「多重幻影」',8,4000000,{
  survival:true,
  init(ctx) {
    start(ctx); ctx.boss.immuneDamage=true; ctx.state.clones=[];
    ctx.state.playerShadow=ctx.effect('shadow',ctx.player,{ follow:ctx.player,interval:2,alpha:.5 });
    ctx.state.bossShadow=ctx.effect('shadow',ctx.boss,{ follow:ctx.boss,interval:2,alpha:.5 });
  },
  update(ctx) {
    const f=tick(ctx);
    if (f===1) maple(ctx);
    if (f===75) for(let i=0;i<4;i++) ctx.state.clones.push(ctx.spawn('Monstone',ctx.boss,loc(0,0),i,{ delay:0,cleanOnHit:false,cleanOnBomb:false,cleanOnOutOfRange:false,
      size:64,checkRadius:7,alpha:.75,tint:[[1,1,.5,.75],[1,.5,.5,.75],[.5,1,1,.75],[.25,.25,1,.75]][i],
      type:i,orbitLength:0,angle:f32(PI/2*i),targetLength:100,playerLoc:copy(ctx.player),...shadow,onUpdate:ghostUpdate }));
    if (f===900) ctx.moveBoss(anchor(ctx,loc(0,50)));
    if (f>1800) { const x=f32(Math.min(f32((f-1800)/1.5),60)*Math.sin(f32((f-1800)/25)));ctx.boss.x=ctx.anchorX?.(x)??x; ctx.boss.y=50; }
  },
  end(ctx) {
    // Summoned bodies survive ordinary bullet cancellation, but belong to
    // this card. Retire their emitters even on the quiet practice escape path.
    for(const clone of ctx.state.clones)clone.kill('phaseEnd');
    ctx.state.clones.length=0;
    if(ctx.state.playerShadow?.kill) ctx.state.playerShadow.kill();
    if(ctx.state.bossShadow?.kill) ctx.state.bossShadow.kill();
    ctx.boss.immuneDamage=false; end(ctx,true);
  }
});

function wallRebound(c,b) {
  if (b.x<edge(c,'minX',-320)) b.vx=Math.abs(b.vx)/2;
  if (b.x>edge(c,'maxX',320)) b.vx=-Math.abs(b.vx)/2;
}
function impactVolley(ctx,p,kind,count,spread,minSpeed,maxSpeed,color) {
  for(let i=0;i<count;i++) ctx.spawn(kind,p,ctx.vec(PI/2+ctx.random(-spread,spread),ctx.random(minSpeed,maxSpeed)),color,{ fx:0,fy:-220-10*ctx.difficulty,drag:loc(0,.25),onUpdate:wallRebound });
}
function finalShooter(ctx) {
  ctx.actor({ update(c,a) {
    const f=a.frame,d=c.difficulty;
    if(f<90) c.boss.x=f32(c.boss.x+(c.player.x-c.boss.x)*.09);
    if(f===90) { c.moveBoss(loc(c.boss.x,120),50); maple(c,false); }
    if(f===150) c.moveBoss(loc(c.boss.x,-220),700,1400);
    if(f===175) {
      impactVolley(c,c.boss,'DaYu',18+6*d,.3,300,660+20*d,3);
      impactVolley(c,c.boss,'XiaoYu',24+8*d,.6,280,620+20*d,13);
      impactVolley(c,c.boss,'MiDan',30+10*d,.9,260,580+20*d,13);
      c.sound('tan00'); c.effect('shake',c.boss,{frames:30,amplitude:16});
    }
    if(f===240) c.moveBoss(loc(c.boss.x,100),300,150);
    if(f>=240&&f%3===0) {
      for(let i=0;i<d+1;i++) c.spawn('XiaoYu',loc(c.random(edge(c,'minX',-320),edge(c,'maxX',320)),edge(c,'maxY',240)),loc(0,c.random(-200,-75)),13,{cleanOnBomb:false,cleanOnHit:false,onUpdate(c2,b) {
        if(b.frame===60) {
          const angle=c2.random(0,TAU);
          for(let j=0;j<3;j++) c2.spawn('DianDan',b,c2.vec(angle+j*TAU/3,90+10*c2.difficulty),13);
          c2.sound('kira00'); b.kill();
        }
      }});
      c.sound('tan00');
    }
    if(f===300) a.kill();
  }});
}
const monstone9 = phase(9,55,'巨石「泰山压顶」',9,4500000,{
  final:true,finalSpell:true,deathDelay:60,lifeBar:{min:0,max:1,startFull:false,showTag:false},
  init(ctx) { start(ctx); ctx.boss.tsRadius=20; },
  update(ctx) {
    const f=tick(ctx);
    if(f===75) finalShooter(ctx);
    if(f===400) ctx.state.tick=0;
  },
  end:ctx=>end(ctx,true,true)
});

export const monstonePhases=[monstone1,monstone2,monstone3,monstone4,monstone5,monstone6,monstone7,monstone8,monstone9];
