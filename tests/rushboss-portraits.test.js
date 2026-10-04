import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DrawList,Keys,SaveStore} from '../packages/thlib/src/index.js';
import {createTouhouResources,TouhouDialogue} from '../packages/thlib/src/touhou/index.js';
import {RushDialogue,RUSH_DIALOGUE_DATA} from '../games/rushboss/src/dialogue.js';
import {RushBossPortraits,RUSH_BOSS_PORTRAIT_ASSETS,drawRushBossSpellPortrait} from '../games/rushboss/src/boss-portraits.js';
import {createRushArtworkAssets} from '../games/rushboss/src/artwork-assets.js';
import {RushPortraitApplication} from '../games/rushboss/src/portrait-application.js';

const available=fs.existsSync('games/rushboss/assets/manifest.json')&&fs.existsSync('packages/thlib/assets/touhou-common/manifest.json');
function fixture(){
  let next=0;const paths=new Map(),calls=[];
  const host={readText:file=>fs.readFileSync(file,'utf8'),loadTexture:path=>{const id=++next;paths.set(id,path);return id;},
    createTexture:()=>++next,createRenderTarget:()=>++next,unloadTexture(){},
    encodeText:text=>new Uint8Array(Array.from(text).reduce((n,ch)=>n+(ch.codePointAt(0)>127?2:1),0)),hasSystemFont:()=>false,
    rasterizeBitmapText:(_text,options)=>({width:options.width,height:options.height,pixels:options.pixels??new Uint8Array(options.width*options.height*4).fill(255)}),updateTextureRegion(){}};
  const artworkAssets=createRushArtworkAssets(host),resources=createTouhouResources(host);
  const graphics={artworkAssets,drawBossPortrait(draw,name,options){
    const id=artworkAssets.texture(name);calls.push({name,...options});draw.sprite(id,options.x,options.y,options.width,options.height,0,options.color);
  },draw(draw,battle,{hud,hideHudNumbers}){draw.clear();hud.draw(draw,battle.sharedPlayer,{hideNumbers:hideHudNumbers});},clearBattle(){}};
  return{host,resources,artworkAssets,graphics,paths,calls,destroy(){resources.dispose();artworkAssets.dispose();}};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<.0001,`${a} != ${b}`);

test('Sunny expression overlays share the body top and preserve actual texture aspect ratios',{skip:!available},()=>{
  const f=fixture(),portraits=new RushBossPortraits({bossId:'sunny',graphics:f.graphics}),dialogue=new TouhouDialogue({resources:f.resources,codePage:936,steps:[{speaker:'right',text:'你好',portraits:{right:{present:true}}}]});
  for(let i=0;i<30;i++)dialogue.update(0);
  portraits.dialogueEvent({type:'portrait',side:'right'},null,dialogue);
  portraits.dialogueEvent({type:'emotion',side:'right',value:'HAPPY'},null,dialogue);
  portraits.drawDialogue(new DrawList(),null,dialogue);
  assert.deepEqual(f.calls.map(call=>call.name),['src_sunnyface_bs','src_sunnyface_0']);
  const [body,face]=f.calls;close(body.y-body.height/2,face.y-face.height/2);close(body.x,face.x);
  close(body.width/body.height,403/416);close(face.width/face.height,403/288);
  assert.equal(body.clip,false);assert.equal(face.clip,false);
  close(body.x-body.width/2,248);close(body.y-body.height/2,120);close(body.width,220);
  f.calls.length=0;portraits.dialogueEvent({type:'emotion',side:'right',value:'LOSE'},null,dialogue);
  portraits.drawDialogue(new DrawList(),null,dialogue);
  close(f.calls[1].width/f.calls[1].height,401/416);close(f.calls[0].y-f.calls[0].height/2,f.calls[1].y-f.calls[1].height/2);
  dialogue.dispose();f.destroy();
});

test('right-side activity uses the common source fifteen-frame motion and color clock',{skip:!available},()=>{
  const f=fixture(),portraits=new RushBossPortraits({bossId:'artia',graphics:f.graphics}),dialogue=new TouhouDialogue({resources:f.resources,codePage:936,steps:[{speaker:'right',text:'你好',portraits:{right:{present:true}}},{speaker:'left',text:'你好',portraits:{right:{present:true}}}]});
  portraits.dialogueEvent({type:'portrait',side:'right'},null,dialogue);
  for(let i=0;i<30;i++)dialogue.update(0);let state=portraits.sample(dialogue);close(state.x,248);close(state.y,120);assert.ok((state.color>>>24)>=254);assert.equal(state.alpha,255);
  const age=dialogue.age;portraits.drawDialogue(new DrawList(),null,dialogue);portraits.drawDialogue(new DrawList(),null,dialogue);
  assert.equal(dialogue.age,age,'repeated renders never advance a private or shared clock');
  dialogue.advance();for(let i=0;i<20;i++)dialogue.update(0);
  // Source ins3 stops the VM before the RGB lerp's final tick; the retained
  // shade is107 rather than the target96 (also checked against source ANM).
  state=portraits.sample(dialogue);close(state.x,280);close(state.y,128);assert.equal(state.color,0x6b6b6bff);
  for(const emotion of Object.keys(RUSH_BOSS_PORTRAIT_ASSETS.artia.expressions)){
    f.calls.length=0;portraits.dialogueEvent({type:'emotion',side:'right',value:emotion},null,dialogue);portraits.drawDialogue(new DrawList(),null,dialogue);
    assert.equal(f.calls[0].name,RUSH_BOSS_PORTRAIT_ASSETS.artia.expressions[emotion]);close(f.calls[0].width/f.calls[0].height,720/1000);
  }
  dialogue.dispose();f.destroy();
});

