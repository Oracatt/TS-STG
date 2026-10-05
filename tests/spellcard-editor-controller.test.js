import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlledPreview} from '../tools/spellcard-editor/controller.js';
import {createTouhouSpellCard} from '../packages/thlib/src/touhou/spellcard.js';

function fixture({duration=600}={}){
  const paths={control:'build/spellcard-editor/test/control.json',status:'spellcard-editor/test/status.json'};
  let document={...createTouhouSpellCard(),duration,events:[]},state={revision:0,documentRevision:0,document,commands:[]};
  let id=0,reads=0,failAt=-1,finishAt=-1,tail=0,timeline={frame:0,alive:true,completed:false};
  const calls=[],files=new Map();
  const preview={game:{bullets:{bullets:[]},lasers:{lasers:[]}},silent:true,
    get timeline(){return timeline;},
    get settling(){return tail>0;},
    reset(source){document=source;timeline={frame:0,alive:true,completed:false};calls.push(['reset',source.id]);},
    setSilent(value){this.silent=value;calls.push(['silent',value]);},
    update(mask){
      calls.push(['update',timeline.frame,mask,this.silent]);
      if(timeline.frame===failAt)throw new Error('fixture update failure');
      if(!timeline.alive){tail=Math.max(0,tail-1);return;}
      timeline.frame++;
      if(timeline.frame===finishAt)timeline.alive=false;
      else if(timeline.frame>=document.duration){timeline.alive=false;timeline.completed=true;}
    },
    render:()=>[['clear',0]],snapshot:()=>({frame:timeline.frame}),destroy(){calls.push(['destroy']);},
  };
  const host={readText(path){assert.equal(path,paths.control);reads++;return JSON.stringify(state);},
    writeText(path,text){assert.equal(path,paths.status);assert.ok(!path.startsWith('userdata/'),'writeText already targets userdata');files.set(`userdata/${path}`,JSON.parse(text));}};
  const controller=createControlledPreview(host,paths,{factory:(receivedHost,source,options)=>{
    assert.equal(receivedHost,host);assert.deepEqual(source,state.document);assert.deepEqual(options,{silent:true});return preview;
  }});
  function readNext(){const before=reads;for(let i=0;i<7&&reads===before;i++)controller.update(123);assert.ok(reads>before);}
  return{controller,preview,calls,files,paths,readNext,
    commands(...commands){state={...state,revision:state.revision+1,commands:[...state.commands,...commands.map(command=>({...command,id:++id}))]};},
    replace(source){state={...state,revision:state.revision+1,documentRevision:state.documentRevision+1,document:source,commands:[]};},
    revise(){state={...state,revision:state.revision+1};},
    failAt(frame){failAt=frame;},finishAt(frame){finishAt=frame;},tail(frames){tail=frames;},
  };
}

test('native controller reads control from the project and writes status through userdata-relative paths',()=>{
  const f=fixture();f.controller.update();
  assert.deepEqual(f.controller.render(),[['clear',0]]);
  assert.equal(f.files.get(`userdata/${f.paths.status}`).frame,0);
  assert.equal(f.controller.snapshot().editor.playing,false);
  f.commands({action:'step'},{action:'step'});f.readNext();
  assert.equal(f.preview.timeline.frame,2);assert.equal(f.preview.silent,true);
  assert.deepEqual(f.calls.filter(row=>row[0]==='update').map(row=>[row[2],row[3]]),[[0,false],[0,false]]);
  const updates=f.calls.filter(row=>row[0]==='update').length;f.revise();f.readNext();
  assert.equal(f.calls.filter(row=>row[0]==='update').length,updates,'acknowledged ordered command IDs never run twice');
  assert.equal(f.controller.snapshot().editor.commandId,2);
});

test('controller play/pause/restart and document replacement reset only their intended session',()=>{
  const f=fixture();f.commands({action:'play'});f.controller.update(42);
  assert.equal(f.preview.timeline.frame,1);assert.equal(f.preview.silent,false);
  f.commands({action:'pause'});f.readNext();const paused=f.preview.timeline.frame;
  for(let i=0;i<4;i++)f.controller.update(42);assert.equal(f.preview.timeline.frame,paused);assert.equal(f.preview.silent,true);
  f.commands({action:'restart'});f.readNext();assert.equal(f.preview.timeline.frame,0);assert.equal(f.controller.snapshot().editor.playing,false);
  f.commands({action:'step'});f.readNext();assert.equal(f.preview.timeline.frame,1);
  f.replace({...createTouhouSpellCard(),id:'edited-card',events:[]});f.readNext();
  assert.equal(f.preview.timeline.frame,0);assert.equal(f.controller.snapshot().editor.documentRevision,1);
  assert.deepEqual(f.calls.filter(row=>row[0]==='reset').at(-1),['reset','edited-card']);
  f.controller.destroy();assert.equal(f.calls.at(-1)[0],'destroy');
});

