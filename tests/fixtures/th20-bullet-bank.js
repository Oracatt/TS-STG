// Small authored ANM test double: isolates source bullet state from asset scripts.
export function bulletTestBank() {
  const bank={instances:[],data:{sprites:[{width:8,height:8}]}};
  bank.create=(scriptId,options={})=>{
    const words=new Map(),interrupts=[];
    const vm={scriptId,...options,alive:true,interrupts,updates:0,spriteIndex:0,width:8,height:8,orientation:0,interpolations:new Map(),
      U(offset,value){if(value!==undefined)words.set(offset,value>>>0);return words.get(offset)??0;},
      F(offset,value){if(value!==undefined)words.set(offset,Math.fround(value));return words.get(offset)??0;},
      B(offset,value){return this.U(offset,value);},flag(){},interrupt(label){interrupts.push(label);},
      update(){this.updates++;},destroy(){this.alive=false;},draw(draw){draw.push(['test',scriptId]);},
      interpolate(key,address,count,end,duration,mode){this.interpolations.set(key,{address,count,end,duration,mode});},
      snapshot(){return {scriptId,alive:this.alive,updates:this.updates};}};
    bank.instances.push(vm);return vm;
  };
  return bank;
}
export function bulletTestStyles() { return Array.from({length:50},(_,type)=>({type,script:type,childScript:0,drawGroup:5,radius:2,cancelType:0,colors:Array.from({length:16},(_,c)=>[c,0,0,6,0xffffffff])})); }
