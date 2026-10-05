import {createSpellCardPreview} from './native-preview.js';

/** Native-only editor adapter. Files use the existing host data API; no editor
 * transport, UI, process ownership or file access enters the public thlib. */
export function createControlledPreview(host,paths,{factory=createSpellCardPreview}={}){
  let state=JSON.parse(host.readText(paths.control)),documentRevision=state.documentRevision;
  const preview=factory(host,state.document,{silent:true});
  let revision=-1,commandId=0,playing=false,settling=false,target=null,ticks=0,error=null,previousInput=0;
  function reset(){preview.setSilent(true);preview.reset(state.document);target=null;settling=false;}
  function read(){
    const next=JSON.parse(host.readText(paths.control));if(next.revision===revision)return;
    state=next;revision=next.revision;error=null;
    if(documentRevision!==state.documentRevision){documentRevision=state.documentRevision;playing=false;reset();}
    for(const command of state.commands){
      if(command.id<=commandId)continue;commandId=command.id;
      if(command.action==='pause'){playing=false;settling=false;target=null;preview.setSilent(true);}
      else if(command.action==='play'){if(!preview.timeline.alive)reset();target=null;playing=true;preview.setSilent(false);}
      else if(command.action==='restart'){playing=false;reset();}
      else if(command.action==='step'){playing=false;settling=false;target=null;preview.setSilent(false);if(preview.timeline.alive||preview.settling)preview.update(0);preview.setSilent(true);}
      else if(command.action==='seek'){playing=false;reset();target=command.frame;}
    }
  }
  function status(){return{revision,documentRevision,commandId,frame:preview.timeline.frame,playing,settling,seeking:target!==null,
    completed:!preview.timeline.alive,bullets:preview.game.bullets.bullets.length,lasers:preview.game.lasers.lasers.length,
    player:preview.game.player?{x:preview.game.player.x,y:preview.game.player.y}:null,error};}
  return{
    update(mask=0){
      try{
        // Input and transport are sampled once per fixed frame. Ordered command
        // IDs preserve quick single-step clicks without tying the clock to IPC.
        read();
        const input=state.input??mask,retry=(input&256)&&!(previousInput&256);previousInput=input;
        if(target===null&&!preview.timeline.alive&&retry){reset();playing=true;preview.setSilent(false);}
        if(target!==null){
          for(let i=0;i<30&&preview.timeline.frame<target&&preview.timeline.alive;i++)preview.update(0);
          if(preview.timeline.frame>=target||!preview.timeline.alive)target=null;
        }else if(playing){preview.update(input);if(!preview.timeline.alive){playing=false;settling=!!preview.settling;}}
        else if(settling){preview.update(0);settling=!!preview.settling;if(!settling)preview.setSilent(true);}
      }catch(failure){error=String(failure.message??failure);playing=false;settling=false;target=null;}
      if(ticks++%6===0)host.writeText(paths.status,JSON.stringify(status()));
    },
    render:()=>preview.render(),snapshot:()=>({editor:status(),preview:preview.snapshot()}),destroy:()=>preview.destroy(),
  };
}
