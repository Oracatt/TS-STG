import test from 'node:test';
import assert from 'node:assert/strict';
import { Keys } from '@ts-stg/thlib';
import { RushGame } from '../games/rushboss/src/game.js';
import { TITLE_TIMING } from '../games/rushboss/src/title.js';
import { hostFixture } from './fixtures/rushboss-host.js';

const ticks=(game,n,mask=0)=>{for(let frame=0;frame<n;frame++)game.update(mask);};
function ready(game){let n=0;while(game.inputLocked&&!game.quitRequested){game.update(0);assert.ok(++n<200);}return n;}
function tap(game,key){ready(game);game.update(key);game.update(0);ready(game);}
function fixture(){const f=hostFixture();return {...f,game:new RushGame(f.host,{resources:f.resources,invincible:true})};}
function dispose(game){game.graphics.dispose();game.assets.dispose();}
function difficultyPage(game){tap(game,Keys.DOWN);tap(game,Keys.CONFIRM);assert.equal(game.screen,'difficulty');}
function characterPage(game){difficultyPage(game);tap(game,Keys.CONFIRM);assert.equal(game.screen,'character');}
function spellPage(game){characterPage(game);tap(game,Keys.CONFIRM);tap(game,Keys.CONFIRM);assert.equal(game.screen,'spell');}
const sprites=(game,name)=>{const id=game.assets.texture(name);return game.render().filter(c=>(c[0]==='sprite'||c[0]==='spriteRegion')&&c[1]===id);};

test('the main entrance consumes held input and confirmation waits for the new difficulty actors',()=>{
  const {game}=fixture();
  ticks(game,TITLE_TIMING.entrance,Keys.CONFIRM);
  assert.equal(game.screen,'title');assert.equal(game.transition,null);assert.equal(game.inputLocked,false);
  game.update(0);game.update(Keys.CONFIRM);
  assert.equal(game.screen,'title');assert.equal(game.transition.age,0);assert.equal(game.transition.duration,60);
  const title=JSON.stringify(game.render());
  ticks(game,19);assert.equal(game.screen,'title');
  assert.equal(sprites(game,'src_titlebg_2').length,0);
  ticks(game,3);
  const backdrop=sprites(game,'src_titlebg_2')[0];
  assert.ok(backdrop[4]>640*1.5&&backdrop[4]<799*1.5);
  assert.deepEqual(sprites(game,'src_difficulty').filter(c=>c[0]==='spriteRegion').map(c=>c[3]),[510]);
  ticks(game,4);
  assert.deepEqual(sprites(game,'src_difficulty').filter(c=>c[0]==='spriteRegion').map(c=>c[3]),[510,340,170]);
  assert.notEqual(JSON.stringify(game.render()),title);
  ticks(game,33);assert.equal(game.screen,'title');assert.equal(game.transition.age,59);
  game.update(0);assert.equal(game.screen,'difficulty');assert.equal(game.transition,null);assert.equal(game.inputLocked,false);
  dispose(game);
});

test('repeated confirm, cancel and direction edges during a transition never queue another page',()=>{
  const {game}=fixture();ready(game);game.update(Keys.CONFIRM);
  for(let frame=0;frame<60;frame++)game.update(frame%2?Keys.CONFIRM|Keys.BOMB|Keys.DOWN:0);
  assert.equal(game.screen,'difficulty');assert.equal(game.difficulty,1);assert.equal(game.character,0);assert.equal(game.selection,0);
  game.update(Keys.CONFIRM|Keys.BOMB|Keys.DOWN);
  assert.equal(game.transition,null,'Held input cannot become a fresh edge after unlock');
  game.update(0);game.update(Keys.CONFIRM);
  assert.equal(game.transition.to.screen,'character');assert.equal(game.screen,'difficulty');
  dispose(game);
});

test('difficulty selection slides existing cards instead of moving them instantly and uses source direction',()=>{
  const {game}=fixture();difficultyPage(game);
  const initial=sprites(game,'src_difficulty').find(c=>c[3]===340);
  game.update(Keys.RIGHT);assert.equal(game.difficulty,2);assert.equal(game.transition.duration,30);
  const start=sprites(game,'src_difficulty').find(c=>c[3]===340);assert.equal(start[6],initial[6]);assert.equal(start[7],initial[7]);
  ticks(game,5);
  const middle=sprites(game,'src_difficulty').find(c=>c[3]===340);
  assert.ok(middle[6]>510&&middle[6]<initial[6]);assert.ok(middle[7]>initial[7]&&middle[7]<360);
  ready(game);const final=sprites(game,'src_difficulty').find(c=>c[3]===340);
  assert.equal(final[6],510);assert.equal(final[7],360);
  tap(game,Keys.DOWN);assert.equal(game.difficulty,1,'Source Down/Left reduce difficulty');
  tap(game,Keys.LEFT);assert.equal(game.difficulty,0);
  game.update(Keys.LEFT);assert.equal(game.difficulty,3);assert.equal(game.transition.duration,82);
  ready(game);assert.equal(game.difficulty,3);dispose(game);
});

test('difficulty confirmation overlaps leaving cards, entering full portrait and the fifteen-frame badge',()=>{
  const {game}=fixture();difficultyPage(game);game.update(Keys.CONFIRM);
  ticks(game,19);assert.equal(sprites(game,'src_ps00').length,0);
  ticks(game,6);assert.equal(game.screen,'difficulty');
  const portrait=sprites(game,'src_ps00')[0];
  assert.equal(portrait[4],1071*.4*1.5);assert.equal(portrait[5],1170*.4*1.5);
  assert.ok((portrait.at(-1)&255)>0&&(portrait.at(-1)&255)<255);
  const badge=sprites(game,'src_difficulty').find(c=>c[5]===119);
  assert.ok(badge[7]>360&&badge[7]<660);assert.ok(badge[8]>477*.4*1.5&&badge[8]<477*.8*1.5);
  assert.ok(sprites(game,'src_difficulty').some(c=>c[5]===170));
  ready(game);assert.equal(game.screen,'character');dispose(game);
});

