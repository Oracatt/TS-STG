import test from 'node:test';
import assert from 'node:assert/strict';
import { TouhouPlayer } from '../packages/thlib/dist/touhou/player.js';
import { TOUHOU_BULLET_STYLES } from '../packages/thlib/dist/touhou/bullet-style-data.js';

// Read-only source audit, 2026-10-04. No original executable is run here.
// The reconstruction's player_entity/cpu_validation.json records 12,000 original
// CPU comparisons for EACH circle/rectangle/axis predicate, all passing.
// Source SHA256 evidence (not an assertion that this JS ran those CPU cases):
// collision.cpp b52ca584c81cbcb13e789c73288279779373a88c7c486354045cb57494986c5d
// cpu_compare.cpp 1cb9deecbfad3b8f8ec330ae181d27c646f9c96e1fb89a11a077f668e093487d
// cpu_validation.json b7c8ee2e358622a25ba7f256772227856e733a5b932d92b16009075362e65ae7
// bullet_system/style_data.cpp e391bedb1819fb3468e94325407133f48bd1f276ed71edf413bb3b3eb29f2c31
// damage_regions/geometry.cpp bdb9ea5cfed5bf7aff6790a88220189008da90f5f9d703f76d221a9a4486ec0f
// stage_reset.cpp 13e0d68b8563b4af1294ccbd6d3ab98728d001d1330abcaf2f62fe74210031e5

// Minimal valid shot data keeps collision tests independent of local artwork.
// No weapon is active: its patterns and offsets are never used by a predicate.
const sht={format:'ts-stg-touhou-shots',maxPower:0,speeds:[4,4,2,2],patterns:Array.from({length:3},()=>[]),
  offsets:[{normal:[[]],focus:[[]]}],optionScripts:[0],fullPowerScripts:[0]};
function player(character=0){
  const p=new TouhouPlayer({character,sht,power:0,x:0,y:0});
  p.hitCalls=0;p.hit=()=>{p.hitCalls++;return true;}; // source CollisionServices::hit spy
  return p;
}
const bits=value=>{const v=new DataView(new ArrayBuffer(4));v.setFloat32(0,value,true);return v.getUint32(0,true);};

// Literal float words independently transcribed from the 50 C++ style rows.
const radiusWords=[1075419546,1075419546,1075419546,1073741824,1082130432,1082130432,1082130432,1082130432,
  1075419546,1075419546,1075419546,1077097267,1075419546,1075419546,1075419546,1075419546,1082130432,1082130432,
  1091043328,1091043328,1086324736,1086324736,1088421888,1088421888,1088421888,1086324736,1086324736,1082130432,
  1082130432,1092616192,1088421888,1082130432,1096810496,1094713344,1075419546,1078774989,1078774989,1082130432,
  1082130432,1082130432,1082130432,1082130432,1082130432,1084227584,1092616192,1092616192,1105199104,1105199104,
  1088421888,1088421888];

// Hand-selected integer lattice points, independently classified from the
// recovered predicate's mathematical inequalities. No JS collision formula or
// collision helper generates expected results. Each row is:
// hit axial x, non-hit axial x, hit diagonal x/y, non-hit diagonal x/y,
// graze axial x, outside axial x, graze diagonal x/y, outside diagonal x/y.
// Example r=4: hit boundary is 3²+4²=25, so (3,4) and (5,0) are NOT hits.
// Example r=28: 19²+20²=761<793, but 20²+20²=800>793;
// graze boundary is 43²+28²=2633, between 51²/52² and 2*36²/2*37².
const lattice={
  1075419546:[3,4,[3,2],[3,3],43,44,[30,30],[31,31]], // r=2.4; hit²≈14.76
  1073741824:[3,4,[2,2],[3,2],43,44,[30,30],[31,31]], // r=2; hit²=13
  1082130432:[4,5,[3,3],[3,4],43,44,[30,30],[31,31]], // r=4; hit²=25
  1077097267:[4,5,[2,3],[3,3],43,44,[30,30],[31,31]], // r=2.8; hit²≈16.84
  1091043328:[9,10,[6,6],[7,6],43,44,[30,31],[31,31]], // r=8.5; hit²=81.25
  1086324736:[6,7,[4,5],[5,5],43,44,[30,30],[31,31]], // r=6; hit²=45
  1088421888:[7,8,[5,5],[5,6],43,44,[30,30],[31,31]], // r=7; hit²=58
  1092616192:[10,11,[7,7],[8,7],44,45,[31,31],[32,32]], // r=10; hit²=109
  1096810496:[14,15,[10,10],[10,11],45,46,[31,31],[32,32]], // r=14; hit²=205
  1094713344:[12,13,[8,9],[9,9],44,45,[31,31],[32,32]], // r=12; hit²=153
  1078774989:[4,5,[3,3],[3,4],43,44,[30,30],[31,31]], // r=3.2; hit²≈19.24
  1084227584:[5,6,[4,4],[4,5],43,44,[30,30],[31,31]], // r=5; hit²=34
  1105199104:[28,29,[19,20],[20,20],51,52,[36,36],[37,37]], // r=28; hit²=793
};

