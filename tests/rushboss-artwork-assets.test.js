import test from 'node:test';
import assert from 'node:assert/strict';
import {createRushArtworkAssets} from '../games/rushboss/src/artwork-assets.js';

const artworkNames=[
  'src_grassland','src_leaf','src_sunlight','src_river_ground','src_water','src_cloud_1','src_cloud_2',
  'src_forest1','src_snow','src_snow_ground','src_tree1','src_tree2',
  'src_sunnymilk','src_monstone','src_artia',
  'src_sunnymilk_cdbg1','src_sunnymilk_cdbg2','src_monstone_cdbg1','src_monstone_cdbg2','src_artia_cdbg1','src_artia_cdbg2',
  'src_sunny_ct','src_monstone_ct','src_artiaface_ct','src_sunnyface_bs',
  ...[0,1,2,3,5,6,8,9].map(i=>`src_sunnyface_${i}`),
  ...[0,1,2,3,4,5,7].map(i=>`src_artiaface_${i}`),
];
const forbiddenNames=['src_reimu','src_marisa','src_pl00','src_bullet','src_bullet_1','src_bullet_2',
  'src_bullet_3','src_ascii','src_titlebg','se_tan00','src_tan00','grassland','sound.wav','image/boss/artia.png'];
const source={project:'TouhouRushBoss-main',archive:'src/thsrc.smx',
  sha256:'d156d11ea024d2eae227ddfcc6f24c9c765b54abd5443fce094d6f008cbe4f28',codeLicense:'GPL-3.0'};
const sunnyHash='dc43a91bb4ba6cecbe441cd7b7ed4b0cb5751e21fcc548a3fb2c52f0d4b8536b';
const artiaHash='121d51945af2bd060ff8e093c01df99abe27d0a6c3f4152eb3dc0ebf5b11dd43';

function fixture(change=()=>{}){
  const textures={},files={};
  for(const [index,name]of [...artworkNames,...forbiddenNames].entries()){
    const file=`image/${name}.png`;textures[name]=file;
    files[file]={width:128,height:64,sha256:index.toString(16).padStart(64,'0')};
  }
  Object.assign(files[textures.src_sunnymilk],{width:512,height:512,sha256:sunnyHash});
  Object.assign(files[textures.src_artia],{width:576,height:333,sha256:artiaHash});
  // Both names are allowed business artwork. The cache must use their file,
  // never allocate another host texture just because an alias is requested.
  textures.src_sunnyface_0=textures.src_sunny_ct;
  const manifest={source,textures,files};change(manifest);
  const calls=[];let next=100;
  const host={
    readText(path){calls.push(['readText',path]);assert.equal(path,'local-art/manifest.json');return JSON.stringify(manifest);},
    loadTexture(path){const handle=++next;calls.push(['loadTexture',path,handle]);return handle;},
    unloadTexture(handle){calls.push(['unloadTexture',handle]);},
    loadSound(){assert.fail('An artwork loader must not own audio');},
    loadMusic(){assert.fail('An artwork loader must not own audio');},
  };
  return{assets:createRushArtworkAssets(host,{basePath:'local-art'}),calls,manifest};
}

test('Rush private artwork accepts all three stage, Boss, spell background and portrait families',()=>{
  const {assets,calls}=fixture();
  for(const name of artworkNames){assert.ok(assets.size(name).width>0);assert.ok(assets.texture(name)>0);}
  assert.deepEqual(assets.snapshot().names,[...artworkNames].sort());
  assert.equal(calls.filter(c=>c[0]==='loadTexture').length,artworkNames.length-1);
  assets.dispose();
});

test('Rush private artwork rejects shared players, bullets, UI and audio even when the manifest has those names',()=>{
  const {assets,calls}=fixture();
  for(const name of forbiddenNames){
    assert.throws(()=>assets.texture(name),/Not a private RushBoss artwork resource/);
    assert.throws(()=>assets.size(name),/Not a private RushBoss artwork resource/);
  }
  assert.equal(calls.filter(c=>c[0]==='loadTexture').length,0);
  assert.deepEqual(assets.snapshot().names,[]);
  assert.throws(()=>assets.texture('src_sunnyface_99'),/Missing RushBoss artwork/);
});

test('artwork dimensions are metadata reads and allowed aliases share the file-owned handle',()=>{
  const {assets,calls}=fixture();
  assert.deepEqual(assets.size('src_sunnymilk'),{width:512,height:512});
  assert.deepEqual(assets.size('src_artia'),{width:576,height:333});
  assert.equal(calls.filter(c=>c[0]==='loadTexture').length,0);
  assert.deepEqual(assets.snapshot().names,[]);
  const first=assets.texture('src_sunny_ct');
  assert.equal(assets.texture('src_sunnyface_0'),first);assert.equal(assets.texture('src_sunny_ct'),first);
  assert.deepEqual(calls.filter(c=>c[0]==='loadTexture'),[['loadTexture','local-art/image/src_sunny_ct.png',first]]);
  assert.equal(assets.snapshot().textures,1);assert.deepEqual(assets.snapshot().names,['src_sunny_ct','src_sunnyface_0']);
});

test('artwork snapshots preserve original archive and texture hashes without substituting or recomputing them',()=>{
  const {assets}=fixture();assets.texture('src_sunnymilk');assets.texture('src_artia');assets.texture('src_artia');
  assert.deepEqual(assets.snapshot(),{source,textures:2,names:['src_artia','src_sunnymilk'],files:[
    {file:'image/src_artia.png',sha256:artiaHash},{file:'image/src_sunnymilk.png',sha256:sunnyHash},
  ]});
});

test('dispose unloads exactly the loaded handles once, never metadata-only images or shared resources',()=>{
  const {assets,calls}=fixture();assets.size('src_sunnymilk');assets.size('src_monstone');
  const portrait=assets.texture('src_sunny_ct'),alias=assets.texture('src_sunnyface_0'),boss=assets.texture('src_artia');
  assert.equal(alias,portrait);assets.dispose();assets.dispose();
  assert.deepEqual(calls.filter(c=>c[0]==='unloadTexture'),[['unloadTexture',portrait],['unloadTexture',boss]]);
  assert.throws(()=>assets.texture('src_artia'),/disposed/);
  assert.deepEqual(assets.snapshot(),{source,textures:0,names:['src_artia','src_sunny_ct','src_sunnyface_0'],files:[]});
  assert.deepEqual(assets.size('src_artia'),{width:576,height:333},'Released handles do not invalidate immutable image metadata');
  assert.equal(calls.filter(c=>c[0]==='loadTexture').length,2);
});

test('an allowed artwork alias still requires positive image dimensions',()=>{
  const {assets,calls}=fixture(manifest=>{manifest.files[manifest.textures.src_artia_cdbg1].width=0;});
  assert.throws(()=>assets.texture('src_artia_cdbg1'),/Missing RushBoss artwork/);
  assert.throws(()=>assets.size('src_artia_cdbg1'),/Missing RushBoss artwork/);
  assert.equal(calls.filter(c=>c[0]==='loadTexture').length,0);
});
