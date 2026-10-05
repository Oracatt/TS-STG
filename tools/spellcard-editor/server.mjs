import http from 'node:http';
import path from 'node:path';
import {readFile,realpath,stat,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateTouhouSpellCard} from '../../packages/thlib/src/touhou/spellcard.js';

const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const bodyLimit=1024*1024;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon',
  '.wav':'audio/wav','.ogg':'audio/ogg','.mp3':'audio/mpeg','.woff':'font/woff','.woff2':'font/woff2'};
const inside=(base,file)=>{const relative=path.relative(base,file);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));};
const problem=(status,message)=>Object.assign(new Error(message),{status});
const exists=async file=>{try{return(await stat(file)).isFile();}catch{return false;}};
async function previewDirectory(root){
  const realRoot=await realpath(root);
  let directory=root;
  for(const part of ['build','spellcard-editor']){
    directory=path.join(directory,part);
    try{
      if(!inside(realRoot,await realpath(directory)))throw problem(403,'Preview directory must stay inside the project');
    }catch(error){
      if(error.code!=='ENOENT')throw error;
      await mkdir(directory);
    }
    if(!inside(realRoot,await realpath(directory)))throw problem(403,'Preview directory must stay inside the project');
  }
  return directory;
}
function json(response,status,value){response.writeHead(status,{'Content-Type':mime['.json']});response.end(JSON.stringify(value));}
function readJson(request){
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')throw problem(415,'Expected application/json');
  if(Number(request.headers['content-length'])>bodyLimit){request.resume();throw problem(413,'Spell card document exceeds 1 MiB');}
  return new Promise((resolve,reject)=>{
    const chunks=[];let length=0,failed=false;
    request.on('data',chunk=>{
      if(failed)return;
      length+=chunk.length;
      if(length>bodyLimit){failed=true;chunks.length=0;reject(problem(413,'Spell card document exceeds 1 MiB'));return;}
      chunks.push(chunk);
    });
    request.on('error',()=>{if(!failed){failed=true;reject(problem(400,'Could not read request body'));}});
    request.on('end',()=>{
      if(failed)return;
      try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(problem(400,'Invalid JSON document'));}
    });
  });
}

/** Local authoring UI only. Preview documents are data, and the generated entry
 * always calls the repository's fixed preview runner, never user-authored JS. */
