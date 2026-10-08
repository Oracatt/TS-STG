import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AnmBank} from '../packages/thlib/src/touhou/anm.js';
import {anmSpriteVertices} from '../packages/thlib/src/touhou/anm-render.js';
import {TouhouBitmapFont} from '../packages/thlib/src/touhou/font.js';
import {TouhouHud,TOUHOU_HUD_LAYOUT,TOUHOU_HUD_LABEL_SCRIPTS} from '../packages/thlib/src/touhou/hud.js';
import {TouhouRenderQueue} from '../packages/thlib/src/touhou/render-queue.js';
import {DrawList} from '../packages/thlib/src/render.js';

const data=name=>JSON.parse(fs.readFileSync(new URL(`../packages/thlib/assets/touhou-common/anm/${name}.json`,import.meta.url)));
const advance=(hud,count=100)=>{for(let frame=0;frame<count;frame++)hud.update();};
function fixture(options={}){
  const values=[],bank=new AnmBank(data('front'),{loadTexture:()=>11});
  const font={draw(draw,value,settings){
    values.push({text:value,...settings});
    const command=['fixture-number',value,settings.x,settings.y];
    if(draw.enqueuePriority)draw.enqueuePriority(settings.drawPriority,target=>target.push(command));else draw.push(command);
  }};
  const hud=new TouhouHud({bank,font,...options});advance(hud);
  // Mark the real ANM's final draw, without substituting its quad renderer or
  // changing its time, alpha, layer, sprite or geometric transform.
  for(const vm of bank.instances){const original=vm.drawSelf;vm.drawSelf=function(draw,view){
    if(!draw.enqueueAnm&&this.alive&&this.visible&&this.alpha)draw.push(['fixture-anm',this.scriptId]);
    return original.call(this,draw,view);
  };}
  return{hud,bank,values};
}
function render(hud,state={},options){const draw=new DrawList();hud.draw(draw,state,options);return draw.commands;}
const scripts=commands=>commands.filter(command=>command[0]==='fixture-anm').map(command=>command[1]);

function scoreFixture(locale='ja',options={}){
  const front=locale==='ja'?data('front'):JSON.parse(fs.readFileSync(new URL('../packages/thlib/assets/touhou-common/locales/zh-CN/anm/front.json',import.meta.url)));
  const bank=new AnmBank(front,{loadTexture:()=>11}),font=new TouhouBitmapFont(data('ascii_960'),{loadTexture:()=>12}),values=[];
  const draw=font.draw;font.draw=function(target,text,settings){
    if(target.enqueuePriority&&settings.drawPriority===75)values.push({text,...settings});
    return draw.call(this,target,text,settings);
  };
  const hud=new TouhouHud({bank,font,...options});advance(hud);
  return{hud,font,values};
}
function scoreBounds(font,value){
  const glyphs=[...font.layout(value.text,{...value,font:10}),...font.layout(value.text,{...value,font:11})];
  return{left:Math.min(...glyphs.map(g=>g.x)),right:Math.max(...glyphs.map(g=>g.x+g.width)),glyphs};
}

test('true source cap and every continue digit fit both score rows beside the real Japanese and Chinese image labels',()=>{
  // damage/items/spell cap the stored score at 999999999; display multiplies
  // it by ten and appends the actual continue/high-score final digit.
  for(const locale of ['ja','zh-CN']){
    const{hud,font,values}=scoreFixture(locale);
    for(let finalDigit=0;finalDigit<=9;finalDigit++){
      values.length=0;const commands=render(hud,{score:999999999,continues:finalDigit,highScore:999999999n,highScoreDigit:finalDigit});
      for(const[row,script,y]of [['highScore',6,42],['score',7,64]]){
        const value=values.find(value=>value.y===y),vm=hud.roots[0].children.find(vm=>vm.scriptId===script);
        assert.equal(value.text,`9,999,999,99${finalDigit}`);
        const labelRight=Math.max(...anmSpriteVertices(vm,hud.rowView(row)).map(vertex=>vertex[0]));
        const bounds=scoreBounds(font,value);
        assert.ok(bounds.left>=labelRight+6.5-.001,`${locale} ${row} cap must clear its image label: ${bounds.left} vs ${labelRight}`);
        assert.ok(bounds.right<=936.001,'shrinking retains the original right edge');
        assert.ok(value.scaleX<1);assert.equal(value.scaleX,value.scaleY,'long scores shrink uniformly');
        assert.equal(bounds.glyphs.length,26,'all thirteen foreground and shadow glyphs remain');
      }
      assert.ok(!commands.some(command=>command[0]==='text'),'scores retain the original bitmap font');
    }
    hud.destroy();
  }
});

