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
    createTransition=options=>new TouhouSceneTransition(options),scenes={},initialScene=null,musicPlayer=null }={}) {
    Object.assign(this,{resources,pixels,gameOptions,menuOptions,createGame,createMenu,
      onSceneChange,onPauseChange,onAfterUpdate,onQuit,clock,clearColor,ownResources,transitionOptions,createTransition,musicPlayer});
    if(clock!==null&&typeof clock!=='function')throw new TypeError('Touhou application clock must return platform time in seconds');
    this.createBank=createBank??(resources?(name=>resources.createBank(name)):null);
    this.selection={character:0,difficulty:1,mode:'normal',...initialSelection};
    this.scenes=new Map();for(const [name,factory]of Object.entries(scenes))this.registerScene(name,factory);
    this.scene=null;this.game=null;this.menu=null;this.mode=null;this.disposed=false;
    this.drawList=new DrawList();this._updating=false;this._pending=null;this._paused=false;this._banks=[];
    this.transition=null;this._transitionBanks=[];this._transitionSelection=null;this.sceneUpdated=false;
    if(initialScene!==null)this.switchScene(initialScene);else if(autostart)this.start(this.selection);else this.openMenu();
  }
  registerScene(name,factory){
    if(this.disposed)throw new Error('Touhou application has been disposed');
    if(typeof name!=='string'||!name||typeof factory!=='function')throw new TypeError('Scene registration requires a nonempty name and factory');
    this.scenes.set(name,factory);return this;
  }
  switchScene(name,{selection={},transition=false,data=null}={}){
    this._request(name,{...this.selection,...selection},transition,data);return this;
  }
  _request(mode,selection,transition=false,data=null){
    if(this.disposed)throw new Error('Touhou application has been disposed');
    if(!this.scenes.has(mode)&&mode!=='title'&&mode!=='game')throw new RangeError(`Unknown application scene: ${mode}`);
    if(this._updating){this._pending={mode,selection,transition,data};return;}
    if(transition&&this.transitionOptions!==false){this._beginTransition(mode,selection,data);return;}
    this._clearTransition();
    this._enter(mode,selection,data);
    const pending=this._pending;this._pending=null;if(pending)this._request(pending.mode,pending.selection,pending.transition,pending.data);
  }
  _clearTransition(){
    this.transition?.destroy();this.transition=null;this._transitionSelection=null;this._transitionTarget=null;
    for(const bank of this._transitionBanks)bank.dispose?.();this._transitionBanks=[];
  }
  _beginTransition(mode,selection,data){
    // A new request may redirect the covered handoff without restarting it.
    if(this.transition?.phase==='cover'){this._transitionSelection=selection;this._transitionTarget={mode,data};return;}
    this._clearTransition();
    const options={...this.transitionOptions};
    const create=name=>{if(!this.createBank)throw new TypeError('Scene transition requires a bank factory');const bank=this.createBank(name);this._transitionBanks.push(bank);return bank;};
    try{
      options.bank??=create('screenswitch');
      if(options.loadingBank===undefined)options.loadingBank=create('ascii_960');
      this.transition=this.createTransition(options,this);this._transitionSelection=selection;this._transitionTarget={mode,data};
    }catch(error){this._clearTransition();throw error;}
  }
  _enter(mode,selection,data=null){
    // Lifecycle callbacks may request another scene. Finish owning the current
    // scene first, then process that request just like a request from update().
    const updating=this._updating;this._updating=true;
    try{this._activateScene(mode,selection,data);}finally{this._updating=updating;}
  }
  _activateScene(mode,selection,data){
    this.sceneUpdated=false;
    const previousMode=this.mode,previousScene=this.scene;
    previousScene?.destroy?.();
    for(const bank of this._banks)bank.dispose?.();this._banks=[];
    this.scene=this.game=this.menu=null;
    if(this._paused){this._paused=false;this.onPauseChange?.(false,this);}
    this.mode=mode;
    this.selection={...this.selection,...selection};
    if(this.scenes.has(mode)){
      const createBank=name=>{if(!this.createBank)throw new TypeError('Scene requires a resource bank factory');const bank=this.createBank(name);this._banks.push(bank);return bank;};
      this.scene=this.scenes.get(mode)({selection:{...this.selection},data,createBank},this);
      if(!this.scene||typeof this.scene.update!=='function'||(typeof this.scene.draw!=='function'&&typeof this.scene.render!=='function'))
        throw new TypeError('Scene must implement update and draw or render');
      if(mode==='game')this.game=this.scene;if(mode==='title')this.menu=this.scene;
    }else if(mode==='game'){
      const supplied=typeof this.gameOptions==='function'?this.gameOptions(this.selection,this):this.gameOptions;
      const options={...supplied,character:this.selection.character,difficulty:supplied?.difficulty??this.selection.difficulty};
      if(this.musicPlayer)options.gameOverOptions={musicPlayer:this.musicPlayer,...options.gameOverOptions};
      const player=this.resources?.players?.[this.selection.character]??(this.selection.character===0?{bank:'pl00'}:this.selection.character===1?{bank:'pl01'}:null);
      const playerOptions={...options.systemOptions?.player};
      if(player?.profile&&playerOptions.profile===undefined)playerOptions.profile=player.profile;
      if(player?.sht&&playerOptions.sht===undefined)playerOptions.sht=player.sht;
      if(!options.banks){
        if(!this.createBank)throw new TypeError('Touhou application requires banks or a resource bank factory');
        if(!player?.bank&&!playerOptions.bank)throw new TypeError('Custom character requires a player resource profile or explicit player bank');
        options.banks={};
        for(const name of new Set(['front','bullet','effect','enemy','ascii_960','text',...(player?.bank?[player.bank]:[])])){
          const bank=this.createBank(name);options.banks[name]=bank;this._banks.push(bank);
        }
      }
      if(player?.bank&&playerOptions.bank===undefined)playerOptions.bank=options.banks[player.bank];
      if(Object.keys(playerOptions).length)options.systemOptions={...options.systemOptions,player:playerOptions};
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
        const selection=this._transitionSelection,target=this._transitionTarget,transition=this.transition;this._transitionSelection=null;this._transitionTarget=null;
        this._enter(target.mode,selection,target.data);
        if(this.transition===transition)transition.reveal();
      }
    }else{
      this._updating=true;
      try{this.scene.update(mask);this.sceneUpdated=true;}finally{this._updating=false;}
      // gameplay/activation.cpp enables the game and reveals the shutters in
      // the same activation frame. Gameplay keeps ticking during the reveal.
      if(this.transition){this.transition.update();if(!this.transition.alive)this._clearTransition();}
    }
    const pending=this._pending;this._pending=null;if(pending)this._request(pending.mode,pending.selection,pending.transition,pending.data);
    const paused=this.mode==='game'&&this.game?.paused&&this.game.pauseVisual instanceof TouhouPause;
    if(!!paused!==this._paused){this._paused=!!paused;this.onPauseChange?.(this._paused,this);}
    this.onAfterUpdate?.(this);
    // card_system/timing.cpp runs after the frame, including paused gameplay.
    // Hosts exposing only update/render can inject their clock here. A null
    // clock preserves deterministic simulation and explicit postFrame users.
    if(this.clock)this.postFrame(this.clock());
  }
  postFrame(nowSeconds){return this.scene?.postFrame?.(nowSeconds)??null;}
  render(){
    if(this.disposed)return [];
    if(typeof this.scene.render==='function'){
      const commands=this.scene.render();if(!this.transition)return commands;
      const draw=this.drawList.reset();for(const command of commands)draw.push(command);
      this.transition.draw(draw);return draw.commands;
    }
    const draw=this.drawList.reset().clear(this.clearColor);this.scene.draw(draw);this.transition?.draw(draw);return draw.commands;
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
