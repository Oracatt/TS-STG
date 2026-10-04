/** Generic C++ platform boundary. Implementations of STG rules belong in JS. */
export interface NativeHost {
 readonly version:string;readonly backend:string;readonly width:number;readonly height:number;
 quit():void;log(text:string):void;readText(path:string):string;writeText(path:string,text:string):void;
 loadTexture(path:string,paddedWidth?:number,paddedHeight?:number):number;
 createRenderTarget(width:number,height:number):number;
 createTexture(width:number,height:number,pixels:Uint8Array|Uint8ClampedArray):number;
 updateTexture(id:number,pixels:Uint8Array|Uint8ClampedArray):void;
 /** Updates a top-left-origin RGBA subrectangle without a full texture readback. */
 updateTextureRegion(id:number,x:number,y:number,width:number,height:number,pixels:Uint8Array|Uint8ClampedArray):void;
 /** id0/default reads the previous completed logical canvas. Headless canvas is transparent zero. */
 readTexturePixels(id?:number):{width:number;height:number;pixels:Uint8Array};
 /** Also releases a render target and its color/depth attachments. */
 unloadTexture(id:number):void;
 /** GLSL330 fragment, optional GLSL330 vertex; empty/null vertex uses the host's default vertex stage. */
 createShader(fragmentSource:string,vertexSource?:string|null):number;unloadShader(id:number):void;
 loadFont(path:string,size?:number):number;unloadFont(id:number):void;
 /** Windows DirectWrite shapes a system font; no system font file is bundled. */
 createTextLayout(text:string,options?:SystemTextLayoutOptions):number;
 /** Vector glyphs are transformed before their outline is stroked in output pixels. */
 rasterizeTextLayout(id:number,options?:SystemTextRasterOptions):SystemTextTexture;
 destroyTextLayout(id:number):void;
 /** Tests an installed font family without accepting font substitution. Windows GDI. */
 hasSystemFont(family:string):boolean;
 /** Windows code-page bytes, without a NUL terminator; unmappable characters use the platform replacement. */
 encodeText(text:string,codePage:number):Uint8Array;
 /** Raw GDI glyph raster and natural text extent. No outlines, padding, cropping, or alpha correction. */
 rasterizeBitmapText(text:string,options?:SystemBitmapTextOptions):SystemBitmapTextPixels;
 loadSound(path:string):number;playSound(id:number,volume?:number,pan?:number,loop?:boolean):void;stopSound(id:number):void;unloadSound(id:number):void;
 pauseSound(id:number):void;resumeSound(id:number):void;isSoundPlaying(id:number):boolean;
 loadMusic(path:string):number;playMusic(id:number,volume?:number):void;stopMusic(id:number):void;unloadMusic(id:number):void;
 pauseMusic(id:number):void;resumeMusic(id:number):void;
 /** Sets finite gain in [0,1] without changing playback, pause state or cursor. */
 setMusicVolume(id:number,volume:number):void;
 /** Stream loop bounds are seconds and serviced per rendered frame. */
 setMusicLoop(id:number,startSeconds:number,endSeconds:number):void;
 seekMusic(id:number,seconds:number):void;getMusicTime(id:number):number;
}

export interface SystemTextLayoutOptions {
 fontFamily?:string;fontSize?:number;locale?:string;width?:number;height?:number;
 horizontalAlign?:'left'|'center'|'right';verticalAlign?:'top'|'center'|'bottom';
}
export interface SystemTextRasterOptions {
 width?:number;height?:number;x?:number;y?:number;layoutX?:number;layoutY?:number;
 scale?:number;rotation?:number;fill?:number;outline?:number;strokeWidth?:number;
 /** Preserve Direct2D premultiplied RGBA for an explicit source-over compositor. */
 premultiplied?:boolean;
}
export interface SystemTextTexture {texture:number;x:number;y:number;width:number;height:number;}
export interface SystemBitmapTextOptions {
 width?:number;height?:number;x?:number;y?:number;fontFamily?:string;fontSize?:number;fontWeight?:number;
 charSet?:number;quality?:number;pitchAndFamily?:number;codePage?:number;fill?:number;background?:number;spacing?:number;
 /** Optional initial full RGBA surface, preserving previous pixel/alpha values beneath glyphs. */
 pixels?:Uint8Array|Uint8ClampedArray;
 /** Explicitly permit GDI's font mapper when the named family is absent; default false. */
 allowFontSubstitution?:boolean;
}
export interface SystemBitmapTextPixels {width:number;height:number;pixels:Uint8Array;extentWidth:number;extentHeight:number;}
