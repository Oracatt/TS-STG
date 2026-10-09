import {TouhouGame,createTouhouResources} from '@ts-stg/thlib/touhou';
const host=globalThis.tsstg;
const resources=createTouhouResources(host);
const game=new TouhouGame({banks:resources.banks,font:resources.font,sht:resources.shots[0],styles:resources.styles,seed:615});
game.player.setPosition(0,240);
game.items.spawn({type:2,x:0,y:240,speed:0});
let draws=0;
globalThis.__tsstg_game={update(){game.update();},render(){draws++;return game.render();},snapshot(){
  const before=JSON.stringify(game.items.floatingScores.snapshot()),score=game.player.score,rng=game.rng.state,visualRng=game.visualRng.state;
  const commands=game.render(),after=JSON.stringify(game.items.floatingScores.snapshot());
  if(before!==after||score!==game.player.score||rng!==game.rng.state||visualRng!==game.visualRng.state)throw Error('Drawing pickup text changed the simulation');
  const entry=game.items.floatingScores.entries.find(entry=>entry.active);
  if(!entry||entry.amount!==3380||entry.timer.current!==game.frame-1||game.player.score!==338)throw Error('Public item collection or visual clock mismatch: '+JSON.stringify({frame:game.frame,score:game.player.score,collectLine:game.player.collectLine,pointValue:game.player.pointValue,entry:entry&&{amount:entry.amount,age:entry.timer.current,y:entry.y}}));
  const atlas=resources.font.texture(resources.font.data.entries[0]);
  const sprites=resources.font.data.sprites;
  const glyphs=commands.filter(command=>command[0]==='spriteRegion'&&command[1]===atlas).flatMap(command=>{
    const sprite=sprites.find(sprite=>sprite&&sprite.index>=289&&sprite.index<=319&&sprite.x===command[2]&&sprite.y===command[3]&&sprite.width===command[4]&&sprite.height===command[5]);
    return sprite?[{index:sprite.index,x:command[6],y:command[7],width:command[8],height:command[9],color:command[11]}]:[];
  });
  if(game.frame>=2&&game.frame<=40&&glyphs.length!==4)throw Error('The Game did not submit its original four pickup glyphs');
  return{frame:game.frame,score:game.player.score,rng:game.rng.state,visualRng:game.visualRng.state,draws,scores:game.items.floatingScores.snapshot(),glyphs,drawPure:true};
}};
