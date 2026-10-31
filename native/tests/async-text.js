const host=globalThis.tsstg,check=(ok,message)=>{if(!ok)throw Error(message);};
const layout={fontFamily:'Arial',fontSize:24,width:220,height:60,horizontalAlign:'right'};
const raster={width:440,height:120,scale:2,fill:0xd5e8ffff,outline:0x17263aff,strokeWidth:2};
let rejected=false;try{host.loadTextTextureAsync('bad',layout,{width:0});}catch{rejected=true;}
check(rejected,'async raster parameters must be checked before enqueue');
const cancelled=host.loadTextTextureAsync('cancel',layout,raster);host.cancelResourceLoad(cancelled);
const requests=[
 {ticket:host.loadTextTextureAsync('Preparing...',layout,raster),text:'Preparing...'},
 {ticket:host.loadTextTextureAsync('',layout,raster),text:''},
 {ticket:host.loadTextTextureAsync('missing',{fontFamily:'TS-STG Missing Font 32764'},raster),error:true},
];
let frames=0,completed=0,texture=null;
globalThis.__tsstg_game={
 update(){frames++;const request=requests[completed];if(!request)return;
   const result=host.pollResourceLoad(request.ticket);if(result.state==='pending')return;
   if(request.error)check(result.state==='error'&&result.error.includes('unavailable'),'worker text failure propagated');
   else{
     check(result.state==='ready'&&!!result.text,'ready text bounds returned');
     const expectedLayout=host.createTextLayout(request.text,layout),expected=host.rasterizeTextLayout(expectedLayout,raster);
     host.destroyTextLayout(expectedLayout);
     for(const field of ['x','y','width','height'])check(expected[field]===result.text[field],`async text ${field} matches synchronous oracle`);
     check(result.handle===result.text.texture,'ordinary texture handle ownership');
     if(result.handle){const a=host.readTexturePixels(result.handle),b=host.readTexturePixels(expected.texture);
       check(a.pixels.length===b.pixels.length&&a.pixels.every((v,i)=>v===b.pixels[i]),'worker shaping/raster pixels match');
       host.unloadTexture(expected.texture);texture=result.text;
     }else check(result.text.width===0,'empty text returns no allocation');
   }
   if(++completed===requests.length)host.quit();
 },
 render(){const list=[['clear',0x0b1428ff],['circle',480+Math.sin(frames*.08)*100,360,8,0xd5e8ffff]];
   if(texture)list.push(['sprite',texture.texture,480,600,texture.width/2,texture.height/2,0,0xffffffff]);return list;},
 snapshot(){check(completed===requests.length&&frames>1,'worker jobs finished across multiple presentations');return{completed,frames,asyncText:true};},
};
