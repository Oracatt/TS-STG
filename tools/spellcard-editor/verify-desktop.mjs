import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {generateSpellSource,readVisualDocument} from './source.js';

/** Runs only with --self-test, in an isolated ephemeral renderer partition.
 * Exercises the actual editor controls and live embedded engine, not a mock. */
export async function verifyDesktop({win,root,files,readStatus,dialog,child}){
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const evaluate=code=>win.webContents.executeJavaScript(code);
  const wait=async(predicate,label)=>{const start=Date.now();while(Date.now()-start<20000){if(await predicate())return;await pause(100);}throw Error(`Timed out: ${label}; status ${JSON.stringify(await readStatus())}`);};
  const click=id=>evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  const change=(selector,value,event='change')=>evaluate(`{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(value)};element.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));}`);
  win.show();
  await wait(async()=>(await readStatus()).documentRevision>=1,'initial preview');
  await wait(async()=>JSON.parse(await readFile(path.join(root,files.bounds),'utf8')).visible===true,'visible embedded viewport');
  assert.ok(child()?.pid);assert.equal((await readStatus()).error,null);
  assert.equal(await evaluate('window.spellCardEditor.desktop'),true);
  await evaluate(`document.querySelector('[data-id="bullet-1"]').click()`);
  await change('[data-field="count"]','18');
  await wait(async()=>JSON.parse(await readFile(path.join(root,files.control),'utf8')).document.events[1].count===18,'inspector edits document');
  await wait(async()=>(await readStatus()).documentRevision>=2,'edited preview');
  await wait(async()=>{const draft=await evaluate('window.spellCardEditor.loadDraft()');return readVisualDocument(draft.source)?.events[1]?.count===18;},'persistent desktop JS draft');
  await click('play');await wait(async()=>(await readStatus()).frame>=100,'play native frames');
  await click('play');await wait(async()=>!(await readStatus()).playing,'pause');
  const paused=(await readStatus()).frame;await pause(250);assert.equal((await readStatus()).frame,paused);
  await change('#seek','180','input');
  await wait(async()=>{const s=await readStatus();return s.frame===180&&!s.seeking;},'seek to 180');
  await click('step');await wait(async()=>(await readStatus()).frame===181,'single step');
  await click('preview-mode');
  await wait(async()=>JSON.parse(await readFile(path.join(root,files.bounds),'utf8')).visible===false,'coordinate editor hides native frames');
  await wait(async()=>!(await evaluate('document.body.classList.contains("native-preview")')),'coordinate mode UI');
  await click('preview-mode');
  await wait(async()=>JSON.parse(await readFile(path.join(root,files.bounds),'utf8')).visible===true,'native frames resume');
  await wait(async()=>{const s=await readStatus();return s.frame===181&&!s.seeking;},'mode switch retains frame');
  const before=JSON.parse(await readFile(path.join(root,files.bounds),'utf8'));win.setSize(1200,850);
  await wait(async()=>JSON.parse(await readFile(path.join(root,files.bounds),'utf8')).width!==before.width,'resize native viewport');
  const after=JSON.parse(await readFile(path.join(root,files.bounds),'utf8'));
  assert.ok(after.width>0&&after.height>0&&Math.abs(after.width/after.height-4/3)<.02);
  win.show();win.focus();await pause(500);
  const output=path.join(root,'reports/spellcard-editor');await mkdir(output,{recursive:true});
  await wait(async()=>Number(await evaluate('document.getElementById("native-frame").dataset.frame'))>0,'native frame arrives');
  const colored=await evaluate(`(()=>{const canvas=document.getElementById('native-frame'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let colored=0;
    for(let at=0;at<pixels.length;at+=16){const high=Math.max(pixels[at],pixels[at+1],pixels[at+2]),low=Math.min(pixels[at],pixels[at+1],pixels[at+2]);if(high>110&&high-low>50)colored++;}return colored;})()`);
  assert.ok(colored>1000,`Native canvas must contain game pixels; found ${colored} colorful samples`);
  const capture=await win.webContents.capturePage();assert.equal(capture.isEmpty(),false);
  await writeFile(path.join(output,'desktop.png'),capture.toPNG());
  // Exercise the same focused-canvas input route used by the player, then
  // confirm that the actual native thlib player moved and blur releases input.
  const playerX=(await readStatus()).player.x;
  await click('play');await wait(async()=>(await readStatus()).playing,'resume for input');
  await evaluate(`{const canvas=document.getElementById('native-frame');canvas.focus();canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft',bubbles:true}));}`);
  await wait(async()=>(await readStatus()).player.x<playerX-8,'native player receives editor input');
  await evaluate(`document.getElementById('native-frame').blur()`);
  await wait(async()=>JSON.parse(await readFile(path.join(root,files.control),'utf8')).input===0,'blur releases held input');
  await click('play');await wait(async()=>!(await readStatus()).playing,'pause after input');
  assert.equal(await evaluate('document.getElementById("notice").hidden'),true,'No hidden layout or preview error may pass the desktop check');
  // Only the OS file picker is replaced; use actual UI actions, preload IPC,
  // validation and filesystem persistence for save/open/cancel/error paths.
  const saved=path.join(root,path.dirname(files.control),'roundtrip.spell.js');
  const originalSave=dialog.showSaveDialog,originalOpen=dialog.showOpenDialog;
  try{
    let savePrompts=0;
    dialog.showSaveDialog=async()=>{savePrompts++;return{canceled:false,filePath:saved};};
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});
    await evaluate(`{const input=document.getElementById('card-name');input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}));}`);
    await wait(async()=>{try{return readVisualDocument(await readFile(saved,'utf8')).events[1].count===18;}catch{return false;}},'save JS while text input focused');
    assert.equal(savePrompts,1);
    await click('new-document');await click('import-document');
    await wait(async()=>JSON.parse(await readFile(path.join(root,files.control),'utf8')).document.events[1].count===18,'open restores saved document');
    const invalid=path.join(root,path.dirname(files.control),'invalid-legacy.json');await writeFile(invalid,'{"format":"invalid"}');
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[invalid]});
    await click('import-document');await wait(async()=>String(await evaluate('document.getElementById("notice-text").textContent')).includes('打开失败'),'invalid import reports error');
    assert.equal(JSON.parse(await readFile(path.join(root,files.control),'utf8')).document.events[1].count,18);
    dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});await click('dismiss-notice');await click('import-document');
    await pause(200);assert.equal(await evaluate('document.getElementById("notice").hidden'),true);
  }finally{dialog.showSaveDialog=originalSave;dialog.showOpenDialog=originalOpen;}
  await click('source-tab');
  const originalSource=await evaluate('document.getElementById("source-code").value');
  const empty={...readVisualDocument(originalSource),name:'JS Live Test',events:[]};
  const custom=generateSpellSource(empty).replace('timeline.update();',`if (frame % 12 === 0) {
        context.boss.x = 60;
        context.bullets.emit({x:60,y:96,type:0,color:6,pattern:3,count:12,rows:1,speed:2,angle:frame / 60});
      }
      timeline.update();`);
  let previous=(await readStatus()).documentRevision;
  await change('#source-code',custom,'input');
  await wait(async()=>{const s=await readStatus();return s.documentRevision>previous&&!s.loading&&s.document?.name==='JS Live Test';},'handwritten JS loads');
  await click('play');
  await wait(async()=>{const s=await readStatus();return s.documentRevision>previous&&!s.seeking&&s.document?.name==='JS Live Test'&&s.bullets>0;},'handwritten JS emits actual native bullets');
  assert.equal((await readStatus()).document.events.length,0,'the tested bullets come from handwritten JS, not visual events');
  // A visual edit must retain the user's update body byte for byte.
  await change('#card-name','JS Preserved');
  await wait(async()=>String(await evaluate('document.getElementById("source-code").value')).includes('JS Preserved'),'visual edit regenerates JS metadata');
  assert.ok((await evaluate('document.getElementById("source-code").value')).includes('context.boss.x = 60;'));
  await wait(async()=>{const s=await readStatus();return s.document?.name==='JS Preserved'&&!s.loading&&!s.seeking;},'visual and manual JS reload together');
  const goodSource=await evaluate('document.getElementById("source-code").value'),goodRevision=(await readStatus()).documentRevision;
  const broken='export const spellCard = ;';
  await change('#source-code',broken,'input');
  await wait(async()=>{const s=await readStatus();return s.requestedDocumentRevision>goodRevision&&!!s.error;},'native syntax error returned');
  assert.equal((await readStatus()).documentRevision,goodRevision,'syntax errors keep the last working native scene');
  await wait(async()=>String(await evaluate('document.getElementById("source-error").textContent')).length>0,'inline source diagnostic');
  assert.equal(await evaluate('document.getElementById("source-code").value'),broken);
  await wait(async()=>(await evaluate('window.spellCardEditor.loadDraft()')).source===broken,'invalid JS draft is preserved');
  await change('#source-code',goodSource,'input');
  await wait(async()=>{const s=await readStatus();return s.documentRevision>goodRevision&&!s.loading&&!s.error&&!s.seeking;},'editing source fixes syntax error without restarting editor');
  // Expressions inside metadata deliberately opt out of visual regeneration.
  previous=(await readStatus()).documentRevision;
  const pure=goodSource.replace('// @spellcard-editor:begin','// plain JS').replace('// @spellcard-editor:end','// end plain JS');
  await click('auto-preview');
  await change('#source-code',pure,'input');
  await pause(600);assert.equal((await readStatus()).documentRevision,previous,'automatic preview can be suspended while editing');
  await evaluate(`document.getElementById('source-code').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}))`);
  await wait(async()=>{const s=await readStatus();return s.documentRevision>previous&&!s.loading&&!s.seeking&&!s.error;},'source-only ES module runs');
  assert.equal(await evaluate('document.getElementById("add-event").disabled'),true,'source-only module cannot be overwritten by visual edits');
  await change('#seek','180','input');await wait(async()=>{const s=await readStatus();return s.frame===180&&!s.seeking&&!s.playing;},'seek handwritten logic to a stable inspection frame');
  await evaluate(`{const input=document.getElementById('source-code');input.focus();const at=input.value.indexOf('    update()');input.setSelectionRange(at,at);input.scrollTop=32*parseFloat(getComputedStyle(input).lineHeight);}`);
  await pause(200);
  await writeFile(path.join(output,'desktop-js.png'),(await win.webContents.capturePage()).toPNG());
  const oldChild=child(),oldFrame=Number(await evaluate('document.getElementById("native-frame").dataset.frame'));
  oldChild.kill();await wait(async()=>!(await readStatus()).running,'owned preview exits without closing editor');
  await click('native-preview');
  await wait(async()=>child()?.pid&&child().pid!==oldChild.pid&&!(await readStatus()).error,'native preview restarts');
  await wait(async()=>Number(await evaluate('document.getElementById("native-frame").dataset.frame'))>oldFrame,'restarted preview supplies fresh pixels');
  await wait(async()=>{const s=await readStatus();return s.documentRevision===s.requestedDocumentRevision&&!s.loading&&!s.seeking&&!s.error&&s.frame===180&&s.bullets>0;},'restarted preview restores the authored module and inspection frame');
  await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:true,preview:await readStatus(),resize:after,
    verified:['visual editing generates JS','live native playback','pause','seeded seek','single step','coordinate/native switch','embedded resize','native RGBA canvas pixels','native player input','blur releases input','editor capture','JS save/open roundtrip with OS picker stub','invalid/cancelled import preserves document','handwritten JS creates native bullets','visual edits preserve manual functions','syntax error retains scene and source','source-only ES module','automatic preview toggle and manual Ctrl+Enter','native process exit and authored scene restart']},null,2));
}
