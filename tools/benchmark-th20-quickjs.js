// Real QuickJS/native-host benchmark of imported title assets. Rendering is
// unchanged; wrappers measure nested phases without suppressing any commands.
import {DrawList} from '../packages/thlib/src/render.js';
import {AnmBank} from '../games/touhou20/src/anm.js';
import {Th20BitmapFont} from '../games/touhou20/src/font.js';
import {Th20TitleMenu} from '../games/touhou20/src/menu.js';
import {Th20TitleBackground} from '../games/touhou20/src/title-background.js';
import {Th20RenderMesh} from '../games/touhou20/src/distortion.js';
import {Th20RenderQueue} from '../games/touhou20/src/render-queue.js';
import {Th20RNG} from '../games/touhou20/src/math.js';
const config=globalThis.__TH20_PERF??{},host=globalThis.tsstg,warmup=config.warmup??30,frames=config.frames??240;
const read=path=>JSON.parse(host.readText(path)),rng=new Th20RNG(2),adapter={rng,loadTexture:(...args)=>host.loadTexture(...args)};
const bank=name=>new AnmBank(read(`games/touhou20/assets/anm/${name}.json`),adapter),font=new Th20BitmapFont(read('games/touhou20/assets/anm/ascii_960.json'),adapter);
const background=new Th20TitleBackground({textureId:host.createRenderTarget(960,720),rng});background.wave=config.wave??0;
const title=new Th20TitleMenu({bank:bank('title'),decorationBank:bank('title_v'),font,background}),draw=new DrawList();
const elapsed={},calls={},samples=[],commandSamples=[];let frame=0,start,updateMs=0,renderMs=0,report;
function track(owner,name,label){const original=owner[name];owner[name]=function(...args){const before=Date.now();try{return original.apply(this,args);}finally{if(frame>warmup&&frame<=warmup+frames){elapsed[label]=(elapsed[label]??0)+Date.now()-before;calls[label]=(calls[label]??0)+1;}}};}
track(Th20TitleBackground.prototype,'update','backgroundUpdate');track(Th20TitleBackground.prototype,'initialize','backgroundInitialize');track(Th20TitleBackground.prototype,'draw','backgroundDraw');track(Th20RenderMesh.prototype,'updateStrips','meshStrips');track(AnmBank.prototype,'update','bankUpdate');track(AnmBank.prototype,'draw','bankEnqueue');track(Th20RenderQueue.prototype,'flush','queueFlush');
function makeReport(){const sorted=samples.slice().sort((a,b)=>a-b),round=x=>Math.round(x*1000)/1000;
 return{kind:'th20-title-quickjs-profile-v1',runtime:host.backend,warmupFrames:warmup,measuredFrames:samples.length,initialWave:config.wave??0,meanUpdateMs:round(updateMs/samples.length),meanRenderJsMs:round(renderMs/samples.length),medianJsMs:sorted[Math.floor(sorted.length/2)],p95JsMs:sorted[Math.floor(sorted.length*.95)],meanCommands:round(commandSamples.reduce((a,b)=>a+b,0)/commandSamples.length),phaseMeanMs:Object.fromEntries(Object.entries(elapsed).map(([k,v])=>[k,round(v/frames)])),calls,final:{wave:background.wave,rng:rng.state,animations:title.bank.instances.length+title.decorationBank.instances.length},scope:'Actual QuickJS title assets. Nested JS phases; excludes native command decoding/GPU. Date.now resolution 1ms; phases overlap.'};
}
globalThis.__tsstg_game={update(){frame++;start=Date.now();title.update(0);if(frame>warmup&&frame<=warmup+frames)updateMs+=Date.now()-start;},render(){const begin=Date.now();draw.reset().clear(0x000000ff);title.draw(draw);if(frame>warmup&&frame<=warmup+frames){renderMs+=Date.now()-begin;samples.push(Date.now()-start);commandSamples.push(draw.commands.length);}if(frame===warmup+frames&&!report){report=makeReport();host.log(JSON.stringify(report));}return draw.commands;},snapshot(){return report??{frame,complete:false};}};
