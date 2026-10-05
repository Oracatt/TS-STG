import type {DrawList} from '../index.js';
import type {AnmBank} from './anm.js';
import type {TouhouGame,TouhouGameOptions} from './game.js';
import type {TouhouTitleMenu,TouhouStartSelection} from './menu.js';
import type {TouhouResources} from './resources.js';
import type {TouhouPixelServices} from './pause-capture.js';
import type {TouhouSceneTransition,TouhouSceneTransitionOptions} from './scene-transition.js';
export interface TouhouApplicationScene {
 update(mask:number):void;draw?(draw:DrawList):unknown;render?():unknown[][];destroy?():void;
 snapshot?():Record<string,unknown>;postFrame?(seconds:number):number|null;
}
export interface TouhouSceneContext {selection:TouhouStartSelection;data:unknown;createBank(name:string):AnmBank;}
export type TouhouSceneFactory=(context:TouhouSceneContext,application:TouhouApplication)=>TouhouApplicationScene;
export interface TouhouSceneRequest {selection?:Partial<TouhouStartSelection>;transition?:boolean;data?:unknown;}
export interface TouhouApplicationOptions {
 resources?:TouhouResources|null;createBank?:(name:string)=>AnmBank;pixels?:TouhouPixelServices|null;
 gameOptions?:Partial<TouhouGameOptions>|((selection:TouhouStartSelection,application:TouhouApplication)=>Partial<TouhouGameOptions>);
 menuOptions?:Partial<ConstructorParameters<typeof TouhouTitleMenu>[0]>|((application:TouhouApplication)=>Partial<ConstructorParameters<typeof TouhouTitleMenu>[0]>);
 createGame?:(options:TouhouGameOptions,application:TouhouApplication)=>TouhouGame;
 createMenu?:(options:ConstructorParameters<typeof TouhouTitleMenu>[0],application:TouhouApplication)=>TouhouTitleMenu;
 onSceneChange?:(change:{mode:string;previousMode:string|null;scene:TouhouApplicationScene;selection:TouhouStartSelection},application:TouhouApplication)=>void;
 onPauseChange?:(paused:boolean,application:TouhouApplication)=>void;onAfterUpdate?:(application:TouhouApplication)=>void;onQuit?:(application:TouhouApplication)=>void;
 /** Optional platform clock in seconds. Calls postFrame automatically after each completed update, including pause frames. */
 clock?:(()=>number)|null;
 initialSelection?:Partial<TouhouStartSelection>;autostart?:boolean;clearColor?:number;ownResources?:boolean;
 /** Source shutters for menu launches; false disables them. Supplied ANM banks are caller owned. */
 transitionOptions?:false|Partial<TouhouSceneTransitionOptions>;
 createTransition?:(options:TouhouSceneTransitionOptions,application:TouhouApplication)=>TouhouSceneTransition;
 /** Named scenes may also override title/game. The factory owns the scene; banks from context.createBank are application-owned. */
 scenes?:Record<string,TouhouSceneFactory>;initialScene?:string|null;
}
export class TouhouApplication {
 constructor(options?:TouhouApplicationOptions);resources:TouhouResources|null;
 mode:string;scene:TouhouApplicationScene|null;game:TouhouGame|null;menu:TouhouTitleMenu|null;
 scenes:Map<string,TouhouSceneFactory>;registerScene(name:string,factory:TouhouSceneFactory):this;switchScene(name:string,request?:TouhouSceneRequest):this;
 selection:TouhouStartSelection;disposed:boolean;drawList:DrawList;clock:(()=>number)|null;
 transition:TouhouSceneTransition|null;
 /** True only when the active scene's update was called this tick. Cover ticks are not gameplay/replay input. */
 sceneUpdated:boolean;
 /** Immediate programmatic start (also used by autostart/retry). */
 start(selection?:Partial<TouhouStartSelection>):this;
 /** Menu/selection launch with the original cover and reveal sequence. */
 startTransition(selection?:Partial<TouhouStartSelection>):this;openMenu():this;update(mask?:number):void;
 postFrame(nowSeconds:number):number|null;render():unknown[][];snapshot():Record<string,unknown>;destroy():void;
}
