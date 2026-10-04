// Frozen pre-optimization animation tick. This deliberately keeps instruction
// lookup/dispatch and per-tick flag checks, to validate the idle fast path.
import {add,sub,f32,wrapAngle} from '../../../packages/thlib/src/touhou/math.js';
import {UnsupportedAnmError} from '../../../packages/thlib/src/touhou/anm-vm.js';
const interpolationOrder=['position','rgb','alpha','scale','scale2','uvScale','rotation','rotationZ','rgb2','alpha2','uvSpeedX','uvSpeedY'];
export function referenceExecuteFrame(){
  if(!this.alive||this.stopped)return;
  const script=this.bank.scripts[this.scriptId],offsets=this.bank.offsets[this.scriptId];
  if(this.pendingInterrupt!==0){
    let label=script.instructions.find(ins=>ins.opcode===5&&(ins.args[0]|0)===this.pendingInterrupt);
    if(!label)label=script.instructions.find(ins=>ins.opcode===5&&ins.args[0]===0xffffffff);
    this.pendingInterrupt=0;
    if(label){this.returnTime=this.time;this.returnPc=this.pc;this.time=label.time;this.pc=label.offset+label.size;this.visible=true;}
  }
  let budget=100000;
  while(true){
    if(--budget===0)throw new Error(`ANM synchronous instruction budget exceeded: ${this.bank.data.name}:${this.scriptId}`);
    const index=offsets.get(this.pc),ins=script.instructions[index];
    if(!ins)throw new Error(`ANM jump does not target an instruction: ${this.pc}`);
    if(this.time<ins.time)break;
    const flow=this.dispatch(ins);
    if(flow==='stop')return;
    if(flow==='wait')break;
    if(flow==='advance')this.pc+=ins.size;
  }
  if(this.U(0x49c)&0x80000){
    for(let i=0;i<3;i++)if(this.F(0x44+i*4)!==0)this.F(0x38+i*4,wrapAngle(add(this.F(0x38+i*4),this.F(0x44+i*4))));
    for(const i of[1,0])if(this.F(0x60+i*4)!==0)this.F(0x50+i*4,add(this.F(0x50+i*4),this.F(0x60+i*4)));
    for(let i=0;i<2;i++)if(this.F(0x3a0+i*4)!==0){let value=add(this.F(0x78+i*4),this.F(0x3a0+i*4));if(value<2){if(value<0)value=add(value,2);}else value=sub(value,2);this.F(0x78+i*4,value);}
  }
  if(this.B(0x4a1)&2)throw new UnsupportedAnmError(this,'camera-offset accumulation');
  if(this.U(0x49c)&0x800)throw new UnsupportedAnmError(this,'corner snapshot motion');
  if(this.interpolations.size)for(const key of interpolationOrder){
    const track=this.interpolations.get(key);if(!track||!track.value.duration)continue;
    const returned=track.value.sample(1,false),values=track.rgb?track.value.current:returned;
    for(let i=0;i<track.count;i++)if(track.bytes)this.B(track.address+i,values[i]);else this.F(track.address+i*4,values[i]);
    if(!track.value.duration)this.interpolations.delete(key);
  }
  this.time=add(this.time,1);
}
