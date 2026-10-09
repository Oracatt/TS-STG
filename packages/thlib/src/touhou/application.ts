import type { DrawCommand } from '../core-types.js';
import type { TouhouTitleMenuOptions } from './menu.js';
interface SceneRequest { mode: string; selection?: Partial<TouhouStartSelection>; transition: boolean; data: unknown; }
import type {AnmBank} from './anm.js';
import type {TouhouGameOptions} from './game.js';
import type {TouhouStartSelection} from './menu.js';
import type {TouhouResources} from './resources.js';
import type {TouhouPixelServices} from './pause-capture.js';
import type {TouhouSceneTransitionOptions} from './scene-transition.js';
import type {TouhouMusic} from './music.js';

export interface TouhouApplicationScene {
 update(mask:number):void;draw?(draw:DrawList):unknown;render?():unknown[][];destroy?():void;
 snapshot?():Record<string,unknown>;postFrame?(seconds:number):number|null|undefined;
}

export interface TouhouApplicationGameScene extends TouhouApplicationScene { readonly paused?:boolean; readonly pauseVisual?:unknown; }

export interface TouhouSceneContext {selection:TouhouStartSelection;data:unknown;createBank(name:string):AnmBank;}

export type TouhouSceneFactory<GameScene extends TouhouApplicationGameScene=TouhouGame>=(context:TouhouSceneContext,application:TouhouApplication<GameScene>)=>TouhouApplicationScene;

export interface TouhouSceneRequest {selection?:Partial<TouhouStartSelection>;transition?:boolean;data?:unknown;}

export interface TouhouApplicationOptions<GameScene extends TouhouApplicationGameScene=TouhouGame> {
 /** Caller-owned music transport, automatically used by the built-in game-over flow. */
 musicPlayer?:Pick<TouhouMusic,'interrupt'>|null;
 resources?:TouhouResources|null;createBank?:(name:string)=>AnmBank;pixels?:TouhouPixelServices|null;
 gameOptions?:Partial<TouhouGameOptions>|((selection:TouhouStartSelection,application:TouhouApplication<GameScene>)=>Partial<TouhouGameOptions>);
 menuOptions?:Partial<ConstructorParameters<typeof TouhouTitleMenu>[0]>|((application:TouhouApplication<GameScene>)=>Partial<ConstructorParameters<typeof TouhouTitleMenu>[0]>);
 createGame?:(options:TouhouGameOptions,application:TouhouApplication<GameScene>)=>GameScene;
 createMenu?:(options:ConstructorParameters<typeof TouhouTitleMenu>[0],application:TouhouApplication<GameScene>)=>TouhouTitleMenu;
 onSceneChange?:(change:{mode:string;previousMode:string|null;scene:TouhouApplicationScene;selection:TouhouStartSelection},application:TouhouApplication<GameScene>)=>void;
 onPauseChange?:(paused:boolean,application:TouhouApplication<GameScene>)=>void;onAfterUpdate?:(application:TouhouApplication<GameScene>)=>void;onQuit?:(application:TouhouApplication<GameScene>)=>void;
 /** Optional platform clock in seconds. Calls postFrame automatically after each completed update, including pause frames. */
 clock?:(()=>number)|null;
 initialSelection?:Partial<TouhouStartSelection>;autostart?:boolean;clearColor?:number;ownResources?:boolean;
 /** Source shutters for menu launches; false disables them. Supplied ANM banks are caller owned. */
 transitionOptions?:false|Partial<TouhouSceneTransitionOptions>;
 createTransition?:(options:TouhouSceneTransitionOptions,application:TouhouApplication<GameScene>)=>TouhouSceneTransition;
 /** Named scenes may also override title/game. The factory owns the scene; banks from context.createBank are application-owned. */
 scenes?:Record<string,TouhouSceneFactory<GameScene>>;initialScene?:string|null;
}