test('ordinary score sizes and right anchors are unchanged while optional row widths translate and fit together',()=>{
  const{hud,font,values}=scoreFixture();render(hud,{score:99999999,highScore:12345});
  for(const y of [42,64]){
    const value=values.find(value=>value.y===y);
    assert.equal(value.x,620);assert.equal(value.scaleX??1,1);assert.equal(value.scaleY??1,1);
    assert.deepEqual(scoreBounds(font,value).glyphs,[...font.layout(value.text,{font:10,x:620,y,alignX:2}),...font.layout(value.text,{font:11,x:620,y,alignX:2})]);
  }
  hud.destroy();
  const moved=scoreFixture('zh-CN',{layout:{score:{x:438,y:74,numberWidth:100},highScore:{numberWidth:null}}});
  render(moved.hud,{score:999999999,continues:9,highScore:999999999,highScoreDigit:9});
  const score=moved.values.find(value=>value.y===74),high=moved.values.find(value=>value.y===42);
  assert.equal(score.x,630);assert.ok(Math.abs(score.scaleX-100/132)<1e-7);assert.equal(score.scaleX,score.scaleY);
  assert.ok(scoreBounds(moved.font,score).left>=795-.001);
  assert.equal(high.scaleX??1,1,'null opts out of fitting without modifying the score value');
  assert.equal(moved.hud.layout.score.numberWidth,100);moved.hud.destroy();
});

test('public default HUD draws all bitmap status labels and exactly the two portable rows below power',()=>{
  const{hud,values}=fixture();
  const commands=render(hud,{highScore:123456,score:100,pointValue:654320,graze:12345,pointItems:777});
  for(const id of [6,7,8,9,10,11,12,TOUHOU_HUD_LABEL_SCRIPTS.pointValue,TOUHOU_HUD_LABEL_SCRIPTS.graze])assert.ok(scripts(commands).includes(id),`public image label ${id}`);
  assert.equal(hud.roots[1].scriptId,100,'Boss pointer keeps its original root index');
  assert.ok(!hud.roots.some(vm=>vm.scriptId===101||vm.scriptId===102),'character names require explicit opt-in');
  assert.deepEqual(values.filter(value=>value.y>189).map(value=>[value.text,value.x,value.y]),[['654,320',620,204],['12,345',620,226]]);
  assert.ok(values.every(value=>value.drawPriority===75&&value.font===10));
  assert.ok(!commands.some(command=>command[0]==='text'),'the shared status framework never calls the system text renderer');
  hud.destroy();
});

test('skin replaces only the frame and library ordering keeps branding behind labels and numbers',()=>{
  const contexts=[];const{hud,bank}=fixture({skin:{
    drawFrame(draw,context){contexts.push(context);assert.equal(draw.enqueuePriority,undefined);draw.push(['fixture-frame']);},
    drawBranding(draw,context){contexts.push(context);draw.push(['fixture-branding']);},
  }});
  const unrelated=bank.create(49),unrelatedTime=unrelated.time;const before=bank.instances.map(vm=>[vm.id,vm.time,vm.pc]);
  const queue=new TouhouRenderQueue(),draw=new DrawList();hud.draw(queue,{score:123,graze:9});
  assert.deepEqual(queue.entries.filter(entry=>entry.commands?.some(command=>command[0]==='fixture-frame'||command[0]==='fixture-branding')).map(entry=>entry.priority),[73,73]);
  queue.flush(draw);const commands=draw.commands,ids=scripts(commands);
  assert.ok(!ids.some(id=>[2,3,4,5,49].includes(id)),'frame subtrees and unrelated bank animations are excluded');
  for(const id of [6,7,8,10,12,TOUHOU_HUD_LABEL_SCRIPTS.pointValue,TOUHOU_HUD_LABEL_SCRIPTS.graze])assert.ok(ids.includes(id));
  const frame=commands.findIndex(command=>command[0]==='fixture-frame'),branding=commands.findIndex(command=>command[0]==='fixture-branding');
  const label=commands.findIndex(command=>command[0]==='fixture-anm'&&command[1]===6),number=commands.findIndex(command=>command[0]==='fixture-number');
  assert.ok(frame<branding&&branding<label&&label<number);
  assert.deepEqual(bank.instances.map(vm=>[vm.id,vm.time,vm.pc]),before,'draw does not advance any animation');
  assert.equal(contexts[0].hud,hud);assert.equal(contexts[0].layout,hud.layout);assert.equal(contexts[0].view.screenScale,1.5);
  assert.equal(contexts[1].state.graze,9);assert.equal(unrelated.time,unrelatedTime);
  hud.skin=null;const restored=scripts(render(hud));for(const id of [2,3,4,5,6,7])assert.ok(restored.includes(id),'removing the skin restores the genuine default frame');hud.destroy();
});

