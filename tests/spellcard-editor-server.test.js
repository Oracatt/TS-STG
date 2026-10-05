import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {createSpellCardEditorServer} from '../tools/spellcard-editor/server.mjs';
import {validateTouhouSpellCard} from '../packages/thlib/src/touhou/spellcard.js';

const card=()=>({format:'ts-stg-spellcard',version:1,id:'test-card',name:'Test card',duration:1800,hp:3000,seed:1,boss:{x:0,y:96},events:[]});
async function fixture(t,{launcher=null,binary=true}={}){
  const root=await mkdtemp(path.join(os.tmpdir(),'ts-stg-editor-'));
  const files={'tools/spellcard-editor/index.html':'<!doctype html><title>Editor</title>',
    'tools/spellcard-editor/app.js':'export const editor = true;',
    'packages/thlib/src/index.js':'export const shared = true;',
    'packages/thlib/assets/test.json':'{"shared":true}',
    'packages/thlib/assets/test.png':Buffer.from([137,80,78,71]),'private/secret.txt':'PRIVATE',
    ...(binary?{'build/Release/ts-stg.exe':'fake executable, never launched'}:{})};
  for(const [file,contents]of Object.entries(files)){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),contents);}
  const launches=[];
  const previewLauncher=launcher??((binary,args,options)=>{
    const child=new EventEmitter();child.killed=false;child.kill=()=>{child.killed=true;child.emit('exit',0);return true;};
    launches.push({binary,args,options,child});queueMicrotask(()=>child.emit('spawn'));return child;
  });
  const server=createSpellCardEditorServer({root,previewLauncher});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port,origin=`http://127.0.0.1:${port}`;
  t.after(async()=>{if(server.listening)await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
  const request=(url,{method='GET',headers={},body,chunked=false}={})=>new Promise((resolve,reject)=>{
    const outgoing=http.request({host:'127.0.0.1',port,path:url,method,headers:{...headers}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString('utf8')}));
    });
    outgoing.on('error',reject);
    if(body!==undefined){if(chunked){outgoing.write(body.slice(0,body.length/2));outgoing.write(body.slice(body.length/2));outgoing.end();}else outgoing.end(body);}else outgoing.end();
  });
  const preview=(document=card(),options={})=>request('/api/preview',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...options.headers},body:JSON.stringify(document),...options});
  return{root,server,request,preview,origin,port,launches};
}

test('editor serves only its static allowlist with browser MIME types',async t=>{
  const f=await fixture(t);
  for(const [url,type,contents]of [['/','text/html','<title>Editor</title>'],['/editor/app.js','text/javascript','editor = true'],
    ['/thlib/index.js','text/javascript','shared = true'],['/assets/test.json','application/json','"shared":true'],['/assets/test.png','image/png','PNG']]){
    const response=await f.request(url);assert.equal(response.status,200);assert.ok(response.headers['content-type'].startsWith(type));assert.ok(response.body.includes(contents));
    assert.equal(response.headers['x-content-type-options'],'nosniff');
  }
  for(const url of ['/private/secret.txt','/package.json','/native/src/host.cpp','/games/rushboss/main.js','/build/Release/ts-stg.exe','/thlib/'])
    assert.equal((await f.request(url)).status,404,url);
  const head=await f.request('/editor/app.js',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body,'');
  assert.equal((await f.request('/editor/app.js',{method:'POST'})).status,405);
});

test('editor rejects encoded traversal, backslashes and symlink escapes',async t=>{
  const f=await fixture(t);
  for(const url of ['/editor/../../private/secret.txt','/editor/%2e%2e/%2e%2e/private/secret.txt',
    '/editor/%2e%2e%2f%2e%2e%2fprivate/secret.txt','/editor/%5c..%5c..%5cprivate%5csecret.txt','/editor/..\\..\\private\\secret.txt',
    '/editor/%00app.js'])assert.equal((await f.request(url)).status,403,url);
  assert.equal((await f.request('/editor/%GG')).status,400);
  assert.equal((await f.request('/editor/%252e%252e/private/secret.txt')).status,404,'double encoding is never decoded twice');
  await symlink(path.join(f.root,'private'),path.join(f.root,'tools/spellcard-editor/leak'),'junction');
  assert.equal((await f.request('/editor/leak/secret.txt')).status,403);
});

