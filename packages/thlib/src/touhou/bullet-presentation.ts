import type {AnmDrawList as DrawList} from './anm.js';
import type {AnmBank,AnmInstance,AnmCreateOptions,AnmView} from './anm.js';
import type {touhouStyle} from './bullet-patterns.js';
export type TouhouResolvedBulletStyle=ReturnType<typeof touhouStyle>;
export interface TouhouBulletFinishOptions {velocity?:{x?:number;y?:number;z?:number};clockScale?:number;cancelKind?:number;frozen?:boolean;}
import {f32,mul} from './math.js';
import {TOUHOU_OWNER_PRIORITIES} from './render-order.js';

/** shoot.cpp: type1 kind0/1/2 selects fast/default/slow birth. Ordinary
 * shoot_one uses interrupt2 to skip birth explicitly; null represents that. */
export const TouhouBulletBirth=Object.freeze({INSTANT:null,FAST:0,NORMAL:1,SLOW:2});
export function configureTouhouBulletBirth(animation: AnmInstance,kind: number|null=null): AnmInstance{
  if(kind!==null&&!Number.isInteger(kind))throw new TypeError('Bullet birth kind must be null or an integer');
  if(kind===null)animation.interrupt(2);
  else if(kind!==1)animation.interrupt(kind+7);
  return animation;
}

/** Binding callbacks are installed before the source VM's first frame. Public
 * AnmBank templates are shared, so remap their local sprite after copying the
 * template and before executing frame0; never force birth sprite1 to body0. */
export function createTouhouBulletAnimation(bank: AnmBank,style: TouhouResolvedBulletStyle,position: {x?:number;y?:number;z?:number}={},options: AnmCreateOptions={}): AnmInstance{
  if(!bank?.create||!style?.remapSprite)throw new TypeError('Bullet ANM bank and resolved original style required');
  const remap=options.spriteRemap??(id=>style.remapSprite(id));
  return bank.create(style.script,{...position,...options,spriteRemap:remap,beforeStart:vm=>{
    if((style.colors[0][0]|0)>=0&&vm.spriteIndex>=0)vm.setSprite(vm.spriteIndex,true);
    // shoot.cpp: embedded bullet body selects original texture alpha mode1.
    vm.U(0x4a0,(vm.U(0x4a0)&~0x03000000)|0x01000000);
    options.beforeStart?.(vm);
  }});
}

/** Only explicit player collision/cancellation creates this separate ANM.
 * movement.cpp::retire (including natural bounds/lifetime removal) does not. */
export function createTouhouBulletCancelAnimation(bank: AnmBank,script: number,{x=0,y=0,z=0,cancelKind=0,drifting=false,
  velocity={x:0,y:0,z:0},clockScale=1}: TouhouBulletFinishOptions&{x?:number;y?:number;z?:number;drifting?:boolean}={}): AnmInstance|null{
  if(script<0)return null;
  const animation=bank.create(script,{x,y,z});
  if(cancelKind===1)animation.interrupt(3,true);
  if(drifting){
    const end=(['x','y','z'] as const).map(key=>mul(mul(velocity[key]??0,clockScale),10));
    animation.interpolate('position',0x2c,3,end,30,6);
  }
  return animation;
}

export function drawTouhouBulletBody(draw: DrawList,animation: AnmInstance,view?: AnmView,drawGroup: number=0): DrawList{
  if(draw.enqueuePriority){
    draw.enqueuePriority(TOUHOU_OWNER_PRIORITIES.bullet,target=>animation.drawSelf(target,view),{order:drawGroup});
    for(const child of animation.children)child.draw(draw,view);
  }else animation.draw(draw,view);
  return draw;
}

/** Shared source presentation for applications that own bullet trajectories.
 * This object never moves/collides an actor or controls its activation delay.
 * Birth readiness is visual fields_444[0], independent of game hitbox state. */
export class TouhouBulletPresentation {
  bank:AnmBank;
  style:TouhouResolvedBulletStyle;
  animation:AnmInstance;
  child:AnmInstance|null;
  x:number;
  y:number;
  z:number;
  birthKind:number|null;
  ending:boolean;
  phase:string;