test('seek resets and silently replays in bounded chunks, then resume continues at the exact target',()=>{
  const f=fixture();f.commands({action:'seek',frame:75});f.controller.update(12);
  assert.equal(f.preview.timeline.frame,30);assert.equal(f.controller.snapshot().editor.seeking,true);
  f.controller.update(12);assert.equal(f.preview.timeline.frame,60);
  f.controller.update(12);assert.equal(f.preview.timeline.frame,75);assert.equal(f.controller.snapshot().editor.seeking,false);
  assert.ok(f.calls.filter(row=>row[0]==='update').every(row=>row[2]===0&&row[3]===true));
  f.commands({action:'play'});f.readNext();assert.equal(f.preview.timeline.frame,76);assert.equal(f.preview.silent,false);
});

test('pause cancels an unfinished seek instead of silently continuing toward the old target',()=>{
  const f=fixture({duration:2000});f.commands({action:'seek',frame:1900});f.controller.update();
  f.commands({action:'pause'});f.readNext();
  assert.equal(f.controller.snapshot().editor.seeking,false);
  const frame=f.preview.timeline.frame;for(let i=0;i<10;i++)f.controller.update();assert.equal(f.preview.timeline.frame,frame);
});

test('a simulation failure survives status polling and clears after an explicit successful restart',()=>{
  const f=fixture();f.commands({action:'play'});f.controller.update();f.failAt(1);
  f.controller.update();assert.match(f.controller.snapshot().editor.error,/fixture update failure/);
  for(let i=0;i<6;i++)f.controller.update();
  assert.match(f.files.get(`userdata/${f.paths.status}`).error,/fixture update failure/,'an error between status frames remains observable');
  f.failAt(-1);f.commands({action:'restart'});f.readNext();assert.equal(f.controller.snapshot().editor.error,null);
});

test('play replays completed cards and an early stopped Boss outcome cannot leave the controller running forever',()=>{
  const complete=fixture({duration:2});complete.commands({action:'play'});complete.controller.update();complete.controller.update();
  assert.equal(complete.controller.snapshot().editor.playing,false);assert.equal(complete.preview.timeline.completed,true);
  complete.commands({action:'play'});complete.readNext();assert.equal(complete.preview.timeline.frame,1);assert.equal(complete.preview.timeline.alive,true);
  const defeated=fixture();defeated.finishAt(2);defeated.commands({action:'play'});defeated.controller.update();defeated.controller.update();
  assert.equal(defeated.preview.timeline.alive,false);assert.equal(defeated.preview.timeline.completed,false);
  assert.equal(defeated.controller.snapshot().editor.playing,false,'a stopped timeline is terminal even when it was defeated early');
  defeated.finishAt(-1);defeated.commands({action:'play'});defeated.readNext();
  assert.equal(defeated.preview.timeline.frame,1);assert.equal(defeated.preview.timeline.alive,true);
});

test('completion keeps updating shared result animations and stops when their owner finishes',()=>{
  const f=fixture({duration:2});f.tail(3);f.commands({action:'play'});
  f.controller.update();f.controller.update();assert.equal(f.controller.snapshot().editor.settling,true);
  for(let i=0;i<3;i++)f.controller.update();
  assert.equal(f.controller.snapshot().editor.settling,false);assert.equal(f.preview.timeline.frame,2);
  const count=f.calls.length;f.controller.update();assert.equal(f.calls.length,count,'settled presentation no longer advances');
});

test('held confirm never replays a completed card, but a new press works even after presentation stops',()=>{
  const f=fixture({duration:2});f.commands({action:'play'});
  f.controller.update(256);f.controller.update(256);f.controller.update(256);
  assert.equal(f.preview.timeline.alive,false);
  f.controller.update(0);f.controller.update(256);
  assert.equal(f.preview.timeline.alive,true);assert.equal(f.preview.timeline.frame,1);
});
