import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlledPreview} from '../tools/spellcard-editor/controller.js';
import {createSpellMetadata} from '../tools/spellcard-editor/metadata.js';

function fixture({duration=600,loadModule,modulePath='./initial.js',invincible=true}={}){
  const paths={control:'build/spellcard-editor/test/control.json',status:'spellcard-editor/test/status.json'};
  let document={...createSpellMetadata(),duration},state={revision:0,documentRevision:0,document,commands:[],modulePath,invincible};
  let id=0,reads=0,failAt=-1,finishAt=-1,pauseAt=-1,tail=0,runner={frame:0,alive:true,completed:false};
  const calls=[],files=new Map();
  const preview={invincible,exited:false,game:{paused:false,bullets:{bullets:[]},lasers:{lasers:[]}},silent:true,
    get runner(){return runner;},
    get settling(){return tail>0;},
    reset(source,{createSpell,invincible=this.invincible}={}){assert.equal(typeof createSpell,'function');const candidate=createSpell({boss:{x:0,y:96},sound:id=>calls.push(['sound',id])});
      this.invincible=invincible;this.exited=false;this.game.paused=false;document=source;runner=candidate;calls.push(['reset',source.id]);},
    setSilent(value){this.silent=value;calls.push(['silent',value]);},
    update(mask){
      calls.push(['update',runner.frame,mask,this.silent]);
      if(runner.frame===failAt)throw new Error('fixture update failure');
      if(!runner.alive){tail=Math.max(0,tail-1);return;}
      if(this.game.paused)return;runner.update();if(runner.frame===pauseAt)this.game.paused=true;
    },
    render:()=>[['clear',0]],snapshot:()=>({frame:runner.frame}),destroy(){calls.push(['destroy']);},
  };
  const host={readText(path){assert.equal(path,paths.control);reads++;return JSON.stringify(state);},
    writeText(path,text){assert.equal(path,paths.status);assert.ok(!path.startsWith('userdata/'),'writeText already targets userdata');files.set(`userdata/${path}`,JSON.parse(text));}};
  const initialModule=()=>({spellCard:state.document,createSpell:()=>({frame:0,alive:true,completed:false,
    update(){this.frame++;if(this.frame===finishAt)this.alive=false;
      else if(this.frame>=document.duration){this.alive=false;this.completed=true;}},stop(){this.alive=false;},
  })});
  const controller=createControlledPreview(host,paths,{loadModule:path=>path==='./initial.js'?initialModule():loadModule(path),
    factory:(receivedHost,source,options)=>{
      assert.equal(receivedHost,host);assert.equal(options.silent,true);assert.equal(typeof options.createSpell,'function');assert.equal(options.invincible,invincible===true);
      preview.reset(source,options);return preview;
    }});
  function readNext(){const before=reads;for(let i=0;i<7&&reads===before;i++)controller.update(123);assert.ok(reads>before);}
  return{controller,preview,calls,files,paths,host,readNext,
    async ready(){controller.update();await flushImports();controller.update();},
    commands(...commands){for(const command of commands)if(command.action==='invincible')state.invincible=command.value;state={...state,revision:state.revision+1,commands:[...state.commands,...commands.map(command=>({...command,id:++id}))]};},
    replace(source){state={...state,revision:state.revision+1,documentRevision:state.documentRevision+1,document:source,commands:[]};},
    module(path,source=state.document){state={...state,revision:state.revision+1,documentRevision:state.documentRevision+1,document:source,modulePath:path,commands:[]};},
    revise(){state={...state,revision:state.revision+1};},
    input(mask){state={...state,revision:state.revision+1,input:mask};},
    pauseAt(frame){pauseAt=frame;},exit(){preview.exited=true;runner.alive=false;},failAt(frame){failAt=frame;},finishAt(frame){finishAt=frame;},tail(frames){tail=frames;},
  };
}

test('native controller reads control from the project and writes status through userdata-relative paths',async()=>{
  const f=fixture();await f.ready();f.controller.update();
  assert.deepEqual(f.controller.render(),[['clear',0]]);
  assert.equal(f.files.get(`userdata/${f.paths.status}`).frame,0);
  assert.equal(f.controller.snapshot().editor.playing,false);
  f.commands({action:'step'},{action:'step'});f.readNext();
  assert.equal(f.preview.runner.frame,2);assert.equal(f.preview.silent,true);
  assert.deepEqual(f.calls.filter(row=>row[0]==='update').map(row=>[row[2],row[3]]),[[0,false],[0,false]]);
  const updates=f.calls.filter(row=>row[0]==='update').length;f.revise();f.readNext();
  assert.equal(f.calls.filter(row=>row[0]==='update').length,updates,'acknowledged ordered command IDs never run twice');
  assert.equal(f.controller.snapshot().editor.commandId,2);
});

