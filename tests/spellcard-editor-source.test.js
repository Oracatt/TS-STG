import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTouhouSpellCard} from '@ts-stg/thlib/touhou';
import {generateSpellSource,readVisualDocument,replaceVisualDocument,validateSpellSource,
  VISUAL_BLOCK_START,VISUAL_BLOCK_END} from '../tools/spellcard-editor/source.js';

test('generated source round trips normalized visual data and depends only on public thlib',()=>{
  const document=createTouhouSpellCard(),source=generateSpellSource(document);
  assert.deepEqual(readVisualDocument(source),document);
  assert.match(source,/from '@ts-stg\/thlib\/touhou'/);
  assert.match(source,/export function createSpell\(context\)/);
  assert.doesNotMatch(source,/spellcard-editor\//);
  assert.equal(validateSpellSource(source),source);
});

test('visual edits preserve handwritten imports, functions and comments exactly, including CRLF',()=>{
  let source=generateSpellSource(createTouhouSpellCard());
  source=`// personal header\nimport {TouhouRNG} from '@ts-stg/thlib/touhou';\n${source}\nfunction extra() { return 'do not rewrite'; }\n`;
  source=source.replace('timeline.update();','extra();\n      timeline.update();').replace(/\n/g,'\r\n');
  const endOfStart=source.indexOf('\n',source.indexOf(VISUAL_BLOCK_START))+1;
  const beginningOfEnd=source.indexOf(VISUAL_BLOCK_END);
  const document={...createTouhouSpellCard(),name:'手写代码保留',seed:0xffffffff};
  const replaced=replaceVisualDocument(source,document);
  assert.equal(replaced.slice(0,endOfStart),source.slice(0,endOfStart));
  assert.equal(replaced.slice(replaced.indexOf(VISUAL_BLOCK_END)),source.slice(beginningOfEnd));
  assert.doesNotMatch(replaced,/(?<!\r)\n/);
  assert.deepEqual(readVisualDocument(replaced),document);
});

test('custom metadata expressions remain executable source-only text, never evaluated or overwritten',()=>{
  const source=generateSpellSource(createTouhouSpellCard()).replace('"duration": 1800','"duration": globalThis.__spellSourceTest()');
  let calls=0;globalThis.__spellSourceTest=()=>{calls++;return 1800;};
  try{
    assert.equal(readVisualDocument(source),null);
    assert.throws(()=>replaceVisualDocument(source,createTouhouSpellCard()),/custom JavaScript/);
    assert.equal(validateSpellSource(source),source);
    assert.equal(calls,0);
  }finally{delete globalThis.__spellSourceTest;}
});

test('missing, duplicate, reversed and malformed blocks cannot trigger a destructive visual rewrite',()=>{
  const source=generateSpellSource(createTouhouSpellCard());
  for(const broken of [
    source.replace(VISUAL_BLOCK_START,''),
    `${VISUAL_BLOCK_START}\n${source}`,
    `${source}\n${VISUAL_BLOCK_END}`,
    `${VISUAL_BLOCK_END}\n${VISUAL_BLOCK_START}\n`,
    source.replace('export const spellCard =','const spellCard ='),
    source.replace('"version": 1','"version": 500'),
    source.replace('"events": [','"events": [someFunction(),'),
    source.replace(';\n'+VISUAL_BLOCK_END,';\n// hand-written metadata note\n'+VISUAL_BLOCK_END),
  ]){
    assert.equal(readVisualDocument(broken),null);
    assert.throws(()=>replaceVisualDocument(broken,createTouhouSpellCard()));
  }
  assert.equal(readVisualDocument('export const spellCard = makeMyCard();'),null);
});

test('source transport validates types and the UTF-8 byte budget without parsing JavaScript',()=>{
  assert.throws(()=>validateSpellSource({}),TypeError);
  assert.throws(()=>validateSpellSource('a'.repeat(1024*1024+1)),RangeError);
  assert.throws(()=>validateSpellSource('灵'.repeat(350000)),RangeError);
  assert.throws(()=>validateSpellSource('💫'.repeat(270000)),RangeError);
  assert.equal(validateSpellSource('syntax is edited temporarily {'),'syntax is edited temporarily {');
  assert.equal(readVisualDocument(null),null);
});

test('marker text inside comments, templates and functions never identifies editable metadata',()=>{
  const source=generateSpellSource(createTouhouSpellCard());
  const block=source.slice(source.indexOf(VISUAL_BLOCK_START),source.indexOf(VISUAL_BLOCK_END)+VISUAL_BLOCK_END.length);
  for(const container of [
    `/*\n${block}\n*/\nexport const spellCard = makeCard();`,
    'const text = `\n'+block+'\n`;\nexport const spellCard = makeCard();',
    'const text = `${`\n'+block+'\n`}`;\nexport const spellCard = makeCard();',
    `function example() {\n${block}\n}\nexport const spellCard = makeCard();`,
  ]){
    assert.equal(readVisualDocument(container),null);
    assert.throws(()=>replaceVisualDocument(container,createTouhouSpellCard()));
  }
  const helpers='const matcher = /[`\'"]+/;\nfunction half(x) { return x / 2; }\nconst note = `value ${half(6)}`;\n';
  const annotated=helpers+source+'\n/*\n'+block+'\n*/';
  assert.deepEqual(readVisualDocument(annotated),createTouhouSpellCard());
  const changed=replaceVisualDocument(annotated,{...createTouhouSpellCard(),name:'changed'});
  assert.ok(changed.startsWith(helpers));assert.ok(changed.endsWith('/*\n'+block+'\n*/'));
});

test('generated module executes visual events and handwritten functions through thlib, then stops',async()=>{
  const document={...createTouhouSpellCard(),duration:4,events:[{id:'sound',type:'sound',frame:1,enabled:true,sound:6}]};
  let source=generateSpellSource(document);
  source=source.replace('timeline.update();','customStep(context, frame);\n      timeline.update();');
  source+='\nfunction customStep(context, frame) {\n  if (frame % 2 === 0) for (let i = 0; i < 3; i++) context.sound(20 + i);\n}\n';
  await mkdir('build',{recursive:true});
  const folder=await mkdtemp(join(process.cwd(),'build','spellcard-source-test-'));
  try{
    const path=join(folder,'test.spell.js');await writeFile(path,source,'utf8');
    const module=await import(pathToFileURL(path).href),sounds=[];
    assert.deepEqual(module.spellCard,document);
    const run=module.createSpell({boss:{x:0,y:96},sound:id=>sounds.push(id)});
    run.update();run.update();run.update();run.update();run.update();
    assert.deepEqual(sounds,[20,21,22,6,20,21,22]);
    assert.equal(run.frame,4);assert.equal(run.alive,false);assert.equal(run.completed,true);
    assert.equal(run.snapshot().frame,4);
    const stopped=module.createSpell({boss:{x:0,y:96},sound:id=>sounds.push(id)});
    stopped.stop();stopped.update();assert.equal(stopped.frame,0);assert.equal(stopped.alive,false);
  }finally{await rm(folder,{recursive:true,force:true});}
});
