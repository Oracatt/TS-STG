import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawList,SpriteAtlas} from '@ts-stg/thlib';
import {RushSpellEffects} from '../games/rushboss/src/spell-effects.js';
import {RushSpellBanner} from '../games/rushboss/src/spell-banner.js';
import {buildCommonSpellAssets} from '../tools/import-common-spell-assets.mjs';
import {existsSync} from 'node:fs';
const phase={key:'card',spell:true,cardId:1,name:'火符「火精灵跃动」',time:40},boss={x:0,y:100,alive:true};
function fixture(){const battle={boss:{...boss},player:{x:-100,y:-200},phaseFrame:0,phase,results:[],difficulty:1,spellBonus:2500000,captureFailed:false},effects=new RushSpellEffects({boss:'sunny',seed:23});effects.beginPhase(phase,battle.boss);return{battle,effects};}
function tick({effects,battle},n){for(let i=0;i<n;i++){battle.phaseFrame++;effects.update(battle);}}

test('source card circles retain the original 15/60/75 frame expansion and timers',()=>{
  const t=fixture();tick(t,15);let c=t.effects.activeCard;
  assert.equal(c.innerMax,95);assert.equal(c.innerMin,0);assert.equal(c.innerAlpha,.5);
  tick(t,45);assert.ok(Math.abs(c.innerMax-195)<.0001);assert.ok(Math.abs(c.innerMin-175)<.0001);
  let radius=20,inner=0,speed=Math.fround(10.16);for(let i=0;i<60;i++){radius=Math.fround(radius+speed);inner=Math.fround(inner+speed);speed=Math.fround(speed-.22);}
  assert.equal(c.outerOuter,radius);assert.equal(c.outerInner,inner);assert.equal(c.outerSpeed,speed);
  assert.equal(c.slideY,35.5);assert.equal(c.textScale,1.0000009536743164,'Source subtracts float .04 every tick; retain that accumulated scale');
  tick(t,15);const savedRadius=c.outerOuter;tick(t,1);assert.equal(c.outerOuter,savedRadius);assert.ok(c.outerScale<1);
});

test('charge uses original 800-pixel shrink, 70-frame blast delay, and full 3D leaf population',()=>{
  const t=fixture(),effect={frame:0,alive:true,color:[1,1,.35],storetimes:1,blast:true};t.effects.addCharge(effect,t.battle.boss);
  const atlas={texture:()=>4};let draw=new DrawList();
  for(let i=1;i<=71;i++){effect.frame=i;tick(t,1);if(i===1){t.effects.drawCharge(draw,t.effects.charges[0],atlas);assert.equal(draw.commands.find(c=>c[0]==='spriteRegion')[8],780*1.5);draw.reset();}if(i===30)assert.equal(t.effects.leaves.length,30);}
  t.effects.drawCharge(draw,t.effects.charges[0],atlas);assert.equal(draw.commands.find(c=>c[0]==='spriteRegion')[8],25*1.5);
  assert.ok(t.effects.leaves.some(l=>l.blast),'Blast emits the original outward leaf sprites');
  tick(t,1);draw.reset();t.effects.drawParticles(draw,atlas);assert.ok(draw.commands.some(c=>c[0]==='mesh3d'));
});

test('repeated charges use 24-frame intervals and shift the blast instead of repeating a simplified ring',()=>{
  const t=fixture(),effect={frame:0,alive:true,color:[.75,.5,1],storetimes:3,blast:true};t.effects.addCharge(effect,t.battle.boss);
  for(let i=1;i<=118;i++){effect.frame=i;tick(t,1);}
  assert.equal(t.effects.leaves.filter(l=>l.blast).length,0);
  effect.frame=119;tick(t,1);assert.equal(t.effects.leaves.filter(l=>l.blast).length,1);
});

test('phase-owned circles retire immediately, backgrounds and banner leave, cut-ins complete independently',()=>{
  const t=fixture();tick(t,30);t.effects.endPhase();assert.equal(t.effects.activeCard,null);assert.equal(t.effects.cards.length,1);assert.equal(t.effects.entrances.length,1);
  tick(t,14);assert.equal(t.effects.cards.length,1);assert.ok(t.effects.cards[0].slideX>0);tick(t,1);assert.equal(t.effects.cards.length,0);assert.equal(t.effects.entrances.length,1);
  tick(t,46);assert.equal(t.effects.entrances.length,0);t.effects.dispose();assert.equal(t.effects.aura.length,0);assert.equal(t.effects.leaves.length,0);
});

