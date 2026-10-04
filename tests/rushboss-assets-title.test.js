import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawList } from '../packages/thlib/src/index.js';
import { createRushAssets, screenX, screenY } from '../games/rushboss/src/assets.js';
import { drawTitle, TITLE_OPTIONS } from '../games/rushboss/src/title.js';

function fixture(fullAudio=false) {
  const files = {}, textures = {};
  for (const [name, width, height] of [
    ['src_titlebg',928,696], ['src_title_1',132,86], ['src_title_2',246,66],
    ['src_title',512,512], ['src_selector',466,24], ['src_light',128,128],
    ['src_titlebg_2',888,666], ['src_select',577,785], ['src_difficulty',477,680],
    ['src_ps00',1071,1170], ['src_ps01',1030,1071], ['src_playerintro',734,285],
    ['src_arrow',45,83], ['src_replay',394,120],
  ]) { textures[name] = `${name}.png`; files[`${name}.png`] = { width, height }; }
  textures.alias = textures.src_title;
  const manifest = {
    files, textures,
    sounds: { se_tan00: { file:'tan.wav',volume:0.1 }, se_cat00: {file:'cat.wav',volume:0.8} },
    music: { title: {file:'title.wav',loopBegin:549000,loopEnd:15450000,sampleRate:44100,channels:2} },
    fonts: { text:'SIMYOU.TTF', digit:'digifaw.ttf' },
  };
  const common = {sounds:Object.fromEntries(['shot','graze','pickup','hit','bomb','select'].map(key=>[key,{file:`audio/${key}.wav`}]))};
  const calls = [];
  let nextID = 1;
  const host = {
    readText(file) { calls.push(['readText',file]); return JSON.stringify(file === 'local/manifest.json' ? manifest : fullAudio&&file.endsWith('touhou-common/audio/manifest.json')?{files:['se_cat00','se_ch00','se_ch02','se_enep02'].map(name=>({name:`${name}.wav`,path:`audio/${name}.wav`}))}:common); },
    loadTexture(file) { const id=nextID++; calls.push(['loadTexture',file,id]); return id; },
    loadSound(file) { const id=nextID++; calls.push(['loadSound',file,id]); return id; },
    loadMusic(file) { const id=nextID++; calls.push(['loadMusic',file,id]); return id; },
    loadFont(file,size) { const id=nextID++; calls.push(['loadFont',file,size,id]); return id; },
    setMusicLoop(...values) { calls.push(['setMusicLoop',...values]); },
    playSound(...values) { calls.push(['playSound',...values]); },
    unloadTexture(id) { calls.push(['unloadTexture',id]); },
    unloadSound(id) { calls.push(['unloadSound',id]); },
    unloadMusic(id) { calls.push(['unloadMusic',id]); },
    unloadFont(id) { calls.push(['unloadFont',id]); },
  };
  return { assets:createRushAssets(host,{basePath:'local',commonBasePath:'common'}), calls };
}

test('RushBoss converts source centres and texture rectangles without cropping', () => {
  assert.equal(screenX(-320),0); assert.equal(screenX(320),960);
  assert.equal(screenY(240),0); assert.equal(screenY(-240),720);
  const {assets}=fixture(), draw=new DrawList();
  assets.region(draw,'src_title',[22,16,135,31],-172.5,10,135,31,0.25,0x12345678);
  assert.deepEqual(draw.commands[0],['spriteRegion',1,22,16,135,31,221.25,345,202.5,46.5,-0.25,0x12345678]);
  assert.equal(assets.texture('alias'),1);
  assert.equal(assets.snapshot().textures,1);
  assert.throws(()=>assets.texture('unknown'),/Unknown RushBoss resource/);
});

test('RushBoss audio uses thlib cues and preserves interleaved loop sample units', () => {
  const {assets,calls}=fixture();
  assert.equal(assets.sound('se_tan00'),assets.sound('shot'));
  assert.ok(calls.some(call=>call[0]==='loadSound'&&call[1]==='common/audio/shot.wav'));
  assets.playSound('se_cat00',0.5);
  assert.ok(calls.some(call=>call[0]==='playSound'&&call[2]===0.4));
  assets.music('title'); assets.music('title');
  assert.equal(calls.filter(call=>call[0]==='loadMusic').length,1);
  assert.deepEqual(calls.find(call=>call[0]==='setMusicLoop').slice(2),[549000/88200,15450000/88200]);
});

