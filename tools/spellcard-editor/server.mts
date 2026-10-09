import http from 'node:http';
import path from 'node:path';
import {readFile,realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.map':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml',
  '.woff':'font/woff','.woff2':'font/woff2'};
const publicFiles=new Map([
  ['/','index.html'],['/editor/index.html','index.html'],['/editor/editor.js','editor.js'],
  ['/editor/styles.css','styles.css'],['/editor/source.js','source.js'],['/editor/metadata.js','metadata.js'],
  ['/editor/typescript-source.js','typescript-source.js'],
]);
const inside=(base:string,file:string)=>{const relative=path.relative(base,file);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));};
const problem=(status:number,message:string)=>Object.assign(new Error(message),{status});

/** Serve the desktop renderer only. Files, scripts and native process control
 * use the desktop IPC boundary; no browser preview or writable HTTP API exists. */
export function createSpellCardEditorServer({root=workspace,host='127.0.0.1',port=0}={}){
  if(!['127.0.0.1','localhost','::1'].includes(host))throw new TypeError('Editor host must be a loopback address');
  if(!Number.isInteger(port)||port<0||port>65535)throw new RangeError('Editor port must be between 0 and 65535');
  root=path.resolve(root);
  const server=http.createServer(async(request,response)=>{
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('Cross-Origin-Resource-Policy','same-origin');
    try{
      const address=server.address(),authority=`${host==='::1'?'[::1]':host}:${(typeof address==='object'?address?.port:undefined)??port}`;
      const hostCount=request.rawHeaders.filter((_,index)=>index%2===0&&request.rawHeaders[index].toLowerCase()==='host').length;
      if(hostCount!==1||request.headers.host?.toLowerCase()!==authority.toLowerCase())throw problem(403,'Host is not this local editor');
      if((request.headers.origin!==undefined&&request.headers.origin!==`http://${authority}`)||request.headers['sec-fetch-site']==='cross-site')
        throw problem(403,'Cross-origin requests are not allowed');
      if(request.method!=='GET'&&request.method!=='HEAD'){request.resume();throw problem(405,'Method not allowed');}
      const rawPath=request.url?.split('?')[0]??'';
      let urlPath;
      try{urlPath=decodeURIComponent(rawPath);}catch{throw problem(400,'Invalid URL encoding');}
      if(!urlPath.startsWith('/')||urlPath.includes('\\')||urlPath.includes('\0')||urlPath.split('/').some(part=>part==='.'||part==='..'))
        throw problem(403,'Invalid editor path');
      const bundle=urlPath.startsWith('/editor/dist/');
      const relative=bundle?urlPath.slice('/editor/dist/'.length):publicFiles.get(urlPath);
      if(!relative)throw problem(404,'Not found');
      const base=path.resolve(root,bundle?'build/spellcard-editor-ui':'tools/spellcard-editor');
      const target=path.resolve(base,relative);
      if(!inside(base,target))throw problem(403,'Invalid editor path');
      let realRoot,realBase,realTarget;
      try{[realRoot,realBase,realTarget]=await Promise.all([realpath(root),realpath(base),realpath(target)]);}catch{throw problem(404,'Not found');}
      if(!inside(realRoot,realBase)||!inside(realBase,realTarget))throw problem(403,'Editor path escapes its public directory');
      if(!(await stat(realTarget)).isFile())throw problem(404,'Not found');
      const data=await readFile(realTarget);
      response.writeHead(200,{'Content-Type':mime[path.extname(realTarget).toLowerCase()]??'application/octet-stream','Content-Length':data.length});
      response.end(request.method==='HEAD'?undefined:data);
    }catch(error){
      if(!response.headersSent&&!response.destroyed){
        const failure=error as Error&{status?:number};
        response.writeHead(failure.status??500,{'Content-Type':mime['.json']});
        response.end(JSON.stringify({error:failure.status?failure.message:'Editor request failed'}));
      }
    }
  });
  return server;
}