export function createSpellCardEditorServer({root=workspace,host='127.0.0.1',port=0,previewLauncher=spawn}={}){
  if(!['127.0.0.1','localhost','::1'].includes(host))throw new TypeError('Editor host must be a loopback address');
  if(!Number.isInteger(port)||port<0||port>65535)throw new RangeError('Editor port must be between 0 and 65535');
  if(typeof previewLauncher!=='function')throw new TypeError('Preview launcher must be a function');
  root=path.resolve(root);
  const binary=path.join(root,'build/Release/ts-stg.exe');
  let preview=null,closed=false;
  const server=http.createServer(async(request,response)=>{
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('Cross-Origin-Resource-Policy','same-origin');
    try{
      const address=server.address(),authority=`${host==='::1'?'[::1]':host}:${address?.port??port}`;
      const hostCount=request.rawHeaders.filter((_,index)=>index%2===0&&request.rawHeaders[index].toLowerCase()==='host').length;
      if(hostCount!==1||request.headers.host?.toLowerCase()!==authority.toLowerCase())throw problem(403,'Host is not this local editor');
      if((request.headers.origin!==undefined&&request.headers.origin!==`http://${authority}`)||request.headers['sec-fetch-site']==='cross-site')
        throw problem(403,'Cross-origin requests are not allowed');
      const rawPath=request.url?.split('?')[0]??'';
      let urlPath;
      try{urlPath=decodeURIComponent(rawPath);}catch{throw problem(400,'Invalid URL encoding');}
      if(!urlPath.startsWith('/')||urlPath.includes('\\')||urlPath.includes('\0')||urlPath.split('/').some(part=>part==='.'||part==='..'))
        throw problem(403,'Invalid editor path');
      if(urlPath==='/api/capabilities'){
        if(request.method!=='GET')throw problem(405,'Method not allowed');
        json(response,200,{nativePreview:await exists(binary)});return;
      }
      if(urlPath==='/api/preview'){
        if(request.method!=='POST')throw problem(405,'Method not allowed');
        const input=await readJson(request);let document;
        try{document=validateTouhouSpellCard(input);}catch(error){throw problem(400,error.message);}
        if(preview)throw problem(409,'A native preview is already running');
        if(!await exists(binary))throw problem(503,'Build the native engine before starting a preview');
        // Claim ownership before any file I/O. Concurrent requests cannot both
        // launch, including while the first request is preparing its document.
        if(preview||closed)throw problem(409,'A native preview is already running or the editor is closing');
        const owned={child:null};preview=owned;
        const release=()=>{if(preview===owned)preview=null;};
        try{
          const name=`preview-${randomUUID()}`;
          await previewDirectory(root);
          const jsonPath=`build/spellcard-editor/${name}.json`,entryPath=`build/spellcard-editor/${name}.js`;
          await writeFile(path.join(root,jsonPath),JSON.stringify(document,null,2)+'\n',{flag:'wx'});
          const entry="import {createSpellCardPreview} from '../../tools/spellcard-editor/native-preview.js';\n"+
            `globalThis.__tsstg_game=createSpellCardPreview(tsstg,JSON.parse(tsstg.readText('${jsonPath}')));\n`;
          await writeFile(path.join(root,entryPath),entry,{flag:'wx'});
          if(closed)throw problem(503,'Editor is closing');
          const child=previewLauncher(binary,[entryPath,'--root',root],{cwd:root,shell:false,windowsHide:true,stdio:'ignore'});
          owned.child=child;
          if(!child||typeof child.once!=='function')throw new TypeError('Preview launcher did not return a child process');
          child.once('exit',release);
          child.on('error',release);
          await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
          json(response,202,{started:true});
        }catch(error){release();throw error;}
        return;
      }
      if(request.method!=='GET'&&request.method!=='HEAD')throw problem(405,'Method not allowed');
      const routes=[['/editor/','tools/spellcard-editor'],['/thlib/','packages/thlib/src'],['/assets/','packages/thlib/assets']];
      const route=urlPath==='/'?['/','tools/spellcard-editor']:routes.find(([prefix])=>urlPath.startsWith(prefix));
      if(!route)throw problem(404,'Not found');
      const base=path.resolve(root,route[1]),relative=urlPath==='/'?'index.html':urlPath.slice(route[0].length),target=path.resolve(base,relative);
      if(!inside(base,target))throw problem(403,'Invalid editor path');
      let realRoot,realBase,realTarget;
      try{[realRoot,realBase,realTarget]=await Promise.all([realpath(root),realpath(base),realpath(target)]);}catch{throw problem(404,'Not found');}
      if(!inside(realRoot,realBase)||!inside(realBase,realTarget))throw problem(403,'Editor path escapes its public directory');
      if(!(await stat(realTarget)).isFile())throw problem(404,'Not found');
      const data=await readFile(realTarget);
      response.writeHead(200,{'Content-Type':mime[path.extname(realTarget).toLowerCase()]??'application/octet-stream','Content-Length':data.length});
      response.end(request.method==='HEAD'?undefined:data);
    }catch(error){
      if(!response.headersSent&&!response.destroyed)json(response,error.status??500,{error:error.status?error.message:'Native preview or editor request failed'});
    }
  });
  server.on('close',()=>{closed=true;preview?.child?.kill();preview=null;});
  return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let port=43120;
  for(let i=0;i<args.length;i++){
    if(args[i]!=='--port'||args[i+1]===undefined)throw new Error('Usage: node tools/spellcard-editor/server.mjs [--port 43120]');
    port=Number(args[++i]);
  }
  const server=createSpellCardEditorServer({port});
  server.on('error',error=>{console.error(`SpellCardEditor: ${error.message}`);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`SpellCardEditor: http://127.0.0.1:${server.address().port}/`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}
