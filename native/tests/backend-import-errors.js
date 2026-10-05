function check(value,message){if(!value)throw new Error(message);}
const diagnostics=[];
for(const specifier of ['./backend-import-broken.js','./backend-import-nested.js']){
  let reason;
  try{await import(specifier);}catch(error){reason=error;}
  check(reason instanceof SyntaxError,`Import must preserve SyntaxError: ${specifier}`);
  check(typeof reason.message==='string'&&reason.message.length>0,'Original syntax message missing');
  check(/backend-import-broken\.js:3(?::22)?\b/.test(reason.stack),`Missing failing module line: ${reason.stack}`);
  if(tsstg.backend==='v8'){
    check(reason.fileName.replaceAll('\\','/').endsWith('/backend-import-broken.js'),'Wrong failing module metadata');
    check(reason.lineNumber===3&&reason.columnNumber===22,`Source locations must be one based: ${reason.lineNumber}:${reason.columnNumber}`);
    check(reason.stack.includes(`${reason.fileName}:3:22`),'Stack must include the exact compile location');
  }
  diagnostics.push({specifier,name:reason.name,message:reason.message});
}
if(tsstg.backend==='v8'){
  globalThis.__importFailureIdentityError=new TypeError('Keep the original thrown object');
  let thrown;
  try{await import('./backend-import-thrown.js');}catch(error){thrown=error;}
  check(thrown===globalThis.__importFailureIdentityError,'Dynamic import changed the thrown error identity');
  delete globalThis.__importFailureIdentityError;
}
const healthy=await import('./backend-module-a.js');
check(healthy.cycleValue()===42,'Caught failed imports must not poison later imports');
let frames=0;
globalThis.__tsstg_game={
  update(){frames++;},render(){return[];},
  snapshot(){check(frames===2,'Engine did not continue after caught import errors');return{diagnostics,errorIdentity:tsstg.backend==='v8',frames};},
};
