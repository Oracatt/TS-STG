// Execute the original HLSL pixel shader independently of the game, then
// compare it with the application's GLSL translation through the real host.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DrawList} from '../packages/thlib/dist/render.js';
import {RushWarpPass} from '../games/rushboss/src/warp-pass.js';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';
const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let output='reports/rushboss/warp-shader',binary='build/Release/ts-stg.exe',reference='build/Release/tsstg-rush-warp-oracle.exe';
for(let i=0;i<args.length;i++){
  if(args[i]==='--out')output=args[++i];else if(args[i]==='--exe')binary=args[++i];
  else if(args[i]==='--oracle')reference=args[++i];else throw Error('Unknown argument '+args[i]);
}
const directory=resolve(root,output),fixtures=join(root,'build/rushboss-warp'),exe=resolve(root,binary),oracle=resolve(root,reference);
mkdirSync(directory,{recursive:true});mkdirSync(fixtures,{recursive:true});
assert.ok(existsSync(exe));assert.ok(existsSync(oracle));
const shader=join(root,'games/rushboss/assets/shader/warp.fx');assert.ok(existsSync(shader));
const width=960,height=720;
function texturePixels(width,height){
  const data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4;
    data[p]=32+Math.floor(x*191/width);data[p+1]=32+Math.floor(y*191/height);
    data[p+2]=32+Math.floor((x+2*y)*191/(width+2*height));data[p+3]=255;
  }
  return data;
}
const input=join(fixtures,'gradient.rgba');writeFileSync(input,texturePixels(width,height));
const run=(command,arguments_)=>{const result=spawnSync(command,arguments_,{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});if(result.error)throw result.error;assert.equal(result.status,0,result.stdout+'\n'+result.stderr);return (result.stdout??'')+(result.stderr??'');};
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const cases=Array.from({length:6},(_,colorKey)=>({name:`color-${colorKey}`,colorKey,frame:colorKey*197+1,
  boss:{x:[0,-240,190,81,-130,305][colorKey],y:[0,160,-145,70,-183,220][colorKey]},warpFrame:colorKey===0?1:colorKey===1?10:20,active:true}));
cases.push({name:'outside-radius',colorKey:0,frame:400,boss:{x:0,y:0},warpFrame:20,active:false});
const results=[];
for(const scene of cases){
  const pass=new RushWarpPass({createShader(){return 1;}}),draw=new DrawList();
  pass.draw(draw,1,scene.boss,scene.frame,scene.warpFrame,scene.colorKey,scene.active);
  const uniforms=Object.fromEntries(pass.uniforms.map(([name,,value])=>[name,value]));
  const raw=join(directory,scene.name+'-hlsl.rgba'),png=join(directory,scene.name+'-glsl.png'),snapshot=join(directory,scene.name+'.json');
  const oracleOutput=run(oracle,[shader,input,raw,width,height,...uniforms.center,...uniforms.vpSize,...uniforms.radius,...uniforms.warpScale,...uniforms.limit,...uniforms.colorKey].map(String));
  const entry=join(fixtures,scene.name+'.js');
  writeFileSync(entry,`import {DrawList} from '@ts-stg/thlib';
import {RushWarpPass} from '../../games/rushboss/src/warp-pass.js';
const texturePixels=${texturePixels.toString()};
const pass=new RushWarpPass(tsstg),target=tsstg.createRenderTarget(${width},${height});
tsstg.updateTexture(target,texturePixels(${width},${height}));
const scene=${JSON.stringify(scene)},draw=new DrawList();
globalThis.__tsstg_game={update(){},render(){draw.reset().clear(0x000000ff);pass.draw(draw,target,scene.boss,scene.frame,scene.warpFrame,scene.colorKey,scene.active);return draw.commands;},snapshot(){return Object.fromEntries(pass.uniforms.map(([name,,value])=>[name,value]));}};
`);
  const nativeOutput=run(exe,[relative(root,entry),'--root',root,'--frames','2','--benchmark','--screenshot',png,'--snapshot',snapshot]);
  assert.deepEqual(JSON.parse(readFileSync(snapshot)),uniforms,'Node and actual QuickJS uniform values');
  const expected=readFileSync(raw),actual=decodeRgbaPng(readFileSync(png));
  assert.equal(actual.width,width);assert.equal(actual.height,height);assert.equal(expected.length,actual.rgba.length);
  let maximum=0,sum=0,nonzero=0,overOne=0;
  for(let i=0;i<expected.length;i++){const difference=Math.abs(expected[i]-actual.rgba[i]);maximum=Math.max(maximum,difference);sum+=difference;if(difference)nonzero++;if(difference>1)overOne++;}
  const result={scene,uniforms,oracleOutput,nativeOutput,hlsl:raw,glsl:png,maximumChannelDifference:maximum,meanChannelDifference:sum/expected.length,changedChannels:nonzero,channelsOverOne:overOne};
  results.push(result);
  writeFileSync(join(directory,'report.json'),JSON.stringify({format:'ts-stg-rush-warp-shader-v1',
    scope:'Original shader/warp.fx PS compiled with Direct3D11 versus actual GLSL host; same authored RGBA gradient, source-sized enlarged quad, sampler and uniforms. This does not compare the complete original game.',
    sourceSha256:hash(shader),binarySha256:hash(exe),oracleSha256:hash(oracle),results},null,2));
  console.log(`${scene.name}: max ${maximum}/255, mean ${(sum/expected.length).toFixed(6)}/255`);
  assert.ok(maximum<=1,`${scene.name}: original HLSL and GLSL differ beyond one 8-bit channel level`);
}
console.log(`Original HLSL / native GLSL verified: ${results.length} cases.`);
