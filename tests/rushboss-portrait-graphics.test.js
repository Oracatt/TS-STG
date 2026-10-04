import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../games/rushboss/src/portrait-application.js';

const available=fs.existsSync('games/rushboss/assets/portrait/manifest.json')&&fs.existsSync('packages/thlib/assets/touhou-common/manifest.json');
test('title skin completes its source fade without combat; rendering never advances its animation',{skip:!available},()=>{
  let id=0;
  const host={readText:path=>fs.readFileSync(path,'utf8'),loadTexture:()=>++id,unloadTexture(){},
    createRenderTarget:()=>++id,createTexture:()=>++id,loadMusic:()=>++id};
  const app=createRushPortraitGame(host,{store:new SaveStore()});
  const background=app.graphics.backgroundVm.children[0];
  assert.ok(background.alpha<255,'Source background begins with a fade');
  for(let frame=0;frame<35;frame++)app.update(0);
  assert.equal(background.alpha,255,'Title updates must finish the original 20-frame fade');
  const time=background.time;app.render();app.render();assert.equal(background.time,time);
  app.destroy();assert.equal(app.graphics.backgroundBank.disposed,true);
});
