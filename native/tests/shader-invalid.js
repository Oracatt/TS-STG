const fragment='#version 330\nout vec4 finalColor;void main(){finalColor=vec4(1);}';
const shader=tsstg.createShader(fragment);
let mode=0;
globalThis.__tsstg_game={
 update(input){mode=input;},
 render(){
  if(mode===0)return [['shaderBegin',shader,[]]];
  if(mode===1)return [['shaderEnd']];
  if(mode===2)return [['shaderBegin',shader,[]],['shaderBegin',shader,[]],['shaderEnd']];
  if(mode===3)return [['shaderBegin',shader,[['bad','vec2',[1]]]],['shaderEnd']];
  if(mode===4)return [['shaderBegin',shader,[['bad','int',[1.5]]]],['shaderEnd']];
  if(mode===5)return [['shaderBegin',shader,[['bad','float',[1]],['bad','float',[2]]]],['shaderEnd']];
  if(mode===6)return [['alphaTest',.5],['shaderBegin',shader,[]],['shaderEnd']];
  if(mode===7)return [['shaderBegin',shader,[]],['alphaTest',.5],['shaderEnd']];
  if(mode===9)return [['shaderBegin',shader,[]],['statefulQuad',0,[0,0,1,0,0,1,1,1],0,0,1,0,0,0,0,1,1,0xffffffff,0xffffffff,0xffffffff,0xffffffff,false,[.5,'one','zero','add','one','zero','add','point','clamp','clamp']],['shaderEnd']];
  tsstg.unloadShader(shader);return [['shaderBegin',shader,[]],['shaderEnd']];
 },
};
