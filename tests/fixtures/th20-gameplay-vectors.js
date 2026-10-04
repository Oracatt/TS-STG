import { Th20Player } from '../../games/touhou20/src/player.js';
import { Th20ReimuBomb, Th20MarisaBomb } from '../../games/touhou20/src/bombs.js';
import { Th20Items } from '../../games/touhou20/src/items.js';
import { Th20Spell, quantizeTh20SpellTime } from '../../games/touhou20/src/spell.js';
import { Th20ShortLine } from '../../games/touhou20/src/short-line.js';
import { continueTh20Game } from '../../games/touhou20/src/game-over.js';
import { Th20DamageAccumulator, Th20Health } from '../../games/touhou20/src/damage.js';
import { Th20Enemy } from '../../games/touhou20/src/enemy.js';
import { Th20BossHud } from '../../games/touhou20/src/boss-hud.js';
import { Th20RNG, Th20Timer, f32, PI, sub, div } from '../../games/touhou20/src/math.js';

// The same assertion body runs in Node/V8 and in the actual embedded QuickJS.
export function verifyTh20GameplayVectors(vectors, sht) {
  const bits = value => { const view = new DataView(new ArrayBuffer(4)); view.setFloat32(0, value, true); return view.getUint32(0, true); };
  const fromBits = value => { const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, value, true); return view.getFloat32(0, true); };
  let comparisons = 0;
  const equal = (actual, expected, label) => { comparisons += expected.length; if (actual.some((v, i) => v !== expected[i])) throw new Error(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`); };
  const create = character => new Th20Player({ character, sht: sht[character] });
  for (const [character, mask, scale, x, y] of vectors.movement) {
    const p = create(character); p.focusTimer.set(4); for (let i = 0; i < 73; i++) p.update(mask, { clockScale: fromBits(scale) });
    equal([p.fixedX, p.fixedY], [x, y], 'movement');
  }
  for (const [target, current, factor, expected] of vectors.options) {
    const p = create(0), option = p.options[0]; p.fixedX = p.fixedY = 0; p.smoothFactor = factor;
    option.normalOffset = { x: target / 128, y: 0 }; option.fixedX = current; option.fixedY = 0; option.changed = 0;
    for (let i = 0; i < 17; i++) p.updateOptions(); equal([option.fixedX], [expected], 'option');
  }
  let rng, seed;
  for (const [nextSeed, , integer, signedBits] of vectors.rng) {
    if (nextSeed !== seed) { seed = nextSeed; rng = new Th20RNG(seed); }
    const copy = new Th20RNG(); copy.state = rng.state; equal([copy.next(), bits(rng.signed())], [integer, signedBits], 'RNG');
  }
  const p = { x: 0, y: 400, invulnerability: new Th20Timer() }, bomb = new Th20ReimuBomb(p), actual = new Map();
  for (let frame = 0; frame < 230; frame++) {
    p.x = f32((frame % 60 - 30) * .125); bomb.update({});
    bomb.orbs.forEach((orb, index) => { const age = frame - (index >= 8 ? 40 : 0); if (age % 5 === 0 || age === 189)
      actual.set(`${index >= 8 ? 1 : 0},${index % 8},${age}`, [orb.x, orb.y, orb.radius, orb.angle, orb.speed].map(bits)); });
  }
  for (const [second, index, frame, ...expected] of vectors.orbs) equal(actual.get(`${second},${index},${frame}`), expected, 'Reimu orb');
  const marisa = new Th20MarisaBomb({ x: 32, y: 400, motionX: 0, invulnerability: new Th20Timer() }); let frame = 0, cursor = 0;
  for (; frame <= 300; frame++) { marisa.player.motionX = frame % 90 < 30 ? -1 : frame % 90 < 60 ? 0 : 1;
    marisa.update({ damageRegion: region => { equal([frame, [208, 240, 304][cursor % 3], bits(region.angle), bits(region.x), bits(region.y)], vectors.marisa[cursor++], 'Marisa beam'); return 0; } }); }
  let key, items, item, player;
  for (const [scenario, clock, frame, ...expected] of vectors.items) {
    const next = `${scenario},${clock}`;
    if (key !== next) { key = next; player = { x: 0, y: 400, state: 1, power: 100, lives: 2, bombs: 2 }; items = new Th20Items({ player });
      item = items.spawn({ x: -120, y: 160, state: scenario % 4 + 1, delay: scenario === 0 ? 2 : 0, angle: sub(div(-PI, 2), .125), speed: 2 });
      items.speedScale = scenario % 2 ? f32(.4) : 1; item.attractionSpeed = item.state >= 3 ? div(5, 3) : 0; }
    if (scenario >= 8 && frame >= 20) player.y = 100;
    if (scenario >= 12 && frame >= 40) { player.state = 4; player.y = 400; }
    items.update({ clockScale: fromBits(clock) });
    equal([item.state, bits(item.x), bits(item.y), bits(item.vx), bits(item.vy), bits(item.attractionSpeed), item.delay, item.timer.current, bits(items.speedScale)], expected, 'item motion');
  }
  for (const [type, power, py, iy, state, pointValue, expectedPower, score, amount] of vectors.itemRewards) {
    const p = { x: 0, y: fromBits(py), state: 1, power, pointValue }, controller = new Th20Items({ player: p });
    const reward = controller.collect({ type, x: 0, y: fromBits(iy), state }); equal([p.power, p.score, reward], [expectedPower, score, amount], 'item reward');
  }
  let spell, current; key = null;
  for (const [difficulty, stage, duration, age, bonus] of vectors.spellDecay) {
    const next = `${difficulty},${stage},${duration}`;
    if (key !== next) { key = next; spell = new Th20Spell({ difficulty, stage }).begin({ duration }); current = -1; }
    while (current < age) { spell.update(); current++; } equal([spell.bonus], [bonus], 'spell decay');
  }
  for (const [elapsed, seconds, hundredths, encoded] of vectors.spellTiming) {
    const t = quantizeTh20SpellTime(elapsed); equal([t.seconds, t.hundredths, t.encoded], [seconds, hundredths, encoded], 'spell clock');
  }
  let line; seed = undefined;
  for (const [nextSeed, index, ...expected] of vectors.graze) {
    if (nextSeed !== seed) { seed = nextSeed; rng = new Th20RNG(seed); line = new Th20ShortLine({ color: 0xff9abcee, rng }); }
    line.update(); equal([bits(line.positions[index].x), bits(line.positions[index].y), bits(line.angle), line.colors[0], line.colors[index], rng.state], expected, 'graze short line');
  }
  for (const [unit, maximum, count, credits, ...expected] of vectors.continueGame) {
    const p = { startingPower: unit, maxBombs: maximum }, session = { continues: count, credits };
    continueTh20Game(p, session); equal([p.bombs, p.power, session.continues, session.credits], expected, 'Continue');
  }
  for (const [input, state, flags, ...expected] of vectors.damage) {
    const p = { state, score: 0, sht: sht[0] }, spell = new Th20Spell(); spell.flags = flags;
    const queue = new Th20DamageAccumulator({ player: p, spell }), enemy = { hp: 500, alive: true, damage(amount) { this.hp -= amount; } };
    queue.add(enemy, input); const [result] = queue.flush(); equal([result.nominal, result.amount, p.score], expected, 'damage aggregate');
  }
  let health; key = null;
  for (const [hp, threshold, amount, ...expected] of vectors.spellHealth) {
    const next = `${hp},${threshold}`; if (key !== next) { key = next; health = new Th20Health(hp, { spell: true, threshold }); }
    health.apply(amount); equal([health.hp, health.scaledHp, health.damageTotal], expected, 'spell HP');
  }
  const bank={create(scriptId,options={}){return {scriptId,...options,alive:true,destroy(){this.alive=false;}};}};
  for(const [animationFile,script,id,...expected] of vectors.enemyDefaults??[]){
    const enemy=new Th20Enemy({bank,animationFile,script,id});equal([enemy.deathScript,enemy.deathSound],expected,'enemy default effects');
  }
  for(const [primaryFlags,flags,contactInvulnerability,blocked,age,...expected] of vectors.enemyContact??[]){
    let kind=0,graze=0;const player={collisionCircle(){kind=1;return 2;},collisionRectangle(){kind=2;return 2;},addGraze(){graze++;}};
    const enemy=new Th20Enemy({bank,primaryFlags,flags,contactInvulnerability});enemy.age=age;enemy.collidePlayer(player,{enemyContactBlocked:!!blocked});
    equal([kind,graze],expected,'enemy contact flags');
  }
  let cancelItems;key=null;
  for(const [difficulty,index,spawned,counter] of vectors.cancelItems??[]){
    if(key!==difficulty){key=difficulty;cancelItems=new Th20Items({player:{},difficulty});}
    const item=cancelItems.spawn({type:15});equal([item?1:0,cancelItems.pointCounter],[spawned,counter],'cancel item difficulty counter');
  }
  const hudBank={create(scriptId){const values={};return{scriptId,alive:true,children:[],x:0,y:0,z:0,alpha:255,visible:true,F(k,v){if(v!==undefined)values[k]=f32(v);return values[k]??0;},U(k,v){if(v!==undefined)values[k]=v>>>0;return values[k]??0;},interrupt(){},interruptNow(){},setSprite(){},update(){},destroy(){this.alive=false;}};}};
  let bossHud;key=null;
  for(const [scenario,frame,...expected] of vectors.bossHud??[]){
    if(key!==scenario){key=scenario;bossHud=new Th20BossHud({bank:hudBank,textBank:hudBank});bossHud.setMarkers(0,[.25]);}
    const boss={x:scenario>=5?193:0,y:100,hp:1000-Math.floor(frame/15)*225,health:{maximum:1000}},player={x:(scenario%5)*20,y:frame<25?150:frame<50?195:196};
    bossHud.update({bosses:[boss],player,remainingFrames:360-frame});const panel=bossHud.panels[0],marker=panel.animations[3];
    equal([bits(panel.fraction),bits(panel.target),bits(panel.animations[0].F(0x38)),bits(marker.x),bits(marker.y),marker.visible?1:0,panel.near?1:0,bossHud.pointerMode,bossHud.pointer.alpha,bits(bossHud.pointer.x),bossHud.seconds,bossHud.hundredths],expected,'boss HUD');
  }
  let feedbackEnemy;key=null;
  for(const [flags,primaryFlags,spellFlags,hp,frame,...expected] of vectors.enemyFeedback??[]){
    const next=`${flags},${primaryFlags},${spellFlags},${hp}`;if(key!==next){key=next;feedbackEnemy=new Th20Enemy({bank,flags,primaryFlags,hp});}
    let sound=-1;feedbackEnemy.frameAge=frame;feedbackEnemy.hitThisFrame=frame%3===0;feedbackEnemy.finishDamageFeedback({spell:{flags:spellFlags},sound:id=>{sound=id;}});
    equal([feedbackEnemy.animation.flashColor??0,feedbackEnemy.hitCooldown,sound],expected,'enemy hit feedback');
  }
  for(const [x,y,bx,by,expected] of vectors.enemyDeathAngle??[]){
    const enemy=new Th20Enemy({bank,x:fromBits(x),y:fromBits(y)});enemy.lastHitPosition={x:fromBits(bx),y:fromBits(by),z:0};enemy.defeat(null,{effectBank:bank});
    equal([bits(enemy.effects[0].rotation)],[expected],'enemy destruction hit direction');
  }
  return { comparisons, failures: 0 };
}
if (globalThis.tsstg) {
  const read = path => JSON.parse(tsstg.readText(path));
  const result = verifyTh20GameplayVectors(read('tests/fixtures/th20-player-vectors.json'), [read('games/touhou20/assets/shots/pl00.json'), read('games/touhou20/assets/shots/pl01.json')]);
  tsstg.log(JSON.stringify({ runtime: 'QuickJS', ...result }));
  globalThis.__tsstg_game = { update() {}, render() { return []; }, snapshot() { return result; } };
}