const flushImports=()=>new Promise(resolve=>setImmediate(resolve));
const moduleDocument=(id,duration=600)=>({...createSpellMetadata(),id,duration});
function exportedSpell(id,duration=600){return{spellCard:moduleDocument(id,duration),createSpell(context){return{
  frame:0,alive:true,update(){context.sound(this.frame);this.frame++;if(this.frame>=duration)this.alive=false;},stop(){this.alive=false;},
};}};}

test('JS imports wait before applying queued transport and use executed module metadata',async()=>{
  let resolveModule;const f=fixture({modulePath:'./spell-0.js',loadModule:path=>{
    assert.equal(path,'./spell-0.js');return new Promise(resolve=>{resolveModule=resolve;});
  }});
  f.commands({action:'seek',frame:2},{action:'play'});f.controller.update();await flushImports();
  assert.equal(f.controller.snapshot().editor.loading,true);assert.equal(f.controller.snapshot().editor.documentRevision,-1);
  assert.equal(f.controller.snapshot().editor.commandId,0);assert.equal(f.preview.runner.frame,0);
  resolveModule(exportedSpell('module-controls-name',12));await flushImports();f.controller.update();
  const status=f.controller.snapshot().editor;
  assert.equal(status.loading,false);assert.equal(status.document.id,'module-controls-name');assert.equal(status.document.duration,12);
  assert.equal(status.documentRevision,0);assert.equal(status.commandId,2);assert.equal(status.playing,true);
  assert.equal(status.frame,2,'seek then play preserves the requested frame while a module is loading');
  assert.deepEqual(f.calls.filter(call=>call[0]==='sound'),[['sound',0],['sound',1]],'handwritten runner executes its own JS');
});

test('newer JS source wins even if an older module finishes loading afterwards',async()=>{
  const requests=new Map(),f=fixture({loadModule:path=>new Promise(resolve=>requests.set(path,resolve))});
  f.module('./old.js');f.controller.update();await flushImports();
  f.module('./latest.js');f.controller.update();await flushImports();
  requests.get('./latest.js')(exportedSpell('latest'));await flushImports();f.controller.update();
  requests.get('./old.js')(exportedSpell('old'));await flushImports();f.controller.update();
  assert.equal(f.controller.snapshot().editor.document.id,'latest');assert.equal(f.controller.snapshot().editor.documentRevision,2);
  assert.equal(f.calls.filter(call=>call[0]==='reset'&&call[1]==='old').length,0);
});

test('late errors from superseded source cannot replace the active source status',async()=>{
  const requests=new Map(),f=fixture({loadModule:path=>new Promise((resolve,reject)=>requests.set(path,{resolve,reject}))});
  f.module('./abandoned.js');f.commands({action:'play'});f.controller.update();await flushImports();
  f.module('./current.js');f.commands({action:'seek',frame:4});f.controller.update();await flushImports();
  requests.get('./current.js').resolve(exportedSpell('current'));await flushImports();f.controller.update();
  requests.get('./abandoned.js').reject(new SyntaxError('obsolete syntax error'));await flushImports();f.controller.update();
  const status=f.controller.snapshot().editor;
  assert.equal(status.error,null);assert.equal(status.document.id,'current');assert.equal(status.documentRevision,2);
  assert.equal(status.requestedDocumentRevision,2);assert.equal(status.frame,4);assert.equal(status.playing,false);
});

test('pause requested during source loading overrides the earlier queued play',async()=>{
  let resolveModule;const f=fixture({modulePath:'./pending.js',loadModule:()=>new Promise(resolve=>{resolveModule=resolve;})});
  f.commands({action:'seek',frame:40},{action:'play'});f.controller.update();await flushImports();
  f.commands({action:'pause'});f.controller.update();
  assert.equal(f.controller.snapshot().editor.commandId,0);
  resolveModule(exportedSpell('paused'));await flushImports();f.controller.update();
  const status=f.controller.snapshot().editor;
  assert.equal(status.commandId,3);assert.equal(status.playing,false);assert.equal(status.seeking,false);
  assert.equal(status.frame,0,'pause cancels a queued seek before the new scene advances');
});

