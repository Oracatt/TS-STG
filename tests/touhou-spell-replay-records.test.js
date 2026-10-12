import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AnmBank} from '../packages/thlib/dist/touhou/anm.js';
import {TouhouBitmapFont} from '../packages/thlib/dist/touhou/font.js';
import {TouhouSpell} from '../packages/thlib/dist/touhou/spell.js';
import {DrawList} from '../packages/thlib/dist/render.js';

function fixture(options={}){
  const data=JSON.parse(readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/ascii_960.json',import.meta.url)));
  const bank=new AnmBank(data,{loadTexture:()=>11}),font=new TouhouBitmapFont(data,{loadTexture:()=>11}),writes=[];
  const originalDraw=font.draw.bind(font);
  font.draw=(draw,text,style)=>{writes.push(text);return originalDraw(draw,text,style);};
  const spell=new TouhouSpell({player:{x:0,y:400,bomb:null,score:0},textBank:bank,font,...options});
  return{spell,history(){writes.length=0;const draw=new DrawList();spell.draw(draw);assert.ok(draw.commands.length>0);return writes.at(-1);},
    advance(frames=150){for(let i=0;i<frames;i++)spell.update();},destroy(){spell.destroy();bank.dispose();}};
}

test('public playback with empty history displays its first attempt through the actual bitmap font',()=>{
  const records={},fallbackRecords={},f=fixture({playback:true,records,fallbackRecords});
  try{f.spell.begin({id:7,name:'First recorded card',duration:900});f.advance();
    assert.equal(f.history(),'00/01');assert.deepEqual(records,{});assert.deepEqual(fallbackRecords,{});
  }finally{f.destroy();}
});

for(const mode of [0,2])test(`playback mode ${mode} restores historical counters, then tracks local captures and attempts without persistent mutation`,()=>{
  const records={7:{name:'Old name',captures:[3,2],attempts:[8,6]}},fallbackRecords={7:{name:'Fallback',captures:[5,1],attempts:[12,4]}};
  const before=JSON.stringify({records,fallbackRecords}),f=fixture({playback:true,mode,records,fallbackRecords}),column=mode===2?1:0;
  try{
    f.spell.begin({id:7,name:'Recorded card',duration:900});f.advance();
    assert.equal(f.history(),mode===2?'02/07':'03/09');assert.equal(JSON.stringify({records,fallbackRecords}),before);
    assert.notStrictEqual(f.spell.records,records);assert.notStrictEqual(f.spell.records[7],records[7]);
    assert.notStrictEqual(f.spell.records[7].captures,records[7].captures);assert.notStrictEqual(f.spell.records[7].attempts,records[7].attempts);
    assert.equal(f.spell.capture().captured,true);
    assert.equal(f.spell.records[7].captures[column],records[7].captures[column]+1);
    assert.equal(f.spell.fallbackRecords[7].captures[column],fallbackRecords[7].captures[column]+1);
    f.spell.begin({id:7,name:'Recorded card',duration:900});f.advance();
    assert.equal(f.history(),mode===2?'03/08':'04/10');
    f.spell.fail('hit');assert.equal(f.spell.finish().captured,false);
    assert.equal(f.spell.records[7].captures[column],records[7].captures[column]+1);
    assert.equal(f.spell.records[7].attempts[1-column],records[7].attempts[1-column]);
    assert.equal(f.spell.records[7].captures[1-column],records[7].captures[1-column]);
    assert.equal(JSON.stringify({records,fallbackRecords}),before);
  }finally{f.destroy();}
});

test('live spells continue updating caller-owned records with the source 99999 cap',()=>{
  const records={7:{name:'Old',captures:[99999,1],attempts:[99999,2]}},f=fixture({records});
  try{f.spell.begin({id:7,name:'Live card',duration:900});f.advance();assert.equal(f.history(),'MASTER');
    assert.strictEqual(f.spell.records,records);assert.equal(records[7].name,'Live card');f.spell.capture();
    assert.deepEqual(records[7].captures,[99999,1]);assert.deepEqual(records[7].attempts,[99999,2]);
  }finally{f.destroy();}
});

test('drawing a missing record is a read-only zero display even with repeated renders',()=>{
  const f=fixture({playback:true});
  try{f.spell.begin({id:7,name:'Draw-only query',duration:900});f.advance();delete f.spell.records[7];
    for(let i=0;i<5;i++)assert.equal(f.history(),'00/00');assert.deepEqual(f.spell.records,{});
  }finally{f.destroy();}
});
