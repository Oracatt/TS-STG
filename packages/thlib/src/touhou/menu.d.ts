import type { AnmBank,AnmInstance } from './anm.js';
import { RepeatingInput } from '../index.js';
import type { DrawList } from '../index.js';
import type { TouhouBitmapFont } from './font.js';
export interface TouhouMenuBackground {textureId:number|null;update():void;drawCapture?(draw:DrawList):void;draw(draw:DrawList):void;destroy?():void;}
export class TouhouButtons extends RepeatingInput {constructor();repeat8:number;repeat12:number;count8:Uint32Array;count12:Uint32Array;}
export const TOUHOU_MAIN_LABELS:readonly string[];
export function touhouMenuStyle(index:number,selected:number,options?:{excluded?:boolean;flash?:number;jitter?:number}):{color:number;shadowColor:number;offset:number};
export type TouhouSelectionId=string|number;
export type TouhouSelectionStep='difficulty'|'character';
export interface TouhouSelectionEntry {id:TouhouSelectionId;label?:string;[key:string]:unknown;}
export interface TouhouSelectionPage {
 draw(draw:DrawList,menu:TouhouTitleMenu):void;update?(mask:number,menu:TouhouTitleMenu):void;
 onSelectionChange?(id:TouhouSelectionId,menu:TouhouTitleMenu):void;destroy?():void;
}
export interface TouhouStartSelection {character:TouhouSelectionId;difficulty:TouhouSelectionId;mode:string;}
export interface TouhouTitleMenuOptions {
 bank:AnmBank;decorationBank?:AnmBank;font:TouhouBitmapFont;background?:TouhouMenuBackground;
 labels?:readonly string[];excluded?:number[];difficulty?:TouhouSelectionId;character?:TouhouSelectionId;
 onSelect?:(index:number,menu:TouhouTitleMenu)=>void;onStart?:(selection:TouhouStartSelection)=>void;sound?:(id:number)=>void;
 scripts?:Record<number,number|false>;childScripts?:Record<number,number>;startModes?:Record<number,string>;quitIndex?:number;
 layout?:{font?:number;x?:number;y?:number;lineHeight?:number};disposeBanks?:boolean;disposeBackground?:boolean;
 difficulties?:readonly (TouhouSelectionId|TouhouSelectionEntry)[];characters?:readonly (TouhouSelectionId|TouhouSelectionEntry)[];
 /** Omit a page to skip it. The mode callback supports e.g. an Extra route without a difficulty page. */
 selectionFlow?:readonly TouhouSelectionStep[]|((mode:string,menu:TouhouTitleMenu)=>readonly TouhouSelectionStep[]);
 /** Required for IDs outside the source 0..3 difficulties and 0..1 characters. Null uses the source ANMs. */
 createSelectionPage?:(kind:TouhouSelectionStep,menu:TouhouTitleMenu)=>TouhouSelectionPage|null;
}
export class TouhouTitleMenu {
 constructor(options:TouhouTitleMenuOptions);
 state:string;phase:number;age:number;selection:number;difficulty:TouhouSelectionId;character:TouhouSelectionId;finished:boolean;buttons:TouhouButtons;
 difficulties:TouhouSelectionEntry[];characters:TouhouSelectionEntry[];readonly selectionEntries:TouhouSelectionEntry[];readonly selectedId:TouhouSelectionId;
 update(mask:number):void;draw(draw:DrawList):DrawList;destroy():void;snapshot():{state:string;phase:number;age:number;selection:number;difficulty:TouhouSelectionId;character:TouhouSelectionId};
}
