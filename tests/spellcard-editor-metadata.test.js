import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpellMetadata,validateSpellMetadata} from '../tools/spellcard-editor/metadata.js';
import {createSpellCardPreview} from '../tools/spellcard-editor/native-preview.js';

test('editor metadata contains only rehearsal settings and returns independent data',()=>{
  const source=createSpellMetadata(),copy=validateSpellMetadata(source);
  assert.deepEqual(Object.keys(copy),['id','name','duration','hp','seed','boss']);
  assert.deepEqual(copy,source);assert.notEqual(copy,source);assert.notEqual(copy.boss,source.boss);
  copy.boss.x=20;assert.equal(source.boss.x,0);assert.equal(createSpellMetadata().boss.x,0);
});

test('editor metadata rejects event documents, unknown fields and executable accessors',()=>{
  for(const [key,value] of [['format','ts-stg-spellcard'],['version',1],['events',[]],['createSpell',()=>{}]])
    assert.throws(()=>validateSpellMetadata({...createSpellMetadata(),[key]:value}),/unknown field/);
  let evaluated=false;
  const source=createSpellMetadata();Object.defineProperty(source,'name',{get(){evaluated=true;return 'Getter';}});
  assert.throws(()=>validateSpellMetadata(source),/accessors are not data/);assert.equal(evaluated,false);
  assert.throws(()=>validateSpellMetadata({...createSpellMetadata(),boss:{x:0,y:96,radius:10}}),/unknown field/);
});

test('editor metadata validates finite geometry, timing, health and deterministic seed',()=>{
  for(const [key,value] of [['duration',0],['duration',1.5],['duration',36001],['hp',0],['hp',Infinity],
    ['seed',-1],['seed',0x100000000],['seed',.5],['id',''],['name',' ']])
    assert.throws(()=>validateSpellMetadata({...createSpellMetadata(),[key]:value}),new RegExp(`spellCard\\.${key}:`));
  for(const coordinate of ['x','y'])for(const value of [NaN,Infinity,'0'])
    assert.throws(()=>validateSpellMetadata({...createSpellMetadata(),boss:{x:0,y:96,[coordinate]:value}}),/finite number/);
  assert.equal(validateSpellMetadata({...createSpellMetadata(),seed:0xffffffff}).seed,0xffffffff);
});

test('native preview requires an explicit JS factory before allocating resources',()=>{
  assert.throws(()=>createSpellCardPreview({},createSpellMetadata()),/createSpell must be a function/);
});
