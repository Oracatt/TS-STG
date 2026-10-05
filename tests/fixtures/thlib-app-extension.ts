import {DrawList} from '@ts-stg/thlib';
import {TouhouApplication,TouhouTitleMenu,createTouhouResources,TouhouDialogue,TouhouGameOver} from '@ts-stg/thlib/touhou';
import type {AnmData,AnmBank,TouhouPlayer,TouhouSht} from '@ts-stg/thlib/touhou';

declare const archive:AnmData;
declare const bank:AnmBank;
declare const player:TouhouPlayer;
declare const sht:TouhouSht;
const resources=createTouhouResources(null,{archives:{alice:archive},shots:{alice:sht},
  players:{alice:{bank:'alice',profile:{id:'alice'},sht}}});
resources.registerBank('portrait',archive);
const application=new TouhouApplication({initialScene:'intro',resources,scenes:{
  intro:({selection,createBank},app)=>{
    const character:string|number=selection.character;
    const ownBank=createBank('portrait');
    return {update(){app.switchScene('credits',{transition:true,data:{character}});},draw(draw){ownBank.draw(draw);}};
  },
  credits:()=>({update(){},render:()=>new DrawList().commands}),
}});
application.registerScene('bonus',()=>({update(){},draw(){}})).switchScene('bonus');
new TouhouTitleMenu({bank,font:resources.font!,characters:[{id:'alice',label:'Alice'}],selectionFlow:['character'],
  createSelectionPage:(kind,menu)=>({draw(draw){resources.font?.draw(draw,`${kind}: ${menu.selectedId}`);}}),
  onStart:selection=>application.start(selection)});
new TouhouDialogue({resources,character:'alice',portraitProfiles:{alice:{bank:'portrait',root:4,body:5,x:0,y:0,width:100,height:200}},
  createPortrait:(side)=>({draw(draw){draw.rect(0,0,10,10,0xffffffff);},setActive(active){void side;void active;},dispose(){}})});
new TouhouGameOver({bank,player,session:{stage:7,stageKind:'normal'},
  continuePolicy:(actor,session,context)=>{actor.lives=5;session.credits=2;context.onStock?.({lives:5,lifeFragments:0,bombs:1,bombFragments:0,power:200});},
  canContinue:(_actor,session)=>session.stageKind!=='extra',formatStage:record=>`Chapter ${record.stage}`});
// @ts-expect-error A custom selection page must draw its actual presentation.
new TouhouTitleMenu({bank,font:resources.font!,characters:['alice'],createSelectionPage:()=>({})});
// @ts-expect-error Resource bank registration takes decoded animation data.
resources.registerBank('bad','portrait.png');
