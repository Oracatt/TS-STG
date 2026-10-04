// Independent portable expansion of the generic quad command ABI. This uses
// only command fields, without animation state or source-game rules.
export function expandQuad(command){
  if(command[0]!=='quad')return command;
  const f=Math.fround,local=command[2],worldX=f(command[3]),worldY=f(command[4]),scale=f(command[5]),x=f(command[6]),y=f(command[7]),vertices=[];
  for(let i=0;i<4;i++){
    let px=f(x+f(f(worldX+f(local[i*2]))*scale)),py=f(y+f(f(worldY+f(local[i*2+1]))*scale));
    if(command[16]){px=f(f(Math.sign(px)*Math.floor(Math.abs(px)+.5))-.5);py=f(f(Math.sign(py)*Math.floor(Math.abs(py)+.5))-.5);}
    vertices.push([px,py,f(command[i&1?10:8]),f(command[i>>1?11:9]),command[12+i]>>>0]);
  }
  return['mesh',command[1],vertices,[0,1,2,1,3,2]];
}

/** Expand the public compact state+geometry ABI into its original commands. */
export function expandStatefulQuad(command){
  if(command[0]!=='statefulQuad')return[command];
  const state=command[17],quad=['quad',...command.slice(1,17)];
  return [['alphaTest',state[0]],['blendFactors',...state.slice(1,7)],
    ...(command[1]?[['sampler',command[1],...state.slice(7,10)]]:[]),
    quad,['blendEnd'],['alphaTest',0]];
}
export function expandDrawCommands(commands,{mesh=false}={}){
  return commands.flatMap(expandStatefulQuad).map(command=>mesh?expandQuad(command):command);
}
