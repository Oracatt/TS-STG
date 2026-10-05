import {createTouhouResources,TouhouGame,TouhouRNG,Keys} from '@ts-stg/thlib';
import {validateSpellMetadata} from './metadata.js';

/** Editor-only host adapter. The document runtime never depends on this tool. */
export function createSpellCardPreview(host,source,{silent=false,createSpell,invincible=true}={}){
  if(typeof createSpell!=='function')throw new TypeError('createSpell must be a function');
  if(typeof invincible!=='boolean')throw new TypeError('invincible must be a boolean');
  let document=validateSpellMetadata(source);const resources=createTouhouResources(host);
  const target=host.createRenderTarget(960,720),composite=host.createRenderTarget(960,720);
  let scene,disposed=false;
  function validateRunner(runner){
    if(!runner||typeof runner.update!=='function'||typeof runner.stop!=='function')
      throw new TypeError('createSpell(context) must return a runner with update() and stop()');
    if(!Number.isSafeInteger(runner.frame)||runner.frame<0||typeof runner.alive!=='boolean')
      throw new TypeError('Spell runner requires a nonnegative integer frame and boolean alive');
    if(runner.snapshot!==undefined&&typeof runner.snapshot!=='function')throw new TypeError('Spell runner snapshot must be a function');
    return runner;
  }
  function stepRunner(runner){
    const frame=runner.frame,result=runner.update();
    if(result&&typeof result.then==='function'){
      // Report this contract violation without leaving an unhandled rejection
      // in the host's job queue when an authored async function also throws.
      Promise.resolve(result).catch(()=>{});
      throw new TypeError('createSpell.update must be synchronous');
    }
    validateRunner(runner);
    if(runner.frame!==frame+1&&(runner.alive||runner.frame!==frame))
      throw new TypeError('createSpell.update must advance frame by exactly one, or stop at the current frame');
  }
  function stopSounds(){
    // stop() is queued by the common audio owner. Flush while paused too, and
    // drain each stop so an edited card with many sound IDs cannot fill its queue.
    for(const id of resources.audio?.handles.keys()??[]){resources.audio.stop(id);resources.audio.flush();}
  }
  function finish(current,reason){
    const {game,runner,boss}=current;
    if(current.ended)return;current.ended=reason;runner.stop();game.holdBoss(boss);
    if(game.spell.active){if(reason==='timeout')game.spell.timeout(game.context);else game.spell.capture(game.context);}
    for(const bullet of game.bullets.bullets)game.bullets.cancel(bullet,0);
    for(const laser of game.lasers.lasers)game.lasers.erase(laser);
    game.stopBossCombat();
  }
  function buildScene(nextDocument,nextFactory,nextInvincible){
    if(typeof nextFactory!=='function')throw new TypeError('createSpell must be a function');
    const current={game:null,runner:null,boss:null,ended:null,invincible:nextInvincible,exitRequested:false,restartRequested:false,openingSounds:[],initializing:true};
    const banks={};
    try{
      for(const name of ['front','bullet','effect','enemy','ascii_960','text','pl00'])banks[name]=resources.createBank(name);
      const game=current.game=new TouhouGame({banks,font:resources.font,styles:resources.styles,sht:resources.shots[0],disposeBanks:true,
        // The Chinese authoring UI selects the existing public text adapter's
        // Chinese code page; the source-faithful thlib default remains Japanese.
        spellContext:{createNameAnimation:(text,options)=>resources.createNameAnimation(text,{...options,codePage:936},banks.text)},
        rng:new TouhouRNG(nextDocument.seed),visualRng:new TouhouRNG(nextDocument.seed^0x12345),power:400,session:{mode:2},
        renderTarget:target,compositeTarget:composite,onBossDefeated:()=>finish(current,'defeated'),onSpellTimeout:()=>finish(current,'timeout'),
        // Menu callbacks finish their own update before the editor replaces or
        // holds this scene. Exiting a rehearsal never quits the native host.
        onExit:()=>{current.exitRequested=true;},onRestart:()=>{current.restartRequested=true;},
        onSound:(id,x)=>{if(current.initializing)current.openingSounds.push([id,x]);else if(!silent)resources.audio?.request(id,x);},onStopSound:id=>resources.audio?.stop(id),
        stage:()=>{if(!current.ended)stepRunner(current.runner);},
        renderBackground:draw=>{
          draw.rect(48,24,576,672,0x101728ff);
          for(let y=24;y<697;y+=48)draw.rect(48,y,576,1,0x253650ff);
          for(let x=48;x<625;x+=48)draw.rect(x,24,1,672,0x253650ff);
        }});
      const boss=current.boss=game.spawnEnemy({script:0,x:nextDocument.boss.x,y:nextDocument.boss.y,hp:nextDocument.hp,radius:12,autoBounds:false});
      boss.prepareSpellHealth(nextDocument.hp);game.enterBoss(boss);game.setBossHud({name:'Preview Boss',remainingSpells:0});
      game.beginSpell({name:nextDocument.name,duration:nextDocument.duration,boss,id:0});
      const context={boss,player:game.player,bullets:game.bullets,lasers:game.lasers,game,random:new TouhouRNG(nextDocument.seed),
        presentation:game.bossPresentation,sound:game.context.sound,
        clear:()=>{for(const bullet of game.bullets.bullets)game.bullets.cancel(bullet,0);for(const laser of game.lasers.lasers)game.lasers.erase(laser);}};
      current.runner=nextFactory(context);
      validateRunner(current.runner);
      current.initializing=false;game.postFrame(0);return current;
    }catch(failure){
      try{current.runner?.stop();}catch{}
      if(current.game)current.game.destroy();else for(const bank of Object.values(banks))bank.dispose();
      throw failure;
    }
  }
  function reset(source=document,options={}){
    const nextDocument=validateSpellMetadata(source),nextFactory=Object.hasOwn(options,'createSpell')?options.createSpell:createSpell;
    const nextInvincible=Object.hasOwn(options,'invincible')?options.invincible:invincible;
    if(typeof nextInvincible!=='boolean')throw new TypeError('invincible must be a boolean');
    // A syntax-valid module may still throw while creating its runner. Keep the
    // last working scene and its banks until construction has fully succeeded.
    const candidate=buildScene(nextDocument,nextFactory,nextInvincible);
    stopSounds();
    // User cleanup must not strand a successfully compiled replacement scene.
    try{scene?.runner.stop();}catch{}
    scene?.game.destroy();
    scene=candidate;document=nextDocument;createSpell=nextFactory;invincible=nextInvincible;
  }
  try{reset();}catch(failure){resources.dispose();host.unloadTexture(target);host.unloadTexture(composite);throw failure;}
  return{
    get game(){return scene.game;},get runner(){return scene.runner;},
    get invincible(){return scene.invincible;},get exited(){return scene.ended==='exited';},
    get settling(){const {game,ended}=scene;return !!ended&&ended!=='exited'&&(game.hud.activeNotice||game.bullets.bullets.length>0||game.lasers.lasers.some(laser=>laser.alive)||
      !!game.player.bomb?.alive||[...game.spell.info,...game.spell.retiredInfo,...game.spell.visuals].some(vm=>vm?.alive));},
    reset,
    setSilent(value){silent=!!value;if(silent)stopSounds();},
    update(mask=0){
      if(disposed)return;const {game,runner,ended}=scene;if(ended&&(mask&Keys.CONFIRM)){reset();return;}
      if(ended==='exited')return;
      for(const [id,x] of scene.openingSounds)if(!silent)resources.audio?.request(id,x);scene.openingSounds=[];
      // Observation is an editor option. Real play leaves every hit, Bomb,
      // death and respawn timer under the common player's ownership.
      if(scene.invincible)game.player.invulnerability.set(9999);
      game.update(mask);if(scene.game!==game)return;
      if(scene.restartRequested){reset();return;}
      if(scene.exitRequested){scene.ended='exited';runner.stop();stopSounds();return;}
      if(!runner.alive&&!ended)finish(scene,'timeout');
      // Authoring seeks run many fixed steps per host frame. A simulation clock
      // keeps the shared result time independent of pauses and seek speed.
      game.postFrame(game.frame/60);resources.audio?.flush();
    },
    render(){const commands=scene.game.render();commands.push(['text',scene.ended?'Finished - Enter to retry':'SpellCardEditor - Z shoot / X bomb / Shift focus / Esc pause',54,701,14,0xaac4eaff]);return commands;},
    snapshot(){const {runner,game,ended}=scene;return{documentId:document.id,invincible,ended,runner:runner.snapshot?.()??{frame:runner.frame,alive:runner.alive},game:game.snapshot()};},
    destroy(){if(disposed)return;disposed=true;try{scene.runner.stop();}finally{scene.game.destroy();resources.dispose();host.unloadTexture(target);host.unloadTexture(composite);}},
  };
}
