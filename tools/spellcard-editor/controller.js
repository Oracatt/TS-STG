import {createSpellCardPreview} from './native-preview.js';
import {validateSpellMetadata} from './metadata.js';

/** Native-only editor adapter. Files use the existing host data API; no editor
 * transport, UI, process ownership or file access enters the public thlib. */
export function createControlledPreview(host,paths,{factory=createSpellCardPreview,loadModule}={}){
  // Startup reads can race the first publication too. No engine resources are
  // allocated until a complete control message and its source module arrive.
  let state={},document=null;
  let documentRevision=-1,requestedDocumentRevision=-1,preview=null;
  let revision=-1,commandId=0,playing=false,settling=false,target=null,ticks=0,error=null,previousInput=0;
  let createSpell,modulePath,requestId=0,loading=false,pending=null,disposed=false;
  let readFailures=0,controlFailure=null,writeFailure=null,transportMuted=false;
  const errorText=failure=>{
    const message=String(failure),stack=String(failure?.stack??'');
    // QuickJS stacks contain source locations without repeating the message;
    // V8 stacks normally include it. Keep both without duplicating the header.
    return stack.includes(message)?stack:stack?`${message}\n${stack}`:message;
  };
  function reset(invincible=preview.invincible){preview.setSilent(true);preview.reset(document,{createSpell,invincible});target=null;settling=false;}
  function requestModule(){
    const id=++requestId,path=state.modulePath,documentId=state.documentRevision;
    loading=true;pending=null;error=null;playing=false;settling=false;target=null;preview?.setSilent(true);
    // Imports execute only in the native runtime. Each source revision has a
    // distinct module path, so edits cannot reuse an old ES-module cache entry.
    Promise.resolve().then(()=>{
      if(typeof path!=='string'||!path)throw new TypeError('JS preview requires a modulePath');
      if(typeof loadModule!=='function')throw new TypeError('JS preview requires a native loadModule(path) adapter');
      return loadModule(path);
    }).then(module=>{
      if(disposed||id!==requestId)return;
      const value=validateSpellMetadata(module.spellCard);
      if(typeof module.createSpell!=='function')throw new TypeError('Spell module must export createSpell(context)');
      pending={document:value,createSpell:module.createSpell,documentRevision:documentId};
    }).catch(failure=>{
      if(disposed||id!==requestId)return;
      pending={error:errorText(failure)};
    });
  }
  function activate(){
    if(!pending)return;
    const candidate=pending;pending=null;loading=false;
    if(candidate.error){error=candidate.error;return;}
    try{
      const options={createSpell:candidate.createSpell,invincible:state.invincible===true};
      if(preview)preview.reset(candidate.document,options);
      else preview=factory(host,candidate.document,{silent:true,...options});
      document=candidate.document;createSpell=candidate.createSpell;documentRevision=candidate.documentRevision;error=null;
    }catch(failure){error=errorText(failure);}
  }
  function read(){
    let next;
    try{
      next=JSON.parse(host.readText(paths.control));
      if(!next||!Number.isSafeInteger(next.revision)||next.revision<0||
        !Number.isSafeInteger(next.documentRevision)||next.documentRevision<0||
        !Array.isArray(next.commands))throw new Error('Invalid editor control message');
    }catch(failure){
      // Windows can deny an open briefly while the desktop atomically replaces
      // this file. Hold the simulation (including held input) until a fresh
      // message arrives; do not turn transport contention into a source error.
      controlFailure=errorText(failure);readFailures++;
      if(readFailures===30){preview?.setSilent(true);transportMuted=true;}
      return false;
    }
    if(transportMuted)preview?.setSilent(!!error||loading||target!==null||!(playing||settling));
    readFailures=0;controlFailure=null;transportMuted=false;
    if(next.revision!==revision){
      state=next;revision=next.revision;
      if(requestedDocumentRevision!==state.documentRevision||modulePath!==(state.modulePath??null)){
        requestedDocumentRevision=state.documentRevision;modulePath=state.modulePath??null;
        requestModule();
      }
    }
    activate();
    // Retain commands sent while importing; never apply a new script's seek or
    // play request to the last good scene after a failed compilation.
    if(!preview||loading||documentRevision!==requestedDocumentRevision)return true;
    for(const command of state.commands??[]){
      if(command.id<=commandId)continue;commandId=command.id;
      if(command.action==='pause'){playing=false;settling=false;target=null;preview.setSilent(true);}
      else if(command.action==='play'){if(error||!preview.runner.alive)reset();error=null;playing=true;preview.setSilent(target!==null);}
      else if(command.action==='restart'){playing=false;reset();error=null;}
      else if(command.action==='invincible'){
        if(typeof command.value!=='boolean')throw new TypeError('invincible must be a boolean');
        playing=false;reset(command.value);error=null;
      }
      else if(command.action==='step'){playing=false;settling=false;target=null;preview.setSilent(false);if(preview.runner.alive||preview.settling)preview.update(0);preview.setSilent(true);}
      else if(command.action==='seek'){
        if(command.frame>0&&!preview.invincible)throw new Error('真实试玩不支持跳帧，请开启无敌观察。');
        playing=false;reset();error=null;target=Math.min(command.frame,document.duration);
      }
    }
    return true;
  }
  function status(){return{revision,documentRevision,requestedDocumentRevision,document,loading,commandId,frame:preview?.runner.frame??0,playing,settling,seeking:target!==null,
    waitingForControl:readFailures>0,transportWarning:readFailures>=30?controlFailure:writeFailure,
    invincible:preview?.invincible??state.invincible===true,exited:preview?.exited??false,gamePaused:preview?.game.paused??false,
    completed:preview?!preview.runner.alive:false,bullets:preview?.game.bullets.bullets.length??0,lasers:preview?.game.lasers.lasers.length??0,
    player:preview?.game.player?{x:preview.game.player.x,y:preview.game.player.y,lives:preview.game.player.lives,bombs:preview.game.player.bombs,deaths:preview.game.player.deaths,state:preview.game.player.state}:null,error};}
  return{
    update(mask=0){
      if(disposed)return;
      try{
        // Input and transport are sampled once per fixed frame. Ordered command
        // IDs preserve quick single-step clicks without tying the clock to IPC.
        if(read()){
          const input=state.input??mask,retry=(input&256)&&!(previousInput&256);previousInput=input;
          const active=!!preview&&!loading&&documentRevision===requestedDocumentRevision;
          if(active&&!error&&target===null&&!preview.runner.alive&&retry){reset();playing=true;preview.setSilent(false);}
          if(active&&target!==null){
            for(let i=0;i<30&&preview.runner.frame<target&&preview.runner.alive&&!preview.game.paused;i++)preview.update(0);
            if(preview.runner.frame>=target||!preview.runner.alive||preview.game.paused){target=null;if(playing)preview.setSilent(false);}
          }else if(active&&playing){preview.update(input);if(!preview.runner.alive){playing=false;settling=!!preview.settling;}}
          else if(active&&settling){preview.update(0);settling=!!preview.settling;if(!settling)preview.setSilent(true);}
        }
      }catch(failure){error=errorText(failure);playing=false;settling=false;target=null;preview?.setSilent(true);}
      // Status is telemetry. A locked destination must not escape update() and
      // terminate the native process; the next status tick retries the write.
      if(ticks++%6===0)try{host.writeText(paths.status,JSON.stringify(status()));writeFailure=null;}
      catch(failure){writeFailure=errorText(failure);}
    },
    render:()=>preview?.render()??[],snapshot:()=>({editor:status(),preview:preview?.snapshot()??null}),destroy:()=>{disposed=true;++requestId;preview?.destroy();},
  };
}
