import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RushRandom } from '../games/rushboss/src/random.js';
import { RushBattle, stepBody, setMove, stepMove } from '../games/rushboss/src/runtime.js';
import { artiaPhases } from '../games/rushboss/src/artia.js';
import { sunnyPhases } from '../games/rushboss/src/sunny.js';
import { monstonePhases } from '../games/rushboss/src/monstone.js';

const view = new DataView(new ArrayBuffer(4));
const fromBits = n => { view.setUint32(0,n,true);return view.getFloat32(0,true); };
const bits = n => { view.setFloat32(0,n,true);return view.getUint32(0,true); };
const advance = (battle, count) => { for (let i=0;i<count;i++) battle.update(0); };
const emptyPhase = {key:'fixture',number:1,boss:'fixture',hp:100,time:1000,spell:false,cardId:-1,bonus:0};
const emptyBattle = () => new RushBattle([emptyPhase],{invincible:true});

test('RushRandom matches C++ std::mt19937 first 1000 uints for three independent seeds',()=>{
  const hashes = [
    [0,'e798f7a4dd5a1ead6e8025453eaf54b8da3d4624c6b4406a4a098a22ccdb1864'],
    [5489,'cdf4f179ec2e6572c53d6fd0c86127c27682db5f1ba01171f0b4e598630bf726'],
    [123456789,'2417afd91a92c2c3b8d1eb4f61b3ab0b999903ade745a2118a952ae547d66111'],
  ];
  for(const [seed,expected] of hashes){
    const rng=new RushRandom(seed),out=Buffer.alloc(4000);
    for(let i=0;i<1000;i++)out.writeUInt32LE(rng.nextUint(),i*4);
    assert.equal(createHash('sha256').update(out).digest('hex'),expected);
    assert.equal(rng.calls,1000);
  }
});

test('RushRandom float32 and inclusive signed integer sampling match frozen C++ oracle',()=>{
  for(const record of oracle.rng){
    const floats=new RushRandom(record.seed);
    for(const [min,max,expected] of record.floats)assert.equal(bits(floats.float(fromBits(min),fromBits(max))),expected);
    const ints=new RushRandom(record.seed);
    for(const [min,max,expected] of record.ints)assert.equal(ints.int(min,max),expected);
  }
});

test('MoveBody constant force and quadratic drag trajectories match C++ float bits',()=>{
  for(const record of oracle.bodies){
    const [x,y,vx,vy]=record.initial.map(fromBits);
    const body={x,y,vx,vy,fx:fromBits(record.force[0]),fy:fromBits(record.force[1]),drag:{x:fromBits(record.drag[0]),y:fromBits(record.drag[1])}};
    let frame=0;
    for(const [at,expected] of record.samples){
      while(frame<at){stepBody(body);frame++;}
      assert.deepEqual([body.x,body.y,body.vx,body.vy].map(bits),expected,`body frame ${at}`);
    }
  }
});

test('MovingObject max/min speed interpolation and normalized motion match C++ float bits',()=>{
  for(const record of oracle.moves){
    const [x,y,tx,ty,max,min]=record.initial.map(fromBits);
    const body={x,y,vx:0,vy:0,fx:0,fy:0,drag:0};setMove(body,{x:tx,y:ty},max,min);
    let frame=0;
    for(const [at,expected] of record.samples){
      while(frame<at){stepMove(body);frame++;}
      assert.deepEqual([bits(body.x),bits(body.y),bits(body.move.speed),body.moving?1:0],expected,`move frame ${at}`);
    }
  }
  const body={x:0,y:100,vx:0,vy:0,fx:0,fy:0,drag:0};setMove(body,{x:30,y:140});
  assert.equal(body.move.maxSpeed,50);assert.equal(body.move.minSpeed,50);
});

test('Fog holds setup state 15 frames and calls source attach hook before first physics tick',()=>{
  const battle=emptyBattle(),events=[];
  const bullet=battle.spawn('XiaoYu',{x:12,y:18},{x:60,y:0},5,{
    setup(c,b){assert.equal(c,battle);b.fx=60;events.push(['setup',b.x,b.frame]);},
    onSpawn(c,b){assert.equal(c,battle);events.push(['spawn',b.x,b.frame]);},
    onUpdate(c,b){events.push(['update',b.x,b.frame]);},
    onDestroy(c,b){assert.equal(c,battle);events.push(['destroy',b.x,b.frame]);},
  });
  assert.deepEqual(events,[['setup',12,0]]);
  advance(battle,15);assert.equal(bullet.delay,0);assert.equal(bullet.frame,0);assert.equal(bullet.x,12);
  assert.equal(events.length,1);
  advance(battle,1);assert.equal(bullet.frame,1);assert.equal(events[1][0],'spawn');
  assert.equal(events[1][1],12);assert.equal(events[2][0],'update');assert.ok(events[2][1]>13);
  bullet.kill();bullet.kill();assert.equal(events.filter(e=>e[0]==='destroy').length,1);
});