test('syntax, export and factory failures preserve the last good scene and retain error stacks',async()=>{
  const modules=new Map([
    ['./syntax.js',()=>{throw new SyntaxError('Unexpected token at spell-2.js:8');}],
    ['./exports.js',()=>({spellCard:moduleDocument('invalid')})],
    ['./factory.js',()=>({spellCard:moduleDocument('invalid'),createSpell(){throw new Error('factory initialization failed');}})],
    ['./fixed.js',()=>exportedSpell('fixed')],
  ]),f=fixture({loadModule:path=>modules.get(path)()});await f.ready();
  f.commands({action:'play'});f.controller.update();f.controller.update();const before=f.preview.runner.frame;
  for(const [path,message] of [['./syntax.js',/SyntaxError.*Unexpected token/],['./exports.js',/must export createSpell/],['./factory.js',/factory initialization failed/]]){
    f.module(path);f.commands({action:'play'});f.controller.update();await flushImports();f.controller.update();
    const status=f.controller.snapshot().editor;
    assert.match(status.error,message);assert.equal(status.loading,false);assert.equal(status.playing,false);
    assert.equal(status.documentRevision,0);assert.equal(f.preview.runner.frame,before);
    f.revise();f.controller.update();assert.match(f.controller.snapshot().editor.error,message,'input/status changes do not clear compilation errors');
  }
  f.module('./fixed.js');f.commands({action:'play'});f.controller.update();await flushImports();f.controller.update();
  assert.equal(f.controller.snapshot().editor.document.id,'fixed');assert.equal(f.controller.snapshot().editor.error,null);
  assert.equal(f.preview.runner.frame,1);assert.equal(f.controller.snapshot().editor.playing,true);
});

test('disposing a preview ignores an outstanding module import',async()=>{
  let resolveModule;const f=fixture({modulePath:'./pending.js',loadModule:()=>new Promise(resolve=>{resolveModule=resolve;})});
  f.controller.update();await flushImports();f.controller.destroy();resolveModule(exportedSpell('too-late'));await flushImports();
  assert.equal(f.calls.length,0,'No engine resources exist until the first valid module activates');
  assert.equal(f.controller.snapshot().preview,null);
});

test('a missing source path cannot activate fallback metadata or create engine resources',async()=>{
  const f=fixture({modulePath:null});await f.ready();
  const status=f.controller.snapshot().editor;
  assert.match(status.error,/requires a modulePath/);assert.equal(status.documentRevision,-1);
  assert.equal(status.frame,0);assert.equal(status.completed,false);assert.equal(f.calls.length,0);
  assert.deepEqual(f.controller.render(),[]);assert.equal(f.controller.snapshot().preview,null);
  f.controller.destroy();assert.equal(f.calls.length,0);
});

test('a first-source import failure can recover without a fallback scene',async()=>{
  const f=fixture({modulePath:'./bad.js',loadModule:path=>{
    if(path==='./bad.js')throw new SyntaxError('first source is incomplete');
    return exportedSpell('recovered');
  }});await f.ready();
  assert.match(f.controller.snapshot().editor.error,/first source is incomplete/);assert.equal(f.calls.length,0);
  f.module('./fixed.js');f.commands({action:'play'});f.controller.update();await flushImports();f.controller.update();
  const status=f.controller.snapshot().editor;
  assert.equal(status.error,null);assert.equal(status.document.id,'recovered');assert.equal(status.frame,1);
});

test('controller play/pause/restart and document replacement reset only their intended session',async()=>{
  const f=fixture();await f.ready();f.commands({action:'play'});f.controller.update(42);
  assert.equal(f.preview.runner.frame,1);assert.equal(f.preview.silent,false);
  f.commands({action:'pause'});f.readNext();const paused=f.preview.runner.frame;
  for(let i=0;i<4;i++)f.controller.update(42);assert.equal(f.preview.runner.frame,paused);assert.equal(f.preview.silent,true);
  f.commands({action:'restart'});f.readNext();assert.equal(f.preview.runner.frame,0);assert.equal(f.controller.snapshot().editor.playing,false);
  f.commands({action:'step'});f.readNext();assert.equal(f.preview.runner.frame,1);
  f.replace({...createSpellMetadata(),id:'edited-card'});f.readNext();await flushImports();f.controller.update();
  assert.equal(f.preview.runner.frame,0);assert.equal(f.controller.snapshot().editor.documentRevision,1);
  assert.deepEqual(f.calls.filter(row=>row[0]==='reset').at(-1),['reset','edited-card']);
  f.controller.destroy();assert.equal(f.calls.at(-1)[0],'destroy');
});

