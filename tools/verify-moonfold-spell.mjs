import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const folder=path.join(root,'build/moonfold-check'),reports=path.join(root,'reports/spellcard/moonfold');
await mkdir(folder,{recursive:true});await mkdir(reports,{recursive:true});
const binary=path.join(root,'build/Release/ts-stg.exe');
const source=(frames,pilot,batch=1)=>`import {createSpellCardPreview} from '../../tools/spellcard-editor/native-preview.js';
import {spellCard,createSpell} from '../../examples/spellcard/moonfold.spell.js';
const preview=createSpellCardPreview(tsstg,spellCard,{silent:true,createSpell});
let steps=0,peak=0,hits=0,minClearance=Infinity,maxStep=0;
const collisions=[],checkpoints=[];
const emit=preview.game.bullets.emit;
preview.game.bullets.emit=function(parameters,...args){
  const result=emit.call(this,parameters,...args);
  if(result.length!==(parameters.count??1)*(parameters.rows??1))throw Error('Authored bullets exceeded the field capacity');
  peak=Math.max(peak,this.count);return result;
};
const collisionCircle=preview.game.player.collisionCircle;
preview.game.player.collisionCircle=function(x,y,radius,...args){
  // Observe before thlib changes a contacted bullet to its hit animation;
  // testing only surviving field objects would miss the collision entirely.
  const playerRadius=(this.focused?this.focusRadius:this.normalRadius)*Math.max(0,Math.min(100,this.collisionPercent))/100;
  const clearance=Math.hypot(this.x-x,this.y-y)-Math.sqrt(playerRadius*playerRadius+radius*radius);
  if(!Number.isFinite(clearance))throw Error('Nonfinite collision geometry');
  minClearance=Math.min(minClearance,clearance);
  const contact=collisionCircle.call(this,x,y,radius,...args);
  if(contact===1){
    hits++;if(collisions.length<16)collisions.push({frame:steps,x:this.x,bullet:{x,y,radius}});
  }
  return contact;
};
function route(frame){
  if(frame<120)return -80*Math.min(frame/60,1);
  if(frame>=2520)return 80;
  const cycle=Math.floor((frame-120)/480),beat=(frame-120)%480,side=cycle%2?1:-1;
  return side*80*(1-2*Math.max(0,Math.min(1,(beat-374)/80)));
}
function step(){
  const player=preview.game.player;
  const target=${pilot?'route(steps)':'0'},beforeX=player.x;
  // Use real focus keys and the player's fixed-point movement owner. Give the
  // initial focus transition eight frames; no position teleporting is used.
  const direction=steps<8?0:target<player.x-1?1:target>player.x+1?2:0;
  preview.update(64|direction);
  maxStep=Math.max(maxStep,Math.abs(player.x-beforeX));
  peak=Math.max(peak,preview.game.bullets.count);
  for(const bullet of preview.game.bullets.bullets){
    if(bullet.state!==1&&bullet.state!==2)continue;
    if(![bullet.x,bullet.y,bullet.vx,bullet.vy].every(Number.isFinite))throw Error('Nonfinite authored bullet');
  }
  steps++;
  if([300,495,780,1260,1740,2220].includes(steps))checkpoints.push({frame:steps,player:{x:player.x,y:player.y},
    bullets:preview.game.bullets.bullets.map(b=>({id:b.id,state:b.state,type:b.type,color:b.color,x:b.x,y:b.y,vx:b.vx,vy:b.vy,radius:b.radius})),spell:preview.timeline.snapshot()});
}
globalThis.__tsstg_game={
  update(){for(let i=0;i<${batch}&&steps<${frames};i++)step();},
  render:()=>${batch>1?'preview.render()':'[]'},
  snapshot:()=>({frames:steps,peak,hits,minClearance,maxStep,collisions,checkpoints,spell:preview.timeline.snapshot()}),
  destroy:()=>preview.destroy(),
};
`;
async function run(args){
  const child=spawn(binary,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
  const timeout=setTimeout(()=>child.kill(),120000);
  try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Native check failed (${code}): ${log}`)));});}
  finally{clearTimeout(timeout);}
}
const results=[];
await writeFile(path.join(folder,'route.js'),source(2700,true));
for(const backend of ['quickjs','v8']){
  const output=path.join(reports,`${backend}-route.json`);
  await run(['build/moonfold-check/route.js','--root',root,'--backend',backend,'--headless','--frames','2700','--snapshot',output]);
  const result=JSON.parse(await readFile(output,'utf8'));results.push(result);
  console.log(`${backend}: hits=${result.hits}, clearance=${result.minClearance.toFixed(2)}, peak=${result.peak}`);
}
assert.ok(JSON.stringify(results[0])===JSON.stringify(results[1]),
  'Native snapshots differ; compare quickjs-route.json and v8-route.json');
assert.equal(results[0].hits,0,'The intended crossing route must survive actual thlib bullet geometry');
assert.equal(results[0].spell.frame,2700,'The authored runner must reach its full duration');
assert.equal(results[0].spell.alive,false,'The authored runner must finish');
assert.ok(results[0].maxStep<=2.00001,'Route must be reachable at original focused movement speed');
assert.ok(results[0].minClearance>=8,'The demonstrated route needs visible clearance, not pixel-perfect luck');
assert.ok(results[0].peak<700,'Preserve the designed entity budget');

await writeFile(path.join(folder,'still.js'),source(2700,false));
const stationary=path.join(reports,'stationary.json');
await run(['build/moonfold-check/still.js','--root',root,'--backend','v8','--headless','--frames','2700','--snapshot',stationary]);
assert.ok(JSON.parse(await readFile(stationary,'utf8')).hits>0,'The spell must require movement');

// Drain hidden native frames while capturing actual GPU output; never leave a
// game window or alter the editor user's draft to present verification.
const pipe=`\\\\.\\pipe\\ts-stg-moonfold-${process.pid}`;
const sockets=new Set();
const server=net.createServer(socket=>{sockets.add(socket);socket.on('data',()=>{});socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
try{
  for(const [name,frame] of [['paper-moon',300],['golden-crossing',510],['last-phrase',2240]]){
    await writeFile(path.join(folder,'capture.js'),source(frame,true,30));
    await run(['build/moonfold-check/capture.js','--root',root,'--backend','v8','--benchmark',
      '--frames',String(Math.ceil(frame/30)),'--frame-stream',pipe,'--screenshot',path.join(reports,`${name}.png`)]);
  }
}finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
await writeFile(path.join(reports,'verification.json'),JSON.stringify({passed:true,frames:2700,
  peak:results[0].peak,minClearance:results[0].minClearance,maxFocusedStep:results[0].maxStep,
  routeHits:results[0].hits,backends:['quickjs','v8'],stationaryHits:JSON.parse(await readFile(stationary,'utf8')).hits,
  note:'One intended focused route verified with real ANM timing and original collision geometry; this does not prove every player position is escapable.'},null,2));
console.log('PASS: Moonfold lifetime, native route, movement demand, backend parity and GPU captures');
