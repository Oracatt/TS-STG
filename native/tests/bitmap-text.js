const check=(condition,message)=>{if(!condition)throw Error(message);};
const rejects=(fn,part)=>{let caught=false;try{fn();}catch(error){caught=String(error).includes(part);}check(caught,`Expected ${part}`);};
const equal=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
check(tsstg.hasSystemFont('Arial'),'Expected Windows Arial family');
check(!tsstg.hasSystemFont('TS STG nonexistent font 432987'),'Missing font accepted');
check(equal(tsstg.encodeText('東方ABC',932),new Uint8Array([0x93,0x8c,0x95,0xfb,65,66,67])),'CP932 encoding differs');
check(equal(tsstg.encodeText('é',65001),new Uint8Array([0xc3,0xa9])),'UTF-8 encoding differs');
check(tsstg.encodeText('',932).length===0,'Empty encoding has a NUL terminator');
rejects(()=>tsstg.encodeText('x',99999),'code page');
const options={width:128,height:64,fontFamily:'Arial',fontSize:24,quality:3,charSet:1,codePage:65001,x:9,y:7,fill:0x804020ff,background:0x102030ff};
const first=tsstg.rasterizeBitmapText('STG',options),repeat=tsstg.rasterizeBitmapText('STG',options);
check(first.width===128&&first.height===64&&first.pixels.length===128*64*4,'Logical bitmap dimensions changed');
check(first.extentWidth>0&&first.extentHeight>0,'Missing natural text extent');
check(equal(first.pixels,repeat.pixels),'Bitmap text not deterministic');
let drawn=0;for(let i=0;i<first.pixels.length;i+=4){
 if(first.pixels[i+3]===0){drawn++;check(first.pixels[i]===0x80&&first.pixels[i+1]===0x40&&first.pixels[i+2]===0x20,'GDI fill RGB order changed');}
}
check(drawn>0,'GDI raw zero-alpha glyphs were altered');
check(equal(first.pixels.slice(0,4),new Uint8Array([0x10,0x20,0x30,0xff])),'Background initialization changed');
const shifted=tsstg.rasterizeBitmapText('STG',{...options,x:12,y:12});
for(let y=0;y<54;y++)for(let x=0;x<120;x++){
 const a=(y*128+x)*4,b=((y+5)*128+x+3)*4;
 for(let channel=0;channel<4;channel++)check(first.pixels[a+channel]===shifted.pixels[b+channel],'Bitmap coordinates include unexpected offsets');
}
const spaced=tsstg.rasterizeBitmapText('STG',{...options,spacing:30});
check(spaced.extentWidth===first.extentWidth&&spaced.extentHeight===first.extentHeight,'Spacing changed natural GDI extent');
check(!equal(first.pixels,spaced.pixels),'Explicit per-character spacing ignored');
const empty=tsstg.rasterizeBitmapText('',{...options,background:0x11223344});
for(let i=0;i<empty.pixels.length;i+=4)check(equal(empty.pixels.slice(i,i+4),new Uint8Array([0x11,0x22,0x33,0x44])),'Empty bitmap changed caller alpha');
const imported=tsstg.rasterizeBitmapText('',{...options,pixels:first.pixels});check(equal(imported.pixels,first.pixels),'Initial raw RGBA bitmap changed');
const redrawn=tsstg.rasterizeBitmapText('STG',{...options,pixels:first.pixels});check(equal(redrawn.pixels,first.pixels),'Repeated no-AA glyph drawing changed its raw surface');
rejects(()=>tsstg.rasterizeBitmapText('',{...options,pixels:new Uint8Array(0)}),'pixels');
rejects(()=>tsstg.rasterizeBitmapText('x',{fontFamily:'TS STG nonexistent font 432987'}),'unavailable');
check(tsstg.rasterizeBitmapText('x',{fontFamily:'TS STG nonexistent font 432987',allowFontSubstitution:true}).extentWidth>0,'Explicit GDI font mapper fallback failed');
rejects(()=>tsstg.rasterizeBitmapText('x',{allowFontSubstitution:1}),'boolean');
rejects(()=>tsstg.rasterizeBitmapText('x',{width:1.5}),'width');
rejects(()=>tsstg.rasterizeBitmapText('x',{fontWeight:1001}),'fontWeight');
rejects(()=>tsstg.rasterizeBitmapText('x',{codePage:999}),'code page');
rejects(()=>tsstg.rasterizeBitmapText('x',{x:NaN}),'finite');
let frame=0;globalThis.__tsstg_game={update(){frame++;},render(){return[];},snapshot(){return{frame,bitmapText:true,extent:[first.extentWidth,first.extentHeight],drawn};}};
