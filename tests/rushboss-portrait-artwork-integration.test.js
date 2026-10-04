import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DrawList,SaveStore,Keys} from '@ts-stg/thlib';
import {TouhouPlayer,getTouhouPlayerData} from '@ts-stg/thlib/touhou';
import {RushPortraitApplication} from '../games/rushboss/src/portrait-application.js';

const available=['games/rushboss/assets/manifest.json','games/rushboss/assets/portrait/manifest.json',
  'packages/thlib/assets/touhou-common/manifest.json'].every(path=>fs.existsSync(path));
const cases=[['sunny',0,'image/boss/sunnymilk.png','image/background/GrassLand/grassland.png',64,64],
  ['monstone',1,'image/boss/monstone.png','image/background/RiverSide/ground.png',64,64],
  ['artia',2,'image/boss/artia.png','image/background/FrozenForest/snow_ground.png',64,74]];
function fixture(options={}){
  let next=0;const paths=new Map(),calls=[];
  const allocate=(kind,path)=>{const id=++next;paths.set(id,path??kind);calls.push([kind,id,path]);return id;};
  const host={readText:path=>fs.readFileSync(path,'utf8'),
    loadTexture:path=>allocate('loadTexture',path),createTexture:()=>allocate('createTexture'),
    createRenderTarget:()=>allocate('createRenderTarget'),unloadTexture:id=>calls.push(['unloadTexture',id]),
    loadMusic:path=>allocate('loadMusic',path),loadSound:path=>allocate('loadSound',path),
    createShader:()=>allocate('createShader'),unloadShader:id=>calls.push(['unloadShader',id]),
    unloadMusic:id=>calls.push(['unloadMusic',id]),unloadSound:id=>calls.push(['unloadSound',id]),
    playMusic(){},setMusicLoop(){},seekMusic(){},stopMusic(){},pauseMusic(){},resumeMusic(){},playSound(){},
    encodeText:text=>new Uint8Array(Array.from(text).reduce((n,ch)=>n+(ch.codePointAt(0)>127?2:1),0)),
    hasSystemFont:()=>false,rasterizeBitmapText:(_text,options)=>({width:options.width,height:options.height,
      pixels:options.pixels??new Uint8Array(options.width*options.height*4).fill(255)}),updateTextureRegion(){},
  };
  const app=new RushPortraitApplication(host,{store:new SaveStore(),startBoss:'sunny',mode:'stage',
    skipDialogue:true,invincible:true,seed:17,...options});
  return{app,paths,calls,close:()=>app.destroy()};
}
const tick=(app,count)=>{for(let frame=0;frame<count;frame++)app.update(0);};
const hasTexture=(commands,paths,command,suffix)=>commands.some(c=>c[0]===command&&paths.get(c[1])?.endsWith(suffix));

test('real Rush dialogue entrances place each private Boss body beneath source black mist at reveal',{skip:!available},()=>{
  for(const [key,,sheet]of cases){
    const f=fixture({startBoss:key,skipDialogue:false});
    try{
      const checked=new Set();
      for(let frame=0;frame<1800;frame++){
        f.app.update(Keys.FOCUS);
        const entrance=f.app.battle.presentation.shared.entrance,age=entrance?.age;
        if(![50,100,101,120,192].includes(age)||checked.has(age))continue;
        checked.add(age);const commands=f.app.render();
        const bodyIndex=commands.findIndex(c=>c[0]==='spriteRegion'&&f.paths.get(c[1])?.endsWith(sheet));
        if(age<101)assert.equal(bodyIndex,-1,`${key}: hidden before source reveal`);
        else{
          assert.ok(bodyIndex>=0,`${key}: visible at source age${age}`);
          assert.equal(commands[bodyIndex][11]&255,255,`${key}: no invented alpha fade`);
          if(age<=120){
            assert.ok(commands.slice(0,bodyIndex).some(c=>c[0]==='statefulQuad'&&c[17][3]==='add'),`${key}: rear glow remains behind body`);
            assert.ok(commands.slice(bodyIndex+1).some(c=>c[0]==='statefulQuad'&&c[17][3]==='reverseSubtract'),`${key}: front black mist covers body`);
          }
        }
        if(age===192)break;
      }
      assert.deepEqual([...checked],[50,100,101,120,192],`${key}: real dialogue drives the whole entrance`);
    }finally{f.close();}
  }
});

