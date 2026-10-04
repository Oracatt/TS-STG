import type {DrawList} from '../index.js';
import type {AnmBank,AnmInstance,AnmView} from './anm.js';
import type {TouhouBitmapTextHost,TouhouTextRenderer} from './text-renderer.js';
export const TOUHOU_MUSIC_CAPTION_VIEW:Readonly<{x:0;y:0;scale:1;screenScale:1.5}>;
export interface TouhouMusicCaptionHost extends Pick<TouhouBitmapTextHost,'hasSystemFont'|'encodeText'|'rasterizeBitmapText'> {
  createTexture(width:number,height:number,pixels:Uint8Array):number;
  unloadTexture(texture:number):void;
}
export interface TouhouMusicCaptionOptions {
  text:string;host?:TouhouMusicCaptionHost|null;codePage?:number;font?:number;color?:number;shadowColor?:number;view?:AnmView;
}
export interface TouhouMusicCaptionSnapshot {
  text:string;frame:number;alive:boolean;view:AnmView;animation:ReturnType<AnmInstance['snapshot']>;
}
/** Shared original 340-frame music announcement; music selection and text belong to the application. */
export class TouhouMusicCaption {
  constructor(options:TouhouMusicCaptionOptions);
  text:string;host:TouhouMusicCaptionHost|null;view:AnmView;frame:number;disposed:boolean;texture:number|null;
  bank:AnmBank;animation:AnmInstance;renderer:TouhouTextRenderer|null;readonly alive:boolean;
  update():this;draw(draw:DrawList,view?:AnmView):DrawList;snapshot():TouhouMusicCaptionSnapshot;destroy():void;
}
