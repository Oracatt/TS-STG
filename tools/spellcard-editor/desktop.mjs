import {app,BrowserWindow,dialog,ipcMain,Menu,screen} from 'electron';
import net from 'node:net';
import {readFile,writeFile,rename,mkdir,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {FrameStreamDecoder} from './frame-stream.mjs';
import {createSpellCardEditorServer} from './server.mjs';
import {createSpellMetadata} from './metadata.js';
import {validateSpellSource} from './source.js';

const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../..');
const session=`spellcard-editor/${randomUUID()}`,folder=`build/${session}`;
const files={control:`${folder}/control.json`,bounds:`${folder}/bounds.json`,status:`${session}/status.json`};
const filters=[{name:'JavaScript Spell Card',extensions:['js','mjs']}];
const selfTest=process.argv.includes('--self-test');
let win,server,child=null,url='',savedPath=null,lastStatus={},nativeError=null,closing=false,commandId=0;
let frameServer,frameSocket,frameId=0,framePending=0;
const pipeName=`\\\\.\\pipe\\ts-stg-frames-${randomUUID()}`;
let bounds={x:0,y:0,width:1,height:1,visible:false};
const document=createSpellMetadata();
let state={revision:0,documentRevision:0,document,commands:[]},io=Promise.resolve();
const serialize=task=>{const next=io.then(task);io=next.catch(()=>{});return next;};
function sourceText(value){
  const source=validateSpellSource(value);
  if(Buffer.byteLength(source,'utf8')>1024*1024)throw Error('JS 源码不能超过 1 MiB。');
  return source;
}
async function atomic(file,text){
  const tmp=`${file}.tmp`;await writeFile(tmp,text);
  // A Windows ifstream may briefly hold the destination without delete sharing.
  // Keep the complete old document visible until the atomic replacement succeeds.
  for(let attempt=0;;attempt++)try{await rename(tmp,file);return;}catch(error){
    if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=12)throw error;
    await new Promise(resolve=>setTimeout(resolve,10+attempt*5));
  }
}
async function publish(){await atomic(path.join(root,files.control),JSON.stringify(state));}
async function readStatus(){
  try{lastStatus=JSON.parse(await readFile(path.join(root,'userdata',files.status),'utf8'));}catch{}
  return {...lastStatus,...(nativeError?{error:nativeError}:{}),running:!!child};
}
async function queue(command){
  const status=await readStatus();state.commands=state.commands.filter(item=>item.id>(status.commandId??0));
  if(state.commands.length>=256)throw Error('预览暂未响应，请稍后再试。');
  state.commands.push({...command,id:++commandId});state.revision++;await publish();
}
async function updateBounds(){
  if(!win||win.isDestroyed())return;
  const scale=screen.getDisplayMatching(win.getBounds()).scaleFactor;
  const physical=Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.round(bounds[key]*scale)]));
  physical.width=Math.max(1,physical.width);physical.height=Math.max(1,physical.height);
  physical.visible=bounds.visible&&!win.isMinimized()&&win.isVisible();
  await atomic(path.join(root,files.bounds),JSON.stringify(physical));
}
async function launch(){
  if(child||closing)return;
  if(process.platform!=='win32')throw Error('当前内嵌预览支持 Windows。符卡文档和 thlib 运行器可跨平台使用。');
  const binary=path.join(root,'build/Release/ts-stg.exe');
  try{await stat(binary);}catch{throw Error('请先运行 build.ps1 构建 TS-STG 引擎。');}
  await updateBounds();await publish();
  const entry=`${folder}/main.js`;
  await writeFile(path.join(root,entry),
    `import {createControlledPreview} from '../../../tools/spellcard-editor/controller.js';\n`+
    `globalThis.__tsstg_game=createControlledPreview(tsstg,${JSON.stringify(files)},{loadModule:path=>import(path)});\n`);
  lastStatus={};await writeFile(path.join(root,'userdata',files.status),'{}');
  frameSocket?.destroy();frameSocket=null;framePending=0;
  const owned=spawn(binary,[entry,'--root',root,'--frame-stream',pipeName],
    {cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child=owned;nativeError=null;let errors='';
  owned.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-4000);});
  owned.stdout.on('data',()=>{});
  owned.on('error',error=>{nativeError=error.message;if(child===owned)child=null;});
  owned.on('exit',code=>{if(child!==owned)return;child=null;if(!closing)nativeError=errors.trim()||`预览已结束（${code}）。点击重新预览可恢复。`;});
  await new Promise((resolve,reject)=>{owned.once('spawn',resolve);owned.once('error',reject);});
}
function handle(channel,callback){ipcMain.handle(channel,(event,...args)=>{
  if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==url)
    throw Error('Unknown editor sender');
  return serialize(()=>callback(...args));
});}
async function start(){
  await mkdir(path.join(root,folder),{recursive:true});await mkdir(path.join(root,'userdata',session),{recursive:true});
  server=createSpellCardEditorServer({root});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  url=`http://127.0.0.1:${server.address().port}/`;
  win=new BrowserWindow({title:'TS-STG · SpellCardEditor',width:1440,height:1000,minWidth:1100,minHeight:740,
    backgroundColor:'#111722',show:false,webPreferences:{preload:path.join(directory,'preload.cjs'),nodeIntegration:false,
      contextIsolation:true,sandbox:true,backgroundThrottling:false,...(selfTest?{partition:`test-${randomUUID()}`}:{})}});
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  frameServer=net.createServer(socket=>{
    if(frameSocket){socket.destroy();return;}frameSocket=socket;
    const decoder=new FrameStreamDecoder(frame=>{
      if(!win||win.isDestroyed()||framePending||!bounds.visible||win.isMinimized())return;
      framePending=++frameId;win.webContents.send('preview:frame',{...frame,id:framePending});
    });
    socket.on('data',chunk=>{try{decoder.push(chunk);}catch(error){nativeError=error.message;socket.destroy();}});
    socket.on('error',error=>{if(!closing)nativeError=error.message;});
    socket.on('close',()=>{if(frameSocket===socket)frameSocket=null;});
  });
  await new Promise((resolve,reject)=>{frameServer.once('error',reject);frameServer.listen(pipeName,resolve);});
  ipcMain.on('preview:frame-ack',(event,id)=>{
    if(event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&id===framePending)framePending=0;
  });
  handle('preview:update',async value=>{
    const source=sourceText(value?.source),revision=state.documentRevision+1;
    // Unique module URLs bypass the native ESM cache without evaluating any
    // authored JavaScript in Electron. The existing engine imports this file.
    const modulePath=`./spell-${revision}.js`;
    await writeFile(path.join(root,folder,modulePath),source,{flag:'wx'});
    state={...state,revision:state.revision+1,documentRevision:revision,modulePath,document,commands:[],input:0};
    await publish();await launch();return {updated:true,documentRevision:state.documentRevision};
  });
  handle('preview:bounds',async value=>{
    if(!value||['x','y','width','height'].some(key=>typeof value[key]!=='number'||!Number.isFinite(value[key])||Math.abs(value[key])>8192)||value.width<0||value.height<0)
      throw Error('Invalid preview bounds');
    bounds={x:value.x,y:value.y,width:value.width,height:value.height,visible:value.visible!==false&&value.width>0&&value.height>0};
    await updateBounds();return {updated:true};
  });
  handle('preview:control',async command=>{
    if(!command||!['pause','play','restart','step','seek'].includes(command.action))throw Error('Invalid preview command');
    if(command.action==='seek'&&(!Number.isInteger(command.frame)||command.frame<0||command.frame>36000))throw Error('Invalid preview frame');
    await launch();await queue({action:command.action,...(command.action==='seek'?{frame:command.frame}:{})});
    return {accepted:true,commandId,documentRevision:state.documentRevision};
  });
  handle('preview:status',readStatus);
  handle('preview:input',async mask=>{
    if(!Number.isInteger(mask)||mask<0||mask>1023)throw Error('Invalid input mask');
    if(state.input!==mask){state.input=mask;state.revision++;await publish();}return{accepted:true};
  });
  const draftDirectory=path.join(root,'userdata/spellcard-editor',selfTest?session.split('/')[1]:'');
  const draft=path.join(draftDirectory,'draft.spell.js');
  handle('document:load-draft',async()=>{
    try{return {source:sourceText(await readFile(draft,'utf8'))};}
    catch(error){if(error.code==='ENOENT')return{};throw error;}
  });
  handle('document:save-draft',async source=>{await atomic(draft,sourceText(source));return{saved:true};});
  handle('document:open',async()=>{
    const result=await dialog.showOpenDialog(win,{filters,properties:['openFile']});if(result.canceled)return{cancelled:true};
    const file=result.filePaths[0];
    if(!['.js','.mjs'].includes(path.extname(file).toLowerCase()))throw Error('只支持 JavaScript 文件（.js 或 .mjs）。');
    if((await stat(file)).size>1024*1024)throw Error('工程文件不能超过 1 MiB。');
    const source=sourceText(await readFile(file,'utf8'));
    savedPath=file;return{source,path:savedPath};
  });
  handle('document:save',async(source,options={})=>{
    const text=sourceText(source);let file=savedPath;
    if(!file||options.saveAs){const result=await dialog.showSaveDialog(win,{filters,defaultPath:file??'new.spell.js'});if(result.canceled)return{cancelled:true};file=result.filePath;}
    if(!['.js','.mjs'].includes(path.extname(file).toLowerCase()))throw Error('请保存为 JavaScript 文件（.js 或 .mjs）。');
    await atomic(file,text);savedPath=file;return{path:file};
  });
  win.once('ready-to-show',()=>{win.show();serialize(updateBounds).catch(()=>{});});
  for(const event of ['resize','move','restore','minimize','show'])win.on(event,()=>serialize(updateBounds).catch(()=>{}));
  let closeReady=false;
  win.on('close',event=>{
    if(closeReady||closing)return;event.preventDefault();
    io.finally(()=>{closeReady=true;if(!win.isDestroyed())win.close();});
  });
  win.on('closed',()=>{cleanup();app.quit();});
  await win.loadURL(url);
  if(selfTest){
    const {verifyDesktop}=await import('./verify-desktop.mjs');
    await verifyDesktop({win,root,files,readStatus,dialog,child:()=>child});
    cleanup();app.exit(0);
  }
}
function cleanup(){closing=true;child?.kill();frameSocket?.destroy();frameServer?.close();server?.close();}
app.setName('TS-STG SpellCardEditor');
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',cleanup);
app.whenReady().then(start).catch(async error=>{
  if(selfTest){await writeFile(path.join(root,'build/spellcard-editor-desktop-error.txt'),error.stack??String(error));cleanup();app.exit(1);}
  else{dialog.showErrorBox('SpellCardEditor',error.stack??String(error));app.quit();}
});