test('branding without a replacement frame remains above the default frame and below status images',()=>{
  const{hud}=fixture({skin:{drawBranding:draw=>draw.push(['fixture-branding'])}}),commands=render(hud);
  const branding=commands.findIndex(command=>command[0]==='fixture-branding');
  for(const id of [2,3,4,5])assert.ok(commands.findIndex(command=>command[0]==='fixture-anm'&&command[1]===id)<branding);
  assert.ok(branding<commands.findIndex(command=>command[0]==='fixture-anm'&&command[1]===6));hud.destroy();
});

test('filtered frame traversal preserves the original live and visible parent/child semantics',()=>{
  const{hud}=fixture(),root=hud.roots[0],label=root.children.find(vm=>vm.scriptId===6);
  root.visible=false;assert.ok(scripts(render(hud)).includes(6),'an invisible parent still draws its independently visible source children');
  label.visible=false;const hidden=scripts(render(hud));assert.ok(!hidden.includes(6));assert.ok(hidden.includes(7));
  label.visible=true;root.alive=false;const dead=scripts(render(hud));assert.ok(!dead.some(id=>[2,3,4,5,6,7,8,9,10,11,12].includes(id)),'a retired parent no longer submits any of its original subtree');
  root.alive=true;hud.destroy();
});

test('row layout translates the real label, underline, stock icons and exact numeric row together',()=>{
  const{hud,values}=fixture({layout:{lives:{x:448,y:106},pointValue:{y:248},graze:{x:430}}});
  const captured=[],queue=new TouhouRenderQueue(),enqueue=queue.enqueueAnm;
  queue.enqueueAnm=function(vm,view){captured.push({vm,view:{...view}});return enqueue.call(this,vm,view);};
  hud.draw(queue,{lives:2,lifeFragments:1,pointValue:10000,graze:7});queue.flush(new DrawList());
  for(const script of [8,9,24,25,32,33,34,35,36,37,38]){
    const entry=captured.find(entry=>entry.vm.scriptId===script);assert.ok(entry,`translated live row script ${script}`);
    assert.equal(entry.view.x,30);assert.equal(entry.view.y,15);
  }
  const label=captured.find(entry=>entry.vm.scriptId===8),baseline=anmSpriteVertices(label.vm,{x:0,y:0,scale:1,screenScale:1.5}),moved=anmSpriteVertices(label.vm,label.view);
  for(let corner=0;corner<4;corner++){assert.equal(moved[corner][0]-baseline[corner][0],30);assert.equal(moved[corner][1]-baseline[corner][1],15);}
  assert.ok(values.some(value=>value.text==='  1'&&value.x===596&&value.y===130));
  assert.ok(values.some(value=>value.text==='10,000'&&value.x===620&&value.y===248));
  assert.ok(values.some(value=>value.text==='7'&&value.x===606&&value.y===226));
  assert.deepEqual(TOUHOU_HUD_LAYOUT.lives,{x:428,y:96},'default layout is immutable');hud.destroy();
});

test('palette changes number RGB without losing the source alpha or applying a system font',()=>{
  const{hud,values}=fixture({palette:{power:{color:0xffeeddcc,shadowColor:0xff112233},graze:{color:0xffabcdef,shadowColor:null}}});
  hud.lifeIcons[0].alpha=96;render(hud,{power:123,graze:4});
  for(const value of values.filter(value=>value.y===182||value.y===189)){assert.equal(value.color,0x60eeddcc);assert.equal(value.shadowColor,0x60112233);}
  const graze=values.find(value=>value.y===226);assert.equal(graze.color,0x60abcdef);assert.equal(graze.shadowColor,null);hud.destroy();
});

