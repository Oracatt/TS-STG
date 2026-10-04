import { DrawList } from '../render.js';
import { TouhouGame } from './game.js';
import { TouhouTitleMenu,TOUHOU_MAIN_LABELS } from './menu.js';
import { TouhouPause } from './pause.js';
import { TouhouPauseCapture } from './pause-capture.js';
import { TouhouSceneTransition } from './scene-transition.js';

/** Portable application lifecycle for the original menu → selection → game →
 * pause/result → retry/title flow. Resource I/O, music and authored stages are
 * adapters; the scene ownership and transition rules belong to thlib. */
export class TouhouApplication {
  constructor({ resources=null, createBank, pixels=null, gameOptions={}, menuOptions={},
    createGame=options=>new TouhouGame(options), createMenu=options=>new TouhouTitleMenu(options),
    onSceneChange, onPauseChange, onAfterUpdate, onQuit, clock=null, initialSelection={},
    autostart=false, clearColor=0x000000ff, ownResources=false, transitionOptions={},
    createTransition=options=>new TouhouSceneTransition(options) }={}) {
    Object.assign(this,{resources,pixels,gameOptions,menuOptions,createGame,createMenu,
      onSceneChange,onPauseChange,onAfterUpdate,onQuit,clock,clearColor,ownResources,transitionOptions,createTransition});
    if(clock!==null&&typeof clock!=='function')throw new TypeError('Touhou application clock must return platform time in seconds');
    this.createBank=createBank??(resources?(name=>resources.createBank(name)):null);
    this.selection={character:0,difficulty:1,mode:'normal',...initialSelection};
    this.scene=null;this.game=null;this.menu=null;this.mode=null;this.disposed=false;
    this.drawList=new DrawList();this._updating=false;this._pending=null;this._paused=false;this._banks=[];
    this.transition=null;this._transitionBanks=[];this._transitionSelection=null;this.sceneUpdated=false;
    if(autostart)this.start(this.selection);else this.openMenu();
  }
  _request(mode,selection,transition=false){
    if(this.disposed)throw new Error('Touhou application has been disposed');
    if(this._updating){this._pending={mode,selection,transition};return;}
    if(transition&&this.transitionOptions!==false){this._beginTransition(selection);return;}
    this._clearTransition();
    this._enter(mode,selection);
  }
  _clearTransition(){
    this.transition?.destroy();this.transition=null;this._transitionSelection=null;
    for(const bank of this._transitionBanks)bank.dispose?.();this._transitionBanks=[];
  }
  _beginTransition(selection){
    // A repeated title callback must not restart the cover indefinitely.
    if(this.transition?.phase==='cover')return;
    this._clearTransition();
    const options={...this.transitionOptions};
    const create=name=>{if(!this.createBank)throw new TypeError('Scene transition requires a bank factory');const bank=this.createBank(name);this._transitionBanks.push(bank);return bank;};
    try{
      options.bank??=create('screenswitch');
      if(options.loadingBank===undefined)options.loadingBank=create('ascii_960');
      this.transition=this.createTransition(options,this);this._transitionSelection=selection;
    }catch(error){this._clearTransition();throw error;}
  }
  _enter(mode,selection){
    this.sceneUpdated=false;
    const previousMode=this.mode,previousScene=this.scene;
    previousScene?.destroy?.();
    for(const bank of this._banks)bank.dispose?.();this._banks=[];
    this.scene=this.game=this.menu=null;
    if(this._paused){this._paused=false;this.onPauseChange?.(false,this);}
    this.mode=mode;
    if(mode==='game'){
      this.selection={...this.selection,...selection};
      const supplied=typeof this.gameOptions==='function'?this.gameOptions(this.selection,this):this.gameOptions;
      const options={...supplied,character:this.selection.character,difficulty:this.selection.difficulty};
      if(!options.banks){
        if(!this.createBank)throw new TypeError('Touhou application requires banks or a resource bank factory');
        options.banks={};
        for(const name of ['front','bullet','effect','enemy','ascii_960','text',this.selection.character?'pl01':'pl00']){
          const bank=this.createBank(name);options.banks[name]=bank;this._banks.push(bank);
        }
      }
      options.font??=this.resources?.font;options.styles??=this.resources?.styles;
      options.sht??=this.resources?.shots[this.selection.character];
      if(!options.pauseCapture&&this.pixels){
        if(!options.banks.text){const bank=this.createBank('text');options.banks.text=bank;this._banks.push(bank);}
        options.pauseCapture=new TouhouPauseCapture({bank:options.banks.text,pixels:this.pixels,rng:options.visualRng});
      }
      options.session={mode:this.selection.mode==='practice'?1:0,...options.session};
      options.onExit??=()=>this.openMenu();options.onRestart??=()=>this.start(this.selection);
      this.scene=this.game=this.createGame(options,this);
    }else{
      const supplied=typeof this.menuOptions==='function'?this.menuOptions(this):this.menuOptions;
      const options={difficulty:this.selection.difficulty,character:this.selection.character,font:this.resources?.font,...supplied};
      if(!options.bank){
        if(!this.createBank)throw new TypeError('Touhou application requires a menu bank or bank factory');
        options.bank=this.createBank('title');this._banks.push(options.bank);
      }
      options.onStart??=(selected=>this.startTransition(selected));
      const quitIndex=options.quitIndex??(options.labels??TOUHOU_MAIN_LABELS).length-1;
      options.startModes??=options.labels?{0:'normal'}:{0:'normal',2:'practice'};
      if(!options.onSelect&&options.excluded===undefined)
        options.excluded=(options.labels??TOUHOU_MAIN_LABELS).map((_,index)=>index).filter(index=>index!==quitIndex&&options.startModes[index]===undefined);
      options.onSelect??=(index=>{if(index===quitIndex)this.onQuit?.(this);});
      this.scene=this.menu=this.createMenu(options,this);
    }
    this.onSceneChange?.({mode,previousMode,scene:this.scene,selection:{...this.selection}},this);
  }
  start(selection={}){this._request('game',{...this.selection,...selection});return this;}
  /** Interactive title/selection launch. start() and autostart intentionally
   * remain immediate for programmatic starts, replay fixtures and retries. */
  startTransition(selection={}){this._request('game',{...this.selection,...selection},true);return this;}
  openMenu(){this._request('title');return this;}
  update(mask=0){
    if(this.disposed)return;
    this.sceneUpdated=false;
    if(this.transition?.phase==='cover'){
      this.transition.update();
      if(this.transition.ready){
        const selection=this._transitionSelection;this._transitionSelection=null;
        this._enter('game',selection);this.transition.reveal();
      }
    }else{
      this._updating=true;
      try{this.scene.update(mask);this.sceneUpdated=true;}finally{this._updating=false;}
      // gameplay/activation.cpp enables the game and reveals the shutters in
      // the same activation frame. Gameplay keeps ticking during the reveal.
      if(this.transition){this.transition.update();if(!this.transition.alive)this._clearTransition();}
    }
    const pending=this._pending;this._pending=null;if(pending)this._request(pending.mode,pending.selection,pending.transition);
    const paused=this.mode==='game'&&this.game.paused&&this.game.pauseVisual instanceof TouhouPause;
    if(!!paused!==this._paused){this._paused=!!paused;this.onPauseChange?.(this._paused,this);}
    this.onAfterUpdate?.(this);
    // card_system/timing.cpp runs after the frame, including paused gameplay.
    // Hosts exposing only update/render can inject their clock here. A null
    // clock preserves deterministic simulation and explicit postFrame users.
    if(this.clock)this.postFrame(this.clock());
  }
  postFrame(nowSeconds){return this.game?.postFrame?.(nowSeconds)??null;}
  render(){
    if(this.disposed)return [];
    if(this.mode==='game'){
      const commands=this.game.render();if(!this.transition)return commands;
      const draw=this.drawList.reset();for(const command of commands)draw.push(command);
      this.transition.draw(draw);return draw.commands;
    }
    const draw=this.drawList.reset().clear(this.clearColor);this.menu.draw(draw);this.transition?.draw(draw);return draw.commands;
  }
  snapshot(){return{mode:this.mode,...this.scene?.snapshot?.(),...(this.transition?{transition:this.transition.snapshot()}: {})};}
  destroy(){
    if(this.disposed)return;this.disposed=true;this._pending=null;
    this._clearTransition();
    this.scene?.destroy?.();for(const bank of this._banks)bank.dispose?.();this._banks=[];
    this.scene=this.game=this.menu=null;
    if(this._paused)this.onPauseChange?.(false,this);this._paused=false;
    if(this.ownResources)this.resources?.dispose();
  }
}
