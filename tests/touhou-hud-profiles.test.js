import test from 'node:test';
import assert from 'node:assert/strict';
import {TouhouHud,TOUHOU_HUD_LABEL_SCRIPTS} from '../packages/thlib/dist/touhou/hud.js';

function fixture(options={}){
  const created=[],text=[];
  const bank={create(script){
    assert.ok(Number.isInteger(script)&&script>=0,'HUD only requests valid animation IDs');
    const vm={scriptId:script,alpha:255,alive:true,x:0,events:[],interrupt(label){this.events.push(label);},update(){},draw(){},destroy(){this.alive=false;}};
    created.push(vm);return vm;
  }};
  const font={draw(_draw,value,settings){text.push({text:value,...settings});}};
  return {hud:new TouhouHud({bank,font,...options}),created,text};
}

test('default HUD keeps the original labels, seven slots, thirds and four-level numeric placement',()=>{
  const {hud,created,text}=fixture();
  assert.deepEqual(created.map(vm=>vm.scriptId),[0,100,76,32,33,34,35,36,37,38,40,41,42,43,44,45,46,...Object.values(TOUHOU_HUD_LABEL_SCRIPTS)]);
  assert.deepEqual(hud.lifeIcons.map(vm=>vm.events),[[2],[2],[7],[3],[3],[3],[3]]);
  hud.draw({}, {power:123,lifeFragments:2,bombFragments:1});
  assert.deepEqual(text.filter(row=>row.y===182||row.y===189).map(row=>[row.text,row.x,row.y]),[['1.',540,182],['23',560,189],['/4.',574,182],['00',606,189]]);
  assert.deepEqual(text.filter(row=>row.y===120||row.y===158).map(row=>[row.text,row.x,row.y]),[['  2',576,120],['/3',597,120],['  1',576,158],['/3',597,158]]);
});

test('unknown identity and difficulty omit their original labels without shifting the Boss pointer root',()=>{
  for(const [character,difficulty]of [['sakuya','lunatic-plus'],[2,99]]){
    const {hud}=fixture({character,difficulty});assert.deepEqual(hud.roots.map(vm=>vm.scriptId),[0,100]);assert.equal(hud.roots[1].scriptId,100);
    hud.update();hud.draw({});hud.destroy();
  }
  const {hud}=fixture({character:'sakuya',difficulty:'custom',characterScript:220,difficultyScript:221});
  assert.deepEqual(hud.roots.map(vm=>vm.scriptId),[0,100,221,220]);
  const omitted=fixture({character:0,difficulty:1,characterScript:null,difficultyScript:null});assert.equal(omitted.hud.roots.length,2);
  assert.deepEqual(fixture({character:1,characterScript:102}).hud.roots.map(vm=>vm.scriptId),[0,100,76,102],'the original character label remains an explicit opt-in');
});

test('custom resource rules display exact power and fractions without using the wrong partial icon art',()=>{
  const {hud,text}=fixture({rules:{maxLives:12,maxBombs:9,maxPower:800,powerPerLevel:200,lifeFragmentThreshold:5,bombFragmentThreshold:4}});
  hud.update({lives:2,bombs:2,lifeFragments:4,bombFragments:3,power:750});
  assert.equal(hud.lifeIcons[2].events.at(-1),7,'five-part fragments are not drawn as two-thirds of a life');
  assert.equal(hud.bombIcons[2].events.at(-1),7);
  hud.draw({}, {lives:2,bombs:2,lifeFragments:4,bombFragments:3,power:750});
  assert.ok(text.some(row=>row.text==='/5'));assert.ok(text.some(row=>row.text==='/4'));
  assert.deepEqual(text.filter(row=>row.y===182||row.y===189).map(row=>row.text),['3.','75','/4.','00']);
  assert.ok(text.some(row=>row.text==='2/12'));assert.ok(text.some(row=>row.text==='2/9'));
});

test('more than seven lives or Bombs keep seven genuine icons and show the actual total numerically',()=>{
  const {hud,text}=fixture({maximumLives:12,maximumBombs:12,lives:10,bombs:11});
  assert.ok(hud.lifeIcons.every(vm=>vm.events.at(-1)===2));assert.ok(hud.bombIcons.every(vm=>vm.events.at(-1)===2));
  hud.draw({}, {lives:10,bombs:11});
  assert.ok(text.some(row=>row.text==='10/12'));assert.ok(text.some(row=>row.text==='11/12'));
  assert.equal(hud.lifeIcons.length,7);assert.equal(hud.bombIcons.length,7);
  const original=fixture();assert.doesNotThrow(()=>original.hud.update({bombs:10,lifeFragments:5}),'source stock overflow and capped extend counters do not crash the frame');
});

test('wide power maxima use one compact numeric row so digits cannot overlap the source denominator slot',()=>{
  const {hud,text}=fixture({maxPower:2000,powerPerLevel:100});hud.draw({}, {power:1234});
  assert.deepEqual(text.filter(row=>row.y===182||row.y===189).map(row=>[row.text,row.alignX]),[['12.34/20.00',2]]);
});
