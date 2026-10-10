import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DrawList} from '../packages/thlib/dist/index.js';
import {AnmBank,TouhouMusicCaption,TOUHOU_MUSIC_CAPTION_VIEW,anmSpriteVertices} from '../packages/thlib/dist/touhou/index.js';

function textHost(){
  let next=10;const calls=[],surfaces=new Map(),unloaded=[];
  const host={hasSystemFont:()=>false,encodeText:(text,codePage)=>{calls.push({encode:text,codePage});return new Uint8Array(text.length*2);},
    rasterizeBitmapText(text,options){calls.push({raster:text,codePage:options.codePage});const pixels=options.pixels??new Uint8Array(options.width*options.height*4);
      if(!options.pixels)for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
      for(let y=8;y<20;y++)for(let x=options.x+3;x<options.x+Math.min(180,text.length*10);x++){
        const p=(y*options.width+x)*4;pixels[p]=255;pixels[p+1]=255;pixels[p+2]=255;pixels[p+3]=0;
      }return{width:options.width,height:options.height,pixels};},
    createTexture(width,height,pixels){const id=++next;surfaces.set(id,{width,height,pixels});return id;},
    unloadTexture:id=>unloaded.push(id)};
  return{host,calls,surfaces,unloaded};
}

test('music caption reproduces all three original logo timelines and screen geometry without their images',{
  skip:!existsSync('games/demo/assets-rush/portrait/anm/st01logo.json')},()=>{
  const sourceHashes={st01logo:'a33fa555420d6f6eb089a6febe314067c38f4fed9abb13626ca51c54c4389248',
    st02logo:'c28400993a415c1939d834fed123e3e852027fa316783a775e5b92ae92023597',st03logo:'e2c6a2ddd51addc39fdba0ca52a903860c9346ea10c123ded651ca273f94c618'};
  for(const name of ['st01logo','st02logo','st03logo']){
    const source=JSON.parse(readFileSync(`games/demo/assets-rush/portrait/anm/${name}.json`)),bank=new AnmBank(source,{loadTexture:()=>11});
    assert.equal(source.source.sha256,sourceHashes[name]);
    const raw=`D:/AIWorkspace/Touhou20Reconstruction/assets/raw/${name}.anm`;
    if(existsSync(raw))assert.equal(createHash('sha256').update(readFileSync(raw)).digest('hex'),sourceHashes[name],'Pinned original archive is only read, never executed');
    const original=bank.create(2),m=textHost(),caption=new TouhouMusicCaption({text:'A user supplied song',host:m.host});
    assert.deepEqual(caption.bank.data.scripts[2],source.scripts[2],'All original ANM offsets, float words, timing and flags stay exact');
    assert.deepEqual(caption.bank.data.sprites[6],source.sprites[6],'Original caption quad/UV geometry is unchanged');
    assert.equal(caption.bank.data.entries[1].texture.kind,'dynamic');assert.equal(caption.bank.data.entries[1].texture.path,undefined);
    for(let frame=0;frame<=340;frame++){
      assert.deepEqual(caption.animation.snapshot(),{...original.snapshot(),archive:'music-caption'},`${name} frame${frame} original state`);
      assert.deepEqual(anmSpriteVertices(caption.animation,caption.view),anmSpriteVertices(original,caption.view),`${name} frame${frame} complete screen quad/UV/color`);
      if([60,90,120,319,320,339].includes(frame)){
        const a=new DrawList(),b=new DrawList();original.draw(a,caption.view);caption.draw(b);
        assert.deepEqual(b.commands,a.commands,'Complete draw commands match the original ANM on an independently owned dynamic texture');
      }
      if(frame===120){const vertices=anmSpriteVertices(caption.animation,{...caption.view,pixelSnap:false});assert.deepEqual(vertices.map(v=>v.slice(0,2)),[[48,672],[624,672],[48,696],[624,696]],'Caption occupies original playfield footer before source half-pixel snapping, not actor coordinates below its scissor');}
      if(frame<340){original.update();caption.update();}
    }
    assert.equal(caption.alive,false);assert.deepEqual(m.unloaded,[11]);caption.destroy();assert.deepEqual(m.unloaded,[11]);bank.dispose();
  }
});

test('music caption renders caller text through the common rasterizer and keeps independent transparent surfaces',()=>{
  const m=textHost(),a=new TouhouMusicCaption({text:'恩惠Summer Rain',host:m.host,codePage:936}),b=new TouhouMusicCaption({text:'Another song',host:m.host});
  assert.deepEqual(m.calls.filter(c=>c.encode).map(c=>[c.encode,c.codePage]),[['恩惠Summer Rain',936],['Another song',932]]);
  assert.deepEqual(m.calls.filter(c=>c.raster).map(c=>c.raster),['恩惠Summer Rain','恩惠Summer Rain','Another song','Another song']);
  assert.notEqual(a.texture,b.texture);assert.deepEqual(a.view,TOUHOU_MUSIC_CAPTION_VIEW);
  for(const surface of m.surfaces.values()){
    assert.deepEqual([surface.width,surface.height],[1024,64]);let ink=0;
    for(let y=0;y<64;y++)for(let x=0;x<1024;x++){const alpha=surface.pixels[(y*1024+x)*4+3];
      if(y<32||x>=766)assert.equal(alpha,0,'No opaque atlas neighbour or trailing edge may enter the caption cell');else if(alpha)ink++;}
    assert.ok(ink>0);
  }
  a.destroy();a.destroy();b.destroy();assert.deepEqual(m.unloaded,[11,12]);
});

test('headless music captions retain the source timeline; invalid graphics adapters fail without retained animation',()=>{
  const c=new TouhouMusicCaption({text:'Headless'});for(let n=0;n<120;n++)c.update();
  assert.equal(c.alive,true);assert.equal(c.animation.alpha,255);assert.equal(c.animation.worldPosition().x,64);
  assert.deepEqual(c.draw(new DrawList()).commands,[]);for(let n=120;n<340;n++)c.update();assert.equal(c.alive,false);
  assert.throws(()=>new TouhouMusicCaption({text:'Invalid',host:{}}),/createTexture/);
  assert.throws(()=>new TouhouMusicCaption(),/text string/);
});