test('the six-sound fallback remains available when a consumer omits the complete audio descriptor', () => {
  const {assets,calls}=fixture();
  const keys=['se_pldead','se_eat','se_timeout','se_plst','se_damage00','se_damage01','se_nep00','se_bombtan','se_slash','se_powerup','se_enep00','se_enep01','se_enep02','se_tan00','se_tan01','se_graze','se_cat00','se_fault','se_cardget','se_extend','se_bonus','se_bonus2','se_boon00','se_select00','se_ok00','se_cancel00','se_lazer02','se_msl','se_pause','se_lazer00','se_lazer01','se_kira00'];
  for(const key of keys) assets.sound(key);
  const loaded=calls.filter(call=>call[0]==='loadSound');
  assert.equal(loaded.length,6);
  assert.ok(loaded.every(call=>call[1].startsWith('common/audio/')));
  assert.deepEqual(loaded.map(call=>call[1]).sort(),['bomb','graze','hit','pickup','select','shot'].map(key=>`common/audio/${key}.wav`));
});

test('spell and charge cues prefer the exact same-name source files in the full shared audio pack',()=>{
  const {assets,calls}=fixture(true);
  for(const key of ['se_cat00','se_ch00','se_ch02','se_enep02']){assets.sound(key);assets.sound(key);}
  const loaded=calls.filter(call=>call[0]==='loadSound');assert.equal(loaded.length,4);
  assert.deepEqual(loaded.map(call=>call[1]),['se_cat00','se_ch00','se_ch02','se_enep02'].map(key=>`common/touhou-common/audio/${key}.wav`));
  assets.playSound('se_cat00',.5);assert.equal(calls.findLast(c=>c[0]==='playSound')[2],.4);assets.dispose();
});

test('RushBoss owns font, texture, sound and music caches and releases them once', () => {
  const {assets,calls}=fixture(), draw=new DrawList();
  assets.texture('src_title'); assets.texture('alias');
  assets.sound('se_tan00'); assets.sound('shot');
  assets.music('title');
  assets.text(draw,'符卡',-300,220,20,0xffffffff);
  assert.deepEqual(draw.commands[0].slice(0,6),['text','符卡',30,30,30,0xffffffff]);
  assets.dispose(); assets.dispose();
  for (const kind of ['Texture','Sound','Music','Font']) assert.equal(calls.filter(call=>call[0]===`unload${kind}`).length,1);
  assert.deepEqual(assets.snapshot(),{textures:0,sounds:0,music:0,fonts:0,commonSounds:[]});
});

test('RushBoss main page draws all six source atlas rows and both original logo sizes', () => {
  const {assets}=fixture(), draw=new DrawList();
  drawTitle(draw,assets,{frame:180,screen:'title',selection:0});
  assert.deepEqual(TITLE_OPTIONS,['Game Start','Practice Start','Replay','Option','Manual','Quit']);
  const menu=draw.commands.filter(command=>command[0]==='spriteRegion'&&command[4]===135&&command[5]===31);
  assert.equal(menu.length,6);
  assert.deepEqual(menu.map(command=>command[3]),[16,76,136,226,256,286]);
  assert.deepEqual(menu.map(command=>command[6]),Array(6).fill(221.25));
  assert.deepEqual(menu.map(command=>command[7]),[345,393,441,489,537,585]);
  const sprites=draw.commands.filter(command=>command[0]==='sprite');
  assert.ok(sprites.some(command=>command[4]===297&&command[5]===193.5));
  assert.ok(sprites.some(command=>command[4]===369&&command[5]===99));
  assert.deepEqual(draw.commands.at(-1),['alphaTest',0]);
});

test('RushBoss player selection keeps the complete original portraits in one quad', () => {
  for(const [character,width,height] of [[0,1071*0.4*1.5,1170*0.4*1.5],[1,1030*0.4*1.5,1071*0.4*1.5]]){
    const {assets}=fixture(), draw=new DrawList();
    drawTitle(draw,assets,{frame:180,screen:'character',character,difficulty:1});
    assert.ok(draw.commands.some(command=>command[0]==='sprite'&&command[2]===180&&command[3]===375&&command[4]===width&&command[5]===height));
  }
});
