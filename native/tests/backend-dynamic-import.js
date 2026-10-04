const mod=await import('./backend-module-a.js');
if(mod.cycleValue()!==42)throw new Error('Dynamic module/cycle mismatch');
const again=await import('./backend-module-a.js');
if(mod!==again)throw new Error('Dynamic module cache identity mismatch');
const {moduleUrl}=await import('./backend-module-b.js');
if(typeof moduleUrl!=='string'||!moduleUrl.replaceAll('\\','/').endsWith('/backend-module-b.js'))throw new Error('Imported module import.meta.url mismatch');
const rejected=[];
for(const name of ['./backend-no-such-module.js','../../../../outside-project.js']){
  let failed=false;try{await import(name);}catch{failed=true;}
  if(!failed)throw new Error('Unsafe/missing dynamic module accepted');rejected.push(name);
}
globalThis.__tsstg_game={update(){},render(){return[];},snapshot(){return{dynamicImport:true,cacheIdentity:true,importMeta:true,rejected};}};
