import {createTouhouResources,TouhouGame,TouhouSpellCardTimeline,validateTouhouSpellCard,
  TouhouRNG,Keys} from '@ts-stg/thlib';

/** Editor-only host adapter. The document runtime never depends on this tool. */
export function createSpellCardPreview(host,source,{silent=false}={}){
  let document=validateTouhouSpellCard(source);const resources=createTouhouResources(host);
  const target=host.createRenderTarget(960,720),composite=host.createRenderTarget(960,720);
  let game,timeline,boss,ended=null,disposed=false,initializing=false,openingSounds=[];
  function stopSounds(){
    // stop() is queued by the common audio owner. Flush while paused too, and
    // drain each stop so an edited card with many sound IDs cannot fill its queue.
    for(const id of resources.audio?.handles.keys()??[]){resources.audio.stop(id);resources.audio.flush();}
  }
  function finish(reason){
    if(ended)return;ended=reason;timeline.stop();game.holdBoss(boss);
    if(game.spell.active){if(reason==='timeout')game.spell.timeout(game.context);else game.spell.capture(game.context);}
    for(const bullet of game.bullets.bullets)game.bullets.cancel(bullet,0);
    for(const laser of game.lasers.lasers)game.lasers.erase(laser);
    game.stopBossCombat();
  }
  function reset(){
    stopSounds();
    timeline?.stop();game?.destroy();ended=null;openingSounds=[];initializing=true;
    const banks=Object.fromEntries(['front','bullet','effect','enemy','ascii_960','text','pl00'].map(name=>[name,resources.createBank(name)]));
    game=new TouhouGame({banks,font:resources.font,styles:resources.styles,sht:resources.shots[0],disposeBanks:true,
      // The Chinese authoring UI selects the existing public text adapter's
      // Chinese code page; the source-faithful thlib default remains Japanese.
      spellContext:{createNameAnimation:(text,options)=>resources.createNameAnimation(text,{...options,codePage:936},banks.text)},
      rng:new TouhouRNG(document.seed),visualRng:new TouhouRNG(document.seed^0x12345),power:400,
      renderTarget:target,compositeTarget:composite,onBossDefeated:()=>finish('defeated'),onSpellTimeout:()=>finish('timeout'),
      onExit:()=>host.quit(),onRestart:reset,
      onSound:(id,x)=>{if(initializing)openingSounds.push([id,x]);else if(!silent)resources.audio?.request(id,x);},onStopSound:id=>resources.audio?.stop(id),
      stage:()=>{if(!ended)timeline.update();},
      renderBackground:draw=>{
        draw.rect(48,24,576,672,0x101728ff);
        for(let y=24;y<697;y+=48)draw.rect(48,y,576,1,0x253650ff);
        for(let x=48;x<625;x+=48)draw.rect(x,24,1,672,0x253650ff);
      }});
    boss=game.spawnEnemy({script:0,x:document.boss.x,y:document.boss.y,hp:document.hp,radius:12,autoBounds:false});
    boss.prepareSpellHealth(document.hp);game.enterBoss(boss);game.setBossHud({name:'Preview Boss',remainingSpells:0});
    game.beginSpell({name:document.name,duration:document.duration,boss,id:0});
    timeline=new TouhouSpellCardTimeline(document,{boss,player:game.player,bullets:game.bullets,lasers:game.lasers,
      presentation:game.bossPresentation,sound:game.context.sound,
      clear:()=>{for(const bullet of game.bullets.bullets)game.bullets.cancel(bullet,0);for(const laser of game.lasers.lasers)game.lasers.erase(laser);}});
    initializing=false;game.postFrame(0);
  }
  reset();
  return{
    get game(){return game;},get timeline(){return timeline;},
    get settling(){return !!ended&&(game.hud.activeNotice||game.bullets.bullets.length>0||game.lasers.lasers.some(laser=>laser.alive)||
      !!game.player.bomb?.alive||[...game.spell.info,...game.spell.retiredInfo,...game.spell.visuals].some(vm=>vm?.alive));},
    reset(source=document){document=validateTouhouSpellCard(source);reset();},
    setSilent(value){silent=!!value;if(silent)stopSounds();},
    update(mask=0){
      if(disposed)return;if(ended&&(mask&Keys.CONFIRM)){reset();return;}
      for(const [id,x] of openingSounds)if(!silent)resources.audio?.request(id,x);openingSounds=[];
      // Authoring rehearsal is invincible; shots/Bomb and collision code still
      // use the real player. The user's project decides its own failure policy.
      game.player.invulnerability.set(9999);game.update(mask);
      if(!timeline.alive&&!ended)finish('timeout');
      // Authoring seeks run many fixed steps per host frame. A simulation clock
      // keeps the shared result time independent of pauses and seek speed.
      game.postFrame(game.frame/60);resources.audio?.flush();
    },
    render(){const commands=game.render();commands.push(['text',ended?'Finished - Enter to retry':'SpellCardEditor - Z shoot / X bomb / Shift focus / Esc pause',54,701,14,0xaac4eaff]);return commands;},
    snapshot(){return{documentId:document.id,ended,timeline:timeline.snapshot(),game:game.snapshot()};},
    destroy(){if(disposed)return;disposed=true;timeline.stop();game.destroy();resources.dispose();host.unloadTexture(target);host.unloadTexture(composite);},
  };
}
