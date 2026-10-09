import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {DrawList} from '@ts-stg/thlib';
import {createTouhouResources,TouhouLaserField} from '@ts-stg/thlib/touhou';
import {anmSpriteVertices} from '../packages/thlib/dist/touhou/anm-render.js';

const available=existsSync('packages/thlib/assets/touhou-common/manifest.json');
function fixture(){
  let handle=1;
  const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>handle++,createRenderTarget:()=>handle++,unloadTexture(){}});
  const bank=resources.createBank('bullet'),field=new TouhouLaserField({bank,styles:resources.styles});
  return{field,dispose(){bank.dispose();resources.dispose();}};
}
const quadColors=vm=>anmSpriteVertices(vm).map(vertex=>vertex[4]);
const rgba=argb=>(((argb&0xffffff)<<8)|(argb>>>24))>>>0;

test('source straight/infinite laser grazing replaces body tint, clamps after56 contacts and restores it on departure',{skip:!available},()=>{
  // Source type0/type1_collision.cpp writes ANM color mode1 with ARGB
  // ff,ff,clamp(208-2*contactFrames,96,240),80. quad.cpp selects that
  // secondary color directly; these literal checkpoints also cover rendering.
  for(const kind of [0,1]){
    const {field,dispose}=fixture();
    try{
      const laser=field.spawnDriven(kind,{x:-80,y:180,width:20,length:160,type:0,color:4,speed:0});
      let response=2,grazes=0;
      const player={x:0,y:202,collisionRectangle:()=>response,addGraze:()=>grazes++};
      field.update(player);
      assert.equal(laser.animation.flashColor,0xffffce80);
      assert.deepEqual(quadColors(laser.animation),Array(4).fill(0xffce80ff));
      assert.equal(laser.origin.flashColor,null,'only the beam body changes, not its origin');
      if(laser.tip)assert.equal(laser.tip.flashColor,null,'the moving tip keeps its own source colors');
      for(let frame=1;frame<8;frame++)field.update(player);
      assert.deepEqual(quadColors(laser.animation),Array(4).fill(0xffc080ff));
      for(let frame=8;frame<64;frame++)field.update(player);
      assert.deepEqual(quadColors(laser.animation),Array(4).fill(0xff6080ff));
      assert.equal(grazes,8,'tint updates each contact frame while graze awards repeat every8');
      response=0;field.update(player);
      assert.equal(laser.animation.flashColor,null);assert.equal(laser.touching,0);
      assert.deepEqual(quadColors(laser.animation),Array(4).fill(rgba(laser.animation.color)));
      response=2;field.update(player);
      assert.deepEqual(quadColors(laser.animation),Array(4).fill(0xffce80ff));
      laser.activeMask=0x200000000n;field.update(player);
      assert.equal(laser.animation.flashColor,null,'source extended command33 suppresses color only');
      assert.deepEqual(quadColors(laser.animation),Array(4).fill(rgba(laser.animation.color)));
      assert.equal(laser.grazeTimer.current,66);assert.equal(grazes,9);
    }finally{dispose();}
  }
});

test('source curved laser grazing preserves white mesh vertices and original palette',{skip:!available},()=>{
  // Source type2_collision.cpp has no color override; type2_frame.cpp::draw
  // assigns literal0xffffffff to every ribbon vertex regardless of graze.
  const {field,dispose}=fixture();
  try{
    const laser=field.spawnDriven(2,{x:80,y:180,width:20,count:16,type:0,color:4,speed:8,time:16});
    let grazes=0;
    const player={x:40,y:202,collisionRectangle:()=>2,addGraze:()=>grazes++};
    for(let frame=0;frame<64;frame++){
      field.update(player);
      assert.equal(laser.flashColor,null);assert.equal(laser.animation.flashColor,null);
      const draw=new DrawList();field.draw(draw,{x:0,y:0,scale:1});
      const mesh=draw.commands.find(command=>command[0]==='mesh');
      assert.ok(mesh);assert.ok(mesh[2].every(vertex=>vertex[4]===0xffffffff));
    }
    assert.equal(grazes,8);assert.equal(laser.p.color,4);
  }finally{dispose();}
});
