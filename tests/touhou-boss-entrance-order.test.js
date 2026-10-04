import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DrawList} from '@ts-stg/thlib';
import {AnmBank,decodeAnm,TouhouBossPresentation,TouhouRenderQueue,
  TOUHOU_BOSS_ENTRANCE_PRESETS,TOUHOU_BOSS_VIEW} from '@ts-stg/thlib/touhou';

const reference='D:/AIWorkspace/Touhou20Reconstruction';
const available=existsSync('packages/thlib/assets/touhou-common/manifest.json');
const bank=name=>new AnmBank(JSON.parse(readFileSync(`packages/thlib/assets/touhou-common/anm/${name}.json`)),{loadTexture:()=>11});
const presentation=()=>new TouhouBossPresentation({banks:{effect:bank('effect'),front:bank('front'),ascii_960:bank('ascii_960')}});

// Independent recovered archives. Body0 frame0 sets its actual layer after
// named_spawn's provisional EnemyState layer8, so the ANM wins. Stage7 is an
// intentional layer8 variant; a generic preset must allow that override.
const archives=[
  ['st01enm','12e38520fc0c32605054cb27daa6fd9c7923a137a9fbd33ad6243ecf2d225d80',7],
  ['st02enm','225a7720608e673c8e300f0d4c9600bccd952073906d87a26514d15ac89b697f',7],
  ['st03enm','c36b85ec23c27b76a93e7d135c32fdbd46f4b491d798817fd5e1b70e5d5373f3',7],
  ['st04enm','addb94305381f780dd4052e560a662eef4d29cdda83a243bafaad5fb86eb556a',7],
  ['st05enm','2f57757e7aa1896c0937640621b2f0764e2943639c89250de4632f160243d33d',7],
  ['st06enm','a016c1e500e89e3a5cbe475c566be4a9e3333cb42e235037ba10a7f24ea2ba08',7],
  ['st07enm','8dd07887da6ab42c27e438b9fe95f741e4129c5d9b76d6ec20264d739c9e3a85',8],
];
test('independent original Boss archives select layer7 with an explicit Extra layer8 variant',{
  skip:!archives.every(([name])=>existsSync(`${reference}/assets/raw/${name}.anm`))},()=>{
  for(const [name,hash,layer]of archives){
    const bytes=readFileSync(`${reference}/assets/raw/${name}.anm`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
    const source=new AnmBank(decodeAnm(bytes,name));
    const body=source.create(0,{front:true,beforeStart:vm=>vm.layer=8});
    assert.deepEqual([body.layer,body.drawPriority,body.renderFront,body.alpha,body.visible],
      [layer,layer===7?18:20,true,255,true],name);
    source.dispose();
  }
  const ecl=readFileSync(`${reference}/scripts/recovered/ecl/st03bs.ecl.txt`,'utf8');
  assert.match(ecl,/ins_23\(101\);\s+ins_302\(3\);\s+ins_306\(0, 0\);/);
  const attach=readFileSync(`${reference}/source_reconstruction/gameplay/enemy_opcode_animation.cpp`,'utf8');
  assert.match(attach,/env\.spawn\(current_file\(\),script,nullptr,0,add\(std::bit_cast<int>\(s.fields_1c\[6\]\),7\),2\)/);
  const pool=readFileSync(`${reference}/source_reconstruction/sprite_renderer/pool.cpp`,'utf8');
  assert.match(pool,/if\(front\)prepend_animation_link\(destination,a.links\[0\]\);else q::append/);
});

test('external Boss body and trails reproduce source front registration among all 800 mist particles',{
  skip:!available||!existsSync(`${reference}/assets/raw/st03enm.anm`)},()=>{
  const owner=presentation();owner.enter({x:0,y:128,hp:100,alive:true});owner.beginEntrance();
  const original=bank('effect'),sourceBodyBank=new AnmBank(decodeAnm(readFileSync(`${reference}/assets/raw/st03enm.anm`),'st03enm'),{resolveTexture:()=>99});
  const roots=TOUHOU_BOSS_ENTRANCE_PRESETS.blackFog.streams.map(stream=>original.create(stream.script,{x:0,y:128,rotation:stream.rotation,front:true}));
  let body=null;
  for(let frame=0;frame<=192;frame++){
    if(frame===101)body=sourceBodyBank.create(0,{x:0,y:128,front:true,beforeStart:vm=>vm.layer=8});
    if([0,50,100,101,102,120,150,180,192].includes(frame)){
      const source=new TouhouRenderQueue(),actual=new TouhouRenderQueue(),a=new DrawList(),b=new DrawList();
      original.draw(source,TOUHOU_BOSS_VIEW);body?.draw(source,TOUHOU_BOSS_VIEW);
      // Deliberately submit mist first: insertion order cannot put the body
      // above it. Its same-layer ordinary registration follows the body.
      owner.drawEntrance(actual);owner.drawBody(actual,(target,view)=>body?.drawSelf(target,view));
      source.flush(a);actual.flush(b);assert.deepEqual(b.commands,a.commands,`full geometry/blends/order at source frame${frame}`);
      const bodyIndex=b.commands.findIndex(command=>command[0]==='statefulQuad'&&command[1]===99);
      if(frame<101)assert.equal(bodyIndex,-1);
      else{
        assert.ok(bodyIndex>=0,`body frame${frame}`);
        if(frame<=150){
          assert.ok(b.commands.slice(0,bodyIndex).some(command=>command[0]==='statefulQuad'&&command[17][3]==='add'),'source rear glow before body');
          assert.ok(b.commands.slice(bodyIndex+1).some(command=>command[0]==='statefulQuad'&&command[17][3]==='reverseSubtract'),'source black fog obscures the body');
        }
      }
    }
    if(frame<192){original.update();body?.update();owner.update();}
  }
  assert.deepEqual(roots.map(vm=>vm.attachedEffect.spawned),[200,200,200,200]);
  assert.equal(owner.entrance.age,192);assert.equal(owner.entrance.particles.length,0);
  owner.destroy();original.dispose();sourceBodyBank.dispose();
});

test('public external artwork retains caller alpha, supports layer variants and obeys entrance/death visibility',{skip:!available},()=>{
  const owner=presentation(),boss={x:0,y:128,hp:100,alive:true};owner.enter(boss);owner.beginEntrance();
  const body=draw=>draw.rect(300,180,64,64,0xffffff80);
  const hidden=new DrawList();owner.drawBody(hidden,body);assert.deepEqual(hidden.commands,[]);
  for(let i=0;i<101;i++)owner.update();
  const queue=new TouhouRenderQueue(),draw=new DrawList();
  queue.enqueue(7,target=>target.push(['ordinary mist']),{order:1});
  owner.drawBody(queue,(target,view)=>{assert.equal(view,owner.view);target.push(['trail']);body(target);});
  queue.enqueue(7,target=>target.push(['front attached']),{order:-1});queue.flush(draw);
  assert.deepEqual(draw.commands,[['front attached'],['trail'],['rect',300,180,64,64,0xffffff80],['ordinary mist']]);
  const variant=new TouhouRenderQueue();owner.drawBody(variant,body,{layer:8});assert.equal(variant.entries[0].priority,20);
  const plain=new DrawList();owner.drawBody(plain,body);assert.deepEqual(plain.commands,[['rect',300,180,64,64,0xffffff80]]);
  boss.alive=false;owner.drawBody(plain,()=>assert.fail('Dead Boss cannot emit a body'));owner.destroy();
  owner.drawBody(plain,()=>assert.fail('Destroyed presentation cannot emit a body'));
});
