// Isolated original HUD/spell bitmap text workload in the actual QuickJS host.
// Draw commands are retained; timings exclude native decoding and the GPU.
import { DrawList } from '../packages/thlib/dist/render.js';
import { Th20BitmapFont,th20GroupedScore } from '../games/touhou20/src/font.js';
const host=globalThis.tsstg,config=globalThis.__TH20_FONT_PERF??{},warmup=config.warmup??30,frames=config.frames??300,repeats=config.repeats??4;
const data=JSON.parse(host.readText('games/touhou20/assets/anm/ascii_960.json'));
const font=new Th20BitmapFont(data,{loadTexture:(...args)=>host.loadTexture(...args)}),draw=new DrawList();
let frame=0,elapsed=0,commands=0,report;const samples=[];
function workload(tick){
 const alpha=255-(tick%8),tint=color=>((color&0xffffff)|(alpha<<24))>>>0;
 const put=(text,x,y,extra={})=>font.draw(draw,text,{x,y,font:10,color:tint(0xff000000),shadowColor:tint(0xffffffff),...extra});
 put(th20GroupedScore(12345678),620,42,{alignX:2});put(th20GroupedScore(100000+tick*11,tick%4),620,64,{alignX:2});
 put('  1',576,120,{scaleX:.6});put('/3',597,120,{scaleX:.6});put('  0',576,158,{scaleX:.6});put('/3',597,158,{scaleX:.6});
 put('4.',540,182);put('00',560,189,{scaleX:.6});put('/4.',574,182);put('00',606,189,{scaleX:.6});
 font.draw(draw,'.',{font:4,x:404,y:32,color:0xffff8080});font.draw(draw,String(tick%60).padStart(2,'0'),{font:4,x:412,y:38,scaleX:.6,color:0xffff8080});
 font.draw(draw,String(999999-tick),{font:2,x:350,y:37,alignX:2});font.draw(draw,'03/12',{font:2,x:397,y:37,alignX:2});
 font.draw(draw,'01/24',{font:2,x:429,y:37,alignX:2});
}
globalThis.__tsstg_game={update(){frame++;},render(){
 const begin=Date.now();for(let i=0;i<repeats;i++){draw.reset();workload(frame*repeats+i);}
 if(frame>warmup){const ms=(Date.now()-begin)/repeats;samples.push(ms);elapsed+=ms;commands+=draw.commands.length;}
 if(frame===warmup+frames){const sorted=samples.slice().sort((a,b)=>a-b);report={kind:'th20-font-quickjs-profile-v1',runtime:host.backend,warmup,frames,repeats,meanJsMs:elapsed/frames,medianJsMs:sorted[Math.floor(frames/2)],p95JsMs:sorted[Math.floor(frames*.95)],meanCommands:commands/frames,lastCommands:draw.commands};host.log(JSON.stringify({...report,lastCommands:undefined}));}
 return draw.commands;
},snapshot(){return report??{frame};}};
