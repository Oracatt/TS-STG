import type {TouhouProjectionCamera} from './anm-projection.js';
import type {AnmDrawList as DrawList} from './anm.js';
import type {AnmBank,AnmInstance,AnmView} from './anm.js';

export interface TouhouSceneTransitionOptions {
 bank:AnmBank;loadingBank?:AnmBank|null;
 /** Original title request: 40 - 10 frames after the effect is spawned. */
 coverFrames?:number;revealLimit?:number;
 coverScripts?:readonly number[];revealScripts?:readonly number[];maskScript?:number|null;loadingScript?:number|null;
 view?:AnmView;width?:number;height?:number;
 /** Source RGBA framebuffer path; false selects its untextured XRGB fallback. */
 masked?:boolean;
}

/** effect_system/transition_panels.cpp and screenswitch.anm: four staggered
 * shutters cover the title, then slide apart over the newly activated game.
 * All artwork is supplied by ANM banks; this owner contains no game branding. */
export class TouhouSceneTransition {
  declare coverFrames: number;
  declare revealLimit: number;
  declare coverScripts: number[];
  declare revealScripts: number[];
  declare maskScript: number | null;
  declare loadingScript: number | null;
  declare view: AnmView;
  declare width: number;
  declare height: number;
  declare masked: boolean;

  declare bank: AnmBank;
  declare loadingBank: AnmBank|null;
  declare panels: AnmInstance[];
  declare mask: AnmInstance|null;
  declare loading: AnmInstance|null;
  declare phase: 'cover'|'reveal';
  declare age: number;
  declare alive: boolean;
  declare destroyed: boolean;

  constructor({bank,loadingBank=null,coverFrames=30,revealLimit=60,
    coverScripts=[3,4,5,6],revealScripts=[7,8,9,10],maskScript=11,loadingScript=17,
    view={x:0,y:0,scale:1,screenScale:1.5},width=960,height=720,masked=true}: TouhouSceneTransitionOptions={} as TouhouSceneTransitionOptions) {
    if(!bank?.create)throw new TypeError('Scene transition requires a screenswitch ANM bank');
    if(!Number.isInteger(coverFrames)||coverFrames<1||!Number.isInteger(revealLimit)||revealLimit<1)
      throw new RangeError('Scene transition durations must be positive integer frames');
    if(coverScripts.length!==4||revealScripts.length!==4)throw new RangeError('Scene transition requires four cover and reveal scripts');
    Object.assign(this,{bank,loadingBank,coverFrames,revealLimit,coverScripts:[...coverScripts],revealScripts:[...revealScripts],maskScript,loadingScript,view:{...view},width,height,masked});
    this.phase='cover';this.age=0;this.alive=true;this.destroyed=false;
    this.panels=this.coverScripts.map(script=>bank.create(script,{x:320,y:240}));
    this.panels[0].setLayer(35); // Effect interrupt7: normal title/game overlay.
    this.mask=maskScript===null?null:bank.create(maskScript);
    // text_renderer/text.cpp: source position (480,392) is doubled before
    // named spawn; ascii17 then uses the original half-resolution mode2.
    this.loading=loadingBank&&loadingScript!==null?loadingBank.create(loadingScript,{x:960,y:784}):null;
  }
  /** The menu requests scene replacement 30 frames after creating the effect.
   * A consumer may hold the covered state until its own resources are ready. */
  get ready(): boolean{return this.phase==='cover'&&this.age>=this.coverFrames;}
  reveal(): this{
    if(!this.alive||this.phase==='reveal')return this;
    for(const vm of this.panels)vm.destroy();
    this.panels=this.revealScripts.map(script=>this.bank.create(script,{x:320,y:240}));
    this.loading?.interrupt(1,true);this.phase='reveal';this.age=0;return this;
  }
  update(): this{
    if(!this.alive)return this;
    for(const vm of this.panels)if(vm.alive)vm.update();
    this.mask?.update();this.loading?.update();this.age++;
    // The final outgoing panel retires at its own ANM frame55; the source
    // callback also has a 60-frame upper bound, not an arbitrary fade timer.
    if(this.phase==='reveal'&&(!this.panels.some(vm=>vm.alive)||this.age>=this.revealLimit))this.destroy();
    return this;
  }
  draw(draw: DrawList): DrawList{
    if(!this.alive)return draw;
    if(this.masked&&this.mask){
      // Clear destination alpha while preserving the scene RGB. The source
      // then writes the moving panels and uses DSTALPHA for its scrolling
      // texture. This uses the public render ABI, without a game shader.
      draw.alphaTest(0);draw.blendFactors('zero','one','add','one','zero','add');
      draw.rect(this.view.x??0,this.view.y??0,this.width,this.height,0);draw.blendEnd();
    }
    for(const vm of this.panels)vm.draw(draw,this.view);
    if(this.masked)this.mask?.draw(draw,this.view);
    this.loading?.draw(draw,this.view);return draw;
  }
  snapshot(): {phase:'cover'|'reveal';age:number;ready:boolean;alive:boolean}{return{phase:this.phase,age:this.age,ready:this.ready,alive:this.alive};}
  destroy(): void{
    if(this.destroyed)return;this.destroyed=true;this.alive=false;
    for(const vm of this.panels)vm.destroy();this.mask?.destroy();this.loading?.destroy();
    this.bank.collect();this.loadingBank?.collect();
  }
}
