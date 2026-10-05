import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

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
  await wait(async()=>{const draft=await evaluate('window.spellCardEditor.loadDraft()');return draft.document?.events[1]?.count===18;},'persistent desktop draft');
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
  const saved=path.join(root,path.dirname(files.control),'roundtrip.spellcard.json');
  const originalSave=dialog.showSaveDialog,originalOpen=dialog.showOpenDialog;
  try{
    let savePrompts=0;
    dialog.showSaveDialog=async()=>{savePrompts++;return{canceled:false,filePath:saved};};
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});
    await evaluate(`{const input=document.getElementById('card-name');input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}));}`);
    await wait(async()=>{try{return JSON.parse(await readFile(saved,'utf8')).events[1].count===18;}catch{return false;}},'save while text input focused');
    assert.equal(savePrompts,1);
    await click('new-document');await click('import-document');
    await wait(async()=>JSON.parse(await readFile(path.join(root,files.control),'utf8')).document.events[1].count===18,'open restores saved document');
    const valid=await readFile(saved,'utf8');await writeFile(saved,'{"format":"invalid"}');
    await click('import-document');await wait(async()=>String(await evaluate('document.getElementById("notice-text").textContent')).includes('打开失败'),'invalid import reports error');
    assert.equal(JSON.parse(await readFile(path.join(root,files.control),'utf8')).document.events[1].count,18);
    await writeFile(saved,valid);
    dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});await click('dismiss-notice');await click('import-document');
    await pause(200);assert.equal(await evaluate('document.getElementById("notice").hidden'),true);
  }finally{dialog.showSaveDialog=originalSave;dialog.showOpenDialog=originalOpen;}
  const oldChild=child(),oldFrame=Number(await evaluate('document.getElementById("native-frame").dataset.frame'));
  oldChild.kill();await wait(async()=>!(await readStatus()).running,'owned preview exits without closing editor');
  await click('native-preview');
  await wait(async()=>child()?.pid&&child().pid!==oldChild.pid&&!(await readStatus()).error,'native preview restarts');
  await wait(async()=>Number(await evaluate('document.getElementById("native-frame").dataset.frame'))>oldFrame,'restarted preview supplies fresh pixels');
  await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:true,preview:await readStatus(),resize:after,
    verified:['inspector edits','live native playback','pause','seeded seek','single step','coordinate/native switch','embedded resize','native RGBA canvas pixels','native player input','blur releases input','editor capture','save/open roundtrip with OS picker stub','invalid/cancelled import preserves document','native process exit and restart']},null,2));
}