test('left and right character changes preserve both portraits and rotate both introduction panels',()=>{
  for(const direction of [Keys.LEFT,Keys.RIGHT]){
    const {game}=fixture();characterPage(game);game.update(direction);ticks(game,5);
    assert.equal(game.character,1);assert.equal(game.screen,'character');assert.equal(game.inputLocked,true);
    const old=sprites(game,'src_ps00')[0],incoming=sprites(game,'src_ps01')[0];
    assert.ok((old.at(-1)&255)>0&&(old.at(-1)&255)<255);assert.ok((incoming.at(-1)&255)>0);
    assert.equal(old[4],1071*.4*1.5);assert.equal(incoming[4],1030*.4*1.5);
    assert.ok(direction===Keys.LEFT?incoming[2]>180:incoming[2]<180);
    const intros=sprites(game,'src_playerintro');assert.equal(intros.length,2);
    assert.ok(intros.every(c=>c[8]>0&&c[8]<367*1.5));
    ticks(game,5,0);game.update(direction);assert.equal(game.character,1,'Selection is locked while the original actors are moving');
    ready(game);assert.equal(sprites(game,'src_ps01')[0][2],180);assert.equal(sprites(game,'src_playerintro').length,1);
    dispose(game);
  }
});

test('return transitions retain outgoing actors, reveal the original main selection and cannot skip a page',()=>{
  const {game}=fixture();characterPage(game);game.update(Keys.BOMB);
  assert.equal(game.screen,'character');assert.equal(game.transition.to.screen,'difficulty');
  ticks(game,5);assert.equal(game.screen,'character');assert.ok(sprites(game,'src_ps00').length);assert.ok(sprites(game,'src_difficulty').some(c=>c[5]===170));
  ready(game);assert.equal(game.screen,'difficulty');game.update(Keys.BOMB);
  ticks(game,10);assert.equal(game.screen,'difficulty');const bg=sprites(game,'src_titlebg_2')[0];assert.ok((bg.at(-1)&255)>0&&(bg.at(-1)&255)<255);
  ready(game);assert.equal(game.screen,'title');assert.equal(game.selection,1);assert.equal(game.transition,null);
  assert.equal(sprites(game,'src_titlebg_2').length,0);dispose(game);
});

test('Boss and individual spell pages animate and battle creation follows the complete original wipe',()=>{
  const {game}=fixture();characterPage(game);game.update(Keys.CONFIRM);
  ticks(game,30);assert.equal(game.screen,'character');assert.ok(sprites(game,'src_title').some(c=>c[4]===69&&(c.at(-1)&255)<255));
  ready(game);assert.equal(game.screen,'boss');game.update(Keys.CONFIRM);
  ticks(game,28);assert.equal(game.screen,'boss');assert.ok(game.render().some(c=>c[0]==='text'&&c[1].includes('符卡练习')&&(c[5]&255)<255));
  ready(game);assert.equal(game.screen,'spell');game.update(Keys.CONFIRM);
  assert.equal(game.battle,null);assert.equal(game.transition.duration,82);ticks(game,14);
  assert.ok(game.render().some(c=>c[0]==='mesh'&&c[1]===game.assets.texture('src_switchbg')));
  ticks(game,67);assert.equal(game.screen,'spell');assert.equal(game.battle,null);
  game.update(0);assert.equal(game.screen,'battle');assert.ok(game.battle);assert.equal(game.battle.frame,0);
  dispose(game);
});

test('Replay, Option, Manual and Quit all wait for their transitions and Quit fires once',()=>{
  for(const [index,screen] of [[2,'replay'],[3,'option'],[4,'manual'],[5,'quit']]){
    const {game,calls}=fixture();for(let move=0;move<index;move++)tap(game,Keys.DOWN);
    game.update(Keys.CONFIRM);assert.equal(game.screen,'title');assert.equal(game.transition.to.screen,screen);
    if(screen==='quit'){
      ticks(game,39);assert.equal(calls.filter(c=>c[0]==='quit').length,0);
      game.update(Keys.CONFIRM);assert.equal(calls.filter(c=>c[0]==='quit').length,1);
      ticks(game,20,Keys.CONFIRM);assert.equal(calls.filter(c=>c[0]==='quit').length,1);
    }else{
      ready(game);assert.equal(game.screen,screen);game.update(Keys.BOMB);assert.equal(game.screen,screen);
      ready(game);assert.equal(game.screen,'title');assert.equal(game.selection,index);
    }
    dispose(game);
  }
});

test('returning from a paused battle freezes simulation while fading into the main page',()=>{
  const {host,resources}=hostFixture(),game=new RushGame(host,{resources,startBoss:'sunny',phaseIndex:1,practice:true,invincible:true});
  game.update(0);tap(game,Keys.PAUSE);tap(game,Keys.DOWN);tap(game,Keys.DOWN);
  game.update(Keys.CONFIRM);const battle=game.battle,frame=battle.frame;
  ticks(game,25);assert.equal(game.screen,'battle');assert.equal(battle.frame,frame);
  assert.ok(game.render().some(c=>c[0]==='sprite'&&c[1]===game.assets.texture('src_titlebg')));
  ticks(game,15);assert.equal(game.screen,'title');assert.equal(game.battle,null);assert.equal(game.paused,false);
  dispose(game);
});
