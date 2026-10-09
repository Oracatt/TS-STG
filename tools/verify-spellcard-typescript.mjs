import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createTypeScriptSpellSource} from './spellcard-editor/typescript-source.js';
import {compileSpellSource,mapSpellSourceError} from './spellcard-editor/source-compiler.mjs';

const root=path.resolve(import.meta.dirname,'..');
const folder=path.join(root,'build/typescript-spell-check');
await mkdir(folder,{recursive:true});
const compiled=compileSpellSource(createTypeScriptSpellSource(),'typed.spell.ts');
await writeFile(path.join(folder,'typed.js'),compiled.code);
await writeFile(path.join(folder,'main.js'),`import {createSpellCardPreview} from '../../tools/spellcard-editor/native-preview.js';
import {spellCard,createSpell} from './typed.js';
const preview=createSpellCardPreview(tsstg,spellCard,{silent:true,createSpell,invincible:true});
globalThis.__tsstg_game={update(){preview.update(0);},render(){return [];},snapshot(){return {
  spell:preview.runner.snapshot(),bullets:preview.game.bullets.bullets.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,type:b.type,color:b.color,state:b.state})),
};},destroy(){preview.destroy();}};
`);
const failing=`interface Point {
  x: number;
  y: number;
}

export function explode(): never {
  throw new Error('TypeScript native source map fixture');
}
`;
const failure=compileSpellSource(failing,'original.spell.mts');
const failurePath=path.join(folder,'failure.js');
await writeFile(failurePath,failure.code);
await writeFile(path.join(folder,'error-main.js'),`import {explode} from './failure.js';
let error=null;
globalThis.__tsstg_game={update(){try{explode();}catch(failure){error=String(failure)+'\\n'+failure.stack;}},render(){return [];},snapshot(){return {error};}};
`);

async function run(entry,backend,frames){
  const output=path.join(folder,`${backend}-${entry}.json`);
  const child=spawn(path.join(root,'build/Release/ts-stg.exe'),[path.join(folder,`${entry}.js`),'--root',root,'--backend',backend,'--headless','--frames',String(frames),'--snapshot',output],
    {cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';
  child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
  const timeout=setTimeout(()=>child.kill(),30000);
  try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Native ${backend} fixture failed (${code}): ${log}`)));});}
  finally{clearTimeout(timeout);}
  return JSON.parse(await readFile(output,'utf8'));
}

const results=[];
for(const backend of ['quickjs','v8']){
  const result=await run('main',backend,96);
  assert.equal(result.spell.frame,96);
  assert.equal(result.bullets.length,48);
  results.push(result);
  const {error}=await run('error-main',backend,1);
  const mapped=mapSpellSourceError(error,failurePath.replaceAll('\\','/'),failure);
  assert.match(mapped,/original\.spell\.mts:7:\d+/);
  console.log(`${backend}: TypeScript spell emits 48 native bullets; runtime stack maps to author line 7`);
}
assert.deepEqual(results[0],results[1],'TypeScript-authored spell must produce the same native simulation in both backends');
console.log('TypeScript authoring native verification passed.');
