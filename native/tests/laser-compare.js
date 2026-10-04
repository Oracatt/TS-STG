import {th20CurveSample} from '../../games/touhou20/src/lasers.js';
import {f32,sub,polar} from '../../games/touhou20/src/math.js';
const memory=new DataView(new ArrayBuffer(4)),bits=value=>{memory.setFloat32(0,value,true);return memory.getUint32(0,true);};
export function verifyLaserVectors(cases){let values=0;for(const test of cases){
 const angle=f32(test.angle),node={begin:0,end:999999,kind:test.mode===0?0:test.mode===3?2:1,position:{x:12.25,y:-8.5,z:f32(.1)},direction:{...polar(angle,1),z:0},angle,speed:2.5,acceleration:.125,angularAcceleration:test.mode===1?-999:f32(.071)};
 const zero={position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},angle:0,speed:0};let previous=zero;
 for(let frame=0;frame<test.values.length;frame++){const actual=th20CurveSample([node],sub(test.time,frame),previous,frame>0,zero);previous=actual;const lanes=[actual.position.x,actual.position.y,actual.position.z,actual.speed,actual.angle].map(bits);
  for(let i=0;i<lanes.length;i++){values++;if(lanes[i]!==test.values[frame][i])throw new Error(`Curve reference mismatch mode=${test.mode} angle=${test.angle} time=${test.time} frame=${frame} lane=${i}: ${lanes[i]} != ${test.values[frame][i]}`);}
 }
}return{cases:cases.length,values};}
