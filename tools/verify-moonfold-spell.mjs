import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const folder=path.join(root,'build/moonfold-check'),reports=path.join(root,'reports/spellcard/moonfold');
await mkdir(folder,{recursive:true});await mkdir(reports,{recursive:true});
const binary=path.join(root,'build/Release/ts-stg.exe');
const probe=process.argv.includes('--probe');
const source=(frames,pilot,batch=1,trace=null,firing=false)=>`import {createSpellCardPreview} from '../../tools/spellcard-editor/native-preview.js';
import {spellCard,createSpell} from '../../examples/spellcard/moonfold.spell.js';
const preview=createSpellCardPreview(tsstg,spellCard,{silent:true,createSpell,invincible:true});
const replay=${JSON.stringify(trace)};
let steps=0,peak=0,hits=0,minClearance=Infinity,maxStep=0,travel=0,lastMask=0;
const collisions=[],checkpoints=[],inputs=[],positions=[];
const emit=preview.game.bullets.emit;
preview.game.bullets.emit=function(parameters,...args){
  const result=emit.call(this,parameters,...args);
  if(result.length!==(parameters.count??1)*(parameters.rows??1))throw Error('Authored bullets exceeded the field capacity');
  peak=Math.max(peak,this.count);return result;
};
const collisionCircle=preview.game.player.collisionCircle;
preview.game.player.collisionCircle=function(x,y,radius,...args){
  // Read contacts before the common collision owner changes a bullet's state.
  const playerRadius=(this.focused?this.focusRadius:this.normalRadius)*Math.max(0,Math.min(100,this.collisionPercent))/100;
  const clearance=Math.hypot(this.x-x,this.y-y)-Math.sqrt(playerRadius*playerRadius+radius*radius);
  if(!Number.isFinite(clearance))throw Error('Nonfinite collision geometry');
  minClearance=Math.min(minClearance,clearance);
  const contact=collisionCircle.call(this,x,y,radius,...args);
  if(contact===1){hits++;if(collisions.length<16)collisions.push({frame:steps,x:this.x,y:this.y,bullet:{x,y,radius}});}
  return contact;
};
function steer(){
  if(replay)return replay[steps];
  if(${pilot}===0||steps<8)return 64;
  const p=preview.game.player;
  const nearby=preview.game.bullets.bullets.filter(b=>(b.state===1||b.state===2)&&Math.hypot(b.x-p.x,b.y-p.y)<145);
  // Two local pilots prefer opposite halves of the field. They see only current
  // positions/velocities, not future emissions or the authored schedule. This
  // is a geometry smoke test, not evidence that the spell is enjoyable.
  const targetX=${pilot}*90,targetY=385;
  let best=Infinity,choice=64;
  for(const [dx,dy,key] of [[0,0,0],[-2,0,1],[2,0,2],[0,-2,4],[0,2,8],[-Math.SQRT2,-Math.SQRT2,5],[Math.SQRT2,-Math.SQRT2,6],[-Math.SQRT2,Math.SQRT2,9],[Math.SQRT2,Math.SQRT2,10]]){
    if(p.x+dx*16<-165||p.x+dx*16>165||p.y+dy*16<270||p.y+dy*16>425)continue;
    let risk=0;
    for(const b of nearby){
      const x=b.x-p.x,y=b.y-p.y,vx=b.vx-dx,vy=b.vy-dy;
      const t=Math.max(0,Math.min(32,-(x*vx+y*vy)/(vx*vx+vy*vy||1)));
      const clearance=Math.hypot(x+vx*t,y+vy*t)-Math.sqrt(p.focusRadius*p.focusRadius+b.radius*b.radius);
      risk+=Math.max(0,22-clearance)**2*(1-t/64);
    }
    const distance=Math.hypot(p.x+dx*16-targetX,p.y+dy*16-targetY);
    const score=risk*20+distance+(key===(lastMask&15)?0:0.8);
    if(score<best){best=score;choice=64|key;}
  }
  return choice;
}
function step(){
  const player=preview.game.player,beforeX=player.x,beforeY=player.y;
  const mask=steer()|${firing?16:0};inputs.push(mask);lastMask=mask;preview.update(mask);
  const distance=Math.hypot(player.x-beforeX,player.y-beforeY);
  maxStep=Math.max(maxStep,distance);travel+=distance;
  peak=Math.max(peak,preview.game.bullets.count);
  for(const bullet of preview.game.bullets.bullets){
    if(bullet.state!==1&&bullet.state!==2)continue;
    if(![bullet.x,bullet.y,bullet.vx,bullet.vy].every(Number.isFinite))throw Error('Nonfinite authored bullet');
  }
  steps++;
  if(steps%30===0)positions.push({frame:steps,x:player.x,y:player.y});
  if([300,495,780,1260,1740,2220].includes(steps))checkpoints.push({frame:steps,player:{x:player.x,y:player.y},
    bullets:preview.game.bullets.bullets.map(b=>({id:b.id,state:b.state,type:b.type,color:b.color,x:b.x,y:b.y,vx:b.vx,vy:b.vy,radius:b.radius})),spell:preview.runner.snapshot()});
}
globalThis.__tsstg_game={
  update(){for(let i=0;i<${batch}&&steps<${frames};i++)step();},
  render:()=>${batch>1?'preview.render()':'[]'},
  snapshot:()=>({frames:steps,peak,hits,minClearance,maxStep,travel,collisions,inputs,positions,checkpoints,spell:preview.runner.snapshot(),result:preview.game.spell.snapshot().result}),
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
async function simulation(name,pilot,backend='v8',trace=null,firing=false){
  const entry=path.join(folder,`${name}.js`),output=path.join(reports,`${name}.json`);
  await writeFile(entry,source(2700,pilot,1,trace,firing));
  await run([entry,'--root',root,'--backend',backend,'--headless','--frames','2700','--snapshot',output]);
  const result=JSON.parse(await readFile(output,'utf8'));
  console.log(`${name}: hits=${result.hits}, clearance=${result.minClearance.toFixed(2)}, peak=${result.peak}, travel=${result.travel.toFixed(0)}`);
  return result;
}
const left=await simulation('left',-1),right=await simulation('right',1),stationary=await simulation('stationary',0);
// Isolate HP/damage pacing from evasion: continuous frontal fire should allow
// capture, not turn this normal spell into an accidental endurance card.
const damage=await simulation('focused-damage',0,'v8',null,true);
if(!probe){
  for(const route of [left,right]){
    assert.equal(route.hits,0,'Both independent local routes must survive the original collision geometry');
    assert.equal(route.spell.frame,2700);assert.equal(route.spell.alive,false);
    assert.ok(route.maxStep<=2.00001,'No teleporting or nonstandard movement speed');
    assert.ok(route.minClearance>=3,'Avoid routes that depend on pixel-perfect collision edges');
    assert.ok(route.peak<1000,'Preserve the authored entity budget');
  }
  assert.ok(left.positions.reduce((sum,p)=>sum+p.x,0)<0&&right.positions.reduce((sum,p)=>sum+p.x,0)>0,'The routes must use different halves');
  assert.ok(stationary.hits>0,'Movement must matter');
  assert.equal(damage.result.captured,true,'Sustained frontal fire must be capable of capturing the card');
  assert.ok(damage.spell.frame>1800&&damage.spell.frame<2600,'Damage pacing must leave time for the final passage');
  const quickjs=await simulation('quickjs-left',-1,'quickjs',left.inputs);
  // Math.hypot is diagnostic double-precision arithmetic, with backend-specific
  // last-bit rounding. Simulation positions and emitted state still match exactly.
  const {minClearance:qClearance,travel:qTravel,...qState}=quickjs;
  const {minClearance:vClearance,travel:vTravel,...vState}=left;
  assert.ok(Math.abs(qClearance-vClearance)<1e-10&&Math.abs(qTravel-vTravel)<1e-10);
  assert.ok(JSON.stringify(qState)===JSON.stringify(vState),
    'Native backends differ on identical inputs; compare quickjs-left.json and left.json');
}
// Capture the actual GPU output, using a hidden frame-stream window.
const pipe=`\\\\.\\pipe\\ts-stg-moonfold-${process.pid}`;
const sockets=new Set();
const server=net.createServer(socket=>{sockets.add(socket);socket.on('data',()=>{});socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
try{
  for(const [name,frame] of [['paper-moon',330],['golden-crossing',540],['last-phrase',2240]]){
    await writeFile(path.join(folder,'capture.js'),source(frame,-1,30,left.inputs));
    await run(['build/moonfold-check/capture.js','--root',root,'--backend','v8','--benchmark',
      '--frames',String(Math.ceil(frame/30)),'--frame-stream',pipe,'--screenshot',path.join(reports,`${name}.png`)]);
  }
}finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
if(!probe)await writeFile(path.join(reports,'verification.json'),JSON.stringify({passed:true,frames:2700,
  routes:[left,right].map(r=>({hits:r.hits,peak:r.peak,minClearance:r.minClearance,travel:r.travel})),
  backends:['quickjs','v8'],stationaryHits:stationary.hits,frontalFireCaptureFrame:damage.spell.frame,
  note:'Two local reactive pilots verify reachable input paths, stock collision geometry, and movement demand. This does not evaluate fun or prove every position is escapable.'},null,2));
console.log(probe?'PROBE: inspect collisions and GPU captures':'PASS: native routes, movement demand, backend parity and GPU captures');
