import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {Keys} from '@ts-stg/thlib';
import {createTouhouResources,touhouEffectVolume} from '@ts-stg/thlib/touhou';
import {RushGame} from '../games/rushboss/src/game.js';
import {hostFixture} from './fixtures/rushboss-host.js';

const available=existsSync(new URL('../packages/thlib/assets/touhou-common/manifest.json',import.meta.url));
test('Rush restart and title return retire animation instances, retain common textures, and flush original sound volume',{skip:!available},()=>{
  const {host,calls}=hostFixture(),read=host.readText;
  host.readText=file=>file.startsWith('packages/thlib/assets/touhou-common/')?
    readFileSync(new URL('../'+file,import.meta.url),'utf8'):read(file);
  host.stopSound=id=>calls.push(['stopSound',id]);
  const resources=createTouhouResources(host),game=new RushGame(host,{resources,startBoss:'sunny',invincible:true});
  game.soundVolume=.25;for(let i=0;i<12;i++)game.update(Keys.SHOOT|(i===0?Keys.BOMB:0));game.render();
  assert.equal(resources.audio.queue.length,0);
  assert.ok(resources.audio.handles.size>0,'A restored player cue must actually play');
  for(const [id,handle]of resources.audio.handles){
    const call=calls.findLast(c=>c[0]==='playSound'&&c[1]===handle);
    assert.ok(call);assert.equal(call[2],Math.pow(10,touhouEffectVolume(resources.audio.definitions.get(id).volume,25)/2000));
  }
  assert.ok(calls.some(c=>c[0]==='loadSound'&&c[1].startsWith('packages/thlib/assets/touhou-common/audio/')));
  const oldBanks=game.battle.touhouResources.banks,oldBossBanks=Object.values(game.battle.presentation.banks),textureLoads=calls.filter(c=>c[0]==='loadTexture').length;
  game.retry();for(let i=0;i<12;i++)game.update(Keys.SHOOT|(i===0?Keys.BOMB:0));game.render();
  for(const [name,bank]of Object.entries(oldBanks)){
    assert.equal(bank.disposed,true);assert.equal(bank.instances.length,0);
    assert.notEqual(bank,game.battle.touhouResources.banks[name]);
    assert.equal(bank.data,game.battle.touhouResources.banks[name].data);
  }
  assert.ok(oldBossBanks.every(bank=>bank.disposed&&bank.instances.length===0));
  assert.equal(calls.filter(c=>c[0]==='loadTexture').length,textureLoads);
  assert.equal(calls.filter(c=>c[0]==='unloadTexture').length,0);
  const currentBanks=game.battle.touhouResources.banks;
  game.toTitle();for(let i=0;i<60;i++)game.update(0);
  assert.equal(game.screen,'title');assert.equal(game.battle,null);
  assert.ok(Object.values(currentBanks).every(bank=>bank.disposed));
  assert.equal(resources.audio.queue.length,0);
  for(const handle of resources.audio.handles.values())assert.ok(calls.some(c=>c[0]==='stopSound'&&c[1]===handle));
  resources.dispose();game.graphics.dispose();game.assets.dispose();
});
