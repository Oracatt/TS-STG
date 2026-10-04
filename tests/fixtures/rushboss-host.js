import { readFileSync } from 'node:fs';
import { COLORS16, COLORS8 } from '../../games/rushboss/src/bullet-styles.js';
import { createTouhouResources } from '@ts-stg/thlib/touhou';

// A checked-in structural fixture supplies common material names without any
// original PNG/SMX dependency. If the optional pack exists, test its real names.
function minimalCommonManifest() {
  const textures={fixture:{file:'fixture.png',width:256,height:256}},sprites={};
  const add=name=>{sprites[name]={texture:'fixture',x:0,y:0,width:8,height:8};};
  for(const shape of ['pellet','orb','ring','rice','kunai','needle','amulet','star','capsule','oval-ring','glow'])for(const color of COLORS16)add(`bullet.${shape}.${color}`);
  for(const shape of ['orb-medium','heart-ring','knife','oval','star-large','ring-medium','orb-large','lightning','diamond','droplet','orb-patterned'])for(const color of COLORS8)add(`bullet.${shape}.${color}`);
  for(const color of COLORS16)add(`laser.straight.${color}`);
  for(const start of [16,160,352])for(let index=0;index<16;index++)add(`bullet-small.${String(start+index).padStart(3,'0')}`);
  for(const name of ['effect.charge','effect.magic-circle','effect.particle','effect.death-ring.blue','bomb.orb'])add(name);
  return {format:'ts-stg-sprite-pack-v1',textures,sprites,clips:{}};
}
function optionalManifest(relative,fallback) {
  if(process.env.TS_STG_TEST_STATIC_ASSETS==='1')return fallback();
  try{return JSON.parse(readFileSync(new URL(relative,import.meta.url),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;return fallback();}
}
export const commonManifest=optionalManifest('../../packages/thlib/assets/reference-common/manifest.json',minimalCommonManifest);
const spellManifest=optionalManifest('../../packages/thlib/assets/spell-common/manifest.json',()=>({
  format:'ts-stg-sprite-pack-v1',textures:{'spell-line':{file:'line.png',width:128,height:128},'legacy-aura':{file:'aura.png',width:128,height:64},'legacy-petals':{file:'petals.png',width:64,height:64}},
  sprites:{'spell.attack-strip':{texture:'spell-line',x:96,y:0,width:16,height:128},'spell.circle-inner':{texture:'spell-line',x:48,y:0,width:16,height:128},'spell.circle-outer':{texture:'spell-line',x:80,y:0,width:16,height:128}},clips:{},
}));

function minimalRushManifest() {
  const files={},textures={};
  for(const [name,width,height] of [
    ['src_titlebg',928,696],['src_titlebg_2',888,666],['src_title_1',132,86],['src_title_2',246,66],['src_title',512,512],['src_selector',466,24],['src_light',128,128],
    ['src_select',577,785],['src_difficulty',477,680],['src_ps00',1071,1170],['src_ps01',1030,1071],['src_playerintro',734,285],['src_arrow',45,83],['src_replay',394,120],['src_switchbg',512,512],['src_switch',64,64],
    ['src_player_reimu',256,256],['src_player_marisa',256,256],['src_artia',576,333],['src_monstone',192,64],['src_sunnymilk',512,512],
    ['src_artia_cdbg1',384,448],['src_artia_cdbg2',350,512],['src_monstone_cdbg1',528,396],['src_monstone_cdbg2',256,256],['src_sunnymilk_cdbg1',256,256],['src_sunnymilk_cdbg2',352,352],
    ['src_artiaface_ct',270,480],['src_monstone_ct',476,404],['src_sunny_ct',383,448],['src_forest1',256,256],['src_river_ground',256,256],['src_grassland',256,256],['src_bullet_3',256,256],['src_fog',256,256],['src_lifebar',256,256],['src_ascii',512,512],
  ]){textures[name]=`${name}.png`;files[`${name}.png`]={width,height};}
  return {files,textures,sounds:{},fonts:{text:'font.ttf',digit:'digit.ttf'},music:Object.fromEntries(['title','grassland','riverside','frozenforest'].map(key=>[key,{file:`${key}.wav`,sampleRate:44100,channels:2,loopBegin:0,loopEnd:88200}]))};
}
const rushManifest=optionalManifest('../../games/rushboss/assets/manifest.json',minimalRushManifest);
const soundManifest={sounds:Object.fromEntries(['shot','graze','pickup','hit','bomb','select'].map(key=>[key,{file:`audio/${key}.wav`}]))};
const fullSoundManifest=optionalManifest('../../packages/thlib/assets/touhou-common/audio/manifest.json',()=>({files:['se_ch00','se_ch01','se_ch02','se_ch03','se_cat00','se_enep02'].map(name=>({name:`${name}.wav`,path:`audio/${name}.wav`}))}));
export function hostFixture() {
  const calls=[];let nextID=1;
  const host={
    readText(file){
      if(file==='games/rushboss/assets/manifest.json')return JSON.stringify(rushManifest);
      if(file==='packages/thlib/assets/manifest.json')return JSON.stringify(soundManifest);
      if(file==='packages/thlib/assets/touhou-common/audio/manifest.json')return JSON.stringify(fullSoundManifest);
      if(file==='packages/thlib/assets/reference-common/manifest.json')return JSON.stringify(commonManifest);
      if(file==='packages/thlib/assets/spell-common/manifest.json')return JSON.stringify(spellManifest);
      throw new Error(`Unexpected test resource ${file}`);
    },
    loadTexture(file){calls.push(['loadTexture',file]);return nextID++;},
    unloadTexture(id){calls.push(['unloadTexture',id]);},
    loadSound(file){calls.push(['loadSound',file]);return nextID++;},
    unloadSound(id){calls.push(['unloadSound',id]);},
    playSound(...args){calls.push(['playSound',...args]);},
    loadMusic(file){calls.push(['loadMusic',file]);return nextID++;},
    unloadMusic(id){calls.push(['unloadMusic',id]);},
    playMusic(...args){calls.push(['playMusic',...args]);},
    stopMusic(id){calls.push(['stopMusic',id]);},
    setMusicLoop(...args){calls.push(['setMusicLoop',...args]);},
    pauseMusic(id){calls.push(['pauseMusic',id]);},
    resumeMusic(id){calls.push(['resumeMusic',id]);},
    loadFont(file){calls.push(['loadFont',file]);return nextID++;},
    unloadFont(id){calls.push(['unloadFont',id]);},
    createRenderTarget(width,height){calls.push(['createRenderTarget',width,height]);return nextID++;},
    createShader(...args){calls.push(['createShader',...args]);return nextID++;},
    unloadShader(id){calls.push(['unloadShader',id]);},
    createTextLayout(...args){calls.push(['createTextLayout',...args]);return nextID++;},
    rasterizeTextLayout(...args){calls.push(['rasterizeTextLayout',...args]);return{texture:nextID++,x:10,y:350,width:400,height:50};},
    destroyTextLayout(id){calls.push(['destroyTextLayout',id]);},
    quit(){calls.push(['quit']);},
  };
  // Menu tests remain independent from ignored original artwork, while using
  // the very same complete SHT data and player classes as the rendered demo.
  return {host,calls,resources:createTouhouResources()};
}
