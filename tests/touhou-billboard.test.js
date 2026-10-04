import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AnmInstance} from '../packages/thlib/src/touhou/anm.js';
import {projectedAnmBillboard} from '../packages/thlib/src/touhou/anm-projection.js';

// Expected vertices come from unmodified prepare_projected_billboard compiled
// against the OS D3DXVec3Project, not from another implementation of the JS.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/th20/billboard.json',import.meta.url)));
const bits=value=>new Uint32Array(new Float32Array([value]).buffer)[0];
function restore(record){
  const nodes=record.words.map(words=>{
    const vm=Object.create(AnmInstance.prototype);vm.memory=new DataView(new Uint32Array(words).buffer);vm.scriptId=133;
    vm.bank={environment:{},data:{name:'effect',sprites:[],entries:[{width:256,height:256,texture:{width:256,height:256}}]}};
    vm.bank.data.sprites[vm.spriteIndex]={entry:0,x:0,y:0,width:vm.width,height:vm.height};return vm;
  });
  for(let index=0;index<nodes.length;index++){
    nodes[index].parent=nodes[record.links[index][0]]??null;
    nodes[index].transformParent=nodes[record.links[index][1]]??null;
  }
  return nodes;
}

test('billboards match all 2712 original C++/D3DX output words, with no ULP tolerance',()=>{
  assert.equal(fixture.evidence.passed,true);assert.equal(fixture.evidence.cases,216);assert.equal(fixture.evidence.maxUlp,0);
  for(const [index,record]of fixture.cases.entries()){
    const nodes=restore(record),geometry=projectedAnmBillboard(nodes.at(-1),{projection:record.camera});
    assert.deepEqual(geometry.sourceVertices.length?[0,...geometry.sourceVertices.flat().map(bits)]:[-1],record.expected,`source case ${index}`);
    assert.deepEqual(nodes.flatMap(node=>[node.F(0x38),node.F(0x3c),node.F(0x40)]).map(bits),record.expectedRotation,`source rotation state ${index}`);
    assert.equal(geometry.vertices.length,geometry.sourceVertices.length);
    assert.ok(geometry.vertices.every(vertex=>vertex.every(Number.isFinite)));
  }
});

test('a world billboard requires the application stage camera instead of guessing a specific stage',()=>{
  assert.throws(()=>projectedAnmBillboard(restore(fixture.cases[0]).at(-1)),/explicit stage camera/);
});
