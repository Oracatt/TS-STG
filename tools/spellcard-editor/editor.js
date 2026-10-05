import {createTouhouSpellCard,validateTouhouSpellCard,parseTouhouSpellCard,serializeTouhouSpellCard} from '/thlib/touhou/spellcard.js';
import {createBrowserPreview} from '/editor/preview.js';

const $=id=>document.getElementById(id),clone=value=>JSON.parse(JSON.stringify(value));
const STORAGE='ts-stg.spellcard-editor.v1',TAU=Math.PI*2;
const TYPES={bullet:{name:'弹幕发射',icon:'✣',color:'#8cdac6'},laser:{name:'激光发射',icon:'╱',color:'#91bcfa'},
  move:{name:'Boss 移动',icon:'↗',color:'#bea9f7'},charge:{name:'聚能 / 释放',icon:'◉',color:'#e9b17f'},
  sound:{name:'音效',icon:'♪',color:'#e6ca78'},clear:{name:'消弹',icon:'◇',color:'#ef99ac'}};
const COLORS=['#8e96a3','#e65969','#ff918a','#e561d1','#f7a4e0','#666fed','#99a8ff','#57b9f2','#91d5fa','#57c89b','#a6e89a','#d7dda4','#f4d25e','#ffee9d','#f8bea0','#f4f4ff'];
const CHARGE_COLORS=[['magenta','紫'],['red','红'],['blue','蓝'],['cyan','青'],['green','绿'],['yellow','黄'],['white','白']];
const PATTERNS=['自机狙 · 扇形','固定角 · 扇形','自机狙 · 环形','固定角 · 环形','自机狙 · 半步错位环','固定角 · 半步错位环','随机角','环形 · 随机速度','随机角与速度','自机狙 · 交错多排环','固定角 · 交错多排环','椭圆','正弦速度变形环'];
const rad=degrees=>degrees*Math.PI/180,deg=radians=>radians*180/Math.PI;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const fmt=value=>Number.isInteger(value)?String(value):String(Math.round(value*1000)/1000);
const uid=prefix=>`${prefix}-${globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`}`;
const desktop=window.spellCardEditor?.desktop===true,bridge=desktop?window.spellCardEditor:null;
let card=createTouhouSpellCard(),selected=null,model=null,playing=false,frame=0,history=[],future=[],previewGeneration=0;
let seekController=null,seekGeneration=0,rebuildTimer=null,saveTimer=null,canvasDrag=null,timelineDrag=null,noticeTimer=null;
let nativeAvailable=false,nativeBusy=false,dirty=false,loadNotice=null,lastTick=0,accumulator=0;
let modelGeneration=-1,targetPoint=null,desktopStatusBusy=false,desktopUpdating=false,documentPath=null,lastNativeError='',boundsFrame=0;
let nativeOperations=Promise.resolve(),nativeControlPending=0,nativeDocumentRevision=0,nativeCommandId=0,switchingMode=false;
let previewMode='native';const useNative=()=>desktop&&previewMode==='native';
try{const saved=desktop?null:localStorage.getItem(STORAGE);if(saved){card=parseTouhouSpellCard(saved);loadNotice='已恢复此浏览器中的上次草稿。';}}catch(error){loadNotice=`草稿无法恢复，原始草稿仍保留在浏览器中：${error.message}`;}

function notice(message,success=false){
  clearTimeout(noticeTimer);$('notice-text').textContent=message;$('notice').classList.toggle('success',success);$('notice').hidden=false;
  if(success)noticeTimer=setTimeout(()=>{$('notice').hidden=true;},5000);
}
$('dismiss-notice').addEventListener('click',()=>{$('notice').hidden=true;});
function setPlaying(value){playing=!!value&&(useNative()||!!model);accumulator=0;lastTick=0;$('play').textContent=playing?'Ⅱ 暂停':'▶ 播放';}
function persist(){
  clearTimeout(saveTimer);dirty=true;$('save-status').textContent='正在保存…';
  const source=clone(card);
  const save=async()=>{try{if(desktop)await bridge.saveDraft(source);else localStorage.setItem(STORAGE,serializeTouhouSpellCard(source));
      if(JSON.stringify(source)===JSON.stringify(card)){dirty=false;$('save-status').textContent='草稿已保存';}}
    catch(error){$('save-status').textContent='草稿未保存';notice(`无法保存本地草稿，请导出 JSON：${error.message}`);}};
  // Queue desktop writes immediately; the main process drains pending writes
  // before closing. Debouncing here could lose the last edit on a quick exit.
  if(desktop)save();else saveTimer=setTimeout(save,200);
}
function selectedEvent(){return card.events.find(event=>event.id===selected)??null;}
function editDocument(next,{selection=selected,keepInspector=false,save=true}={}){
  try{validateTouhouSpellCard(next);}catch(error){notice(`修改未应用：${error.message}`);renderInspector();return false;}
  if(JSON.stringify(next)===JSON.stringify(card))return true;
  history.push({card:clone(card),selected});if(history.length>100)history.shift();future=[];
  card=next;selected=next.events.some(event=>event.id===selection)?selection:null;frame=clamp(frame,0,card.duration);
  if(save)persist();renderDocument(!keepInspector);schedulePreview();return true;
}
function editEvent(id,patch){const next=clone(card),event=next.events.find(value=>value.id===id);if(!event)return false;Object.assign(event,patch);return editDocument(next,{keepInspector:true});}
function travelHistory(backwards){
  const source=backwards?history:future,target=backwards?future:history;if(!source.length)return;
  target.push({card:clone(card),selected});const snapshot=source.pop();card=snapshot.card;selected=snapshot.selected;
  frame=Math.min(frame,card.duration);setPlaying(false);persist();renderDocument();schedulePreview(0);
}
function renderDocument(inspector=true){
  $('card-name').value=card.name;$('event-count').textContent=card.events.length;$('total-frames').textContent=String(card.duration).padStart(5,'0');
  $('seek').max=card.duration;$('undo').disabled=!history.length;$('redo').disabled=!future.length;
  $('duplicate-event').disabled=!selectedEvent();$('delete-event').disabled=!selectedEvent();
  $('add-event').disabled=card.events.length>=256;renderEvents();renderTimeline();if(inspector)renderInspector();renderTransport();
}
function eventSummary(event){
  if(event.type==='bullet')return `弹型 ${event.bulletType} · ${event.count} × ${event.rows} · 每 ${event.interval} 帧`;
  if(event.type==='laser')return `${event.kind==='straight'?'直线':'无限'}激光 · 宽 ${fmt(event.width)} · 每 ${event.interval} 帧`;
  if(event.type==='move')return `(${fmt(event.x)}, ${fmt(event.y)}) · ${event.duration} 帧`;
  if(event.type==='charge')return `${CHARGE_COLORS.find(([id])=>id===event.color)?.[1]??event.color}色 · ${event.release?`${event.releaseFrame} 帧后释放`:'无释放'}`;
  if(event.type==='sound')return `音效 ${event.sound}`;return '清除当前敌弹与激光';
}
function select(id){selected=id;renderDocument();}
function renderEvents(){
  const list=$('event-list');list.replaceChildren();
  if(!card.events.length){const empty=document.createElement('div');empty.className='empty-list';empty.textContent='从一个发射事件开始\n在上方选择类型并添加';empty.style.whiteSpace='pre-line';list.append(empty);return;}
  for(const event of [...card.events].sort((a,b)=>a.frame-b.frame)){
    const item=document.createElement('div');item.className=`event-item${selected===event.id?' selected':''}${event.enabled?'':' disabled'}`;
    item.setAttribute('role','listitem');item.tabIndex=0;item.dataset.id=event.id;item.style.setProperty('--event-color',TYPES[event.type].color);
    const icon=document.createElement('span');icon.className='event-icon';icon.textContent=TYPES[event.type].icon;
    const content=document.createElement('div');content.className='event-content';const title=document.createElement('strong');title.textContent=TYPES[event.type].name;
    const summary=document.createElement('small');summary.textContent=eventSummary(event);content.append(title,summary);
    const at=document.createElement('span');at.className='event-frame';at.textContent=String(event.frame).padStart(4,'0');
    item.append(icon,content,at);item.addEventListener('click',()=>select(event.id));item.addEventListener('keydown',e=>{if(e.key==='Enter'){select(event.id);e.preventDefault();}});list.append(item);
  }
}
function field(group,label,key,value,change,{min,max,step=1,unit='',wide=false,choices=null,nullable=false,type='number',help=''}={}){
  const wrapper=document.createElement('label');wrapper.className=`field${wide?' wide':''}${type==='checkbox'?' checkbox':''}`;
  const title=document.createElement('span');title.textContent=label;const input=document.createElement(choices?'select':'input');input.dataset.field=key;
  if(choices){for(const [id,name] of choices){const option=document.createElement('option');option.value=id;option.textContent=name;input.append(option);}input.value=String(value);}
  else{input.type=type;if(type==='checkbox')input.checked=!!value;else input.value=value===null?'':type==='text'?String(value):fmt(value);if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;input.step=step;if(nullable)input.placeholder='无';}
  input.addEventListener('change',()=>{
    let next=choices?input.value:type==='checkbox'?input.checked:type==='text'?input.value:nullable&&input.value.trim()===''?null:Number(input.value);
    if(type==='number'&&!choices&&next!==null&&(!Number.isFinite(next)||input.value.trim()==='')){notice(`${label}需要有效的数字。`);input.value=value===null?'':String(value);return;}
    change(next);
  });
  if(type==='checkbox')wrapper.append(input,title);else{wrapper.append(title);if(unit){const box=document.createElement('div');box.className='unit';const suffix=document.createElement('small');suffix.textContent=unit;box.append(input,suffix);wrapper.append(box);}else wrapper.append(input);}
  if(help){const note=document.createElement('small');note.className='help';note.textContent=help;wrapper.append(note);}group.append(wrapper);return input;
}
function section(title){const group=document.createElement('section');group.className='inspector-group';const heading=document.createElement('h3');heading.textContent=title;const grid=document.createElement('div');grid.className='field-grid';group.append(heading,grid);$('inspector').append(group);return grid;}
function renderInspector(){
  const inspector=$('inspector'),event=selectedEvent();inspector.replaceChildren();$('inspector-title').textContent=event?'事件属性':'符卡设置';
  $('inspector-hint').textContent=event?'X 向右，Y 向下；画面中心 X = 0。角度以度显示，文件中保存弧度。':useNative()?'所有时间以帧为单位，60 帧 = 1 秒。中央预览由 TS-STG 原生引擎实时渲染。':'所有时间以帧为单位，60 帧 = 1 秒。轨迹预览不执行受击、得分或完整美术演出。';
  if(!event){
    let group=section('基本信息');
    const patch=values=>editDocument({...clone(card),...values});
    field(group,'符卡 ID','id',card.id,value=>patch({id:value}),{type:'text',wide:true});
    field(group,'名称','name',card.name,value=>patch({name:value}),{type:'text',wide:true});
    field(group,'时限','duration',card.duration,value=>patch({duration:value}),{min:1,max:36000,unit:'帧'});
    field(group,'Boss 血量','hp',card.hp,value=>patch({hp:value}),{min:1});
    field(group,'随机种子','seed',card.seed,value=>patch({seed:value}),{min:0,max:4294967295,wide:true});
    group=section('Boss 初始位置');
    for(const axis of ['x','y'])field(group,axis.toUpperCase(),`boss.${axis}`,card.boss[axis],value=>patch({boss:{...card.boss,[axis]:value}}),{step:1});
    const help=document.createElement('p');help.className='panel-note';help.textContent='从左侧添加事件。已有事件超出新时限时，修改会被拒绝；请先调整事件窗口。';inspector.append(help);return;
  }
  const banner=document.createElement('div');banner.className='event-type-title';const icon=document.createElement('span');icon.className='event-icon';icon.style.setProperty('--event-color',TYPES[event.type].color);icon.textContent=TYPES[event.type].icon;
  const label=document.createElement('strong');label.textContent=TYPES[event.type].name;banner.append(icon,label);inspector.append(banner);
  const set=(key,value)=>editEvent(event.id,{[key]:value});let group=section('时间与状态');
  field(group,'启用事件','enabled',event.enabled,value=>set('enabled',value),{type:'checkbox',wide:true});
  field(group,'开始帧','frame',event.frame,value=>set('frame',value),{min:0,max:card.duration-1,unit:'帧'});
  if('duration'in event)field(group,'持续窗口','duration',event.duration,value=>set('duration',value),{min:1,max:card.duration,unit:'帧'});
  if('interval'in event)field(group,'发射间隔','interval',event.interval,value=>set('interval',value),{min:1,unit:'帧'});
  if('x'in event){
    group=section(event.type==='move'?'目标位置':'发射位置');
    if('origin'in event)field(group,'坐标基准','origin',event.origin,value=>{set('origin',value);renderInspector();},{choices:[['boss','相对 Boss'],['world','场地绝对坐标']],wide:true});
    for(const axis of ['x','y'])field(group,axis.toUpperCase(),axis,event[axis],value=>set(axis,value),{step:1});
  }
  if(event.type==='bullet'){
    group=section('弹幕形状');field(group,'弹型编号','bulletType',event.bulletType,value=>set('bulletType',value),{min:0,max:49});
    field(group,'颜色编号','color',event.color,value=>set('color',value),{min:0,max:15});
    field(group,'发射模式','pattern',event.pattern,value=>set('pattern',Number(value)),{wide:true,choices:PATTERNS.map((label,index)=>[index,`${index} · ${label}`])});
    field(group,'每排数量','count',event.count,value=>set('count',value),{min:1,max:2048});field(group,'排数','rows',event.rows,value=>set('rows',value),{min:1,max:2048});
    group=section('速度与角度');field(group,'初速度','speed',event.speed,value=>set('speed',value),{step:.1});field(group,'末排速度 / 随机幅度','speedStep',event.speedStep,value=>set('speedStep',value),{step:.1,help:'多排末排速度；随机速度模式中为随机幅度。'});
    for(const [key,label] of [['angle','初始角度'],['angleStep','子弹角间距'],['rotation','每波旋转']])field(group,label,key,deg(event[key]),value=>set(key,rad(value)),{step:1,unit:'°'});
  }else if(event.type==='laser'){
    group=section('激光形状');field(group,'类型','kind',event.kind,value=>set('kind',value),{choices:[['straight','直线激光'],['infinite','无限激光']],wide:true});
    field(group,'颜色编号','color',event.color,value=>set('color',value),{min:0,max:15});field(group,'速度','speed',event.speed,value=>set('speed',value),{step:.1});
    field(group,'宽度','width',event.width,value=>set('width',value),{min:0,step:1});field(group,'长度','length',event.length,value=>set('length',value),{min:0,step:1});
    for(const [key,label] of [['angle','初始角度'],['rotation','每波旋转']])field(group,label,key,deg(event[key]),value=>set(key,rad(value)),{step:1,unit:'°'});
    group=section('激光生命周期');for(const [key,label] of [['delay','预告'],['grow','展开'],['sustain','维持'],['shrink','收束']])field(group,label,key,event[key],value=>set(key,value),{min:0,unit:'帧'});
  }else if(event.type==='move'){
    group=section('运动');field(group,'插值方式','easing',event.easing,value=>set('easing',value),{choices:[['linear','匀速'],['smooth','平滑缓入缓出']],wide:true});
  }else if(event.type==='charge'){
    group=section('聚能与释放');field(group,'聚能颜色','color',event.color,value=>set('color',value),{choices:CHARGE_COLORS});
    field(group,'释放颜色','releaseColor',event.releaseColor,value=>set('releaseColor',value),{choices:CHARGE_COLORS});
    field(group,'结束后释放','release',event.release,value=>set('release',value),{type:'checkbox',wide:true});
    field(group,'释放延迟','releaseFrame',event.releaseFrame,value=>set('releaseFrame',value),{min:0,unit:'帧',wide:true});
    group=section('显式音效');field(group,'聚能音效','sound',event.sound,value=>set('sound',value),{min:0,max:89,nullable:true,help:'54 聚能；留空不发声。'});
    field(group,'释放音效','releaseSound',event.releaseSound,value=>set('releaseSound',value),{min:0,max:89,nullable:true,help:'6 释放；留空不发声。'});
  }else if(event.type==='sound'){
    group=section('音效');field(group,'音效编号','sound',event.sound,value=>set('sound',value),{min:0,max:89,wide:true,help:'33 开卡 · 54 聚能 · 6 释放。声音在原生试玩中播放。'});
  }
}
function eventSpan(event){return event.duration??(event.type==='charge'&&event.release?event.releaseFrame:0);}
function latestEventFrame(event){return card.duration-(event.type==='charge'?event.releaseFrame+1:Math.max(1,event.duration??0));}
function renderTimeline(){
  const ticks=$('timeline-ticks'),events=$('timeline-events');ticks.replaceChildren();events.replaceChildren();
  for(let i=0;i<=6;i++){const tick=document.createElement('span');tick.className='timeline-tick';tick.style.left=`${i/6*100}%`;tick.textContent=`${fmt(card.duration/60*i/6)}s`;ticks.append(tick);}
  const lanes=Array($('timeline').clientHeight<=75?2:3).fill(0);
  for(const event of [...card.events].sort((a,b)=>a.frame-b.frame)){
    const lane=lanes.indexOf(Math.min(...lanes));lanes[lane]=event.frame+Math.max(eventSpan(event),card.duration*.018);
    const item=document.createElement('div');item.className=`timeline-event${selected===event.id?' selected':''}${event.enabled?'':' disabled'}`;item.dataset.id=event.id;
    item.style.setProperty('--event-color',TYPES[event.type].color);
    item.style.left=`${event.frame/card.duration*100}%`;item.style.width=`${Math.max(.6,eventSpan(event)/card.duration*100)}%`;item.style.top=`${lane*23}px`;
    item.textContent=TYPES[event.type].icon;item.title=`${TYPES[event.type].name} · ${event.frame} 帧`;item.addEventListener('pointerdown',beginTimelineDrag);events.append(item);
  }
}
function newEvent(type){
  const at=clamp(frame,0,card.duration-1),remaining=card.duration-at,base={id:uid(type),type,frame:at,enabled:true};
  if(type==='bullet')return{...base,duration:remaining,interval:30,x:0,y:0,origin:'boss',bulletType:0,color:2,pattern:3,count:24,rows:1,speed:2,speedStep:0,angle:0,angleStep:0,rotation:.12};
  if(type==='laser')return{...base,duration:Math.min(180,remaining),interval:120,x:0,y:0,origin:'boss',kind:'infinite',color:5,angle:Math.PI/2,rotation:0,speed:3,width:12,length:360,delay:30,grow:20,sustain:90,shrink:20};
  if(type==='move')return{...base,duration:Math.min(60,remaining),x:0,y:96,easing:'smooth'};
  if(type==='charge')return{...base,x:0,y:0,origin:'boss',color:'magenta',releaseColor:'white',releaseFrame:Math.min(60,remaining-1),release:true,sound:54,releaseSound:6};
  if(type==='sound')return{...base,sound:33};return base;
}
function beginTimelineDrag(event){
  if(event.button!==0)return;event.preventDefault();event.stopPropagation();setPlaying(false);if(useNative())desktopControl({action:'pause'});
  const id=event.currentTarget.dataset.id,item=card.events.find(value=>value.id===id);selected=id;
  timelineDrag={id,startX:event.clientX,original:item.frame,frame:item.frame,element:event.currentTarget,pointerId:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add('selected');renderInspector();renderEvents();$('duplicate-event').disabled=false;$('delete-event').disabled=false;
}
window.addEventListener('pointermove',event=>{
  if(!timelineDrag)return;const item=card.events.find(value=>value.id===timelineDrag.id),width=$('timeline').getBoundingClientRect().width;
  timelineDrag.frame=clamp(Math.round(timelineDrag.original+(event.clientX-timelineDrag.startX)/width*card.duration),0,latestEventFrame(item));
  timelineDrag.element.style.left=`${timelineDrag.frame/card.duration*100}%`;timelineDrag.element.title=`${timelineDrag.frame} 帧`;
  $('preview-state').textContent=`移动事件 → 第 ${timelineDrag.frame} 帧`;
});
window.addEventListener('pointerup',()=>{if(timelineDrag){const drag=timelineDrag;timelineDrag=null;editEvent(drag.id,{frame:drag.frame});renderDocument();}});
$('timeline').addEventListener('pointerdown',event=>{if(event.target.closest('.timeline-event'))return;const bounds=$('timeline').getBoundingClientRect();seekTo(Math.round(clamp((event.clientX-bounds.left)/bounds.width,0,1)*card.duration));});

async function rebuildPreview(generation){
  if(generation!==previewGeneration)return;let next=null;$('preview-busy').hidden=false;$('preview-state').textContent='正在构建预览…';
  seekController?.abort();const controller=new AbortController();seekController=controller;const wantedFrame=frame;setPlaying(false);
  try{
    if(useNative()){
      desktopUpdating=true;
      await enqueueNative(async()=>{
        if(generation!==previewGeneration||!useNative())return;
        await sendPreviewBounds();rememberNativeRequest(await bridge.preview.update(clone(card)));
        if(generation!==previewGeneration||!useNative())return;
        rememberNativeRequest(await bridge.preview.control({action:'pause'}));
        if(wantedFrame>0)rememberNativeRequest(await bridge.preview.control({action:'seek',frame:wantedFrame}));
        if(generation!==previewGeneration||!useNative())return;modelGeneration=generation;
        const status=await bridge.preview.status();if(generation===previewGeneration)applyDesktopStatus(status);
      });return;
    }
    next=await createBrowserPreview(clone(card));if(generation!==previewGeneration){next.dispose();return;}
    if(targetPoint)next.setTarget(targetPoint.x,targetPoint.y);
    if(wantedFrame>0)await next.seek(wantedFrame,{signal:controller.signal});
    if(generation!==previewGeneration||controller.signal.aborted){next.dispose();return;}
    model?.dispose();model=next;modelGeneration=generation;frame=model.frame;renderTransport();$('preview-state').textContent='就绪 · 原作规则轨迹模拟';
  }catch(error){next?.dispose();if(error.name!=='AbortError'&&generation===previewGeneration){notice(`预览失败：${error.message}`);$('preview-state').textContent='预览不可用；工程仍可编辑和导出';}}
  finally{if(generation===previewGeneration){$('preview-busy').hidden=true;seekController=null;desktopUpdating=false;}}
}
function schedulePreview(delay=130){clearTimeout(rebuildTimer);previewGeneration++;seekGeneration++;seekController?.abort();setPlaying(false);const generation=previewGeneration;rebuildTimer=setTimeout(()=>{rebuildTimer=null;rebuildPreview(generation);},delay);}
async function seekTo(value){
  frame=clamp(Math.round(value),0,card.duration);renderTransport();setPlaying(false);
  if(useNative()){if(modelGeneration!==previewGeneration){schedulePreview(0);return;}return desktopControl({action:'seek',frame});}
  if(!model||modelGeneration!==previewGeneration){schedulePreview(0);return;}
  clearTimeout(rebuildTimer);rebuildTimer=null;const expectedModel=model,generation=++seekGeneration,buildGeneration=previewGeneration;
  seekController?.abort();const controller=new AbortController();seekController=controller;$('preview-busy').hidden=false;
  try{await expectedModel.seek(frame,{signal:controller.signal});if(generation!==seekGeneration||buildGeneration!==previewGeneration||expectedModel!==model||controller.signal.aborted)return;frame=model.frame;renderTransport();$('preview-state').textContent='就绪 · 原作规则轨迹模拟';}
  catch(error){if(error.name!=='AbortError'&&generation===seekGeneration)notice(`跳转失败：${error.message}`);}
  finally{if(generation===seekGeneration&&buildGeneration===previewGeneration){$('preview-busy').hidden=true;seekController=null;}}
}
function renderTransport(){
  $('current-frame').textContent=String(frame).padStart(5,'0');$('time-readout').textContent=`${(frame/60).toFixed(2)} s`;$('seek').value=frame;
  $('playhead').style.left=`${frame/card.duration*100}%`;
}
function enqueueNative(operation){const next=nativeOperations.catch(()=>{}).then(operation);nativeOperations=next.catch(()=>{});return next;}
function rememberNativeRequest(result){
  if(Number.isInteger(result?.documentRevision))nativeDocumentRevision=result.documentRevision;
  if(Number.isInteger(result?.commandId))nativeCommandId=result.commandId;
}
function applyDesktopStatus(status){
  if(!status)return;
  if(status.error&&status.error!==lastNativeError){lastNativeError=status.error;notice(`原生预览：${status.error}`);}
  if((status.documentRevision??0)<nativeDocumentRevision||(status.commandId??0)<nativeCommandId)return;
  if(Number.isFinite(status.frame))frame=clamp(Math.round(status.frame),0,card.duration);
  setPlaying(status.playing&&!status.completed);renderTransport();
  const bullets=Number(status.bullets??0),lasers=Number(status.lasers??0);
  $('preview-state').textContent=status.error?'原生预览报告错误':`${status.seeking?'正在定位':status.settling?'结算演出':status.completed?'播放完成':status.playing?'正在播放':'已暂停'} · ${bullets} 弹 · ${lasers} 激光`;
}
async function desktopControl(command){
  if(!useNative()||switchingMode)return;const generation=++seekGeneration,documentGeneration=previewGeneration;setPlaying(command.action==='play');nativeControlPending++;
  try{await enqueueNative(async()=>{
    // Seek drags coalesce; ordered play, pause and single-frame commands must survive.
    if((command.action==='seek'&&generation!==seekGeneration)||documentGeneration!==previewGeneration||!useNative())return;
    rememberNativeRequest(await bridge.preview.control(command));
    if(generation!==seekGeneration||documentGeneration!==previewGeneration)return;
    const status=await bridge.preview.status();if(generation===seekGeneration&&documentGeneration===previewGeneration&&useNative())applyDesktopStatus(status);
  });}catch(error){notice(`预览操作失败：${error.message}`);}finally{nativeControlPending--;}
}
function fitPreviewHost(){
  const stage=document.querySelector('.canvas-stage'),host=$('native-preview-host'),style=getComputedStyle(stage);
  const availableWidth=Math.max(2,stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight));
  const availableHeight=Math.max(2,stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom));
  const aspect=useNative()?4/3:384/448,width=Math.min(availableWidth-2,(availableHeight-2)*aspect);
  host.style.width=`${Math.max(2,width+2)}px`;host.style.height=`${Math.max(2,width/aspect+2)}px`;
}
async function sendPreviewBounds(){
  fitPreviewHost();if(!desktop)return;const rect=$('native-preview-host').getBoundingClientRect();
  await bridge.preview.bounds({x:rect.left+1,y:rect.top+1,width:Math.max(1,rect.width-2),height:Math.max(1,rect.height-2),visible:useNative()});
}
function queuePreviewBounds(){if(boundsFrame)return;boundsFrame=requestAnimationFrame(()=>{boundsFrame=0;sendPreviewBounds().catch(error=>notice(`预览布局更新失败：${error.message}`));});}
function updatePreviewModeLabels(){
  document.body.classList.toggle('native-preview',useNative());
  document.querySelector('.preview-heading strong').textContent=useNative()?'原生引擎预览':'坐标编排';
  document.querySelector('.preview-disclaimer').textContent=useNative()?'完整画面与音效':'轨迹参考 · 可拖动控制点';
  $('preview-mode').textContent=useNative()?'坐标编排':'引擎预览';renderInspector();queuePreviewBounds();
}
async function switchPreviewMode(next){
  if(!desktop||previewMode===next||switchingMode)return;switchingMode=true;$('preview-mode').disabled=true;
  setPlaying(false);previewGeneration++;seekGeneration++;seekController?.abort();clearTimeout(rebuildTimer);rebuildTimer=null;
  try{
    await enqueueNative(async()=>{
      const receipt=await bridge.preview.control({action:'pause'});rememberNativeRequest(receipt);
      const started=performance.now();
      for(;;){
        const status=await bridge.preview.status();
        if((status.commandId??0)>=(receipt.commandId??0)&&!status.playing){if(useNative())applyDesktopStatus(status);break;}
        if(performance.now()-started>3000)throw new Error('原生预览未确认暂停，请重试。');
        await new Promise(resolve=>setTimeout(resolve,40));
      }
    });
    previewMode=next;modelGeneration=-1;desktopUpdating=false;updatePreviewModeLabels();await sendPreviewBounds();schedulePreview(0);
  }catch(error){notice(`预览模式切换失败：${error.message}`);schedulePreview(0);}
  finally{switchingMode=false;$('preview-mode').disabled=false;}
}
async function pollDesktopStatus(){
  if(!useNative()||desktopStatusBusy||desktopUpdating||nativeControlPending||rebuildTimer||modelGeneration!==previewGeneration)return;
  const generation=previewGeneration,seek=seekGeneration;desktopStatusBusy=true;
  try{const status=await bridge.preview.status();if(generation===previewGeneration&&seek===seekGeneration)applyDesktopStatus(status);}
  catch(error){if(error.message!==lastNativeError){lastNativeError=error.message;notice(`无法读取原生预览状态：${error.message}`);}}
  finally{desktopStatusBusy=false;}
}
async function openDesktopDocument(){
  try{const result=await bridge.openDocument();if(!result||result.cancelled)return;
    if(!result.document)throw new Error('所选文件没有有效的符卡文档。');
    const next=typeof result.document==='string'?parseTouhouSpellCard(result.document):result.document;validateTouhouSpellCard(next);
    frame=0;if(editDocument(clone(next),{selection:null})){documentPath=result.path??null;notice('符卡已打开。',true);}
  }catch(error){notice(`打开失败，当前工程未更改：${error.message}`);}
}
async function saveDesktopDocument(saveAs=false){
  try{validateTouhouSpellCard(card);const result=await bridge.saveDocument(clone(card),{saveAs:saveAs||!documentPath});if(!result||result.cancelled)return;
    documentPath=result.path??documentPath;$('save-status').textContent='文件已保存';notice(`已保存${documentPath?`：${documentPath}`:''}`,true);
  }catch(error){notice(`保存失败，当前工程仍保留：${error.message}`);}
}
function toField(event){const bounds=$('preview').getBoundingClientRect();return{x:(event.clientX-bounds.left)/bounds.width*384-192,y:(event.clientY-bounds.top)/bounds.height*448};}
function positionOf(event){if(event.type==='move'||event.origin==='world')return{x:event.x,y:event.y};const boss=model?.boss??card.boss;return{x:boss.x+event.x,y:boss.y+event.y};}
function handles(){
  const items=[],event=selectedEvent();if(event&&'x'in event)items.push({kind:'event',...positionOf(event),color:'#8cdac6',label:event.type==='move'?'移动目标':'发射点'});
  items.push({kind:'boss',...(model?.boss??card.boss),color:'#bea9f7',label:'Boss'});items.push({kind:'player',...(model?.player??{x:0,y:376}),color:'#e5eaf1',label:'瞄准目标'});return items;
}
$('preview').addEventListener('pointerdown',event=>{
  if(event.button!==0)return;const point=toField(event),hit=handles().find(handle=>Math.hypot(handle.x-point.x,handle.y-point.y)<13);if(!hit)return;
  setPlaying(false);canvasDrag={...hit,start:point,x:hit.x,y:hit.y,id:selected,pointerId:event.pointerId};$('preview').setPointerCapture(event.pointerId);event.preventDefault();
});
$('preview').addEventListener('pointermove',event=>{
  const point=toField(event);if(!canvasDrag){$('preview').style.cursor=handles().some(handle=>Math.hypot(handle.x-point.x,handle.y-point.y)<13)?'grab':'crosshair';return;}
  canvasDrag.x=clamp(Math.round(point.x),-192,192);canvasDrag.y=clamp(Math.round(point.y),0,448);
  if(canvasDrag.kind==='player'){targetPoint={x:canvasDrag.x,y:canvasDrag.y};model?.setTarget(canvasDrag.x,canvasDrag.y);}
  $('preview-state').textContent=`${canvasDrag.label} (${canvasDrag.x}, ${canvasDrag.y})`;
});
$('preview').addEventListener('pointerup',()=>{
  if(!canvasDrag)return;const drag=canvasDrag;canvasDrag=null;
  if(drag.kind==='boss')editDocument({...clone(card),boss:{x:drag.x,y:drag.y}});
  else if(drag.kind==='event'){const item=selectedEvent();if(!item||item.id!==drag.id)return;const boss=item.origin==='boss'?(model?.boss??card.boss):{x:0,y:0};editEvent(item.id,{x:drag.x-boss.x,y:drag.y-boss.y});renderInspector();}
});
window.addEventListener('pointercancel',()=>{canvasDrag=null;timelineDrag=null;renderTimeline();});

function drawPreview(){
  if(useNative())return;
  const canvas=$('preview'),ctx=canvas.getContext('2d'),ratio=Math.min(devicePixelRatio||1,2),bounds=canvas.getBoundingClientRect();
  const width=Math.max(1,Math.round(bounds.width*ratio)),height=Math.max(1,Math.round(bounds.height*ratio));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  ctx.setTransform(width/384,0,0,height/448,0,0);ctx.fillStyle='#0d141e';ctx.fillRect(0,0,384,448);ctx.translate(192,0);
  ctx.strokeStyle='#233043';ctx.lineWidth=.4;ctx.beginPath();for(let x=-192;x<=192;x+=32){ctx.moveTo(x,0);ctx.lineTo(x,448);}for(let y=0;y<=448;y+=32){ctx.moveTo(-192,y);ctx.lineTo(192,y);}ctx.stroke();
  ctx.strokeStyle='#394a61';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,448);ctx.stroke();ctx.setLineDash([]);
  if(model){
    for(const segment of model.laserSegments?.()??[]){if(![segment.x1,segment.y1,segment.x2,segment.y2].every(Number.isFinite))continue;ctx.strokeStyle=COLORS[(segment.color??5)%16];ctx.globalAlpha=.65;ctx.lineWidth=Math.max(.7,segment.width);ctx.beginPath();ctx.moveTo(segment.x1,segment.y1);ctx.lineTo(segment.x2,segment.y2);ctx.stroke();}ctx.globalAlpha=1;
    const collisions=$('show-collision').checked,directions=$('show-direction').checked;
    for(const bullet of model.bullets??[]){if(!Number.isFinite(bullet.x)||!Number.isFinite(bullet.y))continue;
      const radius=Math.max(1,Math.min(18,bullet.radius??2.4)),color=COLORS[Math.abs(bullet.color??0)%16];ctx.fillStyle=color;ctx.beginPath();ctx.arc(bullet.x,bullet.y,Math.max(1.6,Math.min(3.4,radius*.65)),0,TAU);ctx.fill();
      if(collisions){ctx.strokeStyle=color;ctx.globalAlpha=.4;ctx.lineWidth=.65;ctx.beginPath();ctx.arc(bullet.x,bullet.y,radius,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
      if(directions){const angle=bullet.angle??Math.atan2(bullet.vy??0,bullet.vx??0);ctx.strokeStyle=color;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(bullet.x,bullet.y);ctx.lineTo(bullet.x+Math.cos(angle)*9,bullet.y+Math.sin(angle)*9);ctx.stroke();}
    }
    $('object-count').textContent=`${model.bullets?.length??0} 弹 · ${model.lasers?.length??0} 激光`;
  }
  const event=selectedEvent();if(event?.type==='move'){ctx.strokeStyle='#bea9f770';ctx.setLineDash([3,4]);ctx.lineWidth=.8;ctx.beginPath();const boss=model?.boss??card.boss;ctx.moveTo(boss.x,boss.y);ctx.lineTo(event.x,event.y);ctx.stroke();ctx.setLineDash([]);}
  for(const original of handles()){
    const handle=canvasDrag?.kind===original.kind?canvasDrag:original;ctx.strokeStyle=handle.color;ctx.fillStyle=handle.color;ctx.lineWidth=1;ctx.globalAlpha=.9;
    if(handle.kind==='boss'){ctx.save();ctx.translate(handle.x,handle.y);ctx.rotate(Math.PI/4);ctx.strokeRect(-6,-6,12,12);ctx.restore();}
    else{ctx.beginPath();ctx.arc(handle.x,handle.y,handle.kind==='event'?8:5,0,TAU);ctx.stroke();}
    ctx.beginPath();ctx.moveTo(handle.x-12,handle.y);ctx.lineTo(handle.x+12,handle.y);ctx.moveTo(handle.x,handle.y-12);ctx.lineTo(handle.x,handle.y+12);ctx.stroke();
    ctx.font='8px "Segoe UI","Microsoft YaHei",sans-serif';ctx.fillText(handle.label,handle.x+13,handle.y-9);ctx.globalAlpha=1;
  }
}
function animate(now){
  if(!useNative()&&playing&&model&&modelGeneration===previewGeneration&&!seekController&&!rebuildTimer){
    if(lastTick)accumulator+=Math.min(100,now-lastTick);let steps=0;
    while(accumulator>=1000/60&&steps++<6){if(model.frame>=card.duration){setPlaying(false);break;}try{model.step();frame=model.frame;}catch(error){setPlaying(false);notice(`模拟停止：${error.message}`);break;}accumulator-=1000/60;}
    renderTransport();
  }
  lastTick=now;drawPreview();requestAnimationFrame(animate);
}
$('add-event').addEventListener('click',()=>{const event=newEvent($('add-type').value);editDocument({...clone(card),events:[...clone(card.events),event]},{selection:event.id});});
$('delete-event').addEventListener('click',()=>{if(selected)editDocument({...clone(card),events:card.events.filter(event=>event.id!==selected)},{selection:null});});
$('duplicate-event').addEventListener('click',()=>{const event=selectedEvent();if(!event)return;const copy={...clone(event),id:uid(event.type)};if(copy.type==='move')copy.frame=Math.min(card.duration-copy.duration,copy.frame+copy.duration);editDocument({...clone(card),events:[...clone(card.events),copy]},{selection:copy.id});});
$('select-document').addEventListener('click',()=>select(null));$('undo').addEventListener('click',()=>travelHistory(true));$('redo').addEventListener('click',()=>travelHistory(false));
$('card-name').addEventListener('change',()=>editDocument({...clone(card),name:$('card-name').value}));
$('new-document').addEventListener('click',()=>{const next=createTouhouSpellCard();next.id=uid('spellcard');frame=0;if(editDocument(next,{selection:null})){documentPath=null;notice('已创建新符卡。可以撤销回到之前的工程。',true);}});
$('import-document').addEventListener('click',()=>desktop?openDesktopDocument():$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{if(file.size>2*1024*1024)throw new Error('文件超过 2 MB，请检查是否选择了符卡 JSON。');const next=parseTouhouSpellCard(await file.text());frame=0;if(editDocument(next,{selection:null}))notice(`已导入 ${file.name}`,true);}
  catch(error){notice(`导入失败，当前工程未更改：${error.message}`);}
});
$('export-document').addEventListener('click',()=>{
  if(desktop){saveDesktopDocument(true);return;}
  try{const text=serializeTouhouSpellCard(card),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`${card.id.replace(/[^\p{L}\p{N}_-]/gu,'_')||'spellcard'}.spellcard.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('符卡 JSON 已导出。',true);}catch(error){notice(`导出失败：${error.message}`);}
});
$('play').addEventListener('click',async()=>{if(useNative()){if(modelGeneration!==previewGeneration)return;if(frame>=card.duration&&!playing){await desktopControl({action:'restart'});await desktopControl({action:'play'});}else await desktopControl({action:playing?'pause':'play'});return;}if(playing)setPlaying(false);else if(frame>=card.duration){await seekTo(0);setPlaying(true);}else setPlaying(true);});
$('reset').addEventListener('click',()=>seekTo(0));$('step').addEventListener('click',()=>{if(useNative()){desktopControl({action:'step'});return;}setPlaying(false);if(model&&!seekController&&!rebuildTimer&&frame<card.duration){try{model.step();frame=model.frame;renderTransport();}catch(error){notice(`单帧模拟失败：${error.message}`);}}});
$('preview-mode').addEventListener('click',()=>switchPreviewMode(useNative()?'layout':'native').catch(error=>notice(error.message)));
$('seek').addEventListener('input',event=>seekTo(Number(event.target.value)));
$('native-preview').addEventListener('click',async()=>{
  if(desktop){frame=0;if(!useNative())await switchPreviewMode('native');else schedulePreview(0);return;}
  if(!nativeAvailable||nativeBusy)return;nativeBusy=true;$('native-preview').disabled=true;$('native-preview').textContent='正在启动…';
  try{const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:serializeTouhouSpellCard(card)});let body;try{body=await response.json();}catch{body={};}
    if(!response.ok)throw new Error(body.error??body.message??(response.status===409?'已有原生试玩窗口，请关闭后重试。':`启动失败（${response.status}）`));notice('原生试玩已启动。',true);}
  catch(error){notice(error.message);}finally{nativeBusy=false;$('native-preview').disabled=!nativeAvailable;$('native-preview').textContent='原生试玩 ↗';}
});
window.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(desktop)saveDesktopDocument(event.shiftKey);else $('export-document').click();return;}
  if(event.target.closest('input,select,textarea,[contenteditable="true"]'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();travelHistory(!event.shiftKey);}
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();travelHistory(false);}
  else if(event.code==='Space'){event.preventDefault();$('play').click();}
  else if(event.key==='Delete'&&selected){event.preventDefault();$('delete-event').click();}
});
window.addEventListener('beforeunload',()=>{if(dirty){try{localStorage.setItem(STORAGE,serializeTouhouSpellCard(card));}catch{}}});
async function capabilities(){if(desktop){nativeAvailable=true;$('native-preview').disabled=false;return;}try{const response=await fetch('/api/capabilities');if(!response.ok)throw new Error('预览服务不可用');const data=await response.json();nativeAvailable=data.nativePreview===true;$('native-preview').disabled=!nativeAvailable;$('native-preview').title=nativeAvailable?'在本机引擎中运行当前符卡':'没有找到可用的原生引擎；仍可预览轨迹和导出 JSON';}catch(error){$('native-preview').title=error.message;}}
if(desktop){
  const canvas=$('native-frame'),context=canvas.getContext('2d',{alpha:false});
  bridge.preview.onFrame(({width,height,pixels,id})=>{
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
    canvas.dataset.frame=String(id);
  });
  const keys=new Set(),masks={ArrowLeft:1,ArrowRight:2,ArrowUp:4,ArrowDown:8,KeyZ:16|256,KeyX:32|512,ShiftLeft:64,ShiftRight:64,Escape:128,Enter:256};
  let input=0;
  function sendInput(){const mask=[...keys].reduce((value,key)=>value|masks[key],0);if(mask!==input){input=mask;bridge.preview.input(mask).catch(error=>notice(`输入失败：${error.message}`));}}
  canvas.addEventListener('pointerdown',()=>canvas.focus());
  for(const type of ['keydown','keyup'])canvas.addEventListener(type,event=>{
    if(!(event.code in masks)||event.ctrlKey||event.metaKey)return;
    event.preventDefault();event.stopPropagation();if(type==='keydown')keys.add(event.code);else keys.delete(event.code);sendInput();
  });
  function releaseInput(){keys.clear();sendInput();}
  canvas.addEventListener('blur',releaseInput);window.addEventListener('blur',releaseInput);
  document.body.classList.add('desktop-mode','native-preview');document.title='TS-STG · 符卡编辑器';
  document.querySelector('.preview-heading strong').textContent='原生引擎预览';document.querySelector('.preview-disclaimer').textContent='完整画面与音效';
  $('native-preview').textContent='重新预览 ↻';$('native-preview').title='使用当前符卡从头构建原生预览';$('import-document').textContent='打开';$('export-document').textContent='另存 JSON';
  $('preview-mode').hidden=false;const hint=document.querySelector('.preview-options');const description=document.createElement('span');description.className='native-hint';description.textContent='点击画面操作 · 方向键移动 / Z 射击 / X Bomb / Shift 低速';hint.append(description);
  setInterval(pollDesktopStatus,150);
}
new ResizeObserver(queuePreviewBounds).observe(document.querySelector('.canvas-stage'));
window.addEventListener('resize',()=>{queuePreviewBounds();renderTimeline();});
async function initialize(){
  if(desktop)try{const draft=await bridge.loadDraft();if(draft.document){card=validateTouhouSpellCard(draft.document);loadNotice='已恢复上次草稿。';}}
  catch(error){loadNotice=`草稿无法恢复，原文件已保留：${error.message}`;}
  renderDocument();queuePreviewBounds();$('save-status').textContent='本地草稿';if(loadNotice)notice(loadNotice,!loadNotice.startsWith('草稿无法'));schedulePreview(0);capabilities();requestAnimationFrame(animate);
}
initialize();
