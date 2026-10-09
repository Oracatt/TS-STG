import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TouhouItems,TouhouBitmapFont,TouhouFloatingScores,TouhouRenderQueue,TouhouGame,createTouhouResources,TouhouRNG} from '@ts-stg/thlib/touhou';
import {Keys} from '../packages/thlib/dist/input.js';
import {DrawList} from '../packages/thlib/dist/render.js';

const data=JSON.parse(fs.readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/ascii_960.json',import.meta.url)));
const font=()=>new TouhouBitmapFont(data,{loadTexture:()=>71});
const player=()=>({x:0,y:400,state:1,power:400,lives:2,bombs:2});

test('ordinary public item collection draws original pickup digits by default without a business hook',()=>{
  const p=player(),items=new TouhouItems({player:p,font:font()});
  items.spawn({type:2,x:0,y:400,speed:0});items.update();items.update();
  const draw=new DrawList();items.draw(draw);
  const glyphs=draw.commands.filter(command=>command[0]==='spriteRegion');
  assert.ok(glyphs.length>0,'collected point values must have a default public presentation');
  assert.ok(glyphs.every(command=>command[1]===71),'pickup digits use the existing original ASCII texture');
});

const regions=draw=>draw.commands.filter(command=>command[0]==='spriteRegion');
const indices=commands=>commands.map(command=>data.sprites.find(sprite=>sprite&&sprite.x===command[2]&&sprite.y===command[3]&&sprite.width===command[4]&&sprite.height===command[5]).index);
const render=scores=>{const draw=new DrawList();scores.draw(draw);return draw;};

test('source slot overwrite, zero/negative glyphs, rise and strict61-frame retirement are reproduced',()=>{
  const scores=new TouhouFloatingScores({font:font(),player:{x:0,y:400}});
  const first=scores.spawn({x:0,y:400,amount:0,color:0xffffffff});
  assert.deepEqual(first.digits,[0]);assert.equal(first.timer.current,0);assert.equal(first.speed,1);
  assert.deepEqual(regions(render(scores)),[],'the source age0 spacing singularity never becomes an invalid host command');
  scores.update();assert.equal(first.y,399);assert.equal(first.speed,Math.fround(.95));
  let glyph=regions(render(scores))[0];assert.equal(indices([glyph])[0],289);
  assert.deepEqual(glyph.slice(6,10),[330,622.5,10,10],'original anchor and pixel-sized glyph differ from world-coordinate scale');
  for(let age=2;age<=60;age++)scores.update();assert.equal(first.active,true);
  assert.equal(regions(render(scores)).length,0,'digits finish their staged disappearance before the entry slot retires');
  scores.update();assert.equal(first.active,false);
  scores.clear();const power=scores.spawn({x:12,y:100,amount:-1,color:0xffffff40});power.timer.set(60);
  glyph=regions(render(scores))[0];assert.equal(indices([glyph])[0],299);
  assert.deepEqual(glyph.slice(6,10),[348,174,70,10],'the original POWER UP image remains complete');
  scores.clear();for(let value=0;value<=10;value++)scores.spawn({x:0,y:0,amount:value});
  assert.equal(scores.entries.length,10);assert.equal(scores.nextSlot,1);assert.equal(scores.entries[0].amount,10);
  assert.deepEqual(scores.entries.slice(1).map(entry=>entry.amount),[1,2,3,4,5,6,7,8,9]);
});

test('the three real ASCII digit stages disappear from left to right at their recovered thresholds',()=>{
  const scores=new TouhouFloatingScores({font:font()}),entry=scores.spawn({x:10,y:100,amount:123456});
  const at=age=>{entry.timer.set(age);return regions(render(scores));};
  assert.deepEqual(indices(at(39)),[290,291,292,293,294,295]);
  assert.deepEqual(indices(at(44)),[311,302,303,293,294,295]);
  assert.deepEqual(indices(at(48)),[312,313,304,305,295]);
  assert.deepEqual(indices(at(58)),[]);
  entry.timer.set(2);assert.equal(regions(render(scores))[0][6],333,'8/time spacing is preserved before frame8');
  entry.timer.set(8);assert.equal(regions(render(scores))[0][6],315,'frame8 uses the original steady8-unit spacing');
});

test('near-player alpha, original color and bilinear blend state retain exact source boundaries',()=>{
  const p={x:0,y:0},scores=new TouhouFloatingScores({font:font(),player:p});
  for(const x of [0,64,80,128,129]){const entry=scores.spawn({x,y:0,amount:1,color:0xffffcc00});entry.timer.set(10);}
  const draw=render(scores),glyphs=regions(draw);
  assert.deepEqual(glyphs.map(command=>command[11]>>>0),[0xffcc0080,0xffcc0080,0xffcc0098,0xffcc0000,0xffcc00ff]);
  assert.deepEqual(draw.commands.slice(0,2),[['alphaTest',1/255],['blendFactors','srcAlpha','oneMinusSrcAlpha','add','one','zero','add']]);
  assert.ok(draw.commands.filter(command=>command[0]==='sampler').every(command=>command[2]==='bilinear'));
  assert.deepEqual(draw.commands.slice(-2),[['blendEnd'],['alphaTest',0]]);
});

test('pickup conditions and colors remain source-specific rather than displaying every item reward',()=>{
  const cases=[
    {type:2,power:400,y:350,state:1,color:0xffffffff},
    {type:2,power:400,y:100,state:1,color:0xffffff00},
    {type:2,power:400,y:350,state:3,color:0xffffff00},
    {type:1,power:150,y:350,state:1,absent:true},
    {type:1,power:199,y:350,state:1,amount:-1,color:0xffffff40},
    {type:1,power:400,y:350,state:1,color:0xffffffff},
    {type:3,power:400,y:350,state:1,amount:20000,color:0xff808080},
    {type:8,power:400,y:350,state:1,color:0xff40ff40},
    ...[4,5,6,7].map(type=>({type,power:400,y:350,state:1,absent:true})),
  ];
  for(const expected of cases){
    const p={...player(),power:expected.power},events=[],items=new TouhouItems({player:p,font:font(),context:{floatingScore:entry=>events.push(entry)}});
    items.collect({type:expected.type,x:10,y:expected.y,state:expected.state});
    const active=items.floatingScores.entries.filter(entry=>entry.active);
    assert.equal(active.length,expected.absent?0:1,'type '+expected.type+' at power '+expected.power);
    assert.equal(events.length,active.length,'existing callbacks still receive one matching notification');
    if(active.length){assert.equal(active[0].color,expected.color);assert.equal(active[0].amount,expected.amount??events[0].amount);}
  }
});

test('the owner draws once after projectiles; repeated drawing never advances entries, awards score, or consumes RNG',()=>{
  const rng=new TouhouRNG(913),p={...player(),rng},items=new TouhouItems({player:p,font:font(),rng});
  items.collect({type:2,x:0,y:400,state:1});items.update();
  const before={items:items.snapshot(),score:p.score,rng:rng.state,scores:items.floatingScores.snapshot()};
  const queue=new TouhouRenderQueue(),draw=new DrawList();
  queue.enqueuePriority(41,target=>target.rect(0,0,1,1,0x123456ff));items.draw(queue);queue.flush(draw);
  const glyphs=regions(draw);assert.equal(glyphs.length,4);
  assert.ok(draw.commands.findIndex(command=>command[0]==='rect')<draw.commands.findIndex(command=>command[0]==='spriteRegion'));
  render(items.floatingScores);items.draw(new DrawList());
  assert.deepEqual({items:items.snapshot(),score:p.score,rng:rng.state,scores:items.floatingScores.snapshot()},before);
});

test('public Game supplies the shared font, freezes effects during pause, and leaves deterministic snapshots identical when disabled',()=>{
  const make=disabled=>{
    const res=createTouhouResources({readText:file=>fs.readFileSync(file,'utf8'),loadTexture:()=>71}),game=new TouhouGame({banks:res.banks,font:res.font,sht:res.shots[0],styles:res.styles,seed:951,
      systemOptions:{items:{floatingScores:disabled?false:{}}}});
    game.player.x=0;game.player.y=400;game.player.state=1;
    return{res,game};
  };
  const a=make(false),b=make(true);
  a.game.items.spawn({type:2,x:0,y:400,speed:0});b.game.items.spawn({type:2,x:0,y:400,speed:0});
  for(let i=0;i<35;i++){a.game.update();b.game.update();a.game.render();b.game.render();assert.deepEqual(a.game.snapshot(),b.game.snapshot());}
  assert.equal(a.game.items.floatingScores.font,a.res.font);
  const before=a.game.items.floatingScores.snapshot();a.game.update(Keys.PAUSE);b.game.update(Keys.PAUSE);
  for(let i=0;i<15;i++){a.game.update();b.game.update();a.game.render();b.game.render();}
  assert.deepEqual(a.game.items.floatingScores.snapshot(),before);assert.deepEqual(a.game.snapshot(),b.game.snapshot());
  a.game.destroy();b.game.destroy();assert.ok(a.game.items.floatingScores.entries.every(entry=>!entry.active));a.res.dispose();b.res.dispose();
});

test('public configuration and custom items reuse the visual owner while the old hook can own rendering explicitly',()=>{
  const p=player(),seen=[],items=new TouhouItems({player:p,font:font(),floatingScores:false,context:{floatingScore:entry=>seen.push(entry)}});
  items.collect({type:2,x:0,y:100,state:1});assert.equal(items.floatingScores,null);assert.equal(seen.length,1);assert.equal(regions(new DrawList()).length,0);
  const customized=new TouhouItems({player:player(),font:font(),floatingScores:{capacity:1,lifetime:70,initialSpeed:2,drag:.5,scale:2,drawPriority:52}});
  customized.register('token',{collect(item,player,context,owner){owner.floatingScore(item,321,0xff80ffff,context);return 321;}});
  customized.collect(customized.spawn({type:'token',x:0,y:100}));customized.update();
  const entry=customized.floatingScores.entries[0];assert.equal(entry.y,98);assert.equal(entry.speed,1);
  assert.deepEqual(regions(render(customized.floatingScores))[0].slice(8,10),[20,20]);
  const queue=new TouhouRenderQueue();customized.draw(queue);assert.ok(queue.entries.some(entry=>entry.priority===52));
  customized.destroy();assert.ok(customized.floatingScores.entries.every(entry=>!entry.active));
  for(const options of [{capacity:-1},{lifetime:0},{drag:1.1},{initialSpeed:NaN},{scale:0},{drawPriority:Infinity}])assert.throws(()=>new TouhouFloatingScores(options),RangeError);
  assert.throws(()=>new TouhouFloatingScores().spawn({x:0,y:0,amount:1.5}),RangeError);
});
