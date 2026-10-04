import assert from 'node:assert/strict';

// Mirror native platform scope constraints, applied to actual application output
// rather than a stubbed renderer. Stateful ANM quads carry their own blend state.
export function assertRenderScopes(commands,context='render') {
  let blend=false,target=false,shader=false,scissor=false;
  for(let i=0;i<commands.length;i++){
    const [kind]=commands[i],message=`${context}: command ${i} ${kind}`;
    if(kind==='blend'||kind==='blendFactors'){assert.equal(blend,false,`${message}: nested blend`);blend=true;}
    else if(kind==='blendEnd'){assert.equal(blend,true,`${message}: unmatched blendEnd`);blend=false;}
    else if(kind==='statefulQuad')assert.equal(blend,false,`${message}: ANM quad inside external blend`);
    else if(kind==='targetBegin'){assert.equal(target||blend||scissor,false,`${message}: target crosses scope`);target=true;}
    else if(kind==='targetEnd'){assert.equal(target,true,`${message}: missing target`);assert.equal(blend||scissor,false,`${message}: target crosses scope`);target=false;}
    else if(kind==='shaderBegin'){assert.equal(shader,false,`${message}: nested shader`);shader=true;}
    else if(kind==='shaderEnd'){assert.equal(shader,true,`${message}: unmatched shaderEnd`);shader=false;}
    else if(kind==='scissor'){assert.equal(scissor,false,`${message}: nested scissor`);scissor=true;}
    else if(kind==='scissorEnd'){assert.equal(scissor,true,`${message}: unmatched scissorEnd`);scissor=false;}
  }
  assert.equal(blend||target||shader||scissor,false,`${context}: unterminated scope`);
}