import { DrawList } from '../render.js';
import { TouhouGame } from './game.js';
import { TouhouTitleMenu,TOUHOU_MAIN_LABELS } from './menu.js';
import { TouhouPause } from './pause.js';
import { TouhouPauseCapture } from './pause-capture.js';
import { TouhouSceneTransition } from './scene-transition.js';

/** Portable application lifecycle for the original menu → selection → game →
 * pause/result → retry/title flow. Resource I/O, music and authored stages are
 * adapters; the scene ownership and transition rules belong to thlib. */
export class TouhouApplication<GameScene extends TouhouApplicationGameScene=TouhouGame> {
  declare _pending: SceneRequest | null;
  declare _banks: AnmBank[];
  declare _transitionBanks: AnmBank[];
  declare _transitionSelection: Partial<TouhouStartSelection> | null | undefined;
  declare _transitionTarget: {mode: string; data: unknown} | null;
  declare pixels: TouhouPixelServices | null;
  declare gameOptions: (Partial<TouhouGameOptions> | ((selection: TouhouStartSelection, application: TouhouApplication<GameScene>) => Partial<TouhouGameOptions>));
  declare menuOptions: (Partial<TouhouTitleMenuOptions> | ((application: TouhouApplication<GameScene>) => Partial<ConstructorParameters<typeof TouhouTitleMenu>[0]>));
  declare createGame: ((options: TouhouGameOptions, application: TouhouApplication<GameScene>) => GameScene);
  declare createMenu: ((options: ConstructorParameters<typeof TouhouTitleMenu>[0], application: TouhouApplication<GameScene>) => TouhouTitleMenu);
  declare onSceneChange: (((change: { mode: string; previousMode: string | null; scene: TouhouApplicationScene; selection: TouhouStartSelection; }, application: TouhouApplication<GameScene>) => void) | undefined);
  declare onPauseChange: (((paused: boolean, application: TouhouApplication<GameScene>) => void) | undefined);
  declare onAfterUpdate: (((application: TouhouApplication<GameScene>) => void) | undefined);
  declare onQuit: (((application: TouhouApplication<GameScene>) => void) | undefined);
  declare clearColor: number;
  declare ownResources: boolean;
  declare transitionOptions: false | Partial<TouhouSceneTransitionOptions>;
  declare createTransition: ((options: TouhouSceneTransitionOptions, application: TouhouApplication<GameScene>) => TouhouSceneTransition);
  declare createBank: (((name: string) => AnmBank) | null);
  declare _updating: boolean;
  declare _paused: boolean;

  declare resources: TouhouResources|null;
  declare musicPlayer: Pick<TouhouMusic,'interrupt'>|null;
  declare mode: string;
  declare scene: TouhouApplicationScene|null;
  declare game: GameScene|null;
  declare menu: TouhouTitleMenu|null;
  declare scenes: Map<string,TouhouSceneFactory<GameScene>>;
  declare selection: TouhouStartSelection;
  declare disposed: boolean;
  declare drawList: DrawList;
  declare clock: (()=>number)|null;
  declare transition: TouhouSceneTransition|null;
  declare sceneUpdated: boolean;