test('seek resets and silently replays in bounded chunks, then resume continues at the exact target',async()=>{
  const f=fixture();await f.ready();f.commands({action:'seek',frame:75});f.controller.update(12);
  assert.equal(f.preview.runner.frame,30);assert.equal(f.controller.snapshot().editor.seeking,true);
  f.controller.update(12);assert.equal(f.preview.runner.frame,60);
  f.controller.update(12);assert.equal(f.preview.runner.frame,75);assert.equal(f.controller.snapshot().editor.seeking,false);
  assert.ok(f.calls.filter(row=>row[0]==='update').every(row=>row[2]===0&&row[3]===true));
  f.commands({action:'play'});f.readNext();assert.equal(f.preview.runner.frame,76);assert.equal(f.preview.silent,false);
});

test('pause cancels an unfinished seek instead of silently continuing toward the old target',async()=>{
  const f=fixture({duration:2000});await f.ready();f.commands({action:'seek',frame:1900});f.controller.update();
  f.commands({action:'pause'});f.readNext();
  assert.equal(f.controller.snapshot().editor.seeking,false);
  const frame=f.preview.runner.frame;for(let i=0;i<10;i++)f.controller.update();assert.equal(f.preview.runner.frame,frame);
});

test('a simulation failure survives status polling and clears after an explicit successful restart',async()=>{
  const f=fixture();await f.ready();f.commands({action:'play'});f.controller.update();f.failAt(1);
  f.controller.update();assert.match(f.controller.snapshot().editor.error,/fixture update failure/);
  for(let i=0;i<6;i++)f.controller.update();
  assert.match(f.files.get(`userdata/${f.paths.status}`).error,/fixture update failure/,'an error between status frames remains observable');
  f.failAt(-1);f.commands({action:'restart'});f.readNext();assert.equal(f.controller.snapshot().editor.error,null);
});

test('play replays completed cards and an early stopped Boss outcome cannot leave the controller running forever',async()=>{
  const complete=fixture({duration:2});await complete.ready();complete.commands({action:'play'});complete.controller.update();complete.controller.update();
  assert.equal(complete.controller.snapshot().editor.playing,false);assert.equal(complete.preview.runner.completed,true);
  complete.commands({action:'play'});complete.readNext();assert.equal(complete.preview.runner.frame,1);assert.equal(complete.preview.runner.alive,true);
  const defeated=fixture();await defeated.ready();defeated.finishAt(2);defeated.commands({action:'play'});defeated.controller.update();defeated.controller.update();
  assert.equal(defeated.preview.runner.alive,false);assert.equal(defeated.preview.runner.completed,false);
  assert.equal(defeated.controller.snapshot().editor.playing,false,'a stopped runner is terminal even when it was defeated early');
  defeated.finishAt(-1);defeated.commands({action:'play'});defeated.readNext();
  assert.equal(defeated.preview.runner.frame,1);assert.equal(defeated.preview.runner.alive,true);
});

test('completion keeps updating shared result animations and stops when their owner finishes',async()=>{
  const f=fixture({duration:2});await f.ready();f.tail(3);f.commands({action:'play'});
  f.controller.update();f.controller.update();assert.equal(f.controller.snapshot().editor.settling,true);
  for(let i=0;i<3;i++)f.controller.update();
  assert.equal(f.controller.snapshot().editor.settling,false);assert.equal(f.preview.runner.frame,2);
  const count=f.calls.length;f.controller.update();assert.equal(f.calls.length,count,'settled presentation no longer advances');
});

test('held confirm never replays a completed card, but a new press works even after presentation stops',async()=>{
  const f=fixture({duration:2});await f.ready();f.commands({action:'play'});
  f.controller.update(256);f.controller.update(256);f.controller.update(256);
  assert.equal(f.preview.runner.alive,false);
  f.controller.update(0);f.controller.update(256);
  assert.equal(f.preview.runner.alive,true);assert.equal(f.preview.runner.frame,1);
});