test('every source dialogue uses its private Boss images and keeps the common player portrait without changing state',{skip:!available},()=>{
  const f=fixture(),seen=new Set();
  for(const sequence of Object.values(RUSH_DIALOGUE_DATA.sequences)){
    const portraits=new RushBossPortraits({bossId:sequence.bossId,graphics:f.graphics});
    const dialogue=new RushDialogue(f.resources,{bossId:sequence.bossId,character:sequence.character,phase:sequence.phase,
      onEvent:(event,step,owner)=>portraits.dialogueEvent(event,step,owner),
      drawPortrait:(...args)=>portraits.drawDialogue(...args)});
    let last=-1;
    for(let frame=0;frame<5000&&!dialogue.complete;frame++){
      dialogue.update(Keys.FOCUS);
      if(dialogue.complete||dialogue.index===last)continue;last=dialogue.index;
      if(!portraits.present)continue;
      const before=dialogue.snapshot(),draw=new DrawList(),count=f.calls.length;dialogue.draw(draw);
      assert.deepEqual(dialogue.snapshot(),before);
      if(f.calls.length>count)seen.add(sequence.bossId);
      assert.ok([...dialogue.portraitBank.textures.values()].some(id=>draw.commands.some(command=>['statefulQuad','quad'].includes(command[0])&&command[1]===id)),`${sequence.id}: common body/expression skin still draws`);
      assert.ok(f.calls.slice(count).every(call=>call.name.startsWith('src_')));
    }
    assert.equal(dialogue.complete,true,sequence.id);dialogue.dispose();
  }
  assert.deepEqual([...seen].sort(),['artia','monstone','sunny']);
  assert.ok(f.artworkAssets.snapshot().files.every(file=>file.file.startsWith('image/face/')));
  f.destroy();
});

test('private spell cut-ins use all three original images and the common spell clock',{skip:!available},()=>{
  const f=fixture();
  for(const bossKey of ['sunny','monstone','artia']){
    const spell={active:true,age:{current:10}},battle={bossKey,phase:{spell:true},presentation:{shared:{spell}}};
    for(const [age,x,y,alpha]of [[1,185,197,26],[10,50,224,255],[80,-20,238,255],[90,-170,268,0]]){
      f.calls.length=0;spell.age.current=age;drawRushBossSpellPortrait(new DrawList(),f.graphics,battle);
      assert.equal(spell.age.current,age);assert.equal(f.calls.length,1);const call=f.calls[0];
      assert.equal(call.name,RUSH_BOSS_PORTRAIT_ASSETS[bossKey].cutin);close(call.x,x);close(call.y,y);assert.equal(call.color&255,alpha);
      const size=f.artworkAssets.size(call.name);close(call.width/call.height,size.width/size.height);
      assert.ok(call.width<=360&&call.height<=424);
    }
    f.calls.length=0;spell.age.current=91;drawRushBossSpellPortrait(new DrawList(),f.graphics,battle);assert.equal(f.calls.length,0);
  }
  f.destroy();
});

test('portrait application routes real right-side dialogue events into private images',{skip:!available},()=>{
  const f=fixture(),app=new RushPortraitApplication(f.host,{resources:f.resources,graphics:f.graphics,startBoss:'sunny',store:new SaveStore()});
  const session=app.application.game;let rendered=false;
  assert.deepEqual(session.dialogue.playerPortrait,{x:0,y:130,height:349},'application uses the public source layout');
  for(let frame=0;frame<1000&&session.state==='before';frame++){
    app.update(Keys.FOCUS);f.calls.length=0;app.render();
    if(f.calls.some(call=>call.name==='src_sunnyface_bs')){rendered=true;break;}
  }
  assert.equal(rendered,true);assert.ok(session.dialogue instanceof RushDialogue);
  assert.ok(f.calls.every(call=>call.name.startsWith('src_sunny')));
  app.destroy();f.destroy();
});