test('visual rendering does not advance any randomness or animation clock',()=>{
  const t=fixture();tick(t,20);const before=JSON.stringify(t.effects.snapshot()),calls=t.effects.random.calls,draw=new DrawList(),atlas={texture:()=>5,getSprite:()=>({texture:'spell-line',x:192,y:0,width:32,height:256})};
  t.effects.drawUnderBoss(draw,atlas,atlas,t.battle);t.effects.drawOuter(draw,atlas);t.effects.drawUnderBoss(draw,atlas,atlas,t.battle);
  assert.equal(t.effects.random.calls,calls);assert.equal(JSON.stringify(t.effects.snapshot()),before);assert.ok(draw.commands.filter(c=>c[0]==='spriteRegion').length>=240,'All 120 original attack units are rendered per pass');
});

test('spell text uses native right/bottom SimSun outline in source-size RT and releases retired raster resources',()=>{
  const t=fixture(),calls=[];let id=10;const host={createRenderTarget:(...a)=>{calls.push(['target',...a]);return++id;},createTextLayout:(...a)=>{calls.push(['layout',...a]);return++id;},rasterizeTextLayout:(...a)=>{calls.push(['raster',...a]);return{texture:++id,x:10,y:360,width:500,height:50};},unloadTexture:n=>calls.push(['unload',n]),destroyTextLayout:n=>calls.push(['destroyLayout',n])};
  const banner=new RushSpellBanner(host,{texture:()=>2}),draw=new DrawList();tick(t,25);banner.draw(draw,t.effects,t.battle);banner.draw(draw,t.effects,t.battle);
  assert.deepEqual(calls[0],['target',640,480]);assert.equal(calls.filter(c=>c[0]==='raster').length,1);
  const layout=calls.find(c=>c[0]==='layout')[2];assert.equal(layout.fontFamily,'宋体');assert.equal(layout.horizontalAlign,'right');assert.equal(layout.verticalAlign,'bottom');
  const options=calls.find(c=>c[0]==='raster')[2];assert.equal(options.strokeWidth,4);assert.equal(options.scale,t.effects.activeCard.textScale);assert.equal(options.x,615);assert.equal(options.y,405);assert.equal(options.premultiplied,true);
  assert.ok(draw.commands.some(c=>c[0]==='blendFactors'&&c[1]==='one'&&c[2]==='oneMinusSrcAlpha'));
  t.effects.endPhase();tick(t,15);banner.draw(draw,t.effects,t.battle);assert.ok(calls.some(c=>c[0]==='destroyLayout'));assert.equal(banner.rasters.size,0);banner.dispose();
});

test('common spell media contains only reviewed ordinary effect skins',{skip:!existsSync(new URL('../games/rushboss/assets/manifest.json',import.meta.url))},()=>{
  const {manifest,files}=buildCommonSpellAssets();assert.equal(Object.keys(manifest.textures).length,3);assert.equal(Object.keys(manifest.sprites).length,7);
  new SpriteAtlas(manifest,{loadTexture:()=>1,unloadTexture:()=>{}}).dispose();
  assert.ok(files.has('textures/spell-line.png'));assert.equal(manifest.sprites['charge.circle'].texture,'legacy-petals');assert.equal(manifest.sprites['boss.aura-ring'].x,52);
  assert.ok(!Object.keys(manifest.textures).some(name=>/sunny|artia|monstone|boss-cut|title/.test(name)));
});

test('source bitmap history keeps exactly the last three decimal digits and original HUD sampler',()=>{
  const t=fixture();tick(t,60);t.battle.spellHistory={'1/1':{got:1234,total:5678}};
  const host={createRenderTarget:()=>7,createTextLayout:()=>8,rasterizeTextLayout:()=>({texture:0,width:0,height:0}),unloadTexture:()=>{},destroyTextLayout:()=>{}},banner=new RushSpellBanner(host,{texture:()=>2}),draw=new DrawList();
  banner.draw(draw,t.effects,t.battle);
  const history=draw.commands.filter(c=>c[0]==='spriteRegion'&&c[3]===320&&c[6]>=540);
  assert.deepEqual(history.map(c=>c[2]),[2,3,4,10,6,7,8].map(n=>n*16));
  assert.ok(draw.commands.some(c=>c[0]==='sampler'&&c[1]===2&&c[2]==='anisotropic4x'&&c[3]==='wrap'&&c[4]==='wrap'));banner.dispose();
});
