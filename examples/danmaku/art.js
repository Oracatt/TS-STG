const INK = 0x080f20ff, PAPER = 0xe8e0ccff, GOLD = 0xb8a078ff;
const stars = Array.from({ length: 72 }, (_, i) => ({
  x: 42 + ((i * 137 + i * i * 13) % 553), y: 30 + ((i * 79 + i * i * 5) % 651),
  r: i % 8 === 0 ? 1.8 : .8
}));

export function background(d, game) {
  if (game.menu) { game.menu.x = 84; game.menu.y = 300; game.menu.width = 476; }
  const frame = game.world?.frame ?? 0;
  d.clear(INK);
  d.rect(32, 24, 576, 672, 0x111d32ff);
  d.scissor(32, 24, 576, 672);
  for (let y = 0; y < 16; y++) {
    const c = ((12 + y) << 24 | (20 + y) << 16 | (38 + y) << 8 | 255) >>> 0;
    d.rect(32, 24 + y * 42, 576, 42, c);
  }
  for (const star of stars) {
    const alpha = Math.floor(90 + 55 * Math.sin(frame * .018 + star.x));
    d.circle(star.x, 24 + ((star.y + frame * .11) % 672), star.r, (0xa2becd00 | alpha) >>> 0);
  }
  d.circle(453, 147, 74, 0x9eaeac12);
  d.circle(453, 147, 63, 0xc6c6b923);
  d.circle(453, 147, 52, 0xd2d3bd4f);
  d.circle(465, 134, 47, 0x152139ff);
  // Distant mountains and a quiet shrine silhouette.
  d.triangle(10, 440, 180, 270, 370, 440, 0x142239ff);
  d.triangle(190, 470, 444, 286, 690, 470, 0x17263cff);
  d.triangle(10, 530, 285, 365, 680, 550, 0x1b2c40ff);
  for (let i = 0; i < 6; i++) d.line(32, 430 + i * 48, 608, 430 + i * 48, 1, 0x9cafb30b);
  const drift = frame * .13 % 70;
  for (let i = -5; i <= 9; i++) d.line(320, 340, 32 + i * 100 + drift, 720, 1, 0x95aaba12);
  d.rect(141, 335, 12, 191, 0x080f1ccc); d.rect(492, 335, 12, 191, 0x080f1ccc);
  d.rect(120, 345, 407, 13, 0x090f1ecc); d.rect(134, 381, 381, 10, 0x090f1ecc);
  d.line(112, 329, 320, 343, 12, 0x090f1ecc); d.line(320, 343, 535, 329, 12, 0x090f1ecc);
  d.scissorEnd();
  d.line(24, 24, 24, 696, 1, 0xb8a0786a); d.line(616, 24, 616, 696, 1, 0xb8a0786a);
  d.line(32, 16, 608, 16, 1, 0xb8a0786a); d.line(32, 704, 608, 704, 1, 0xb8a0786a);
  for (const [x,y] of [[24,16],[616,16],[24,704],[616,704]]) d.circle(x,y,3,GOLD);
}

export function hud(d, game) {
  const p = game.player ?? {};
  const stats = game.stats ?? p;
  const score = game.score ?? stats.score ?? p.score ?? 0;
  d.rect(632, 24, 300, 672, 0x0b1425ff);
  d.text('TS-STG', 659, 46, 37, PAPER);
  d.text('SCRIPTABLE DANMAKU ENGINE', 660, 91, 12, GOLD);
  d.line(660, 124, 902, 124, 1, 0xb8a07872);
  d.text('THE MOONLIT', 660, 150, 22, PAPER);
  d.text('ARCHIVE', 660, 179, 31, PAPER);
  d.text('01  /  TECHNICAL DEMONSTRATION', 660, 222, 11, GOLD);
  if (['title', 'options', 'practice'].includes(game.state)) {
    d.text('C++ HOST', 660, 290, 15, GOLD);
    d.text('Window / Render / Audio', 660, 316, 14, 0xa7b4c9ff);
    d.text('JAVASCRIPT THLIB', 660, 366, 15, GOLD);
    d.text('Patterns / Players / Stages', 660, 392, 14, 0xa7b4c9ff);
    d.text('YOUR GAME', 660, 442, 15, GOLD);
    d.text('Create a sky of your own.', 660, 468, 14, 0xa7b4c9ff);
    d.line(660, 552, 902, 552, 1, 0xb8a07872);
    d.text('ARROWS  SELECT', 660, 579, 14, PAPER);
    d.text('Z / ENTER  CONFIRM', 660, 608, 14, PAPER);
    d.text('X  BACK', 660, 637, 14, 0xa7b4c9ff);
    d.text('QUICKJS  /  THLIB  /  60 HZ', 660, 672, 11, 0x6b829dff);
    return;
  }
  d.text(String(game.difficulty ?? 'normal').toUpperCase(), 660, 259, 17, 0x93c9dcff);
  d.text('SCORE', 660, 305, 12, GOLD);
  d.text(String(score).padStart(10, '0'), 660, 326, 27, PAPER);
  const rows = [ ['LIVES', p.lives ?? stats.lives ?? 3], ['BOMBS', p.bombs ?? stats.bombs ?? 3],
    ['POWER', Number(p.power ?? stats.power ?? 1).toFixed(2)], ['GRAZE', p.graze ?? stats.graze ?? 0] ];
  rows.forEach(([label, value], i) => {
    d.text(label, 660, 385 + i * 39, 13, GOLD);
    d.text(String(value), 832, 382 + i * 39, 21, PAPER);
  });
  d.line(660, 552, 902, 552, 1, 0xb8a07872);
  d.text('Z  SHOOT       X  BOMB', 660, 576, 14, 0xa7b4c9ff);
  d.text('SHIFT  FOCUS   ESC  PAUSE', 660, 601, 13, 0xa7b4c9ff);
  d.text('ARROWS  MOVE / SELECT', 660, 626, 13, 0xa7b4c9ff);
  d.text('QUICKJS  /  THLIB  /  60 HZ', 660, 672, 11, 0x6b829dff);
}
