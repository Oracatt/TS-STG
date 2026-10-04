import {TouhouApplication,TouhouMotion,createTouhouResources} from '@ts-stg/thlib/touhou';

// A consumer of the public application/prefabs only. This authored test stage
// uses an ordinary enemy as a target; it contains no named Boss or private art.
const host=globalThis.tsstg,options=globalThis.__TOUHOU_FRAMEWORK_OPTIONS??{};
const resources=createTouhouResources(host),target=host.createRenderTarget(960,720),titleTarget=host.createRenderTarget(960,720);
const title={textureId:titleTarget,update(){},draw(draw){
  draw.rect(0,0,960,720,0x121729ff).sprite(titleTarget,480,360,960,720).text('TS-STG',650,100,44,0xdadcf0ff)
    .text('Public framework',650,160,22,0xaabbd0ff);
}};
const app=new TouhouApplication({resources,pixels:host,ownResources:true,
  initialSelection:{character:options.character??0,difficulty:1},autostart:!!options.autostart,
  menuOptions:{background:title,sound:id=>resources.audio?.request(id)},
  gameOptions:{power:400,renderTarget:target,
    onSound:(id,x)=>resources.audio?.request(id,x),onStopSound:id=>resources.audio?.stop(id),
    renderBackground(draw,game){
      draw.rect(0,0,960,720,0x18243dff);
      for(let y=-48;y<720;y+=48)draw.line(0,y+game.frame%48,960,y+game.frame%48,1,0x395773ff);
      for(let x=0;x<960;x+=48)draw.line(x,0,x,720,1,0x304861ff);
    },
    stage(game,frame){
      if(frame===30){
        const boss=game.spawnEnemy({script:166,x:0,y:112,hp:80000,radius:12,
          motion:new TouhouMotion({position:{x:0,y:112}})});
        boss.keepOffscreen=true;game.enterBoss(boss);
      }
      const boss=game.context.boss;
      if(frame===90&&boss?.alive)game.beginSpell({boss,id:0,name:'共通符「星の軌跡」',duration:1800});
      if(boss?.alive&&frame>150&&frame%36===0)game.bullets.emit({x:boss.x,y:boss.y,
        type:Math.floor(frame/180)%50,color:Math.floor(frame/36)%16,
        pattern:3,count:12,rows:1,speed:1.6,angle:frame*.015,angleStep:.12});
      if(frame>180&&frame%180===0){
        const x=frame%360?-130:130;
        game.spawnEnemy({script:(Math.floor(frame/180)%9)*5,x,y:24,hp:80,
          motion:new TouhouMotion({position:{x,y:24},angle:Math.PI/2,speed:.8}),drop:[{type:1},{type:2}]});
      }
      if(frame===1980){game.setBoss(null);game.onExit?.();}
    },
  },onAfterUpdate:()=>resources.audio?.flush(),onQuit:()=>host.quit(),
});
const destroy=app.destroy.bind(app);app.destroy=()=>{if(app.disposed)return;destroy();host.unloadTexture(target);host.unloadTexture(titleTarget);};
globalThis.__tsstg_game=app;