test('pause hides numeric rows but keeps the public Replay bitmap glyphs, with state overriding the option',()=>{
  const{hud,values}=fixture({replay:true});const paused=render(hud,{graze:12},{hideNumbers:true});
  assert.deepEqual(values.map(value=>[value.text,value.font,value.drawPriority,value.x,value.y]),[['Replay',6,74,440,274]]);
  assert.ok(scripts(paused).includes(6));assert.ok(scripts(paused).includes(TOUHOU_HUD_LABEL_SCRIPTS.graze));
  values.length=0;render(hud,{replay:false},{hideNumbers:true});assert.equal(values.length,0);
  hud.replay=false;render(hud,{replay:true},{hideNumbers:true});assert.equal(values.at(-1).text,'Replay');hud.destroy();
});

test('HUD owns each original and supplementary animation once with injected resource rules and character opt-in',()=>{
  const{hud,bank,values}=fixture({characterScript:102,rules:{maxLives:12,maxBombs:9,maxPower:800,powerPerLevel:200,lifeFragmentThreshold:5,bombFragmentThreshold:4,pointValueMinimum:12000}});
  const updates=new Map(),destroyed=new Map();
  for(const vm of bank.instances){const update=vm.update,destroy=vm.destroy;vm.update=function(){updates.set(this.id,(updates.get(this.id)??0)+1);return update.call(this);};vm.destroy=function(){destroyed.set(this.id,(destroyed.get(this.id)??0)+1);return destroy.call(this);};}
  const ids=bank.instances.map(vm=>vm.id);hud.update({lives:2,bombs:2,lifeFragments:4,bombFragments:3});
  for(const id of ids)assert.equal(updates.get(id),1,`animation ${id} updated once`);
  assert.equal(hud.roots[1].scriptId,100);assert.ok(hud.roots.some(vm=>vm.scriptId===102));
  render(hud,{lives:2,bombs:2,lifeFragments:4,bombFragments:3,power:750});
  assert.ok(values.some(value=>value.text==='/5'));assert.ok(values.some(value=>value.text==='/4'));assert.ok(values.some(value=>value.text==='12,000'&&value.y===204));
  assert.deepEqual(values.filter(value=>value.y===182||value.y===189).map(value=>value.text),['3.','75','/4.','00']);
  hud.destroy();for(const id of ids)assert.equal(destroyed.get(id),1,`animation ${id} destroyed once`);
});

test('real common bitmap font emits original image glyphs for values and Replay without a menu image or system text',()=>{
  const{hud}=fixture();hud.font=new TouhouBitmapFont(data('ascii_960'),{loadTexture:()=>12});
  const queue=new TouhouRenderQueue(),draw=new DrawList();hud.lifeIcons[0].alpha=96;
  hud.draw(queue,{score:1234,pointValue:12000,graze:321,replay:true},{hideNumbers:true});
  const glyphs=hud.font.layout('Replay',{font:6,x:440,y:274});
  assert.deepEqual(glyphs.map(glyph=>glyph.index),[370,389,400,396,385,409],'letter glyphs are from the original variable-width ASCII font');
  const replay=queue.entries.find(entry=>entry.priority===74&&entry.commands?.some(command=>command[0]==='spriteRegion'&&command[1]===12));assert.ok(replay);
  assert.equal(replay.commands.filter(command=>command[0]==='spriteRegion').length,12,'six foreground and six shadow image glyphs');
  assert.ok(replay.commands.filter(command=>command[0]==='spriteRegion').every(command=>(command.at(-1)&255)===96));
  queue.flush(draw);const commands=draw.commands;
  assert.ok(commands.some(command=>command[0]==='spriteRegion'&&command[1]===12));
  assert.ok(!commands.some(command=>command[0]==='text'));hud.destroy();
});

test('invalid row, palette and skin options fail before creating animation owners',()=>{
  const bank={create(){throw new Error('must validate before creating animations');}},font={draw(){}};
  for(const options of [{layout:{graze:{y:NaN}}},{layout:{pointItems:{y:300}}},{layout:{score:{numberWidth:0}}},{layout:{score:{numberWidth:-1}}},{layout:{score:{numberWidth:Infinity}}},{layout:{score:{numberWidth:'120'}}},{palette:{graze:{color:-1}}},{palette:{unknown:{color:0}}},{skin:{drawFrame:true}}])assert.throws(()=>new TouhouHud({bank,font,...options}),/HUD/);
});
