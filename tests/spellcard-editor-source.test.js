import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTouhouSpellCard,validateTouhouSpellCard} from '@ts-stg/thlib/touhou';
import {generateSpellSource,validateSpellSource} from '../tools/spellcard-editor/source.js';

async function moduleFrom(source,callback){
  await mkdir('build',{recursive:true});
  const folder=await mkdtemp(join(process.cwd(),'build','spellcard-source-test-'));
  try{
    const path=join(folder,'test.spell.js');await writeFile(path,source,'utf8');
    return await callback(await import(pathToFileURL(path).href));
  }finally{await rm(folder,{recursive:true,force:true});}
}

test('new source directly executes editable JavaScript rings without managed data or a timeline dependency',async()=>{
  const source=generateSpellSource();
  assert.doesNotMatch(source,/spellcard-editor:|TouhouSpellCardTimeline|^import /m);
  await moduleFrom(source,module=>{
    assert.deepEqual(validateTouhouSpellCard(module.spellCard).events,[]);
    assert.equal(module.spellCard.id,createTouhouSpellCard().id);
    const emitted=[],context={boss:{x:7,y:103},bullets:{emit:parameters=>emitted.push(parameters)}};
    const run=module.createSpell(context);
    for(let frame=0;frame<61;frame++)run.update();
    assert.equal(emitted.length,1);assert.equal(emitted[0].count,24);assert.equal(emitted[0].angle,0);
    assert.equal(emitted[0].x,7);assert.equal(emitted[0].y,103);
    context.boss.x=20;
    for(let frame=61;frame<91;frame++)run.update();
    assert.equal(emitted.length,2);assert.equal(emitted[1].x,20);assert.equal(emitted[1].angle,0.12);
    for(let frame=91;frame<module.spellCard.duration;frame++)run.update();
    assert.equal(run.frame,1800);assert.equal(run.alive,false);assert.equal(run.completed,true);
    assert.deepEqual(run.snapshot(),{frame:1800,alive:false,completed:true,documentId:module.spellCard.id});
    const count=emitted.length;run.update();assert.equal(emitted.length,count);
    const stopped=module.createSpell(context);stopped.stop();stopped.update();
    assert.equal(stopped.frame,0);assert.equal(stopped.completed,false);
  });
});

test('ordinary source edits change execution without extracting or rewriting any metadata',async()=>{
  const source=generateSpellSource().replace('count: 24','count: 7').replace('frame % 30 === 0','frame % 15 === 0');
  await moduleFrom(source,module=>{
    const emitted=[],run=module.createSpell({boss:{x:0,y:96},bullets:{emit:p=>emitted.push(p)}});
    for(let frame=0;frame<91;frame++)run.update();
    assert.deepEqual(emitted.map(p=>p.count),[7,7,7]);
  });
});

test('legacy JSON conversion preserves existing events and supports custom functions in the same module',async()=>{
  const document=validateTouhouSpellCard({...createTouhouSpellCard(),duration:4,events:[{id:'sound',type:'sound',frame:1,sound:6}]});
  let source=generateSpellSource(document);
  assert.match(source,/from '@ts-stg\/thlib\/touhou'/);assert.doesNotMatch(source,/spellcard-editor:/);
  source=source.replace('timeline.update();','customStep(context, frame);\n      timeline.update();');
  source+='\nfunction customStep(context, frame) {\n  if (frame % 2 === 0) for (let i = 0; i < 3; i++) context.sound(20 + i);\n}\n';
  await moduleFrom(source,module=>{
    assert.deepEqual(module.spellCard,document);
    const sounds=[],run=module.createSpell({boss:{x:0,y:96},sound:id=>sounds.push(id)});
    run.update();run.update();run.update();run.update();run.update();
    assert.deepEqual(sounds,[20,21,22,6,20,21,22]);
    assert.equal(run.frame,4);assert.equal(run.alive,false);assert.equal(run.completed,true);
  });
});

test('importing an empty legacy document remains empty rather than adding template attacks',async()=>{
  const document=validateTouhouSpellCard({...createTouhouSpellCard(),duration:3,events:[]});
  await moduleFrom(generateSpellSource(document),module=>{
    const run=module.createSpell({boss:{x:0,y:96}});
    for(let i=0;i<3;i++)run.update();
    assert.equal(run.completed,true);assert.equal(run.frame,3);
  });
});

test('source transport preserves text and accepts incomplete JavaScript within its UTF-8 byte budget',()=>{
  assert.throws(()=>validateSpellSource({}),TypeError);
  assert.throws(()=>validateSpellSource('a'.repeat(1024*1024+1)),RangeError);
  assert.throws(()=>validateSpellSource('灵'.repeat(350000)),RangeError);
  assert.throws(()=>validateSpellSource('💫'.repeat(270000)),RangeError);
  const source='// unchanged\r\nexport const spellCard = makeCard();\r\nfunction partiallyWritten( {';
  assert.equal(validateSpellSource(source),source);
});

test('the browser source helper has no thlib runtime or renderer evaluation dependency',async()=>{
  const helper=await readFile(new URL('../tools/spellcard-editor/source.js',import.meta.url),'utf8');
  assert.doesNotMatch(helper,/^import /m);
  assert.doesNotMatch(helper,/\beval\s*\(|new Function\s*\(/);
});
