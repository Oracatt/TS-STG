import {createSpellSource,validateSpellSource} from './source.js';
import {createCodeEditor} from './dist/code-editor.bundle.js';

const $=id=>document.getElementById(id),clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const bridge=window.spellCardEditor?.desktop?window.spellCardEditor:null;
const STORAGE='ts-stg.spellcard-editor.source.v2';
let sourceText=createSpellSource(),savedSource=null,documentPath=null,editor=null,initializing=true;
let editRevision=0,submittedEdit=-1,documentRevision=0,commandId=0,reloadToken=0,controlToken=0,seekToken=0;
let frame=0,duration=1800,playing=false,playIntent=false,nativeLoading=false,sourcePending=true,invincible=false;
let reloadTimer=null,noticeTimer=null,boundsFrame=0,statusBusy=false,updating=0,controlsPending=0;
let operations=Promise.resolve(),errorLocation=null,errorText='',draftDirty=false,folded=false,lastStatus=null;
let transportWarning=null;
let restartPosition=false;
let documentEpoch=0;
let releaseInput=()=>{};

function notice(message,success=false){clearTimeout(noticeTimer);$('notice-text').textContent=message;$('notice').classList.toggle('success',success);$('notice').hidden=false;if(success)noticeTimer=setTimeout(()=>{$('notice').hidden=true;},4000);}
function enqueue(operation){const next=operations.catch(()=>{}).then(operation);operations=next.catch(()=>{});return next;}
function receipt(value){if(Number.isInteger(value?.documentRevision))documentRevision=value.documentRevision;if(Number.isInteger(value?.commandId))commandId=value.commandId;}
function setPlaying(value){playing=!!value;$('play').textContent=playing?'Ⅱ 暂停':'▶ 播放';}
function sourceState(text){$('source-preview-status').textContent=text;}
function renderPreviewState(){
  const status=lastStatus??{};
  if(status.running===false){$('engine-dot').classList.remove('ready');$('preview-state').textContent='引擎已停止 · 重新加载可恢复';}
  else if(errorText)$('preview-state').textContent='运行错误';
  else if(transportWarning)$('preview-state').textContent='预览通信暂时中断，正在重试…';
  else if(!status.error)$('preview-state').textContent=nativeLoading?'正在载入源码…':status.exited?'已返回编辑器 · 播放可重试':status.seeking?'正在按种子定位…':status.gamePaused?'游戏菜单':status.settling?'结算演出':status.completed?'播放完成':playing?(invincible?'无敌观察':'真实试玩'):'已暂停';
}
function setTransportWarning(value){transportWarning=value?String(value):null;renderPreviewState();}
function renderFile(){const name=documentPath?.split(/[\\/]/).at(-1)??'untitled.spell.js';$('file-name').textContent=name;$('file-name').title=documentPath??name;$('file-dirty').hidden=sourceText===savedSource;}
function renderTransport(){frame=clamp(frame,0,duration);$('current-frame').textContent=String(frame).padStart(5,'0');$('total-frames').textContent=String(duration).padStart(5,'0');$('time-readout').textContent=`${(frame/60).toFixed(2)} s`;
  $('seek').max=duration;$('seek').value=frame;$('seek').disabled=!bridge||!invincible;$('seek').title=invincible?'按固定种子重新模拟到指定帧':'真实试玩从头进行；开启无敌观察后可跳帧';const seconds=Math.floor(duration/60);$('duration-time').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function setError(value){
  const text=value?String(value.stack??value):'';if(text===errorText)return;errorText=text;
  $('source-error').textContent=text;$('source-errors').hidden=!text;$('engine-dot').classList.toggle('error',!!text);
  const location=text.match(/spell-\d+\.js:(\d+)(?::(\d+))?/)??text.match(/<anonymous>:(\d+)(?::(\d+))?/);
  errorLocation=location?{line:Number(location[1]),column:Number(location[2]??1)}:null;$('error-goto').hidden=!errorLocation;
  editor?.diagnostics(errorLocation?[{...errorLocation,message:text.split('\n')[0]}]:[]);
  if(text)sourceState('运行失败 · 源码与草稿已保留');renderPreviewState();
}
async function persist(){
  const source=sourceText;draftDirty=true;$('save-status').textContent='保存草稿…';
  try{if(bridge)await bridge.saveDraft(source);else localStorage.setItem(STORAGE,source);
    if(source===sourceText){draftDirty=false;$('save-status').textContent='草稿已保存';}}
  catch(error){$('save-status').textContent='草稿保存失败';notice(`无法保存草稿，请使用“另存为”：${error.message}`);}
}
function changed(source){
  sourceText=source;editRevision++;sourcePending=true;renderFile();
  // CodeMirror update listeners must not dispatch another update recursively.
  const revision=editRevision;queueMicrotask(()=>{if(revision!==editRevision)return;if(errorText)setError(null);else editor?.diagnostics([]);});
  if(initializing)return;persist();sourceState($('auto-preview').checked?'修改待运行…':'自动运行已关闭 · Ctrl+Enter 运行');
  clearTimeout(reloadTimer);reloadTimer=null;if($('auto-preview').checked)reloadTimer=setTimeout(()=>{reloadTimer=null;reload();},450);
}
function updateEditorStatus(value){$('source-position').textContent=`Ln ${value.line}, Col ${value.column}`;$('undo').disabled=!value.undo;$('redo').disabled=!value.redo;}
function applyStatus(status){
  if(!status)return;lastStatus=status;
  // Transport is independent of source revisions and command acknowledgments.
  // A stalled command must still show recovery status without replacing diagnostics.
  setTransportWarning(status.transportWarning);
  const requested=status.requestedDocumentRevision??status.documentRevision??0;
  // Failed imports cannot acknowledge queued controls, but old runtime errors
  // must not undo a later play/restart command in the same loaded revision.
  const failedImport=!!status.error&&requested>=documentRevision&&(status.documentRevision??0)<documentRevision;
  if((status.commandId??0)<commandId&&!failedImport)return;
  const matches=requested>=documentRevision&&submittedEdit===editRevision;
  if(matches&&status.error){setError(status.errorStack??status.error);nativeLoading=false;playIntent=false;setPlaying(false);}
  if((status.documentRevision??0)<documentRevision||(status.commandId??0)<commandId)return;
  nativeLoading=!!status.loading;
  invincible=status.invincible===true;$('invincible').checked=invincible;
  if(matches&&!nativeLoading&&!status.error&&!status.waitingForControl&&!transportWarning){setError(null);sourceState('当前源码已在原生引擎中运行');sourcePending=false;}
  if(status.document&&!nativeLoading&&!status.error&&!restartPosition){const document=status.document;
    if(Number.isInteger(document.duration)&&document.duration>0)duration=document.duration;
    $('card-name').textContent=String(document.name??'未命名符卡');$('runtime-metadata').textContent=`种子 ${document.seed??'—'} · HP ${document.hp??'—'} · 60 FPS`;
  }
  if(Number.isFinite(status.frame)&&!restartPosition)frame=Math.round(status.frame);
  if(!restartPosition&&!status.waitingForControl){setPlaying(!!status.playing&&!status.completed);if(!nativeLoading&&!status.seeking)playIntent=playing;}
  renderTransport();$('object-count').textContent=`${Number(status.bullets??0)} 弹 · ${Number(status.lasers??0)} 激光`;
  $('engine-dot').classList.toggle('ready',!!status.running&&!status.error);
  renderPreviewState();
}
async function reload(){
  clearTimeout(reloadTimer);reloadTimer=null;
  if(!bridge){sourceState('请在桌面工作台中运行 JS');return;}
  const source=sourceText,edit=editRevision,token=++reloadToken;
  const wantedFrame=restartPosition||!invincible?0:frame,wantedPlaying=restartPosition?false:playIntent||playing;
  restartPosition=false;nativeLoading=true;playIntent=wantedPlaying;sourceState('正在载入源码…');updating++;
  try{
    validateSpellSource(source);
    await enqueue(async()=>{
      if(token!==reloadToken)return;
      await sendBounds();receipt(await bridge.preview.update({source}));submittedEdit=edit;
      if(token!==reloadToken)return;
      receipt(await bridge.preview.control({action:'pause'}));
      if(wantedFrame>0&&invincible)receipt(await bridge.preview.control({action:'seek',frame:wantedFrame}));
      if(wantedPlaying)receipt(await bridge.preview.control({action:'play'}));
      if(token!==reloadToken)return;const status=await bridge.preview.status();if(token===reloadToken)applyStatus(status);
    });
  }catch(error){if(token===reloadToken&&edit===editRevision){nativeLoading=false;playIntent=false;setPlaying(false);setError(error);}}
  finally{updating--;}
}
async function control(command){
  if(!bridge)return;
  const token=++controlToken,documentToken=reloadToken,edit=editRevision,seek=command.action==='seek'?++seekToken:seekToken;
  if(command.action==='play')playIntent=true;else playIntent=false;
  setPlaying(command.action==='play');controlsPending++;
  try{await enqueue(async()=>{
    if(documentToken!==reloadToken||command.action==='seek'&&seek!==seekToken)return;
    receipt(await bridge.preview.control(command));
    if(documentToken!==reloadToken||token!==controlToken)return;const status=await bridge.preview.status();
    if(documentToken===reloadToken&&token===controlToken)applyStatus(status);
  });}catch(error){if(documentToken===reloadToken&&token===controlToken&&edit===editRevision)setError(error);}finally{controlsPending--;}
}
async function pollStatus(){if(!bridge||statusBusy||updating||controlsPending)return;statusBusy=true;const token=reloadToken,command=controlToken,edit=editRevision;
  try{const status=await bridge.preview.status();if(token===reloadToken&&command===controlToken)applyStatus(status);}
  catch(error){if(token===reloadToken&&command===controlToken&&edit===editRevision)setTransportWarning(error);}finally{statusBusy=false;}}
function fitPreview(){const stage=document.querySelector('.canvas-stage'),style=getComputedStyle(stage),host=$('native-preview-host');
  const width=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2,height=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-2;
  const fitted=Math.max(2,Math.min(width,height*4/3));host.style.width=`${fitted+2}px`;host.style.height=`${fitted*3/4+2}px`;}
async function sendBounds(){fitPreview();if(!bridge)return;const box=$('native-preview-host').getBoundingClientRect();await bridge.preview.bounds({x:box.left+1,y:box.top+1,width:Math.max(1,box.width-2),height:Math.max(1,box.height-2),visible:true});}
function queueBounds(){if(boundsFrame)return;boundsFrame=requestAnimationFrame(()=>{boundsFrame=0;sendBounds().catch(error=>notice(`预览布局更新失败：${error.message}`));});}
function replaceSource(source,{path=null,saved=false}={}){
  if(typeof source!=='string')throw Error('文件没有可读取的 JavaScript 文本。');
  documentEpoch++;documentPath=path;savedSource=saved?source:null;restartPosition=true;frame=0;playIntent=false;folded=false;$('fold-source').textContent='折叠';setPlaying(false);editor.setSource(source);renderFile();renderTransport();
  if(source===sourceText&&$('auto-preview').checked){clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>{reloadTimer=null;reload();},450);}
}
async function openDocument(){
  if(!bridge){$('import-file').click();return;}
  try{const result=await bridge.openDocument();if(!result||result.cancelled)return;replaceSource(result.source,{path:result.path,saved:true});notice('JS 文件已打开。',true);}
  catch(error){notice(`打开失败，源码未更改：${error.message}`);}
}
async function saveDocument(saveAs=false){
  const source=sourceText,epoch=documentEpoch;
  try{
    if(bridge){const result=await bridge.saveDocument(source,{saveAs:saveAs||!documentPath});if(!result||result.cancelled||epoch!==documentEpoch)return;documentPath=result.path??documentPath;}
    else{const url=URL.createObjectURL(new Blob([source],{type:'text/javascript;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=documentPath?.split(/[\\/]/).at(-1)??'untitled.spell.js';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    savedSource=source;renderFile();$('save-status').textContent='文件已保存';notice('JavaScript 文件已保存。',true);
  }catch(error){notice(`保存失败，源码仍保留：${error.message}`);}
}

$('dismiss-notice').addEventListener('click',()=>{$('notice').hidden=true;});
$('new-document').addEventListener('click',()=>{replaceSource(createSpellSource());editor.focus();});
$('import-document').addEventListener('click',openDocument);
$('import-file').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(!/\.(?:js|mjs)$/i.test(file.name))throw Error('请选择 .js 或 .mjs 源码文件。');if(file.size>1024*1024)throw Error('源码超过 1 MiB。');replaceSource(await file.text(),{path:file.name,saved:true});}catch(error){notice(`打开失败：${error.message}`);}});
$('save-source').addEventListener('click',()=>saveDocument(false));$('export-document').addEventListener('click',()=>saveDocument(true));
for(const id of ['apply-source','native-preview'])$(id).addEventListener('click',reload);
$('auto-preview').addEventListener('change',()=>{clearTimeout(reloadTimer);reloadTimer=null;if($('auto-preview').checked&&sourcePending)reload();else if(!$('auto-preview').checked)sourceState('自动运行已关闭 · Ctrl+Enter 运行');});
$('undo').addEventListener('click',()=>editor.undo());$('redo').addEventListener('click',()=>editor.redo());
$('search-source').addEventListener('click',()=>editor.search());$('goto-line').addEventListener('click',()=>editor.gotoLine());
$('fold-source').addEventListener('click',()=>{folded=!folded;if(folded)editor.foldAll();else editor.unfoldAll();$('fold-source').textContent=folded?'展开':'折叠';});
$('error-goto').addEventListener('click',()=>{if(errorLocation)editor.goto(errorLocation.line,errorLocation.column);});
$('play').addEventListener('click',async()=>{if(!bridge)return;if(playing||playIntent){await control({action:'pause'});return;}if(frame>=duration)await control({action:'restart'});await control({action:'play'});});
$('reset').addEventListener('click',()=>{frame=0;renderTransport();control({action:'seek',frame:0});});
$('invincible').addEventListener('change',event=>{invincible=event.target.checked;frame=0;playIntent=false;releaseInput();setPlaying(false);renderTransport();control({action:'invincible',value:invincible});});
$('step').addEventListener('click',()=>control({action:'step'}));
$('seek').addEventListener('input',event=>{frame=clamp(Math.round(Number(event.target.value)),0,duration);renderTransport();control({action:'seek',frame});});
window.addEventListener('keydown',event=>{
  if(event.defaultPrevented)return;
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();reload();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveDocument(event.shiftKey);return;}
  if(event.target.closest('input,textarea,button,select,a,[role="button"],[contenteditable="true"],.cm-editor'))return;
  if(event.code==='Space'){event.preventDefault();$('play').click();}
});
window.addEventListener('beforeunload',()=>{if(draftDirty&&!bridge)try{localStorage.setItem(STORAGE,sourceText);}catch{}});