test('Actors run frame/physics wrapper and nested emitters start on following world tick',()=>{
  const battle=emptyBattle();let nested=null;
  const actor=battle.actor({x:0,y:0,vx:60,update(c,a){
    assert.equal(c,battle);if(a.frame===1)nested=c.actor({x:a.x,y:0,update(cc,b){assert.equal(cc,battle);}});
  }});
  advance(battle,1);assert.equal(actor.frame,1);assert.equal(actor.x,1);assert.ok(nested);assert.equal(nested.frame,0);
  advance(battle,1);assert.equal(actor.frame,2);assert.equal(nested.frame,1);
});

test('authored straight/curve trajectories retain their timing while sample parts have no separate hitboxes',()=>{
  const battle=emptyBattle();
  const straight=battle.laser({x:0,y:100},0,4,{length:1000,checking:false,lifetime:3});
  const head=battle.laser({x:0,y:0},0,6,{curve:true,width:8,vx:180,vy:0,segments:10,lifetime:3,cleanOnOutOfRange:false});
  advance(battle,1);
  assert.equal(straight.frame,1);assert.equal(head.frame,1);assert.ok(Math.abs(head.x-3)<0.000001);
  const part=battle.world.entities.find(e=>e.visualKind==='laserPart');
  assert.ok(part);assert.equal(part.frame,0);assert.equal(part.x,head.x);
  assert.equal(part.laserHead,head);assert.equal(part.sampleSpeed,3);assert.equal(part.radius,0);
  advance(battle,2);assert.equal(head.alive,false);assert.equal(straight.alive,false);
  assert.equal(battle.world.entities.filter(e=>e.visualKind==='laserPart').length,0,'explicit curve lifetime retires its full source history');
  advance(battle,10);assert.equal(battle.world.entities.filter(e=>e.visualKind==='laserPart').length,0);
});

test('Practice timeout completes its selected phase and survival timeout awards capture',()=>{
  for(const survival of [false,true]){
    const phase={...emptyPhase,time:6,spell:true,cardId:1,bonus:100,survival};
    const battle=new RushBattle([phase],{practice:true,spellIndex:0,invincible:true});
    advance(battle,359);assert.equal(battle.finished,false);advance(battle,1);
    assert.equal(battle.results.length,1);assert.equal(battle.results[0].frames,360);
    assert.equal(battle.results[0].reason,'timeout');assert.equal(battle.results[0].captured,survival);
    // Final-spell death-delay behavior is tested by the boss progression fixture.
    assert.equal(battle.finished,true);
  }
});

test('All three boss catalogs advance through every phase in source order',()=>{
  for(const [boss,phases] of [['sunny',sunnyPhases],['monstone',monstonePhases],['artia',artiaPhases]]){
    const battle=new RushBattle(phases,{boss,difficulty:1,invincible:true});
    for(let i=0;i<phases.length;i++){
      assert.equal(battle.phaseIndex,i,`${boss} phase ${i+1}`);
      battle.phaseFrame=Math.round(battle.phase.time*60)-1;battle.playerAdapter.spell.age.set(battle.phaseFrame);advance(battle,1);
      // Fast-forward only transition/death presentation; gameplay timers remain
      // fixed frames and preserve original phase ordering and lifecycle hooks.
      let guard=500;
      while(!battle.finished&&battle.phaseIndex===i&&--guard)battle.update(0);
      assert.ok(guard>0,`${boss} phase ${i+1} transition stalled`);
    }
    assert.equal(battle.finished,true);assert.equal(battle.boss.alive,false);
    assert.deepEqual(battle.results.map(r=>r.number),phases.map(p=>p.number));
  }
});

