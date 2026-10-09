import type {Game} from '@ts-stg/thlib';
import { Stage, Enemy, Boss, Bullet, Laser, Patterns, wait } from '@ts-stg/thlib';

const PINK = 0xf294c5ff, BLUE = 0x88d8f5ff, GOLD = 0xf4d49aff;
const TAU = Math.PI * 2;
const rank = (game: Game) => (({ easy: .75, normal: 1, hard: 1.3, lunatic: 1.6 } as Record<string, number>)[game.difficulty] ?? 1);

export function createBoss(game: Game) {
  const density = rank(game);
  return new Boss({ x: 320, y: 148, name: 'SELENE / Keeper of the archive', phases: [
    {
      name: 'Prelude - Falling constellations', spell: false, hp: 950, timeLimit: 1500,
      script: function* (boss, world) {
        let cycle = 0;
        while (boss.alive) {
          boss.x = 320 + Math.sin(cycle * .24) * 130;
          Patterns.ring(world, { x: boss.x, y: boss.y, count: Math.floor(20 * density), angle: cycle * .16,
            speed: 1.45, radius: 4, color: cycle % 2 ? PINK : BLUE });
          if (cycle % 3 === 0) Patterns.aimed(world, { x: boss.x, y: boss.y, target: game.player,
            count: 5, spread: .50, speed: 2.5, radius: 5, color: GOLD });
          cycle++; yield* wait(28);
        }
      }
    },
    {
      name: 'Moon Sign - Petals of the night', spell: true, hp: 1450, timeLimit: 2400, bonus: 500000,
      script: function* (boss, world) {
        boss.x = 320; boss.y = 150;
        let cycle = 0;
        while (boss.alive) {
          const arms = Math.floor(9 * density);
          for (let i = 0; i < arms; i++) {
            const angle = i * TAU / arms + cycle * .12;
            world.spawn(new Bullet({ x: boss.x, y: boss.y, angle, speed: 1.1,
              acceleration: .007, angularVelocity: cycle % 2 ? -.004 : .004,
              radius: 4, color: i % 2 ? PINK : BLUE }));
          }
          if (cycle % 10 === 0) Patterns.aimed(world, { x: boss.x, y: boss.y,
            target: game.player, count: 5, spread: .34, speed: 2.9, color: GOLD, radius: 4 });
          cycle++; yield* wait(8);
        }
      }
    },
    {
      name: 'Star Map - Meridians of light', spell: true, hp: 1700, timeLimit: 2400, bonus: 700000,
      script: function* (boss, world) {
        boss.x = 320; boss.y = 124;
        let cycle = 0;
        while (boss.alive) {
          const aim = Math.atan2(game.player.y - boss.y, game.player.x - boss.x);
          for (let i = -1; i <= 1; i++) world.spawn(new Laser({ x: boss.x, y: boss.y,
            angle: aim + i * .46, length: 760, width: 13, warning: 65, grow: 12,
            duration: 60, fade: 20, color: i ? BLUE : PINK }));
          for (let j = 0; j < 5; j++) {
            Patterns.ring(world, { x: boss.x, y: boss.y, count: Math.floor(18 * density),
              speed: 1.25 + j * .10, angle: cycle * .2 + j * .10, radius: 4, color: GOLD });
            yield* wait(22);
          }
          cycle++; yield* wait(75);
        }
      }
    },
    {
      name: 'Last Light - An unwritten sky', spell: true, hp: 1900, timeLimit: 2700, bonus: 1000000,
      script: function* (boss, world) {
        boss.x = 320; boss.y = 156;
        let cycle = 0;
        while (boss.alive) {
          Patterns.ring(world, { x: boss.x, y: boss.y, count: Math.floor(28 * density),
            angle: cycle * .107, speed: 1.4 + Math.sin(cycle * .2) * .25,
            angularVelocity: .003 * Math.sin(cycle * .11), radius: 4,
            color: cycle % 3 ? BLUE : PINK });
          if (cycle % 8 === 0) for (let side = -1; side <= 1; side += 2)
            world.spawn(new Laser({ x: 320 + side * 205, y: 80, angle: Math.PI / 2,
              angularVelocity: side * .0025, length: 640, width: 9, warning: 70,
              grow: 15, duration: 100, fade: 25, color: GOLD }));
          cycle++; yield* wait(22);
        }
      }
    }
  ] });
}

export function createStage(game: Game) {
  return new Stage({ name: '01 / THE MOONLIT ARCHIVE', bossFactory: () => createBoss(game),
    script: function* (stage) {
      yield* wait(90);
      for (let wave = 0; wave < 4; wave++) {
        for (let i = 0; i < 6; i++) {
          const left = wave % 2 === 0;
          stage.spawn(new Enemy({ x: left ? 72 : 568, y: 62 + i * 12,
            hp: 24, vx: left ? 1.15 : -1.15, vy: .55, radius: 14,
            color: wave % 2 ? PINK : BLUE, drops: { power: 1, point: 2 },
            script: function* (enemy, world) {
              yield* wait(40);
              for (let shot = 0; shot < 5; shot++) {
                Patterns.aimed(world, { x: enemy.x, y: enemy.y, target: game.player,
                  count: Math.max(3, Math.floor(4 * rank(game))), spread: .65,
                  speed: 1.65, radius: 4, color: GOLD });
                yield* wait(70);
              }
            }
          }));
          yield* wait(28);
        }
        yield* wait(115);
      }
      yield* wait(180);
      stage.spawnBoss(createBoss(game));
    }
  });
}