  constructor({ resources=null, createBank, pixels=null, gameOptions={}, menuOptions={},
    createGame=options=>new TouhouGame(options) as unknown as GameScene, createMenu=options=>new TouhouTitleMenu(options),
    onSceneChange, onPauseChange, onAfterUpdate, onQuit, clock=null, initialSelection={},
    autostart=false, clearColor=0x000000ff, ownResources=false, transitionOptions={},
    createTransition=options=>new TouhouSceneTransition(options),scenes={},initialScene=null,musicPlayer=null }: TouhouApplicationOptions<GameScene>={} as TouhouApplicationOptions<GameScene>) {
    Object.assign(this,{resources,pixels,gameOptions,menuOptions,createGame,createMenu,
      onSceneChange,onPauseChange,onAfterUpdate,onQuit,clock,clearColor,ownResources,transitionOptions,createTransition,musicPlayer});
    if(clock!==null&&typeof clock!=='function')throw new TypeError('Touhou application clock must return platform time in seconds');
    this.createBank=createBank??(resources?(name=>resources.createBank(name)):null);
    this.selection={character:0,difficulty:1,mode:'normal',...initialSelection};
    this.scenes=new Map();for(const [name,factory]of Object.entries(scenes))this.registerScene(name,factory);
    this.scene=null;this.game=null;this.menu=null;(this as {mode:string|null}).mode=null;this.disposed=false;
    this.drawList=new DrawList();this._updating=false;this._pending=null;this._paused=false;this._banks=[];
    this.transition=null;this._transitionBanks=[];this._transitionSelection=null;this.sceneUpdated=false;
    if(initialScene!==null)this.switchScene(initialScene);else if(autostart)this.start(this.selection);else this.openMenu();
  }
  registerScene(name: string,factory: TouhouSceneFactory<GameScene>): this{
    if(this.disposed)throw new Error('Touhou application has been disposed');
    if(typeof name!=='string'||!name||typeof factory!=='function')throw new TypeError('Scene registration requires a nonempty name and factory');
    this.scenes.set(name,factory);return this;
  }
  switchScene(name: string,{selection={},transition=false,data=null}: TouhouSceneRequest={} as TouhouSceneRequest): this{
    this._request(name,{...this.selection,...selection},transition,data);return this;
  }
  _request(mode: string,selection?: Partial<TouhouStartSelection>,transition=false,data: unknown=null){
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
  _beginTransition(mode: string,selection: Partial<TouhouStartSelection> | undefined,data: unknown){
    // A new request may redirect the covered handoff without restarting it.
    if(this.transition?.phase==='cover'){this._transitionSelection=selection;this._transitionTarget={mode,data};return;}
    this._clearTransition();
    const options={...this.transitionOptions as Partial<TouhouSceneTransitionOptions>};
    const create=(name: string)=>{if(!this.createBank)throw new TypeError('Scene transition requires a bank factory');const bank=this.createBank(name);this._transitionBanks.push(bank);return bank;};
    try{
      options.bank??=create('screenswitch');
      if(options.loadingBank===undefined)options.loadingBank=create('ascii_960');
      this.transition=this.createTransition(options as TouhouSceneTransitionOptions,this);this._transitionSelection=selection;this._transitionTarget={mode,data};
    }catch(error){this._clearTransition();throw error;}
  }
  _enter(mode: string,selection: Partial<TouhouStartSelection> | undefined,data: unknown=null){
    // Lifecycle callbacks may request another scene. Finish owning the current
    // scene first, then process that request just like a request from update().
    const updating=this._updating;this._updating=true;
    try{this._activateScene(mode,selection,data);}finally{this._updating=updating;}
  }
  _activateScene(mode: string,selection: Partial<TouhouStartSelection> | undefined,data: unknown){
    this.sceneUpdated=false;
    const previousMode=this.mode,previousScene=this.scene;
    previousScene?.destroy?.();
    for(const bank of this._banks)bank.dispose?.();this._banks=[];
    this.scene=this.game=this.menu=null;
    if(this._paused){this._paused=false;this.onPauseChange?.(false,this);}
    this.mode=mode;
    this.selection={...this.selection,...selection};
    if(this.scenes.has(mode)){
      const createBank=(name: string)=>{if(!this.createBank)throw new TypeError('Scene requires a resource bank factory');const bank=this.createBank(name);this._banks.push(bank);return bank;};
      this.scene=this.scenes.get(mode)!({selection:{...this.selection},data,createBank},this);
      if(!this.scene||typeof this.scene.update!=='function'||(typeof this.scene.draw!=='function'&&typeof this.scene!.render!=='function'))
        throw new TypeError('Scene must implement update and draw or render');
      // Named overrides occupy the public built-in slots; their factory owns that compatibility contract.
      if(mode==='game')this.game=this.scene as GameScene;if(mode==='title')this.menu=this.scene as TouhouTitleMenu;
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
      options.font??=this.resources?.font!;options.styles??=this.resources?.styles;
      options.sht??=this.resources?.shots[this.selection.character];
      if(!options.pauseCapture&&this.pixels){
        if(!options.banks.text){const bank=this.createBank!('text');options.banks.text=bank;this._banks.push(bank);}
        options.pauseCapture=new TouhouPauseCapture({bank:options.banks.text,pixels:this.pixels,rng:options.visualRng});
      }
      options.session={mode:this.selection.mode==='practice'?1:0,...options.session};
      options.onExit??=()=>this.openMenu();options.onRestart??=()=>this.start(this.selection);
      this.scene=this.game=this.createGame(options as TouhouGameOptions,this);
    }else{
      const supplied=typeof this.menuOptions==='function'?this.menuOptions(this):this.menuOptions;
      const options={difficulty:this.selection.difficulty,character:this.selection.character,font:this.resources?.font!,...supplied};
      if(!options.bank){
        if(!this.createBank)throw new TypeError('Touhou application requires a menu bank or bank factory');
        options.bank=this.createBank('title');this._banks.push(options.bank);
      }
      options.onStart??=((selected)=>this.startTransition(selected));
      const quitIndex=options.quitIndex??(options.labels??TOUHOU_MAIN_LABELS).length-1;
      options.startModes??=options.labels?{0:'normal'}:{0:'normal',2:'practice'};
      if(!options.onSelect&&options.excluded===undefined)
        options.excluded=(options.labels??TOUHOU_MAIN_LABELS).map((_,index)=>index).filter((index)=>index!==quitIndex&&options.startModes![index]===undefined);
      options.onSelect??=(index=>{if(index===quitIndex)this.onQuit?.(this);});
      this.scene=this.menu=this.createMenu(options as TouhouTitleMenuOptions,this);
    }
    this.onSceneChange?.({mode,previousMode,scene:this.scene!,selection:{...this.selection}},this);
  }
  start(selection: Partial<TouhouStartSelection>={}): this{this._request('game',{...this.selection,...selection});return this;}
  /** Interactive title/selection launch. start() and autostart intentionally
   * remain immediate for programmatic starts, replay fixtures and retries. */
  startTransition(selection: Partial<TouhouStartSelection>={}): this{this._request('game',{...this.selection,...selection},true);return this;}
  openMenu(): this{this._request('title');return this;}
  update(mask: number=0): void{
    if(this.disposed)return;
    this.sceneUpdated=false;
    if(this.transition?.phase==='cover'){
      this.transition.update();
      if(this.transition.ready){
        const selection=this._transitionSelection,target=this._transitionTarget,transition=this.transition;this._transitionSelection=null;this._transitionTarget=null;
        this._enter(target!.mode,selection!,target!.data);
        if(this.transition===transition)transition.reveal();
      }
    }else{
      this._updating=true;
      try{this.scene!.update(mask);this.sceneUpdated=true;}finally{this._updating=false;}
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
  postFrame(nowSeconds: number): number|null{return this.scene?.postFrame?.(nowSeconds)??null;}
  render(): unknown[][]{
    if(this.disposed)return [];
    if(typeof this.scene!.render==='function'){
      const commands=this.scene!.render!();if(!this.transition)return commands;
      const draw=this.drawList.reset();for(const command of commands)draw.push(command as DrawCommand);
      this.transition.draw(draw);return draw.commands;
    }
    const draw=this.drawList.reset().clear(this.clearColor);this.scene!.draw!(draw);this.transition?.draw(draw);return draw.commands;
  }
  snapshot(): Record<string,unknown>{return{mode:this.mode,...this.scene?.snapshot?.(),...(this.transition?{transition:this.transition.snapshot()}: {})};}
  destroy(): void{
    if(this.disposed)return;this.disposed=true;this._pending=null;
    this._clearTransition();
    this.scene?.destroy?.();for(const bank of this._banks)bank.dispose?.();this._banks=[];
    this.scene=this.game=this.menu=null;
    if(this._paused)this.onPauseChange?.(false,this);this._paused=false;
    if(this.ownResources)this.resources?.dispose();
  }
}
