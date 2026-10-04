import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {Th20TitleBackground} from '../games/touhou20/src/title-background.js';
import {applyPauseNoise,copyPauseSurface,Th20PauseCapture} from '../games/touhou20/src/pause-capture.js';
import {Th20RNG} from '../games/touhou20/src/math.js';
import {AnmBank} from '../games/touhou20/src/anm.js';
import {DrawList} from '../packages/thlib/src/render.js';
const evidence=JSON.parse(fs.readFileSync(new URL('./fixtures/th20/background.json',import.meta.url)));
const hash=words=>crypto.createHash('sha256').update(Buffer.from(new Uint32Array(words).buffer)).digest('hex'),bits=x=>new Uint32Array(new Float32Array([x]).buffer)[0];
const argb=p=>Array.from({length:p.length/4},(_,n)=>{const j=n*4;return((p[j+3]<<24)|(p[j]<<16)|(p[j+1]<<8)|p[j+2])>>>0;});
const rect=a=>({left:a[0],top:a[1],right:a[2],bottom:a[3]});
test('title deformation agrees with 451647 source-oracle words across sizes, offsets, wave wrap and colors',()=>{
 assert.equal(evidence.evidence.failures,0);
 for(const c of evidence.title){const rng=new Th20RNG(c.seed,c.modulus);rng.last=0;const bg=new Th20TitleBackground({width:c.width,height:c.height,displayOffsetX:c.offsetX,displayOffsetY:c.offsetY,rng});bg.wave=c.wave;bg.color=c.color;bg.update();
  assert.equal(hash([bits(bg.wave),rng.state,rng.last,...bg.mesh.vertices.flatMap(v=>[bits(v.x),bits(v.y),bits(v.z),bits(v.rhw),v.color,bits(v.u),bits(v.v)])]),c.sha256,JSON.stringify(c));
 }
});

test('title shared-grid draw preserves each original triangle without duplicated strip vertices',()=>{
 const b=new Th20TitleBackground({textureId:2});b.wave=0;b.update();const strip=b.mesh.geometry(),grid=b.mesh.geometry({strips:false});assert.equal(grid.vertices.length,3072);assert.equal(strip.vertices.length,6048);
 for(let i=0;i<grid.indices.length;i+=3){const a=grid.indices.slice(i,i+3).map(j=>grid.vertices[j]),old=strip.indices.slice(i,i+3).map(j=>strip.vertices[j]);assert.ok([0,1,2].some(offset=>a.every((v,j)=>JSON.stringify(v)===JSON.stringify(old[(j+offset)%3]))));}
});

test('cached title grid invalidates when layout changes and does not alias recorded draw commands',()=>{
 const b=new Th20TitleBackground({textureId:1});b.wave=0;b.update();const previous=b.mesh.geometry({strips:false}),saved=JSON.stringify(previous);
 b.width=1280;b.height=960;b.displayOffsetX=12;b.displayOffsetY=-7;b.mesh.screenWidth=1280;b.mesh.screenHeight=960;b.update();
 assert.equal(JSON.stringify(previous),saved);assert.equal(b.mesh.vertices[0].x,12);assert.equal(b.mesh.vertices[0].y,-7);
 const reference=new Th20TitleBackground({width:1280,height:960,displayOffsetX:12,displayOffsetY:-7});reference.wave=8;reference.update();assert.deepEqual(b.mesh.vertices,reference.mesh.vertices);
 const next=b.mesh.geometry({strips:false});next.indices[0]=999;assert.equal(b.mesh.geometry({strips:false}).indices[0],0);
});
test('pause point resampling matches OS D3DX9_43 including 16.16 truncation boundaries',()=>{
 for(const c of evidence.resize){const source=new Uint8Array(c.sw*c.sh*4);for(let n=0;n<c.sw*c.sh;n++)source.set([(n>>>16)&255,(n>>>8)&255,n&255,255],n*4);const pixels=new Uint8Array(c.dw*c.dh*4);copyPauseSurface({width:c.sw,height:c.sh,pixels:source},{width:c.dw,height:c.dh,pixels},rect(c.s),rect(c.d));assert.equal(hash(argb(pixels)),c.sha256);}
});

test('pause copy preserves byte subview offsets and guard bytes in aligned and unaligned storage',()=>{
 for(const offset of[4,1]){
  const sourceStorage=new Uint8Array(40).fill(91),targetStorage=new Uint8Array(24).fill(73);
  const source=sourceStorage.subarray(offset,offset+32),target=targetStorage.subarray(offset,offset+16);
  for(let pixel=0;pixel<8;pixel++)source.set([pixel,100+pixel,200+pixel,255],pixel*4);
  copyPauseSurface({width:4,height:2,pixels:source},{width:2,height:2,pixels:target},rect([0,0,4,2]),rect([0,0,2,2]));
  assert.deepEqual([...target],[0,100,200,255,2,102,202,255,4,104,204,255,6,106,206,255]);
  assert.ok(targetStorage.subarray(0,offset).every(value=>value===73));
  assert.ok(targetStorage.subarray(offset+16).every(value=>value===73));
 }
});
test('pause noise preserves original swapped traversal and raw RNG independent of modulus',()=>{
 for(const c of evidence.noise){const pixels=new Uint8Array(c.width*c.height*4);for(let n=0;n<pixels.length/4;n++){const p=Math.imul(n+1,0x9e3779b1)>>>0;pixels.set([(p>>>16)&255,(p>>>8)&255,p&255,p>>>24],n*4);}const rng=new Th20RNG(c.seed,13);applyPauseNoise({...c,pixels},c.rect,rng);assert.equal(hash([rng.state,...argb(pixels)]),c.sha256);}
 const surface={width:5,height:3,pixels:new Uint8Array(60)};assert.throws(()=>applyPauseNoise(surface,{left:0,top:0,right:5,bottom:2},new Th20RNG(1)),/original pause noise traversal/i);
});
const textFile=new URL('../games/touhou20/assets/anm/text.json',import.meta.url);
test('real text87 capture uses original secondary children, preserves border storage, fades and retires',{skip:!fs.existsSync(textFile)},()=>{
 const source={width:960,height:720,pixels:new Uint8Array(960*720*4).fill(200)},surface={width:512,height:512,pixels:new Uint8Array(512*512*4).fill(73)};
 const bank=new AnmBank(JSON.parse(fs.readFileSync(textFile)),{resolveTexture:()=>7,loadTexture:()=>8});let uploads=0;
 const capture=new Th20PauseCapture({bank,pixels:{readTexturePixels:id=>id===7?surface:source,updateTexture:(id,p)=>{assert.equal(id,7);assert.equal(p,surface.pixels);uploads++;}}}).capture();
 assert.equal(uploads,1);assert.equal(capture.animation.scriptId,87);assert.equal(capture.animation.renderSecondary,true);assert.equal(capture.animation.children.length,5);
 assert.deepEqual([...surface.pixels.slice(255*4,256*4)],[73,73,73,73]);for(let i=0;i<30;i++)capture.update();const d=new DrawList();capture.draw(d);assert.ok(d.commands.some(c=>(c[0]==='mesh'||c[0]==='quad'||c[0]==='statefulQuad')&&c[1]===7));capture.hide();for(let i=0;i<14;i++)capture.update();assert.equal(capture.animation.alive,false);capture.destroy();assert.equal(bank.instances.length,0);
});