test('controller uses real play unless observation is explicitly enabled, and mode switches rebuild at frame zero',async()=>{
  const f=fixture({invincible:null});await f.ready();
  assert.equal(f.preview.invincible,false);assert.equal(f.controller.snapshot().editor.invincible,false);
  f.commands({action:'play'});f.controller.update();f.controller.update();assert.equal(f.preview.runner.frame,2);
  const first=f.preview.runner;
  f.commands({action:'invincible',value:true});f.controller.update();
  assert.equal(f.preview.invincible,true);assert.notEqual(f.preview.runner,first);
  assert.equal(f.preview.runner.frame,0);assert.equal(f.controller.snapshot().editor.playing,false);
  f.commands({action:'seek',frame:45});f.controller.update();f.controller.update();assert.equal(f.preview.runner.frame,45);
  f.commands({action:'invincible',value:false});f.controller.update();
  assert.equal(f.preview.invincible,false);assert.equal(f.preview.runner.frame,0);assert.equal(f.controller.snapshot().editor.seeking,false);
});

test('real play rejects nonzero seek and a restart remains available',async()=>{
  const f=fixture({invincible:false});await f.ready();
  f.commands({action:'play'});f.controller.update();
  f.commands({action:'seek',frame:45});f.controller.update();
  assert.match(f.controller.snapshot().editor.error,/真实试玩不支持跳帧/);assert.equal(f.preview.runner.frame,1);
  assert.equal(f.controller.snapshot().editor.seeking,false);
  f.commands({action:'seek',frame:0});f.controller.update();
  assert.equal(f.controller.snapshot().editor.error,null);assert.equal(f.preview.runner.frame,0);
});

test('observation seek stops at an in-game pause rather than waiting for a frozen frame forever',async()=>{
  const f=fixture();await f.ready();f.pauseAt(12);
  f.commands({action:'seek',frame:45});f.controller.update();
  const status=f.controller.snapshot().editor;
  assert.equal(status.frame,12);assert.equal(status.seeking,false);assert.equal(status.gamePaused,true);
});

test('leaving the native menu keeps the editor session available for retry',async()=>{
  const f=fixture({invincible:false});await f.ready();
  f.commands({action:'play'});f.controller.update();f.exit();f.controller.update();
  assert.equal(f.controller.snapshot().editor.exited,true);assert.equal(f.controller.snapshot().editor.playing,false);
  f.commands({action:'play'});f.controller.update();
  assert.equal(f.controller.snapshot().editor.exited,false);assert.equal(f.preview.runner.frame,1);
});

test('a contended control read freezes one frame, retains the runner and resumes with fresh input',async()=>{
  const f=fixture();await f.ready();f.commands({action:'play'});f.input(17);f.controller.update();
  const runner=f.preview.runner,frame=runner.frame,calls=f.calls.length,read=f.host.readText;
  f.host.readText=()=>{throw Error('Cannot read: control.json');};
  f.input(0);assert.doesNotThrow(()=>f.controller.update());
  assert.equal(runner.frame,frame);assert.equal(f.calls.length,calls,'stale held input is never simulated');
  let status=f.controller.snapshot().editor;
  assert.equal(status.waitingForControl,true);assert.equal(status.playing,true);
  assert.equal(status.error,null);assert.equal(status.transportWarning,null,'one missed read does not flash an error');
  f.host.readText=read;f.controller.update();status=f.controller.snapshot().editor;
  assert.equal(f.preview.runner,runner);assert.equal(runner.frame,frame+1);
  assert.equal(status.waitingForControl,false);assert.equal(status.error,null);
  assert.deepEqual(f.calls.filter(call=>call[0]==='update').at(-1),['update',frame,0,false]);
});

test('missing startup control retries without allocating a scene or aborting the native host',async()=>{
  const f=fixture(),read=f.host.readText;
  f.host.readText=()=>{throw Error('Cannot read: initial control.json');};
  f.commands({action:'play'});
  for(let i=0;i<40;i++)assert.doesNotThrow(()=>f.controller.update());
  let status=f.controller.snapshot().editor;
  assert.equal(status.error,null);assert.equal(status.documentRevision,-1);
  assert.match(status.transportWarning,/Cannot read/);assert.equal(f.calls.length,0);
  assert.equal(f.controller.snapshot().preview,null);
  f.host.readText=read;await f.ready();status=f.controller.snapshot().editor;
  assert.equal(status.transportWarning,null);assert.equal(status.error,null);
  assert.equal(status.documentRevision,0);assert.equal(status.commandId,1);assert.equal(status.frame,1);
});

