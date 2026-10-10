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
import {compileSpellSource,isSpellSourceFile,mapSpellSourceError} from './source-compiler.mjs';
import type {CompiledSpellSource} from './source-compiler.mjs';
import {parseLaunchOptions} from './launch-options.mjs';
import type {ChildProcess} from 'node:child_process';
import type {PreviewBounds,PreviewCommand,PreviewControl,PreviewStatus,SourceDocument} from './protocol.js';

interface EditorRequests {
  'preview:update': [value:{source:unknown;fileName?:unknown}];
  'preview:bounds': [value:PreviewBounds];
  'preview:control': [command:PreviewCommand];
  'preview:status': [];
  'preview:input': [mask:number];
  'document:initial': [];
  'document:load-draft': [];
  'document:save-draft': [source:unknown];
  'document:open': [];
  'document:save': [source:unknown,options?:{saveAs?:boolean;fileName?:unknown}];
}

const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../..');
const session=`spellcard-editor/${randomUUID()}`,folder=`build/${session}`;
const files={control:`${folder}/control.json`,bounds:`${folder}/bounds.json`,status:`${session}/status.json`};
const filters=[{name:'TypeScript / JavaScript Spell Card',extensions:['ts','mts','js','mjs']}];
const selfTest=process.argv.includes('--self-test');
let win:BrowserWindow,server:ReturnType<typeof createSpellCardEditorServer>;
let child:ChildProcess|null=null,url='',savedPath:string|null=null,lastStatus:PreviewStatus={},nativeError:string|null=null,closing=false,commandId=0;
let initialDocument:SourceDocument|null=null;
const compiledSources=new Map<string,CompiledSpellSource>();
let frameServer:net.Server,frameSocket:net.Socket|null=null,frameId=0,framePending=0;
const pipeName=`\\\\.\\pipe\\ts-stg-frames-${randomUUID()}`;
let bounds={x:0,y:0,width:1,height:1,visible:false};
const document=createSpellMetadata();
let state:PreviewControl={revision:0,documentRevision:0,document,invincible:false,commands:[]},io:Promise<unknown>=Promise.resolve();
const serialize=<T,>(task:()=>T|Promise<T>):Promise<T>=>{const next=io.then(task);io=next.catch(()=>{});return next;};
function sourceText(value:unknown){
  const source=validateSpellSource(value);
  if(Buffer.byteLength(source,'utf8')>1024*1024)throw Error('源码不能超过 1 MiB。');
  return source;
}
async function readDocument(file:string){
  if(!isSpellSourceFile(file))throw Error('只支持 JavaScript 或 TypeScript 文件（.js、.mjs、.ts 或 .mts）。');
  const info=await stat(file);
  if(!info.isFile())throw Error('请选择 TypeScript 或 JavaScript 文件。');
  if(info.size>1024*1024)throw Error('工程文件不能超过 1 MiB。');
  return{source:sourceText(await readFile(file,'utf8')),path:file};
}
async function atomic(file:string,text:string){
  const tmp=`${file}.tmp`;await writeFile(tmp,text);
  // A Windows ifstream may briefly hold the destination without delete sharing.
  // Keep the complete old document visible until the atomic replacement succeeds.
  for(let attempt=0;;attempt++)try{await rename(tmp,file);return;}catch(error){
    if(!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code??'')||attempt>=12)throw error;
    await new Promise(resolve=>setTimeout(resolve,10+attempt*5));
  }
}
async function publish(){await atomic(path.join(root,files.control),JSON.stringify(state));}
async function readStatus(){
  let transportWarning=null;
  try{lastStatus=JSON.parse(await readFile(path.join(root,'userdata',files.status),'utf8'));}
  catch{if(child&&Number.isInteger(lastStatus.revision))transportWarning='预览状态暂时无法读取，正在重试。';}
  const status={...lastStatus,...(transportWarning?{transportWarning}:{}),...(nativeError?{error:nativeError}:{}),running:!!child};
  for(const [generatedFile,compiled] of compiledSources){
    if(status.error)status.error=mapSpellSourceError(status.error,generatedFile,compiled);
    if(status.errorStack)status.errorStack=mapSpellSourceError(status.errorStack,generatedFile,compiled);
  }
  return status;
}
async function queue(command:PreviewCommand){
  const status=await readStatus();state.commands=state.commands.filter(item=>item.id>(status.commandId??0));
  if(state.commands.length>=256)throw Error('预览暂未响应，请稍后再试。');
  state.commands.push({...command,id:++commandId});state.revision++;await publish();
}
async function updateBounds(){
  if(!win||win.isDestroyed())return;
  const scale=screen.getDisplayMatching(win.getBounds()).scaleFactor;
  const physical:Pick<PreviewBounds,'x'|'y'|'width'|'height'>&{visible?:boolean}={
    x:Math.round(bounds.x*scale),y:Math.round(bounds.y*scale),
    width:Math.round(bounds.width*scale),height:Math.round(bounds.height*scale),
  };
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
  await new Promise<void>((resolve,reject)=>{owned.once('spawn',resolve);owned.once('error',reject);});
}
function handle<K extends keyof EditorRequests>(channel:K,callback:(...args:EditorRequests[K])=>unknown){ipcMain.handle(channel,(event,...args:unknown[])=>{
  if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame!.url!==url)
    throw Error('Unknown editor sender');
  // Each named handler validates its untrusted IPC arguments before use.
  return serialize(()=>callback(...args as EditorRequests[K]));
});}
async function start(){
  const options=parseLaunchOptions(process.argv.slice(app.isPackaged?1:2),{
    cwd:process.env.TSSTG_EDITOR_CWD??process.env.INIT_CWD??process.cwd(),
  });
  if(options.filePath){initialDocument=await readDocument(options.filePath);savedPath=initialDocument.path!;}
  await mkdir(path.join(root,folder),{recursive:true});await mkdir(path.join(root,'userdata',session),{recursive:true});
  server=createSpellCardEditorServer({root});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  url=`http://127.0.0.1:${(server.address() as net.AddressInfo).port}/`;
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
    socket.on('data',chunk=>{try{decoder.push(chunk);}catch(error){nativeError=(error as Error).message;socket.destroy();}});
    socket.on('error',error=>{if(!closing)nativeError=error.message;});
    socket.on('close',()=>{if(frameSocket===socket)frameSocket=null;});
  });
  await new Promise<void>((resolve,reject)=>{frameServer.once('error',reject);frameServer.listen(pipeName,resolve);});
  ipcMain.on('preview:frame-ack',(event,id)=>{
    if(event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&id===framePending)framePending=0;
  });
  handle('preview:update',async value=>{
    const source=sourceText(value?.source),revision=state.documentRevision+1;
    if(value.fileName!==undefined&&typeof value.fileName!=='string')throw Error('Invalid source file name');
    const fileName=typeof value.fileName==='string'?path.basename(value.fileName):'untitled.spell.ts';
    const compiled=compileSpellSource(source,fileName);
    // Unique module URLs bypass the native ESM cache without evaluating any
    // authored JavaScript in Electron. The existing engine imports this file.
    const modulePath=`./spell-${revision}.js`;
    const generatedFile=path.join(root,folder,modulePath);
    await writeFile(generatedFile,compiled.code,{flag:'wx'});
    if(compiled.sourceMap)compiledSources.set(generatedFile.replaceAll('\\','/'),compiled);
    state={...state,revision:state.revision+1,documentRevision:revision,modulePath,document,commands:[],input:0};
    await publish();await launch();return {updated:true,documentRevision:state.documentRevision};
  });
  handle('preview:bounds',async value=>{
    if(!value||(['x','y','width','height'] as const).some(key=>typeof value[key]!=='number'||!Number.isFinite(value[key])||Math.abs(value[key])>8192)||value.width<0||value.height<0)
      throw Error('Invalid preview bounds');
    bounds={x:value.x,y:value.y,width:value.width,height:value.height,visible:value.visible!==false&&value.width>0&&value.height>0};
    await updateBounds();return {updated:true};
  });
  handle('preview:control',async command=>{
    if(!command||!['pause','play','restart','step','seek','invincible'].includes(command.action))throw Error('Invalid preview command');
    if(command.action==='seek'&&(!Number.isInteger(command.frame)||command.frame<0||command.frame>36000))throw Error('Invalid preview frame');
    if(command.action==='seek'&&command.frame>0&&!state.invincible)throw Error('真实试玩不支持跳帧，请开启无敌观察。');
    if(command.action==='invincible'){
      if(typeof command.value!=='boolean')throw Error('Invalid observation mode');
      state.invincible=command.value;state.input=0;
    }
    await launch();await queue({action:command.action,...(command.action==='seek'?{frame:command.frame}:command.action==='invincible'?{value:command.value}:{})} as PreviewCommand);
    return {accepted:true,commandId,documentRevision:state.documentRevision};
  });
  handle('preview:status',readStatus);
  handle('preview:input',async mask=>{
    if(!Number.isInteger(mask)||mask<0||mask>2047)throw Error('Invalid input mask');
    if(state.input!==mask){state.input=mask;state.revision++;await publish();}return{accepted:true};
  });
  const draftDirectory=path.join(root,'userdata/spellcard-editor',selfTest?session.split('/')[1]:'');
  const draft=path.join(draftDirectory,'draft.spell.js');
  async function loadDraft(){
    try{return {source:sourceText(await readFile(draft,'utf8'))};}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{};throw error;}
  }
  handle('document:initial',()=>initialDocument??loadDraft());
  handle('document:load-draft',loadDraft);
  handle('document:save-draft',async source=>{await atomic(draft,sourceText(source));return{saved:true};});
  handle('document:open',async()=>{
    const result=await dialog.showOpenDialog(win,{filters,properties:['openFile']});if(result.canceled)return{cancelled:true};
    const opened=await readDocument(result.filePaths[0]);
    savedPath=opened.path;return opened;
  });
  handle('document:save',async(source,options={})=>{
    const text=sourceText(source);let file=savedPath;
    if(options.fileName!==undefined&&typeof options.fileName!=='string')throw Error('Invalid source file name');
    if(!file||options.saveAs){const result=await dialog.showSaveDialog(win,{filters,defaultPath:typeof options.fileName==='string'?path.join(file?path.dirname(file):'',path.basename(options.fileName)):file??'new.spell.ts'});if(result.canceled)return{cancelled:true};file=result.filePath!;}
    if(!isSpellSourceFile(file))throw Error('请保存为 TypeScript 或 JavaScript 文件（.ts、.mts、.js 或 .mjs）。');
    await atomic(file,text);savedPath=file;return{path:file};
  });
  win.once('ready-to-show',()=>{win.show();serialize(updateBounds).catch(()=>{});});
  // All five notification overloads have the same argument-free callback.
  for(const event of ['resize','move','restore','minimize','show'] as const)win.on(event as 'resize',()=>serialize(updateBounds).catch(()=>{}));
  let closeReady=false;
  win.on('close',event=>{
    if(closeReady||closing)return;event.preventDefault();
    io.finally(()=>{closeReady=true;if(!win.isDestroyed())win.close();});
  });
  win.on('closed',()=>{cleanup();app.quit();});
  await win.loadURL(url);
  if(selfTest){
    const {verifyDesktop}=await import('./verify-desktop.mjs');
    await verifyDesktop({win,root,files,readStatus,dialog,child:()=>child,initialDocument});
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
