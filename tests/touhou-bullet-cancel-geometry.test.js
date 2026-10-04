import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {DrawList} from '@ts-stg/thlib';
import {AnmBank,anmSpriteVertices,createTouhouResources,createTouhouBulletCancelAnimation,
  TouhouLaserField,TouhouRNG} from '@ts-stg/thlib/touhou';
import {RushBulletVisuals} from '../games/rushboss/src/bullet-visuals.js';
import {BULLET_STYLES} from '../games/rushboss/src/bullet-styles.js';

const path='packages/thlib/assets/touhou-common/anm/bullet.json';
const optional={skip:!existsSync(path)||process.env.TS_STG_TEST_STATIC_ASSETS==='1'};
const view={x:336,y:24,scale:1.5,screenScale:1};
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<.0001,`${message}: ${actual} != ${expected}`);
const edge=vertices=>Math.hypot(vertices[1][0]-vertices[0][0],vertices[1][1]-vertices[0][1]);
const data=()=>JSON.parse(readFileSync(path,'utf8'));
const bank=()=>new AnmBank(data(),{loadTexture:()=>1,rng:new TouhouRNG(123)});

// Recovered bullet.anm: sprite540..547 are62x62; scripts171/172,
// 219/220,258/259,282/283 provide the four source size/duration families.
// Use edge length, not an axis-aligned box: the source rotates each quad.
test('cancel fragments retain original62-unit sprites and source scales at every visible frame',optional,()=>{
  const b=bank();
  try{
    for(let id=540;id<=547;id++)assert.deepEqual([b.data.sprites[id].width,b.data.sprites[id].height],[62,62]);
    for(const [script,start,end,duration,alpha,blend] of [
      [171,.3,.42,16,64,0],[172,.3,.45,16,224,1],
      [219,.5,.7,24,64,0],[220,.5,.75,24,224,1],
      [258,.8,1.12,24,64,0],[259,.8,1.2,24,224,1],
      [282,1,1.4,32,64,0],[283,1,1.5,32,224,1],
    ]){
      const vm=b.create(script);
      for(let frame=0;frame<duration;frame++){
        assert.equal(vm.alive,true);assert.equal(vm.scale2X,1);assert.equal(vm.scale2Y,1);
        assert.equal(vm.alpha,alpha);assert.equal(vm.B(0x499),blend);
        const scale=Math.fround(Math.fround(start)+Math.fround(Math.fround(Math.fround(end)-Math.fround(start))*Math.fround((frame+1)/duration)));
        near(vm.scaleX,scale,`script${script} frame${frame} source scale`);
        near(edge(anmSpriteVertices(vm,view)),62*scale*1.5,`script${script} frame${frame} screen edge`);
        vm.update();
      }
      assert.equal(vm.alive,false,`script${script} must retire at${duration}`);
    }
  }finally{b.dispose();}
});

test('Rush cancellation keeps the scaled body while its independent fragments keep source size',optional,()=>{
  const shared=createTouhouResources({readText:f=>readFileSync(f,'utf8'),loadTexture:()=>1});
  const visuals=new RushBulletVisuals(shared,{yOffset:224,commonOnly:true});
  try{
    for(const scale of [.375,1,2]){
      const actor={kind:'XiaoYu',color:3,x:12,y:20,vx:0,vy:0,size:BULLET_STYLES.XiaoYu.size*scale,
        alpha:.5,tint:[1,.5,0],rotation:.7,delay:0,alive:true,group:'bullet'};
      const visual=visuals.create(actor);actor.alive=false;actor.destroyReason='cancel';
      // No preceding draw: correct cancellation cannot depend on whether the
      // render loop happened to visit this actor before it was cancelled.
      visuals.finishEntity(actor);
      const vm=visual.animation,sourceColor=vm.color,sourceAlpha=vm.alpha;
      const draw=new DrawList();visuals.drawEffects(draw,view);
      assert.equal(vm.scale2X,scale);assert.equal(vm.scale2Y,scale);
      near(edge(anmSpriteVertices(vm,view)),14*.99609375*scale*1.5,'cancelled body edge');
      assert.equal(vm.color,sourceColor);assert.equal(vm.alpha,sourceAlpha);
      const quad=draw.commands.find(command=>command[0]==='quad'||command[0]==='statefulQuad');
      assert.ok(quad);assert.equal(quad[12]&255,127,'business fade survives on the retiring body');
      const effect=visuals.effects.at(-1);assert.equal(effect.scriptId,221);assert.equal(effect.scale2X,1);
      for(let frame=0;!effect.children.length&&frame<20;frame++)effect.update();
      const child=effect.children.find(c=>c.scriptId===219);assert.ok(child);
      near(edge(anmSpriteVertices(child,view)),62*child.scaleX*1.5,'independent fragment edge');
      visuals.dispose();
    }
  }finally{visuals.dispose();shared.dispose();}
});

test('source laser cancellation samples use their ANM dimensions independently of beam width',optional,()=>{
  const b=bank(),shared=createTouhouResources();
  try{
    for(const kind of [0,1,2]){
      const results=[];
      for(const width of [4,80]){
        b.rng=new TouhouRNG(123);
        const field=new TouhouLaserField({bank:b,styles:shared.styles});
        const laser=field.spawnDriven(kind,{x:0,y:128,angle:0,type:0,color:0,width,length:160,count:40});
        if(kind===2)laser.samples.forEach((s,i)=>{s.position={x:i*2,y:128,z:0};});
        const count=field.erase(laser,{check:false});
        // type2 erase returns0 and emits every third node (localized curve
        // cancellation uses every twentieth node instead).
        assert.equal(count,kind===2?0:9);
        assert.equal(field.effects.length,kind===2?14:9);
        results.push(field.effects.map(vm=>({script:vm.scriptId,x:vm.x,y:vm.y,scale:vm.scaleX,scale2:vm.scale2X})));
        assert.ok(field.effects.every(vm=>vm.scriptId===212&&vm.scale2X===1));
        field.retire(laser);for(const vm of field.effects)vm.destroy();
      }
      assert.deepEqual(results[0],results[1],`kind${kind} must not copy beam width into cancel fragments`);
    }
  }finally{b.dispose();shared.dispose();}
});

const originalPath='games/touhou20/assets/anm/bullet.json';
test('public cancel roots and children match unfiltered source ANM commands for normal and kind1 cancellation',
  {skip:optional.skip||!existsSync(originalPath)},()=>{
    const common=bank(),original=new AnmBank(JSON.parse(readFileSync(originalPath,'utf8')),{loadTexture:()=>1,rng:new TouhouRNG(123)});
    try{
      // The source tables select these families for dots, small bullets,
      // medium/large bullets and laser fragments. Match the rendered commands
      // as well as every frame of the complete random child-spawn sequence.
      for(const script of [173,212,221,260,269,284])for(const cancelKind of [0,1]){
        const actual=createTouhouBulletCancelAnimation(common,script,{x:10,y:100,cancelKind});
        const expected=original.create(script,{x:10,y:100});
        if(cancelKind===1)expected.interrupt(3,true);
        for(let frame=0;frame<90;frame++){
          const a=new DrawList(),e=new DrawList();actual.draw(a,view);expected.draw(e,view);
          assert.deepEqual(a.commands,e.commands,`script${script} kind${cancelKind} frame${frame}`);
          assert.equal(actual.alive,expected.alive);actual.update();expected.update();
        }
        actual.destroy();expected.destroy();
      }
    }finally{common.dispose();original.dispose();}
  });