// Frozen MSVC /Od /fp:strict oracle output. Regenerate and check all frames with
// node tools/verify-rushboss-numerics.mjs. Source equations: Rand.cpp,
// UserComponent.h and BaseObject.h. Missing original VirtualLib/Lerp is represented
// by an independent float-field V2 adapter and conventional Lerp equation; this
// is not original executable output.
const oracle = {"rng":[{"seed":0,"floats":[[0,1065353216,1057783563],[3197737370,1050253722,1029975240],[3281715200,1134231552,1124428506],[1106247680,1112014848,1111198352],[3296331743,1147219657,1125229668],[0,1086918619,1085046798],[0,1065353216,1057717623],[3197737370,1050253722,1045780984],[3281715200,1134231552,3258799624],[1106247680,1112014848,1110041238],[3296331743,1147219657,1130602652],[0,1086918619,1075483054]],"ints":[[0,15,12],[0,1,1],[-50,50,-36],[-2147483648,2147483647,1478610112],[-2147483648,0,-327900151],[-2147483648,-2147483640,-2147483648],[-1073741824,1073741824,577165042],[3,3,3],[0,15,7],[0,1,0],[-50,50,40],[-2147483648,2147483647,1991416408],[-2147483648,0,-976433780],[-2147483648,-2147483640,-2147483643],[-1073741824,1073741824,977814209],[3,3,3]]},{"seed":5489,"floats":[[0,1065353216,1062244795],[3197737370,1050253722,3193960067],[3281715200,1134231552,1132173132],[1106247680,1112014848,1111149818],[3296331743,1147219657,3292376918],[0,1086918619,1086508396],[0,1065353216,1063899904],[3197737370,1050253722,3190515085],[3281715200,1134231552,1118052384],[1106247680,1112014848,1108387651],[3296331743,1147219657,3293293984],[0,1086918619,1079774443]],"ints":[[0,15,12],[0,1,0],[-50,50,0],[-2147483648,2147483647,1438850937],[-2147483648,0,-1602079444],[-2147483648,-2147483640,-2147483647],[-1073741824,1073741824,-124407839],[3,3,3],[0,15,11],[0,1,1],[-50,50,-28],[-2147483648,2147483647,-951342908],[-2147483648,0,-1338389222],[-2147483648,-2147483640,-2147483643],[-1073741824,1073741824,-396798815],[3,3,3]]},{"seed":123456789,"floats":[[0,1065353216,1057515455],[3197737370,1050253722,1050065464],[3281715200,1134231552,1101615424],[1106247680,1112014848,1106385615],[3296331743,1147219657,3254537216],[0,1086918619,1083280054],[0,1065353216,1060547618],[3197737370,1050253722,3193974726],[3281715200,1134231552,3273042208],[1106247680,1112014848,1110996974],[3296331743,1147219657,1138184606],[0,1086918619,1053455983]],"ints":[[0,15,8],[0,1,0],[-50,50,47],[-2147483648,2147483647,-2090985511],[-2147483648,0,-1567177977],[-2147483648,-2147483640,-2147483644],[-1073741824,1073741824,-803436333],[3,3,3],[0,15,12],[0,1,0],[-50,50,-16],[-2147483648,2147483647,732491363],[-2147483648,0,-113022097],[-2147483648,-2147483640,-2147483643],[-1073741824,1073741824,122545102],[3,3,3]]}],"bodies":[{"initial":[0,1120403456,1133903872,0],"force":[0,0],"drag":[0,0],"samples":[[1,[1084227585,1120403456,1133903872,0]],[2,[1092616193,1120403456,1133903872,0]],[3,[1097859074,1120403456,1133903872,0]],[30,[1125515265,1120403456,1133903872,0]],[60,[1133903873,1120403456,1133903872,0]],[120,[1142292481,1120403456,1133903872,0]],[180,[1147207681,1120403456,1133903872,0]]]},{"initial":[3270508544,1125515264,1132068864,3273654272],"force":[1117782016,3256877056],"drag":[1045220557,1045220557],"samples":[[1,[3269964901,1125341502,1131994144,3273594218]],[2,[3269423698,1125168723,1131920954,3273535263]],[3,[3268884885,1124996908,1131849256,3273477381]],[30,[3222677613,1117261211,1130366071,3272242045]],[60,[1121126996,1093127037,1129399580,3271182629]],[120,[1134120141,3268715141,1128495036,3269274197]],[180,[1140430309,3277123485,1128175996,3268353373]]]},{"initial":[0,0,0,0],"force":[1117126656,3272015872],"drag":[1065353216,1065353216],"samples":[[1,[1017817772,3172571546,1067450369,3222274048]],[2,[1031796387,3185991160,1075836728,3230660632]],[3,[1040180200,3194375452,1081070616,3235371131]],[30,[1091711104,3246625295,1107683367,3262187590]],[60,[1106844515,3261084225,1112354615,3266882177]],[120,[1118850100,3273566974,1114526411,3268836792]],[180,[1125398991,3280299836,1114712413,3269004190]]]},{"initial":[1124859904,1117782016,3281387520,1123024896],"force":[0,3272998912],"drag":[1073741824,1028443341],"samples":[[1,[1124567516,1118037993,3280328753,1122654865]],[2,[1124303608,1118287885,3279002994,1122289785]],[3,[1124052961,1118531759,3277592004,1121928704]],[30,[1117737362,1122947379,3262627204,1109795966]],[60,[1113681957,1123120236,3255993116,3255192725]],[120,[1108983503,1095743206,3229504524,3274772251]],[180,[1108746143,3278105078,3168730449,3281319151]]]},{"initial":[1075042058,3275672060,953267991,3100751639],"force":[1112014848,3259498496],"drag":[1045220557,1050253722],"samples":[[1,[1075100319,3275672970,1062558692,3210042340]],[2,[1075216832,3275674791,1070946186,3218429697]],[3,[1075391590,3275677522,1075838709,3223322014]],[30,[1091286550,3276091741,1103481546,3250893506]],[60,[1104759029,3277282603,1111446688,3258657179]],[120,[1119751911,3280726745,1118443315,3265081672]],[180,[1128356698,3283597237,1121613269,3267113948]]]},{"initial":[3240099840,1101004800,3287941120,3259498496],"force":[1130102784,1124204544],"drag":[1008981770,1063675494],"samples":[[1,[3247578936,1100619757,3287807249,3257942574]],[2,[3251876668,1100282402,3287673616,3256511943]],[3,[3255459366,1099988945,3287540215,3255195012]],[30,[3278164732,1100958100,3284014753,1102785201]],[60,[3284302661,1108494046,3280235441,1109692942]],[120,[3288791446,1120052790,3257366773,1118435970]],[180,[3286963597,1128625789,1127288370,1119881628]]]}],"moves":[{"initial":[0,1132068864,0,1120403456,1125515264,1112014848],"samples":[[1,[0,1131905024,1125515264,1]],[2,[0,1131741184,1125406037,1]],[3,[0,1131579164,1125296810,1]],[20,[0,1129087377,1123160007,1]],[60,[0,1124809106,1117390815,1]],[118,[0,1120403456,1112197580,0]],[180,[0,1120403456,1112197580,0]],[300,[0,1120403456,1112197580,0]]]},{"initial":[3272015872,1117650944,1102053376,1118830592,1125990908,1112014848],"samples":[[1,[3271844386,1117670605,1125990908,1]],[2,[3271672900,1117690266,1125873754,1]],[3,[3271449607,1117709703,1125756600,1]],[20,[3266246884,1118007947,1123844031,1]],[60,[3248396843,1118516327,1117714892,1]],[118,[1102053376,1118830592,1112179614,0]],[180,[1102053376,1118830592,1112179614,0]],[300,[1102053376,1118830592,1112179614,0]]]},{"initial":[1095080346,1128838595,3274565222,1117952410,1138491392,1117126656],"samples":[[1,[1086694895,1128579204,1138491392,1]],[2,[994400256,1128319813,1138094951,1]],[3,[3233809924,1128067554,1137698512,1]],[20,[3266001113,1124722574,1132412625,1]],[60,[3274442354,1118109959,1117908532,1]],[118,[3274565222,1117952410,1117608232,0]],[180,[3274565222,1117952410,1117608232,0]],[300,[3274565222,1117952410,1117608232,0]]]},{"initial":[1127481344,1121714176,3259498496,1117782016,1119092736,1119092736],"samples":[[1,[1127383866,1121688747,1119092736,1]],[2,[1127286388,1121663318,1119092736,1]],[3,[1127188910,1121637889,1119092736,1]],[20,[1125531784,1121205596,1119092736,1]],[60,[1119191830,1120188436,1119092736,1]],[118,[1083151238,1118713554,1119092736,1]],[180,[3259498496,1117782016,1119092736,0]],[300,[3259498496,1117782016,1119092736,0]]]},{"initial":[0,0,1036831949,1036831949,1133903872,1112014848],"samples":[[1,[1036831949,1036831949,1133903872,0]],[2,[1036831949,1036831949,1133903872,0]],[3,[1036831949,1036831949,1133903872,0]],[20,[1036831949,1036831949,1133903872,0]],[60,[1036831949,1036831949,1133903872,0]],[118,[1036831949,1036831949,1133903872,0]],[180,[1036831949,1036831949,1133903872,0]],[300,[1036831949,1036831949,1133903872,0]]]}]};
