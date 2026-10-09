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

// The stock application preserves its full game type without a type assertion.
import type {TouhouGame,TouhouApplicationGameScene} from '@ts-stg/thlib/touhou';
const defaultApplication=new TouhouApplication({resources});
const defaultGame:TouhouGame|null=defaultApplication.game;
if(defaultApplication.game){const actualPlayer:TouhouPlayer=defaultApplication.game.player;void actualPlayer;}

class AuthoredGameScene implements TouhouApplicationGameScene {
  frame=0;
  paused=false;
  readonly chapter='snow';
  update(mask:number){this.frame+=mask===0?1:2;}
  draw(draw:DrawList){draw.rect(0,0,8,8,0xffffffff);}
  snapshot(){return{chapter:this.chapter,frame:this.frame};}
  destroy(){}
}
const customApplication=new TouhouApplication<AuthoredGameScene>({resources,
  createGame(options,app){
    const character:string|number=options.character??0;
    const priorScene:AuthoredGameScene|null=app.game;
    void character;void priorScene;
    return new AuthoredGameScene();
  },
  onAfterUpdate(app){const chapter:string|undefined=app.game?.chapter;void chapter;},
  onPauseChange(paused,app){const frame:number|undefined=app.game?.frame;void paused;void frame;},
  scenes:{ending:(_context,app)=>({update(){const scene:AuthoredGameScene|null=app.game;void scene;},draw(draw){draw.point(0,0,0xffffffff);}})},
});
const customGame:AuthoredGameScene|null=customApplication.game;
const inferredApplication=new TouhouApplication({resources,createGame:()=>new AuthoredGameScene()});
const inferredGame:AuthoredGameScene|null=inferredApplication.game;
customApplication.registerScene('bonus',(_context,app)=>({update(){const chapter:string|undefined=app.game?.chapter;void chapter;},render:()=>new DrawList().commands}));

// @ts-expect-error The default game cannot acquire fields from an authored scene.
defaultApplication.game?.chapter;
// @ts-expect-error A custom factory must return the declared scene type.
new TouhouApplication<AuthoredGameScene>({createGame:()=>({update(){},draw(){}})});
// @ts-expect-error Scene updates keep the numeric input-mask contract.
new TouhouApplication({createGame:()=>({update(mask:string){},draw(){}})});