  constructor({bank,style,x=0,y=0,z=.1,birthKind=TouhouBulletBirth.NORMAL}: {bank:AnmBank;style:TouhouResolvedBulletStyle;x?:number;y?:number;z?:number;birthKind?:number|null}={} as {bank:AnmBank;style:TouhouResolvedBulletStyle}){
    this.bank=bank;this.style=style;this.x=f32(x);this.y=f32(y);this.z=f32(z);
    this.birthKind=birthKind;this.ending=false;this.phase=birthKind===null?'active':'birth';
    this.animation=createTouhouBulletAnimation(bank,style,{x:this.x,y:this.y,z:this.z},{spriteRemap:id=>this.style.remapSprite(id)});
    this.child=style.childScript?bank.create(style.childScript,{x:this.x,y:this.y,z:this.z}):null;
    configureTouhouBulletBirth(this.animation,birthKind);
    // Named spawn has already executed frame0; execute pending birth labels
    // immediately without silently consuming an extra default birth frame.
    if(birthKind!==1)this.animation.update();
  }
  get alive(): boolean{return this.animation.alive||!!this.child?.alive;}
  get ready(): boolean{return !!this.animation.U(0x444)&&!this.ending;}
  setStyle(style: TouhouResolvedBulletStyle): this{
    const index=this.style.colors[this.style.color].indexOf(this.animation.spriteIndex);
    this.style=style;if(index>=0)this.animation.setSprite(index,true);return this;
  }
  setPosition({x=this.x,y=this.y,z=this.z}: {x?:number;y?:number;z?:number}={}): this{
    this.x=f32(x);this.y=f32(y);this.z=f32(z);
    this.animation.x=this.x;this.animation.y=this.y;this.animation.z=this.z;
    if(this.child){this.child.x=this.x;this.child.y=this.y;this.child.z=this.z;}return this;
  }
  update(position: {x?:number;y?:number;z?:number}={}): this{
    this.setPosition(position);this.animation.update();this.child?.update();
    if(!this.ending&&this.ready)this.phase='active';return this;
  }
  /** Returns an effect for the caller's separately updated/rendered effect
   * list, or null. 'retire' is immediate deletion, never interrupt1. */
  finish(reason: 'retire'|'cancel'|'hit'='retire',{velocity={x:0,y:0,z:0},clockScale=1,cancelKind=0,frozen=false}: TouhouBulletFinishOptions={}): AnmInstance|null{
    if(this.ending)return null;
    this.ending=true;this.phase=reason;
    if(reason!=='cancel'&&reason!=='hit'){this.animation.destroy();this.child?.destroy();return null;}
    this.animation.interrupt(1);this.child?.interrupt(1,true);
    if(reason==='cancel')this.animation.update();
    return frozen?null:createTouhouBulletCancelAnimation(this.bank,this.style.cancelScript,{x:this.x,y:this.y,z:this.z,
      cancelKind,drifting:reason==='hit',velocity,clockScale});
  }
  draw(draw: DrawList,view?: AnmView,{scale=1,rotation=0,alpha=1,tint=null}: {scale?:number;rotation?:number;alpha?:number;tint?:number[]|null}={}): DrawList{
    const animation=this.animation,floats=animation.renderFloats,words=animation.renderWords;
    if(floats&&words){
      floats[0x5bc>>>2]=this.x;floats[0x5c0>>>2]=this.y;floats[0x5c4>>>2]=this.z;
      let flags=words[0x49c>>>2];
      if((words[0x4a0>>>2]>>>21)&7){floats[0x40>>>2]=rotation;flags|=2;}
      floats[0x58>>>2]=floats[0x5c>>>2]=scale;words[0x49c>>>2]=flags|4;
    }else{
      animation.x=this.x;animation.y=this.y;animation.z=this.z;
      if(animation.orientation){animation.rotation=rotation;animation.flag(2,2);}
      animation.scale2X=animation.scale2Y=scale;animation.flag(4,4);
    }
    const tinted=Array.isArray(tint),faded=alpha!==1;
    const drawBody=(target:DrawList,selfOnly: boolean)=>{
      const originalAlpha=animation.alpha,originalColor=tinted?animation.color:0;
      try{
        if(tinted){const c=originalColor;animation.color=((((c>>>24)*tint[0])<<24)|(((c>>>16&255)*tint[1])<<16)|
          (((c>>>8&255)*tint[2])<<8)|(c&255))>>>0;}
        if(faded)animation.alpha=Math.floor(originalAlpha*alpha);
        if(selfOnly)animation.drawSelf(target,view);else animation.draw(target,view);
      }finally{if(faded)animation.alpha=originalAlpha;if(tinted)animation.color=originalColor;}
    };
    // Keep temporary business tint/fade inside the owner callback. The stock
    // queue captures commands immediately; deferred adapters also retain them.
    if(draw.enqueuePriority){
      draw.enqueuePriority(TOUHOU_OWNER_PRIORITIES.bullet,target=>drawBody(target,true),{order:this.style.drawGroup});
      for(const child of animation.children)child.draw(draw,view);
    }else drawBody(draw,false);
    this.child?.draw(draw,view);return draw;
  }
  snapshot(): {phase:string;birthKind:number|null;ready:boolean;alive:boolean;script:number;sprite:number;alpha:number;scaleX:number;scaleY:number}{return{phase:this.phase,birthKind:this.birthKind,ready:this.ready,alive:this.alive,
    script:this.animation.scriptId,sprite:this.animation.spriteIndex,alpha:this.animation.alpha,
    scaleX:this.animation.scaleX,scaleY:this.animation.scaleY};}
  destroy(): void{this.finish('retire');this.animation.destroy();this.child?.destroy();}
}