test('editor requires exact local Host and rejects cross-origin API and static requests',async t=>{
  const f=await fixture(t);
  for(const url of ['/','/api/capabilities']){
    assert.equal((await f.request(url,{headers:{Host:`attacker.example:${f.port}`}})).status,403);
    assert.equal((await f.request(url,{headers:{Origin:'https://attacker.example'}})).status,403);
    assert.equal((await f.request(url,{headers:{Origin:'null'}})).status,403);
    assert.equal((await f.request(url,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  }
  assert.equal((await f.preview(card(),{headers:{'Content-Type':'application/json',Origin:'http://localhost:1234'}})).status,403);
  assert.equal(f.launches.length,0);
  assert.throws(()=>createSpellCardEditorServer({root:f.root,host:'0.0.0.0'}),/loopback/);
});

test('native capability depends on an existing engine binary and unavailable preview is explicit',async t=>{
  const f=await fixture(t,{binary:false});
  assert.deepEqual(JSON.parse((await f.request('/api/capabilities')).body),{nativePreview:false});
  assert.equal((await f.preview()).status,503);assert.equal(f.launches.length,0);
  await mkdir(path.join(f.root,'build/Release'),{recursive:true});await writeFile(path.join(f.root,'build/Release/ts-stg.exe'),'fake');
  assert.deepEqual(JSON.parse((await f.request('/api/capabilities')).body),{nativePreview:true});
});

test('preview accepts only bounded validated JSON and never launches malformed documents',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/preview',{method:'POST',body:'{}',headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await f.request('/api/preview',{method:'POST',body:'{',headers:{'Content-Type':'application/json'}})).status,400);
  for(const document of [{}, {...card(),duration:-1},{...card(),events:[{id:'code',type:'script',frame:0,code:'process.exit()'}]}])
    assert.equal((await f.preview(document)).status,400);
  const oversized=' '.repeat(1024*1024+1);
  assert.equal((await f.request('/api/preview',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(oversized)},body:oversized})).status,413);
  assert.equal((await f.request('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:oversized,chunked:true})).status,413);
  assert.equal(f.launches.length,0);
});

test('preview writes data and a fixed entry, launches without a shell, and prevents duplicate previews',async t=>{
  const f=await fixture(t),document=card();document.name="';globalThis.USER_CODE=true;//";
  const response=await f.preview(document);assert.equal(response.status,202);assert.deepEqual(JSON.parse(response.body),{started:true});
  assert.equal(f.launches.length,1);const launch=f.launches[0];
  assert.equal(launch.binary,path.join(f.root,'build/Release/ts-stg.exe'));
  assert.match(launch.args[0],/^build\/spellcard-editor\/preview-[0-9a-f-]+\.js$/);
  assert.deepEqual(launch.args.slice(1),['--root',f.root]);
  assert.deepEqual(launch.options,{cwd:f.root,shell:false,windowsHide:true,stdio:'ignore'});
  const entry=await readFile(path.join(f.root,launch.args[0]),'utf8'),jsonPath=launch.args[0].replace(/\.js$/,'.json');
  assert.equal(entry,"import {createSpellCardPreview} from '../../tools/spellcard-editor/native-preview.js';\n"+
    `globalThis.__tsstg_game=createSpellCardPreview(tsstg,JSON.parse(tsstg.readText('${jsonPath}')));\n`);
  assert.ok(!entry.includes('USER_CODE'));assert.deepEqual(JSON.parse(await readFile(path.join(f.root,jsonPath),'utf8')),validateTouhouSpellCard(document));
  assert.equal((await f.preview()).status,409);assert.equal(f.launches.length,1);
  launch.child.emit('exit',0);assert.equal((await f.preview()).status,202);assert.equal(f.launches.length,2);
  await new Promise(resolve=>f.server.close(resolve));
  assert.equal(launch.child.killed,false,'an exited preview is no longer owned');
  assert.equal(f.launches[1].child.killed,true,'server close ends only its currently owned preview');
  assert.equal((await readdir(path.join(f.root,'build/spellcard-editor'))).length,4);
});

test('failed native spawn releases the busy flag for another attempt',async t=>{
  let attempts=0;
  const f=await fixture(t,{launcher:()=>{
    attempts++;
    const child=new EventEmitter();child.kill=()=>true;
    queueMicrotask(()=>child.emit('error',new Error('spawn failed')));return child;
  }});
  assert.equal((await f.preview()).status,500);assert.equal((await f.preview()).status,500);assert.equal(attempts,2);
});

test('simultaneous preview requests create exactly one owned process',async t=>{
  const f=await fixture(t);
  const responses=await Promise.all([f.preview(),f.preview(),f.preview()]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[202,409,409]);
  assert.equal(f.launches.length,1);
});

test('preview refuses a generated-output directory symlink that leaves the project',async t=>{
  const f=await fixture(t),outside=await mkdtemp(path.join(os.tmpdir(),'ts-stg-editor-outside-'));
  t.after(()=>rm(outside,{recursive:true,force:true}));
  await symlink(outside,path.join(f.root,'build/spellcard-editor'),'junction');
  assert.equal((await f.preview()).status,403);assert.equal(f.launches.length,0);
  assert.deepEqual(await readdir(outside),[],'no document or launcher is written outside the project');
});
