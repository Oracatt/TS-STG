// SPDX-License-Identifier: GPL-3.0-only
// Private character images from Source.cpp/Face.h and BossSprite{,Deriver}.h.
// thlib continues to own the player portrait, dialogue, spell opening and HUD.
const normalizeBoss=key=>key==='sunnymilk'?'sunny':key;
const faceIndices=Object.freeze({HAPPY:0,DISAPPOINT:1,SWEAT:2,ANGRY:3,ANGRY2:4,SURPRISE:5,PUZZLED:6,NOTICE:7,NOTICE2:8,LOSE:9});
export const RUSH_BOSS_PORTRAIT_ASSETS=Object.freeze({
  sunny:Object.freeze({body:'src_sunnyface_bs',expressions:Object.freeze({
    HAPPY:'src_sunnyface_0',DISAPPOINT:'src_sunnyface_1',SWEAT:'src_sunnyface_2',ANGRY:'src_sunnyface_3',
    SURPRISE:'src_sunnyface_5',PUZZLED:'src_sunnyface_6',NOTICE2:'src_sunnyface_8',LOSE:'src_sunnyface_9'}),cutin:'src_sunny_ct'}),
  monstone:Object.freeze({body:'src_monstone_ct',expressions:Object.freeze({}),cutin:'src_monstone_ct'}),
  artia:Object.freeze({body:'src_artiaface_7',expressions:Object.freeze({
    HAPPY:'src_artiaface_0',DISAPPOINT:'src_artiaface_1',SWEAT:'src_artiaface_2',ANGRY:'src_artiaface_3',
    ANGRY2:'src_artiaface_4',SURPRISE:'src_artiaface_5',NOTICE:'src_artiaface_7'}),cutin:'src_artiaface_ct'}),
});
const defaultView=Object.freeze({x:336,y:24,scale:1.5,screenScale:1});
const fit=(size,width,height)=>{const scale=Math.min(width/size.width,height/size.height);return{width:size.width*scale,height:size.height*scale,scale};};

/** Private artwork sampled from the common original dialogue portrait clock.
 * Events select an expression; drawing advances no animation state. */
export class RushBossPortraits {
  constructor({bossId,graphics}){
    this.bossId=normalizeBoss(bossId);this.graphics=graphics;this.present=false;this.emotion='NOTICE';
    if(!RUSH_BOSS_PORTRAIT_ASSETS[this.bossId])throw new RangeError(`Unknown Rush Boss portrait: ${bossId}`);
  }
  dialogueEvent(event,_step,dialogue){
    if(event.side!=='right')return;
    if(event.type==='portrait'){this.present=true;return;}
    if(event.type==='emotion'){this.emotion=event.value in faceIndices?event.value:'NOTICE';return;}
  }
  sample(dialogue){
    // The common original portrait clock owns all entrance, speaking, shade
    // and fade state. Rush supplies only image selection and authored ratios.
    const source=dialogue.portraitState?.('right');
    return source?{...source,present:this.present,emotion:this.emotion}:null;
  }
  drawDialogue(draw,_step,dialogue,view={x:0,y:0,scale:1,screenScale:1.5}){
    if(!this.present||typeof this.graphics?.drawBossPortrait!=='function')return false;
    const assets=RUSH_BOSS_PORTRAIT_ASSETS[this.bossId],state=this.sample(dialogue);if(!state)return false;
    // Common right portrait: source 440x720 canvas, mode2, full-screen origin.
    // Private cropped/full-body skins retain their own aspect ratio within it.
    const baseName=this.bossId==='artia'?(assets.expressions[state.emotion]??assets.body):assets.body;
    const base=this.graphics.artworkAssets.size(baseName),box=fit(base,state.width,state.height);
    const x=state.x+box.width/2,top=state.y,color=state.color;
    this.graphics.drawBossPortrait(draw,baseName,{x,y:top+box.height/2,width:box.width,height:box.height,color,view,clip:false});
    const overlay=this.bossId==='sunny'?assets.expressions[state.emotion]:null;
    if(overlay){
      const size=this.graphics.artworkAssets.size(overlay),width=size.width*box.scale,height=size.height*box.scale;
      this.graphics.drawBossPortrait(draw,overlay,{x:state.x+width/2,y:top+height/2,width,height,color,view,clip:false});
    }
    return false; // Retain thlib's default player portrait.
  }
}

/** BossSprite.h's authored 90-frame cut-in uses the public spell clock, so
 * pause/replay and repeated renders cannot advance the portrait independently. */
export function drawRushBossSpellPortrait(draw,graphics,battle,view=defaultView){
  const spell=battle?.presentation?.shared?.spell,assets=RUSH_BOSS_PORTRAIT_ASSETS[normalizeBoss(battle?.bossKey)];
  if(!assets||!spell?.active||!battle.phase?.spell||typeof graphics?.drawBossPortrait!=='function')return draw;
  const age=Math.floor(spell.age.current);
  if(age<1||age>90)return draw;
  const fast=Math.min(age,10),middle=Math.max(0,Math.min(age-10,70)),leaving=Math.max(0,age-80);
  const sourceX=200-15*fast-middle-15*leaving,sourceY=30-3*fast-.2*middle-3*leaving;
  const alpha=Math.max(0,Math.min(1,fast*.1-leaving*.1)),box=fit(graphics.artworkAssets.size(assets.cutin),360,424);
  graphics.drawBossPortrait(draw,assets.cutin,{x:sourceX,y:224-sourceY,width:box.width,height:box.height,
    color:(0xffffff00|Math.round(alpha*255))>>>0,view,clip:true});return draw;
}
