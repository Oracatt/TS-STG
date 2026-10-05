import {createSpellCardPreview} from './native-preview.js';
import {validateTouhouSpellCard} from '@ts-stg/thlib';

/** Native-only editor adapter. Files use the existing host data API; no editor
 * transport, UI, process ownership or file access enters the public thlib. */
export function createControlledPreview(host,paths,{factory=createSpellCardPreview,loadModule}={}){
  let state=JSON.parse(host.readText(paths.control)),document=state.document;
  let documentRevision=state.modulePath?-1:state.documentRevision,requestedDocumentRevision=state.documentRevision;
  const preview=factory(host,state.document,{silent:true});
  let revision=-1,commandId=0,playing=false,settling=false,target=null,ticks=0,error=null,previousInput=0;
  let createSpell,modulePath=null,requestId=0,loading=false,pending=null,disposed=false;
  const errorText=failure=>{
    const message=String(failure),stack=String(failure?.stack??'');
    // QuickJS stacks contain source locations without repeating the message;
    // V8 stacks normally include it. Keep both without duplicating the header.
    return stack.includes(message)?stack:stack?`${message}\n${stack}`:message;
  };
  function reset(){preview.setSilent(true);preview.reset(document,{createSpell});target=null;settling=false;}
  function requestModule(){
    const id=++requestId,path=state.modulePath,documentId=state.documentRevision;
    loading=true;pending=null;error=null;playing=false;settling=false;target=null;preview.setSilent(true);
    // Imports execute only in the native runtime. Each source revision has a
    // distinct module path, so edits cannot reuse an old ES-module cache entry.
    Promise.resolve().then(()=>{
      if(typeof loadModule!=='function')throw new TypeError('JS preview requires a native loadModule(path) adapter');
      return loadModule(path);
    }).then(module=>{
      if(disposed||id!==requestId)return;
      const value=validateTouhouSpellCard(module.spellCard);
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
      preview.reset(candidate.document,{createSpell:candidate.createSpell});
      document=candidate.document;createSpell=candidate.createSpell;documentRevision=candidate.documentRevision;error=null;
    }catch(failure){error=errorText(failure);}
  }
  function read(){
    const next=JSON.parse(host.readText(paths.control));
    if(next.revision!==revision){
      state=next;revision=next.revision;
      if(requestedDocumentRevision!==state.documentRevision||modulePath!==(state.modulePath??null)){
        requestedDocumentRevision=state.documentRevision;modulePath=state.modulePath??null;
        if(modulePath)requestModule();
        else{
          ++requestId;loading=false;pending=null;playing=false;
          preview.setSilent(true);preview.reset(state.document,{createSpell:undefined});
          document=state.document;createSpell=undefined;documentRevision=state.documentRevision;target=null;settling=false;error=null;
        }
      }
    }
    activate();
    // Retain commands sent while importing; never apply a new script's seek or
    // play request to the last good scene after a failed compilation.
    if(loading||documentRevision!==requestedDocumentRevision)return;
    for(const command of state.commands??[]){
      if(command.id<=commandId)continue;commandId=command.id;
      if(command.action==='pause'){playing=false;settling=false;target=null;preview.setSilent(true);}
      else if(command.action==='play'){if(error||!preview.timeline.alive)reset();error=null;playing=true;preview.setSilent(target!==null);}
      else if(command.action==='restart'){playing=false;reset();error=null;}
      else if(command.action==='step'){playing=false;settling=false;target=null;preview.setSilent(false);if(preview.timeline.alive||preview.settling)preview.update(0);preview.setSilent(true);}
      else if(command.action==='seek'){playing=false;reset();error=null;target=Math.min(command.frame,document.duration);}
    }
  }
  function status(){return{revision,documentRevision,requestedDocumentRevision,document,loading,commandId,frame:preview.timeline.frame,playing,settling,seeking:target!==null,
    completed:!preview.timeline.alive,bullets:preview.game.bullets.bullets.length,lasers:preview.game.lasers.lasers.length,
    player:preview.game.player?{x:preview.game.player.x,y:preview.game.player.y}:null,error};}
  return{
    update(mask=0){
      if(disposed)return;
      try{
        // Input and transport are sampled once per fixed frame. Ordered command
        // IDs preserve quick single-step clicks without tying the clock to IPC.
        read();
        const input=state.input??mask,retry=(input&256)&&!(previousInput&256);previousInput=input;
        const active=!loading&&documentRevision===requestedDocumentRevision;
        if(active&&!error&&target===null&&!preview.timeline.alive&&retry){reset();playing=true;preview.setSilent(false);}
        if(active&&target!==null){
          for(let i=0;i<30&&preview.timeline.frame<target&&preview.timeline.alive;i++)preview.update(0);
          if(preview.timeline.frame>=target||!preview.timeline.alive){target=null;if(playing)preview.setSilent(false);}
        }else if(active&&playing){preview.update(input);if(!preview.timeline.alive){playing=false;settling=!!preview.settling;}}
        else if(active&&settling){preview.update(0);settling=!!preview.settling;if(!settling)preview.setSilent(true);}
      }catch(failure){error=errorText(failure);playing=false;settling=false;target=null;preview.setSilent(true);}
      if(ticks++%6===0)host.writeText(paths.status,JSON.stringify(status()));
    },
    render:()=>preview.render(),snapshot:()=>({editor:status(),preview:preview.snapshot()}),destroy:()=>{disposed=true;++requestId;preview.destroy();},
  };
}