test('real portrait app composes three private Boss sheets and stage ground with the unchanged shared self player',{skip:!available},()=>{
  const f=fixture();
  try{
    for(const [key,bossIndex,sheet,ground,width,height]of cases){
      f.app.start({mode:'stage',bossIndex,phaseIndex:0,character:bossIndex%2,difficulty:1});tick(f.app,60);
      const battle=f.app.battle,commands=f.app.render();
      assert.equal(battle.phase.spell,false,key);
      const bossSprite=commands.find(c=>c[0]==='spriteRegion'&&f.paths.get(c[1])?.endsWith(sheet));assert.ok(bossSprite,key);
      assert.equal(bossSprite[8],width*1.5);assert.equal(bossSprite[9],height*1.5);
      assert.equal(bossSprite[8]/bossSprite[9],width/height);
      assert.ok(hasTexture(commands,f.paths,'mesh3d',ground),`${key}: original stage ground`);
      assert.ok(battle.sharedPlayer instanceof TouhouPlayer);
      assert.equal(battle.sharedPlayer.sht,getTouhouPlayerData(bossIndex%2));
      assert.equal(battle.playerAdapter.player,battle.sharedPlayer);
      assert.equal(battle.sharedPlayer.bank,battle.touhouResources.banks[bossIndex%2?'pl01':'pl00']);
      const playerTexture=battle.sharedPlayer.bank.textureFor(battle.sharedPlayer.animation.spriteIndex);
      assert.ok(commands.some(c=>['quad','statefulQuad'].includes(c[0])&&c[1]===playerTexture),
        `${key}: shared player actually renders`);
      for(const [other,,otherSheet,otherGround]of cases)if(other!==key){
        assert.equal(hasTexture(commands,f.paths,'spriteRegion',otherSheet),false,`${key}: no stale ${other} body`);
        assert.equal(hasTexture(commands,f.paths,'mesh3d',otherGround),false,`${key}: no stale ${other} stage`);
      }
      assert.equal(f.app.graphics.stageArtwork.snapshot().stage,key);
    }
  }finally{f.close();}
});

test('repeated native-command renders freeze Boss, stage, cards and gameplay snapshots',{skip:!available},()=>{
  const f=fixture({startBoss:'monstone',mode:'spell',phaseIndex:7});
  try{
    tick(f.app,120);f.app.render();
    const battle=f.app.battle,graphics=f.app.graphics;
    const before={battle:JSON.stringify(battle.snapshot()),boss:JSON.stringify(graphics.bossArtwork.snapshot()),
      stage:JSON.stringify(graphics.stageArtwork.snapshot()),spell:JSON.stringify(battle.presentation.shared.spell.snapshot()),
      bodyTicks:graphics.bodyTickCount};
    const first=JSON.stringify(f.app.render());for(let i=0;i<4;i++)assert.equal(JSON.stringify(f.app.render()),first);
    assert.equal(JSON.stringify(battle.snapshot()),before.battle);assert.equal(JSON.stringify(graphics.bossArtwork.snapshot()),before.boss);
    assert.equal(JSON.stringify(graphics.stageArtwork.snapshot()),before.stage);assert.equal(JSON.stringify(battle.presentation.shared.spell.snapshot()),before.spell);
    assert.equal(graphics.bodyTickCount,before.bodyTicks);assert.ok(graphics.stageArtwork.snapshot().cards.length>0);
  }finally{f.close();}
});

