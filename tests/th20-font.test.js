import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {Th20BitmapFont} from '../games/touhou20/src/font.js';
import {DrawList} from '../packages/thlib/dist/render.js';
import {fontCases} from './fixtures/th20/font-cases.js';
const data=JSON.parse(fs.readFileSync(new URL('../games/touhou20/assets/anm/ascii_960.json',import.meta.url))),golden=JSON.parse(fs.readFileSync(new URL('./fixtures/th20/font-layout-golden.json',import.meta.url)));
const create=screenScale=>new Th20BitmapFont(data,{loadTexture:()=>1,screenScale});
const commands=(font,text,options)=>{const draw=new DrawList();font.draw(draw,text,options);return draw.commands;};

test('all fourteen original bitmap modes retain exact pre-cache layout and command output',()=>{
 for(let i=0;i<14;i++){
  const values=[];
  for(const {text,screenScale,options} of fontCases(i)){
   const font=create(screenScale),first=commands(font,text,options),second=commands(font,text,options);
   assert.deepEqual(second,first);values.push([font.layout(text,options),second]);
  }
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex'),golden.hashes[i],`font ${i}`);
 }
});

test('cached text keeps colors, scores, options and public layout objects independent',()=>{
 const font=create(1.5),options={font:10,x:620,y:64,alignX:2,scaleX:.6,scaleY:.75,rotation:.123,color:0xff102030,shadowColor:0x90804020};
 const first=commands(font,'123,456',options),layout=font.layout('123,456',options);
 layout[0].x=999;layout[0].width=0;layout.length=0;first[3][1]=999;first.length=0;
 assert.deepEqual(commands(font,'123,456',options),commands(create(1.5),'123,456',options));
 for(let i=0;i<320;i++){
  const changed={...options,color:(0x80123400|i)>>>0,shadowColor:i%2?null:0xffffcc00,x:options.x+i%3,alignX:i%3,scaleY:.75+(i%2)*.125};
  assert.deepEqual(commands(font,String(123456+i),changed),commands(create(1.5),String(123456+i),changed));
 }
 assert.ok(font._drawLayouts.size<=256);
 font.screenScale=2;assert.deepEqual(commands(font,'123,456',options),commands(create(2),'123,456',options));
});

test('queued text reads live options at submission and retains source alpha state',()=>{
 const font=create(1.5),pending=[],queue={enqueuePriority(priority,run){pending.push({priority,run});}},options={font:10,x:42,y:15,color:0xffffffff,shadowColor:null,drawPriority:84};
 assert.equal(font.draw(queue,'12',options),queue);assert.equal(pending[0].priority,84);
 options.color=0x80010203;options.x=52;
 const draw=new DrawList();pending[0].run(draw);
 assert.deepEqual(draw.commands,commands(create(1.5),'12',options));
 assert.deepEqual(draw.commands[0],['alphaTest',1/255]);
 assert.deepEqual(draw.commands[1],['blendFactors','srcAlpha','oneMinusSrcAlpha','add','one','zero','add']);
 assert.deepEqual(draw.commands.slice(-2),[['blendEnd'],['alphaTest',0]]);
});
