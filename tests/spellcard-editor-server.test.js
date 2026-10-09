import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,mkdir,writeFile,rm,symlink,readdir} from 'node:fs/promises';
import {createSpellCardEditorServer} from '../tools/spellcard-editor/server.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'ts-stg-editor-'));
  const files={
    'tools/spellcard-editor/index.html':'<!doctype html><title>Editor</title>',
    'tools/spellcard-editor/editor.js':'export const editor = true;',
    'tools/spellcard-editor/source.js':'export const template = true;',
    'tools/spellcard-editor/metadata.js':'export const metadata = true;',
    'tools/spellcard-editor/styles.css':'body { margin: 0 }',
    'tools/spellcard-editor/desktop.mjs':'PRIVATE DESKTOP',
    'tools/spellcard-editor/preload.cjs':'PRIVATE PRELOAD',
    'tools/spellcard-editor/node_modules/private.js':'PRIVATE DEPENDENCY',
    'build/spellcard-editor-ui/code-editor.bundle.js':'export const codeMirror = true;',
    'build/spellcard-editor/control.json':'PRIVATE CONTROL',
    'packages/thlib/dist/index.js':'PRIVATE LIBRARY',
    'packages/thlib/assets/test.png':'PRIVATE ASSET','private/secret.txt':'PRIVATE',
  };
  for(const [file,contents]of Object.entries(files)){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),contents);}
  const server=createSpellCardEditorServer({root});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port,origin=`http://127.0.0.1:${port}`;
  t.after(async()=>{if(server.listening)await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
  const request=(url,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
    const outgoing=http.request({host:'127.0.0.1',port,path:url,method,headers:{...(body===undefined?{}:{'Content-Length':Buffer.byteLength(body)}),...headers}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString('utf8')}));
    });
    outgoing.on('error',reject);outgoing.end(body);
  });
  return{root,server,request,origin,port};
}

test('desktop renderer serves only exact UI files and its generated code editor bundle',async t=>{
  const f=await fixture(t);
  for(const [url,type,contents]of [['/','text/html','<title>Editor</title>'],['/editor/editor.js','text/javascript','editor = true'],
    ['/editor/source.js','text/javascript','template = true'],['/editor/metadata.js','text/javascript','metadata = true'],['/editor/styles.css','text/css','margin: 0'],
    ['/editor/dist/code-editor.bundle.js','text/javascript','codeMirror = true']]){
    const response=await f.request(url);assert.equal(response.status,200);assert.ok(response.headers['content-type'].startsWith(type));assert.ok(response.body.includes(contents));
    assert.equal(response.headers['x-content-type-options'],'nosniff');assert.equal(response.headers['cross-origin-resource-policy'],'same-origin');
  }
  for(const url of ['/private/secret.txt','/package.json','/native/src/host.cpp','/games/rushboss/main.js',
    '/build/spellcard-editor/control.json','/thlib/index.js','/assets/test.png','/editor/desktop.mjs',
    '/editor/preload.cjs','/editor/node_modules/private.js','/editor/server.mjs','/editor/dist/'])
    assert.equal((await f.request(url)).status,404,url);
  const head=await f.request('/editor/editor.js',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body,'');
  assert.equal((await f.request('/editor/editor.js?cache=1')).status,200);
});

test('static service has no browser preview API or HTTP mutation endpoints',async t=>{
  const f=await fixture(t);
  const before=await readdir(path.join(f.root,'build/spellcard-editor'));
  assert.equal((await f.request('/api/capabilities')).status,404);
  assert.equal((await f.request('/api/preview')).status,404);
  for(const method of ['POST','PUT','DELETE']){
    assert.equal((await f.request('/api/preview',{method,headers:{'Content-Type':'application/json'},body:'{}'})).status,405);
    assert.equal((await f.request('/editor/editor.js',{method,body:'overwrite'})).status,405);
  }
  assert.deepEqual(await readdir(path.join(f.root,'build/spellcard-editor')),before);
});

test('static service rejects encoded traversal, backslashes and bundle symlink escapes',async t=>{
  const f=await fixture(t);
  for(const url of ['/editor/dist/../../private/secret.txt','/editor/%2e%2e/%2e%2e/private/secret.txt',
    '/editor/dist/%2e%2e%2f%2e%2e%2fprivate/secret.txt','/editor/%5c..%5c..%5cprivate%5csecret.txt',
    '/editor/..\\..\\private\\secret.txt','/editor/%00editor.js'])assert.equal((await f.request(url)).status,403,url);
  assert.equal((await f.request('/editor/%GG')).status,400);
  assert.equal((await f.request('/editor/dist/%252e%252e/private/secret.txt')).status,404,'double encoding is never decoded twice');
  await symlink(path.join(f.root,'private'),path.join(f.root,'build/spellcard-editor-ui/leak'),'junction');
  assert.equal((await f.request('/editor/dist/leak/secret.txt')).status,403);
});

test('static service requires exact local Host and rejects cross-origin requests',async t=>{
  const f=await fixture(t);
  for(const url of ['/','/editor/dist/code-editor.bundle.js']){
    assert.equal((await f.request(url,{headers:{Host:`attacker.example:${f.port}`}})).status,403);
    assert.equal((await f.request(url,{headers:{Origin:'https://attacker.example'}})).status,403);
    assert.equal((await f.request(url,{headers:{Origin:'null'}})).status,403);
    assert.equal((await f.request(url,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    assert.equal((await f.request(url,{headers:{Origin:f.origin}})).status,200);
  }
  assert.throws(()=>createSpellCardEditorServer({root:f.root,host:'0.0.0.0'}),/loopback/);
  assert.throws(()=>createSpellCardEditorServer({root:f.root,port:-1}),/port/);
});

test('a public bundle directory cannot be redirected outside the workspace',async t=>{
  const f=await fixture(t),outside=await mkdtemp(path.join(os.tmpdir(),'ts-stg-editor-external-'));
  t.after(()=>rm(outside,{recursive:true,force:true}));
  await writeFile(path.join(outside,'private.js'),'PRIVATE');
  await rm(path.join(f.root,'build/spellcard-editor-ui'),{recursive:true});
  await symlink(outside,path.join(f.root,'build/spellcard-editor-ui'),'junction');
  assert.equal((await f.request('/editor/dist/private.js')).status,403);
});