test('extended transport failure mutes and holds playback without repeating or losing queued commands',async()=>{
  const f=fixture();await f.ready();f.commands({action:'step'},{action:'play'});f.controller.update();
  const frame=f.preview.runner.frame,runner=f.preview.runner,read=f.host.readText;
  f.host.readText=()=>{throw Error('Cannot read: control.json');};
  f.commands({action:'step'},{action:'step'},{action:'pause'});
  for(let i=0;i<45;i++)f.controller.update();
  let status=f.controller.snapshot().editor;
  assert.equal(status.commandId,2);assert.equal(status.frame,frame);assert.equal(status.playing,true);
  assert.match(status.transportWarning,/Cannot read/);assert.equal(status.error,null);assert.equal(f.preview.silent,true);
  f.host.readText=read;f.controller.update();status=f.controller.snapshot().editor;
  assert.equal(f.preview.runner,runner);assert.equal(status.frame,frame+2);assert.equal(status.commandId,5);
  assert.equal(status.playing,false);assert.equal(status.transportWarning,null);
  for(let i=0;i<5;i++)f.controller.update();assert.equal(f.preview.runner.frame,frame+2);
  f.commands({action:'play'});f.controller.update();assert.equal(f.preview.silent,false);
});

test('partial or invalid control messages preserve an in-progress seek until the next complete message',async()=>{
  const f=fixture();await f.ready();f.commands({action:'seek',frame:75});f.controller.update();
  const runner=f.preview.runner,read=f.host.readText;
  assert.equal(runner.frame,30);
  for(const text of ['', '{', 'null', '{"revision":0,"documentRevision":0,"commands":{}}']){
    f.host.readText=()=>text;f.controller.update();
    assert.equal(runner.frame,30);assert.equal(f.controller.snapshot().editor.seeking,true);
    assert.equal(f.controller.snapshot().editor.error,null);
  }
  f.host.readText=read;f.controller.update();f.controller.update();
  assert.equal(f.preview.runner,runner);assert.equal(runner.frame,75);
  assert.equal(f.controller.snapshot().editor.seeking,false);assert.equal(f.controller.snapshot().editor.transportWarning,null);
});

test('status write contention cannot abort the host, stop play or reapply acknowledged commands',async()=>{
  const f=fixture();await f.ready();const write=f.host.writeText,runner=f.preview.runner;
  f.host.writeText=()=>{throw Error('Cannot write: status.json');};
  f.commands({action:'step'},{action:'play'});
  for(let i=0;i<18;i++)assert.doesNotThrow(()=>f.controller.update());
  let status=f.controller.snapshot().editor;
  assert.equal(status.frame,19);assert.equal(status.commandId,2);assert.equal(status.playing,true);
  assert.equal(status.error,null);assert.match(status.transportWarning,/Cannot write/);assert.equal(f.preview.runner,runner);
  f.host.writeText=write;for(let i=0;i<12;i++)f.controller.update();
  status=f.controller.snapshot().editor;
  assert.equal(status.frame,31);assert.equal(status.commandId,2);assert.equal(status.transportWarning,null);
  const report=f.files.get(`userdata/${f.paths.status}`);
  assert.equal(report.commandId,2);assert.equal(report.error,null);assert.equal(report.transportWarning,null);
});

test('transport recovery never clears a genuine source error or starts its failed runner',async()=>{
  const f=fixture();await f.ready();f.commands({action:'play'});f.controller.update();f.failAt(1);f.controller.update();
  const original=f.controller.snapshot().editor.error,read=f.host.readText;
  assert.match(original,/fixture update failure/);
  f.host.readText=()=>{throw Error('Cannot read: control.json');};
  for(let i=0;i<40;i++)f.controller.update();
  f.host.readText=read;f.controller.update();
  const status=f.controller.snapshot().editor;
  assert.equal(status.error,original);assert.equal(status.transportWarning,null);
  assert.equal(status.frame,1);assert.equal(status.playing,false);assert.equal(f.preview.silent,true);
});
