import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createTouhouResources,TouhouLaserField} from '@ts-stg/thlib/touhou';

const available=existsSync('packages/thlib/assets/touhou-common/manifest.json');
// Visible particle RGB in bullet.anm, independent of the owner's script lookup.
const sixteen=[0xc0c0c0,0x800808,0xff0808,0x800880,0xe008e0,0x3030c0,0x5050ff,0x08a0a0,
  0x08e0e0,0x08d008,0x08ff08,0x80ff30,0xc0c008,0xffff08,0xffd008,0xffffff];
const eight=[0xc0c0c0,0xff1515,0xe020e0,0x5050ff,0x08e0e0,0x08ff08,0xffff08,0xffffff];
const four=[0xff1010,0x8008ff,0x08ff08,0xffff08];
const styles=[[0,sixteen],[1,sixteen],[2,sixteen],[17,[sixteen[4],sixteen[0],sixteen[1]]],
  [18,eight],[25,[eight[2]]],[26,[eight[1]]],[27,[eight[3]]],[28,[eight[6]]],
  [30,eight],[31,eight],[32,four],[33,eight],[34,sixteen],[38,sixteen]];
const fragments=vm=>[...(vm.visible&&vm.spriteIndex>=540&&vm.spriteIndex<=547?[vm]:[]),...vm.children.flatMap(fragments)];

for(const kind of [0,1,2])for(const method of ['circle','rectangle','erase','hit'])
  test(`laser kind${kind} ${method} cancellation preserves every supported palette color`,{skip:!available},()=>{
    const resources=createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1,unloadTexture(){}});
    try{
      for(const [type,colors] of kind===2?[[0,sixteen],[1,sixteen]]:styles)for(const [color,rgb] of colors.entries()){
        const bank=resources.createBank('bullet'),field=new TouhouLaserField({bank,styles:resources.styles});
        try{
          const laser=field.spawnDriven(kind,{x:0,y:100,type,color,width:16,length:96,count:24,speed:0});
          if(kind===2)field.updateDrivenCurve(laser,Array.from({length:24},(_,i)=>({
            position:{x:-i*8,y:100,z:0},velocity:{x:8,y:0,z:0},angle:0,speed:8})));
          field.update();
          if(method==='circle')assert.ok(field.cancelCircle(0,100,256)>0);
          else if(method==='rectangle')assert.ok(field.cancelRectangle(0,100,512,512)>0);
          else if(method==='erase')field.erase(laser);
          else field.update({x:0,y:100,collisionRectangle:()=>1});
          assert.ok(field.effects.length>0,`type${type} color${color}: cancellation creates effects`);
          for(const effect of field.effects){
            // Parent animations delay their first fragments by up to seven frames.
            for(let frame=0;frame<16;frame++)effect.update();
            const visible=fragments(effect);
            assert.ok(visible.length>0,`type${type} color${color}: visible fragments`);
            assert.ok(visible.every(vm=>vm.color>>>8===rgb),
              `type${type} color${color}: expected ${rgb.toString(16)}, got ${visible.map(vm=>(vm.color>>>8).toString(16))}`);
          }
        }finally{bank.dispose();}
      }
    }finally{resources.dispose();}
  });
