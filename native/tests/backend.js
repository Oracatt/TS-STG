// Real embedding checks: no Node fallback, ESM cycles/live bindings, fulfilled
// top-level await, per-frame microtasks, typed-array offsets and host exceptions.
import {alpha,cycleValue,advanceAlpha} from './backend-module-a.js';
import {cycleValue as secondImport} from './backend-module-a.js';
import {DrawList} from '@ts-stg/thlib';
function check(condition,message){if(!condition)throw new Error(message);}
check(['quickjs','v8'].includes(tsstg.backend),'Unexpected backend');
for(const name of ['process','require','Buffer','window','document','fetch','setTimeout'])
  check(typeof globalThis[name]==='undefined',`Unexpected ambient API ${name}`);
check(Object.isFrozen(tsstg),'Host API must be immutable');
check(cycleValue===secondImport&&cycleValue()===42,'ESM identity/cycle mismatch');
advanceAlpha();check(alpha===42&&cycleValue()===43,'ESM live binding mismatch');
const awaited=await Promise.resolve(17);
await Promise.reject(new Error('Handled rejection')).catch(()=>{});
check(awaited===17,'Top-level await mismatch');
const bytes=new Uint8Array(12);bytes.set([251,12,73,255],4);
const view=bytes.subarray(4,8),id=tsstg.createTexture(1,1,view);
check(Array.from(tsstg.readTexturePixels(id).pixels).join(',')===Array.from(view).join(','),'Typed array byte offset mismatch');
const checks=[];
for(const [name,action] of [
  ['read traversal',()=>tsstg.readText('../outside.txt')],
  ['write traversal',()=>tsstg.writeText('nested/../../escape.txt','forbidden')],
  ['resource handle',()=>tsstg.playSound(987654)],
  ['texture size',()=>tsstg.createTexture(1,1,new Uint8Array(3))],
]){let rejected=false;try{action();}catch{rejected=true;}check(rejected,`Host exception missing: ${name}`);checks.push(name);}
tsstg.unloadTexture(id);let expired=false;
try{tsstg.readTexturePixels(id);}catch{expired=true;}check(expired,'Expired resource accepted');
let frame=0,microtasks=0;
globalThis.__tsstg_game={
  update(mask){check(mask===16,'Input ABI mismatch');check(microtasks===frame,'Update microtasks were not drained');frame++;Promise.resolve().then(()=>microtasks++);},
  render(){check(microtasks===frame,'Render ran before update microtasks');return new DrawList().clear(0x101020ff).circle(20,20,3,0xffffffff).commands;},
  snapshot(){check(frame===8&&microtasks===8,'Frame/microtask count mismatch');return{backend:tsstg.backend,frame,microtasks,awaited,cycle:cycleValue(),hostExceptionChecks:checks};},
};