test('all 50 source bullet radii retain their exact IEEE words and independent axial/diagonal collision vectors',()=>{
  assert.equal(TOUHOU_BULLET_STYLES.length,50);
  for(const character of [0,1])for(const focused of [false,true])for(const [type,style] of TOUHOU_BULLET_STYLES.entries()){
    assert.equal(style.type,type);assert.equal(style.radiusBits,radiusWords[type]);assert.equal(bits(style.radius),radiusWords[type]);
    const p=player(character);p.focused=focused;assert.equal(p.normalRadius,3);assert.equal(p.focusRadius,3);
    assert.deepEqual(p.normalExtent,{x:1.5,y:1.5});assert.deepEqual(p.focusExtent,{x:1.5,y:1.5});
    const [inside,outside,diagonalIn,diagonalOut,graze,far,grazeDiagonal,farDiagonal]=lattice[radiusWords[type]];
    const vectors=[[inside,0,1],[outside,0,2],[...diagonalIn,1],[...diagonalOut,2],
      [graze,0,2],[far,0,0],[...grazeDiagonal,2],[...farDiagonal,0]];
    for(const [x,y,expected] of vectors)for(const [sx,sy] of [[1,1],[1,-1],[-1,1],[-1,-1]])for(const swap of [false,true]){
      const a=(swap?y:x)*sx,b=(swap?x:y)*sy,before=p.hitCalls;
      assert.equal(p.collisionCircle(a,b,style.radius),expected,`character ${character}, focus ${focused}, type ${type}, (${a},${b})`);
      assert.equal(p.hitCalls-before,expected===1?1:0);
    }
  }
});

test('circle hit/graze tangency is strict and distinguishes original squared radii from summed radii',()=>{
  const p=player();
  // Exact binary32 neighbors around the 3-4-5 boundary, independent of sqrt.
  for(const [x,y,radius,expected] of [[5-2**-21,0,4,1],[5,0,4,2],[5+2**-21,0,4,2],
    [3,4,4,2],[4,3,4,2],[6,0,4,2],[3-2**-22,0,0,1],[3,0,0,2],
    [43-2**-18,0,0,2],[43,0,0,0],[43+2**-18,0,0,0]])
    assert.equal(p.collisionCircle(x,y,radius),expected,`(${x},${y}), r=${radius}`);
  // 0% removes only the player contribution; it does not disable bullets.
  p.collisionPercent=0;assert.equal(p.collisionCircle(4,0,4),2);assert.equal(p.collisionCircle(3,0,4),1);
  p.collisionPercent=-50;assert.equal(p.collisionCircle(4,0,4),2);
  p.collisionPercent=150;assert.equal(p.collisionCircle(5,0,4),2);assert.equal(p.collisionCircle(4,0,4),1);
});

test('laser rectangles retain width/height ordering, inclusive straight edges and strict rounded corners',()=>{
  const p=player();
  // Public collide_rectangle(width=8,height=20) becomes source geometric
  // x extent ±10 and y extent ±4; player radius=3, graze radius=33.
  for(const [x,y,expected] of [[13,0,1],[13.125,0,2],[0,7,1],[0,7.125,2],
    [12,6,1],[12,7,2],[43,0,2],[43.125,0,0],[0,37,2],[0,37.125,0]]){
    p.x=x;p.y=y;assert.equal(p.collisionRectangle(0,0,0,8,20),expected,`(${x},${y})`);
  }
  // A second exact 3-4-5 triangle tests CORNER tangency, where <= is wrong.
  p.normalRadius=5;p.x=13;p.y=8;assert.equal(p.collisionRectangle(0,0,0,8,20),2);
  p.x=12;p.y=8;assert.equal(p.collisionRectangle(0,0,0,8,20),1);
  p.x=15;p.y=0;assert.equal(p.collisionRectangle(0,0,0,8,20),1,'straight tangency includes equality');
});

test('quarter-turn and diagonal laser geometry are tested using hand-classified world points',()=>{
  const p=player();
  const rows=[
    [Math.PI/2,0,12.5,1],[Math.PI/2,0,13.5,2],[Math.PI/2,6.5,0,1],[Math.PI/2,7.5,0,2],
    [Math.PI/2,0,43.5,0],[Math.PI/4,8,8,1],[Math.PI/4,10,10,2],
    [Math.PI/4,-4,4,1],[Math.PI/4,-5,5,2],[Math.PI/4,100,100,0],
  ];
  for(const [angle,x,y,expected] of rows)for(const sign of [-1,1]){
    p.x=x*sign;p.y=y*sign;assert.equal(p.collisionRectangle(0,0,angle,8,20),expected,`angle ${angle}, (${p.x},${p.y})`);
  }
});

test('collision dispatch follows source CPU oracle precedence across preview, suppression, states and invulnerability',()=>{
  // Literal rows from player_entity/cpu_compare.cpp:225..233: bit0 invalid
  // state, bit1 invulnerability, bit2 Boss suppression, bit3 preview.
  const circle=[1,0,1,0,0,0,0,0,2,2,2,2,0,0,0,0];
  const rectangle=[1,0,0,0,0,0,0,0,2,2,2,2,0,0,0,0];
  for(const invalidState of [2,3,4])for(const pattern of circle.keys())for(const shape of ['circle','rectangle']){
    const p=player();p.state=pattern&1?invalidState:1;p.invulnerability.set(pattern&2?5:0);
    const context={bossSuppressed:!!(pattern&4)},preview=!!(pattern&8);
    const got=shape==='circle'?p.collisionCircle(0,0,4,context,preview):p.collisionRectangle(0,0,0,4,4,context,preview);
    assert.equal(got,(shape==='circle'?circle:rectangle)[pattern],`${shape}, state ${invalidState}, pattern ${pattern}`);
    assert.equal(p.hitCalls,pattern===0?1:0);
  }
  // Source excludes exactly states 2/3/4; do not accidentally blacklist 0/5+.
  for(const state of [0,1,5,6,7]){const p=player();p.state=state;assert.equal(p.collisionCircle(0,0,4),1);assert.equal(p.hitCalls,1);}
});
