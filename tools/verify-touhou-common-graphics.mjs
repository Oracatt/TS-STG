// Compare full original local banks with the public filtered resource pack using
// the same real QuickJS player implementation and native GPU, sequentially.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let output='reports/touhou-common',selection,binary='build/Release/ts-stg.exe';
for(let i=0;i<args.length;i++){
  if(args[i]==='--out')output=args[++i];else if(args[i]==='--scene')selection=args[++i];else if(args[i]==='--exe')binary=args[++i];else throw Error(`Unknown option ${args[i]}`);
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),hashFile=path=>hash(readFileSync(path));
const watched=readdirSync(join(root,'packages/thlib/dist/touhou')).filter(name=>name.endsWith('.js')).map(name=>`packages/thlib/dist/touhou/${name}`);
watched.push('packages/thlib/assets/touhou-common/manifest.json');
const sourceHashes=()=>Object.fromEntries(watched.map(file=>[file,hashFile(join(root,file))]));
const before=sourceHashes(),executable=resolve(root,binary),destination=resolve(root,output),fixtures=join(root,'build/touhou-common-graphics');
assert.ok(existsSync(executable),'Build the native engine first');mkdirSync(destination,{recursive:true});mkdirSync(fixtures,{recursive:true});
const scenes=[0,1].flatMap(character=>[
  {name:`${character?'marisa':'reimu'}-shoot-focus`,character,frames:120,bombFrame:-1,focused:true},
  ...[['early',24],['middle',100],['late',200]].map(([age,bombAge])=>({name:`${character?'marisa':'reimu'}-bomb-${age}`,character,frames:60+bombAge,bombFrame:60,focused:false,bombAge})),
]).filter(scene=>!selection||scene.name===selection);
assert.ok(scenes.length,`Unknown scene ${selection}`);
const results=[];
for(const scene of scenes){
  const artifacts={};
  for(const mode of ['original','shared']){
    const entry=join(fixtures,`${scene.name}-${mode}.js`),prefix=join(destination,`${scene.name}-${mode}`);
    writeFileSync(entry,`import {TouhouPlayer,AnmBank,TouhouRenderQueue,createTouhouResources} from '@ts-stg/thlib/touhou';
import {DrawList,Keys} from '@ts-stg/thlib';
const host=globalThis.tsstg,mode=${JSON.stringify(mode)},scene=${JSON.stringify(scene)},character=scene.character,name='pl0'+character;
const read=path=>JSON.parse(host.readText(path)),environment={loadTexture:(...args)=>host.loadTexture(...args)};
const resources=mode==='shared'?createTouhouResources(host):null;
const bank=resources?resources.banks[name]:new AnmBank(read('games/touhou20/assets/anm/'+name+'.json'),environment);
const effect=resources?resources.banks.effect:new AnmBank(read('games/touhou20/assets/anm/effect.json'),environment);
const sht=resources?resources.shots[character]:read('games/touhou20/assets/shots/'+name+'.json');
const player=new TouhouPlayer({character,sht,bank,effectBank:effect,power:400,x:0,y:380,seed:2468});
const draw=new DrawList(),queue=new TouhouRenderQueue(),enemy={x:0,y:70,radius:12,hp:999999},sounds=[],traces=[],cancellations=[];let frame=0,maximumShots=0,sawFocus=false,sawBomb=false;
const context={enemies:[enemy],sound:(id,x)=>sounds.push([frame,id,x]),stopSound:id=>sounds.push([frame,-id-1,0]),
 cancelCircle:(x,y,radius,options)=>cancellations.push([frame,'circle',x,y,radius,options]),
 cancelRectangle:(x,y,width,height,angle,options)=>cancellations.push([frame,'rectangle',x,y,width,height,angle,options])};
function state(){return {frame,player:player.snapshot(),body:player.animation?.snapshot(),focus:player.focusEffect?.snapshot()??null,
  options:player.options.filter(o=>o.active).map(o=>({animation:o.animation?.snapshot(),full:o.fullAnimation?.snapshot()})),
  shots:player.shots.map(s=>({id:s.id,animation:s.animation?.snapshot()})),enemyHp:enemy.hp};}
globalThis.__tsstg_game={update(){let mask=Keys.SHOOT;
 if(frame>=20&&frame<35)mask|=Keys.RIGHT;
 if(frame>=35&&frame<50)mask|=Keys.LEFT|Keys.FOCUS;
 if(scene.focused&&frame>=70)mask|=Keys.FOCUS;
 if(frame===scene.bombFrame)mask|=Keys.BOMB;
 player.update(mask,context);for(const b of[bank,effect]){b.updateDetached();b.collect();}frame++;maximumShots=Math.max(maximumShots,player.shots.length);sawFocus||=player.focused;sawBomb||=!!player.bomb;
 if([1,30,59,60,61,80,120,160,200].includes(frame))traces.push(state());
},render(){draw.reset().clear(0x0e1426ff);draw.rect(192,16,576,672,0x18243aff);
 for(let x=192;x<=768;x+=48)draw.line(x,16,x,688,1,0x26364fff);
 for(let y=16;y<=688;y+=48)draw.line(192,y,768,y,1,0x26364fff);
 draw.ring(480,121,12,14,0x89aac0ff);const view={x:480,y:16,scale:1.5,screenScale:1};queue.reset();player.draw(queue,view);bank.drawDetached(queue,view);effect.drawDetached(queue,view);draw.scissor(192,16,576,672);queue.flush(draw);draw.scissorEnd();return draw.commands;
},snapshot(){return {final:state(),traces,sounds,cancellations,maximumShots,sawFocus,sawBomb};}};
`);
    const run=spawn(executable,[relative(root,entry),'--root',root,'--frames',String(scene.frames),'--benchmark','--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';run.stdout.on('data',data=>stdout+=data);run.stderr.on('data',data=>stderr+=data);
    const status=await new Promise((done,fail)=>{run.on('error',fail);run.on('close',done);});assert.equal(status,0,`${scene.name}/${mode}: ${stdout}\n${stderr}`);
    artifacts[mode]={image:`${prefix}.png`,snapshot:`${prefix}.json`,imageSha256:hashFile(`${prefix}.png`),snapshotSha256:hashFile(`${prefix}.json`)};
  }
  const original=JSON.parse(readFileSync(artifacts.original.snapshot)),shared=JSON.parse(readFileSync(artifacts.shared.snapshot));
  assert.deepEqual(shared,original,`${scene.name}: runtime or animation state changed`);
  assert.equal(shared.final.frame,scene.frames);assert.ok(shared.maximumShots>0);assert.ok(shared.sawFocus);
  if(scene.bombFrame>=0){assert.ok(shared.sawBomb);assert.equal(shared.final.player.bombs,1);assert.ok(shared.cancellations.length>0);}
  else assert.equal(shared.final.player.focused,true);
  const a=decodeRgbaPng(readFileSync(artifacts.original.image)),b=decodeRgbaPng(readFileSync(artifacts.shared.image));
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  let changedPixels=0,maxChannelDifference=0;for(let i=0;i<a.rgba.length;i+=4){let changed=false;for(let c=0;c<4;c++){const delta=Math.abs(a.rgba[i+c]-b.rgba[i+c]);if(delta)changed=true;maxChannelDifference=Math.max(maxChannelDifference,delta);}if(changed)changedPixels++;}
  assert.equal(changedPixels,0,`${scene.name}: ${changedPixels} pixels changed; maximum RGBA difference ${maxChannelDifference}`);
  assert.equal(artifacts.shared.imageSha256,artifacts.original.imageSha256,`${scene.name}: PNG bytes changed`);
  results.push({...scene,artifacts,statesIdentical:true,pngBytesIdentical:true,changedPixels,maxChannelDifference,width:a.width,height:a.height});
  console.log(`PASS ${scene.name}: state and native PNG identical (${a.width}x${a.height})`);
}
assert.deepEqual(sourceHashes(),before,'Public implementation or resources changed during comparison');
const report={format:'ts-stg-touhou-common-graphics-v1',scope:'Same restored TouhouPlayer in real QuickJS/native GPU, full original local ANM/SHT vs public filtered ANM and baseline data; does not execute the original game.',passed:true,binarySha256:hashFile(executable),sourceHashes:before,sourceStable:true,results};
writeFileSync(join(destination,'graphics.json'),JSON.stringify(report,null,2)+'\n');console.log(`Report: ${join(destination,'graphics.json')}`);
