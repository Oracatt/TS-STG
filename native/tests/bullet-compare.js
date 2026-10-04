import {Th20BulletField,th20BulletCommand as command} from '../../games/touhou20/src/bullets.js';
import {bulletTestBank,bulletTestStyles} from '../../tests/fixtures/th20-bullet-bank.js';
const memory=new DataView(new ArrayBuffer(4));const bits=value=>{memory.setFloat32(0,value,true);return memory.getUint32(0,true);};
export function verifyBulletVectors(cases) {
 let values=0;
 for(const vector of cases){
  const commands=[command(2,{floats:[.125,.4,0],ints:[9]}),command(3,{floats:[-.03125,.08],ints:[9]}),command(31,{floats:[3,.2,.0625],ints:[9]}),command(4,{floats:[.6,2.5,0],ints:[4,3,0]}),command(6,{floats:[2.75],ints:[3,15]})];
  const field=new Th20BulletField({bank:bulletTestBank(),styles:bulletTestStyles()});field.player={x:70,y:280};
  const [b]=field.emit({x:vector.mode===4?195:0,y:vector.mode===4?-2:100,speed:2,angle:vector.angle,commands:[commands[vector.mode]]});
  b.primaryRate=vector.rate;b.offscreenGrace=99999;
  const flag=[4,8,0x80000000,16,64][vector.mode],motion=b.motion.get(flag);
  for(let frame=0;frame<vector.values.length;frame++){
   field.advance(b);const actual=[...[b.x,b.y,b.vx,b.vy,b.angle,b.speed].map(bits),motion.timer.current,motion.turns??motion.bounces??0];
   for(let i=0;i<actual.length;i++){values++;if(actual[i]!==vector.values[frame][i])throw new Error(`Bullet differential mode=${vector.mode} rate=${vector.rate} angle=${vector.angle} frame=${frame} lane=${i}: ${actual[i]} != ${vector.values[frame][i]}`);}
  }
 }
 return {cases:cases.length,values};
}