test('reopening the same Boss resets both artwork clocks and source trajectories',{skip:!available},()=>{
  const f=fixture({startBoss:'artia'});
  try{
    tick(f.app,60);f.app.render();const initialStage=f.app.graphics.stageArtwork.snapshot(),initialBoss=f.app.graphics.bossArtwork.snapshot();
    const previousBattle=f.app.battle;tick(f.app,60);f.app.render();assert.equal(f.app.graphics.stageArtwork.snapshot().frame,120);
    f.app.start({mode:'stage',bossIndex:2,phaseIndex:0,character:0,difficulty:1});
    assert.notEqual(f.app.battle,previousBattle);assert.equal(f.app.graphics.stageArtwork.snapshot().frame,0);
    assert.equal(f.app.graphics.bossArtwork.snapshot().actors.length,0);tick(f.app,60);f.app.render();
    assert.deepEqual(f.app.graphics.stageArtwork.snapshot(),initialStage);assert.deepEqual(f.app.graphics.bossArtwork.snapshot(),initialBoss);
  }finally{f.close();}
});

test('real Boss portrait composition crops UVs and geometry without changing the active scissor or source aspect ratio',{skip:!available},()=>{
  const f=fixture();
  try{
    const name='src_artiaface_ct',size=f.app.graphics.artworkAssets.size(name),draw=new DrawList();
    f.app.graphics.drawBossPortrait(draw,name,{x:-120,y:140,width:size.width,height:size.height});
    assert.equal(draw.commands.some(c=>c[0]==='scissor'||c[0]==='scissorEnd'),false);
    const sprite=draw.commands.find(c=>c[0]==='spriteRegion');assert.ok(sprite);
    assert.ok(sprite[2]>0||sprite[3]>0,'Partially off-field image must crop its source UVs');
    assert.ok(Math.abs(sprite[8]/sprite[4]-1.5)<1e-9);assert.ok(Math.abs(sprite[9]/sprite[5]-1.5)<1e-9);
    assert.ok(sprite[6]-sprite[8]/2>=48);assert.ok(sprite[7]-sprite[9]/2>=24);
    assert.ok(sprite[6]+sprite[8]/2<=624);assert.ok(sprite[7]+sprite[9]/2<=696);
    const uncut=new DrawList();f.app.graphics.drawBossPortrait(uncut,name,{x:0,y:224,width:size.width,height:size.height,clip:false});
    const full=uncut.commands.find(c=>c[0]==='spriteRegion');assert.deepEqual(full.slice(2,6),[0,0,size.width,size.height]);
    assert.equal(full[8]/full[9],size.width/size.height);
  }finally{f.close();}
});

test('assembled application releases private artwork once alongside independently owned common banks and shader',{skip:!available},()=>{
  const f=fixture();
  for(const [,bossIndex]of cases){f.app.start({mode:'stage',bossIndex,phaseIndex:0,character:0,difficulty:1});tick(f.app,60);f.app.render();}
  f.app.graphics.drawBossPortrait(new DrawList(),'src_monstone_ct',{x:0,y:220,width:476,height:404});
  const privateHandles=f.calls.filter(c=>c[0]==='loadTexture'&&c[2]?.startsWith('games/rushboss/assets/image/')).map(c=>c[1]);
  assert.ok(privateHandles.length>=7);
  f.close();const count=f.calls.length;f.close();f.app.graphics.dispose();assert.equal(f.calls.length,count);
  const unloads=f.calls.filter(c=>c[0]==='unloadTexture').map(c=>c[1]);assert.equal(new Set(unloads).size,unloads.length);
  for(const handle of privateHandles)assert.equal(unloads.filter(id=>id===handle).length,1);
  assert.equal(f.calls.filter(c=>c[0]==='unloadShader').length,1);
  assert.equal(f.app.graphics.artworkAssets.snapshot().textures,0);
});