const divider=$('pane-divider');let dragging=false,split=54;
function setSplit(value){const width=$('workspace').clientWidth,min=Math.max(32,340/width*100),max=Math.min(68,(width-345)/width*100);split=clamp(value,min,max);document.documentElement.style.setProperty('--source-width',`${split}%`);divider.setAttribute('aria-valuenow',String(Math.round(split)));queueBounds();}
divider.addEventListener('pointerdown',event=>{if(event.button!==0)return;dragging=true;divider.setPointerCapture(event.pointerId);document.body.classList.add('resizing');event.preventDefault();});
divider.addEventListener('pointermove',event=>{if(!dragging)return;const box=$('workspace').getBoundingClientRect();setSplit((event.clientX-box.left)/box.width*100);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])divider.addEventListener(type,()=>{dragging=false;document.body.classList.remove('resizing');});
divider.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();setSplit(event.key==='Home'?54:split+(event.key==='ArrowLeft'?-2:2));}});
new ResizeObserver(queueBounds).observe(document.querySelector('.canvas-stage'));
window.addEventListener('resize',()=>setSplit(split));

if(bridge){
  const canvas=$('native-frame'),context=canvas.getContext('2d',{alpha:false});
  bridge.preview.onFrame(({width,height,pixels,id})=>{if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);canvas.dataset.frame=String(id);$('preview-placeholder').hidden=true;});
  const keys=new Set(),masks={ArrowLeft:1,ArrowRight:2,ArrowUp:4,ArrowDown:8,KeyZ:16|256,KeyX:32|512,ShiftLeft:64,ShiftRight:64,Escape:128,Enter:256};let input=0;
  function sendInput(){const mask=[...keys].reduce((result,key)=>result|masks[key],0);if(mask!==input){input=mask;bridge.preview.input(mask).catch(error=>notice(`输入失败：${error.message}`));}}
  canvas.addEventListener('pointerdown',()=>canvas.focus());
  for(const type of ['keydown','keyup'])canvas.addEventListener(type,event=>{if(!(event.code in masks))return;
    if(type==='keydown'&&(event.ctrlKey||event.metaKey))return;
    if(type==='keyup'&&!keys.has(event.code))return;
    event.preventDefault();event.stopPropagation();if(type==='keydown')keys.add(event.code);else keys.delete(event.code);sendInput();});
  releaseInput=()=>{keys.clear();sendInput();};canvas.addEventListener('blur',releaseInput);window.addEventListener('blur',releaseInput);
  setInterval(pollStatus,120);
}else{
  $('placeholder-text').textContent='在桌面工作台中打开此 JS，使用原生引擎预览。浏览器可编辑和保存源码。';
  for(const id of ['play','reset','step','seek','invincible'])$(id).disabled=true;
  $('preview-state').textContent='浏览器编辑模式';
}
async function initialize(){
  try{
    const initial=bridge?await bridge.loadInitialDocument():{source:localStorage.getItem(STORAGE)};
    if(typeof initial.source==='string')sourceText=initial.source;
    if(initial.path){documentPath=initial.path;savedSource=sourceText;}
  }
  catch(error){notice(`草稿无法恢复，原文件已保留：${error.message}`);}
  editor=createCodeEditor({parent:$('source-code'),source:sourceText,onChange:changed,onUpdate:updateEditorStatus,onRun:reload,onSave:saveDocument});
  initializing=false;renderFile();renderTransport();queueBounds();$('save-status').textContent=documentPath?'文件已载入':'本地草稿';await reload();
}
initialize().catch(error=>{setError(error);notice(`编辑器启动失败：${error.message}`);});
