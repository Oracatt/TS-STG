import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import path from 'node:path';

/** Isolated --self-test window: actual CodeMirror, IPC, files and native engine.
 * Only the OS file picker is replaced, to choose a disposable test file. */
export async function verifyDesktop({win,root,files,readStatus,dialog,child,initialDocument}){
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const evaluate=async code=>{try{return await win.webContents.executeJavaScript(code);}catch(error){throw new Error(`Renderer check failed: ${code.slice(0,180)}`,{cause:error});}};
  const wait=async(predicate,label)=>{const start=Date.now();while(Date.now()-start<20000){if(await predicate())return;await pause(100);}throw Error(`Timed out: ${label}; status ${JSON.stringify(await readStatus())}`);};
  const click=id=>evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  const change=(selector,value,event='change')=>evaluate(`{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(value)};element.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));}`);
  const text=()=>evaluate('globalThis.__checkCodeView.state.doc.toString()');
  const setText=source=>evaluate(`globalThis.__checkCodeView.dispatch({changes:{from:0,to:globalThis.__checkCodeView.state.doc.length,insert:${JSON.stringify(source)}},selection:{anchor:0}})`);
  const shortcut=(key,code)=>evaluate(`{const view=globalThis.__checkCodeView;view.focus();view.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},ctrlKey:true,bubbles:true,cancelable:true}));}`);
  const loaded=async()=>{const s=await readStatus();return s.documentRevision>=1&&s.documentRevision===s.requestedDocumentRevision&&!s.loading&&!s.seeking&&!s.error;};
  const control=()=>readFile(path.join(root,files.control),'utf8').then(JSON.parse);
  async function interruptControl(check){
    // Corrupt only this disposable self-test session's transport, never user files.
    const file=path.join(root,files.control),saved=await readFile(file,'utf8');
    try{
      await writeFile(file,'{');
      await wait(async()=>{const s=await readStatus();return s.waitingForControl&&!!s.transportWarning;},'recoverable control interruption');
      await check();
    }finally{await writeFile(file,saved);}
    await wait(async()=>{const s=await readStatus();return !s.waitingForControl&&!s.transportWarning;},'control communication recovers');
  }
  win.show();
  await wait(async()=>evaluate('!!document.querySelector(".cm-editor")'),'CodeMirror is ready');
  await evaluate(`(async()=>{globalThis.__checkCodeView=(await import('/editor/dist/code-editor.bundle.js')).getEditorView(document.querySelector('.cm-editor'));})()`);
  assert.equal(await evaluate('!!globalThis.__checkCodeView'),true);
  assert.equal(await evaluate('!!document.querySelector("#event-list,#inspector,#timeline,#preview-mode,#visual-tab")'),false,'event authoring must be removed');
  assert.ok(await evaluate('document.querySelectorAll(".cm-lineNumbers .cm-gutterElement").length')>1,'code has visible line numbers');
  await wait(loaded,'initial module preview');
  await wait(async()=>JSON.parse(await readFile(path.join(root,files.bounds),'utf8')).visible,'embedded viewport');
  assert.ok(child()?.pid);assert.deepEqual(Object.keys((await readStatus()).document).sort(),['boss','duration','hp','id','name','seed']);
  assert.equal((await readStatus()).invincible,false,'desktop starts in real play');
  assert.equal(await evaluate('document.getElementById("invincible").checked'),false);
  assert.equal(await evaluate('document.getElementById("seek").disabled'),true,'real play does not replay zero-input seeks');
  assert.equal(await evaluate('window.spellCardEditor.desktop'),true);
  const initial=await text();
  if(initialDocument){
    assert.equal(initial,initialDocument.source,'startup file source is loaded verbatim');
    assert.equal(await evaluate('document.getElementById("file-name").textContent'),path.basename(initialDocument.path));
    assert.equal(await evaluate('document.getElementById("file-dirty").hidden'),true,'startup file starts saved');
    assert.equal(await readFile(initialDocument.path,'utf8'),initial,'opening never writes the input file');
    assert.deepEqual(await evaluate('window.spellCardEditor.loadDraft()'),{},'startup file does not replace the isolated draft');
  }else assert.ok(initial.includes('function fireRing('));
  assert.ok(!initial.includes('@spellcard-editor:'));

  // Only this self-test session's disposable draft directory is touched.
  // A historical JSON draft is ignored, and old JS is read without migration.
  const draftDirectory=path.dirname(path.join(root,'userdata',files.status));
  const draftFile=path.join(draftDirectory,'draft.spell.js'),oldDraft=path.join(draftDirectory,'draft.json');
  await unlink(draftFile).catch(error=>{if(error.code!=='ENOENT')throw error;});
  const oldData='{"format":"ts-stg-spellcard","version":1,"events":[]}';
  await writeFile(oldDraft,oldData);
  assert.deepEqual(await evaluate('window.spellCardEditor.loadDraft()'),{});
  assert.equal(await readFile(oldDraft,'utf8'),oldData,'old JSON files are not rewritten or migrated');
  const oldSource=`// Existing user draft; keep these bytes unchanged.\r\nexport const spellCard = ${oldData};\r\n`;
  await writeFile(draftFile,oldSource);
  assert.equal((await evaluate('window.spellCardEditor.loadDraft()')).source,oldSource);
  assert.equal(await readFile(draftFile,'utf8'),oldSource,'existing JS drafts remain raw source');
  await unlink(oldDraft);

  // Test ordinary JS expressions and closures, with no visual event data.
  const custom=`// Ordinary JavaScript; no managed regions or editor event model.
const title = 'JS Preview';
export const spellCard = {
  id: 'desktop-js', name: title,
  duration: 60 * 30, hp: 3000, seed: 123, boss: {x: 60, y: 96},
};

export function createSpell(context) {
  let frame = 0, alive = true;
  function ring(angle) {
    context.bullets.emit({
      x: context.boss.x, y: context.boss.y,
      type: 0, color: 6, pattern: 3,
      count: 12, rows: 1, speed: 2, angle,
    });
  }
  return {
    get frame() { return frame; },
    get alive() { return alive; },
    update() {
      if (!alive) return;
      if (frame % 12 === 0) ring(frame / 60);
      if (++frame >= spellCard.duration) alive = false;
    },
    stop() { alive = false; },
  };
}
`;
  let revision=(await readStatus()).documentRevision;
  await setText(custom);
  await wait(async()=>await loaded()&&(await readStatus()).documentRevision>revision&&(await readStatus()).document.name==='JS Preview','automatic code reload');
  await wait(async()=>(await evaluate('window.spellCardEditor.loadDraft()')).source===custom,'persistent JS draft');
  assert.equal(await text(),custom,'metadata evaluation must not rewrite source');
  await click('fold-source');assert.ok(await evaluate('document.querySelectorAll(".cm-foldPlaceholder").length')>0);
  await click('fold-source');assert.equal(await evaluate('document.querySelectorAll(".cm-foldPlaceholder").length'),0);

  // A second construction fails deliberately: recovery must keep the same JS
  // closure, not merely restart the process or rebuild to an equivalent frame.
  const transportSource=custom.replace('export function createSpell(context) {',
    "let constructions = 0;\nexport function createSpell(context) {\n  if (++constructions > 1) throw Error('Transport recovery rebuilt the runner');");
  revision=(await readStatus()).documentRevision;await setText(transportSource);
  await wait(async()=>await loaded()&&(await readStatus()).documentRevision>revision,'transport test source loads');
  await click('play');await wait(async()=>(await readStatus()).frame>=24,'transport test is playing');
  const transportProcess=child().pid,transportRevision=(await readStatus()).documentRevision;
  let frozenFrame;
  await interruptControl(async()=>{
    const frozen=await readStatus();frozenFrame=frozen.frame;
    assert.equal(frozen.error,null);assert.equal(frozen.playing,true,'communication failure preserves play intent');
    await wait(async()=>String(await evaluate('document.getElementById("preview-state").textContent')).includes('通信暂时中断'),'separate communication message');
    await pause(250);assert.equal((await readStatus()).frame,frozenFrame,'simulation freezes while control is unreadable');
    assert.equal(await evaluate('document.getElementById("source-errors").hidden'),true);
    assert.equal(await evaluate('!!document.querySelector(".cm-lintRange-error")'),false);
    assert.equal(await text(),transportSource);
  });
  await wait(async()=>{const s=await readStatus();return s.playing&&!s.error&&s.frame>frozenFrame+12;},'same runner resumes from the frozen frame');
  assert.equal(child().pid,transportProcess);assert.equal((await readStatus()).documentRevision,transportRevision);
  await wait(async()=>!String(await evaluate('document.getElementById("preview-state").textContent')).includes('通信暂时中断'),'communication message clears automatically');
  await click('play');await wait(async()=>!(await readStatus()).playing,'pause recovered runner');
  await setText(custom);await wait(async()=>await loaded()&&(await readStatus()).documentRevision>transportRevision,'restore ordinary code test');

  await click('play');await wait(async()=>(await readStatus()).frame>=100,'play native frames');
  await click('play');await wait(async()=>!(await readStatus()).playing,'pause native frames');
  const paused=(await readStatus()).frame;await pause(250);assert.equal((await readStatus()).frame,paused);
  await click('invincible');
  await wait(async()=>{const s=await readStatus();return s.invincible&&s.frame===0&&!s.playing;},'observation mode rebuilds at frame zero');
  assert.equal(await evaluate('document.getElementById("seek").disabled'),false);
  await change('#seek','180','input');
  await wait(async()=>{const s=await readStatus();return s.frame===180&&!s.seeking;},'seek to 180');
  assert.ok((await readStatus()).bullets>0,'handwritten JS emitted actual native bullets');
  await click('step');await wait(async()=>(await readStatus()).frame===181,'single step');
  await change('#seek','600','input');await click('play');
  await wait(async()=>{const s=await readStatus();return s.playing&&!s.seeking&&s.frame>=600;},'play preserves a preceding queued seek');
  await click('play');await wait(async()=>!(await readStatus()).playing,'pause after queued seek and play');
  await change('#seek','181','input');await wait(async()=>{const s=await readStatus();return s.frame===181&&!s.seeking;},'restore code test frame');
  await click('invincible');
  await wait(async()=>{const s=await readStatus();return !s.invincible&&s.frame===0&&!s.playing;},'return to real play with fresh player state');
  assert.equal(await evaluate('document.getElementById("seek").disabled'),true);
  await click('play');await wait(async()=>(await readStatus()).frame>=15,'real play after mode switch');
  await click('play');await wait(async()=>!(await readStatus()).playing,'pause real play');
  revision=(await readStatus()).documentRevision;await click('native-preview');
  await wait(async()=>await loaded()&&(await readStatus()).documentRevision>revision&&(await readStatus()).frame===0,'real reload starts at zero');
  await click('invincible');await wait(async()=>{const s=await readStatus();return s.invincible&&s.frame===0;},'observation mode for code inspection');
  await change('#seek','181','input');await wait(async()=>{const s=await readStatus();return s.frame===181&&!s.seeking;},'restore inspection after mode checks');

  // CodeMirror's own find/replace and history, not a stand-in text field.
  await shortcut('h','KeyH');
  await wait(async()=>evaluate('!!document.querySelector(".cm-search input[name=search]")'),'search and replace panel');
  await change('.cm-search input[name=search]','JS Preview');
  await change('.cm-search input[name=replace]','JS Search');
  await evaluate('document.querySelector(".cm-search button[name=replaceAll]").click()');
  await wait(async()=>(await text()).includes("const title = 'JS Search'"),'replace edits source');
  await evaluate('document.querySelector(".cm-search button[name=close]").click()');
  await shortcut('z','KeyZ');await wait(async()=>(await text())===custom,'native code undo');
  await shortcut('y','KeyY');await wait(async()=>(await text()).includes("const title = 'JS Search'"),'native code redo');
  await wait(async()=>await loaded()&&(await readStatus()).document.name==='JS Search','search edit preview');
  const goodSource=await text();

  // Actual save/open persistence, including raw code that uses expressions.
  const saved=path.join(root,path.dirname(files.control),'roundtrip.spell.js');
  const originalSave=dialog.showSaveDialog,originalOpen=dialog.showOpenDialog;
  try{
    let savePrompts=0;
    dialog.showSaveDialog=async()=>{savePrompts++;return{canceled:false,filePath:saved};};
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});
    if(initialDocument)await click('export-document');else await shortcut('s','KeyS');
    await wait(async()=>{try{return await readFile(saved,'utf8')===goodSource;}catch{return false;}},'save exact JS while editing');
    assert.equal(savePrompts,1);
    await click('new-document');await wait(async()=>(await text())!==goodSource,'new code document');
    await click('import-document');await wait(async()=>(await text())===goodSource,'open exact saved source');
    await wait(async()=>await loaded()&&(await readStatus()).document.name==='JS Search','opened source runs');
    const moduleFile=path.join(root,path.dirname(files.control),'roundtrip.spell.mjs');await writeFile(moduleFile,goodSource);
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[moduleFile]});await click('import-document');
    await wait(async()=>await evaluate('document.getElementById("file-name").textContent')==='roundtrip.spell.mjs'&&await loaded(),'open an mjs source module');
    assert.equal(await text(),goodSource);
    const openedName=await evaluate('document.getElementById("file-name").textContent');
    const invalid=path.join(root,path.dirname(files.control),'unsupported.json');await writeFile(invalid,'{}');
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[invalid]});await click('import-document');
    await wait(async()=>String(await evaluate('document.getElementById("notice-text").textContent')).includes('只支持 JavaScript'),'unsupported file type is rejected');
    assert.equal(await text(),goodSource);
    assert.equal(await evaluate('document.getElementById("file-name").textContent'),openedName,'rejected file cannot change the open path');
    dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});await click('dismiss-notice');await click('import-document');
    await pause(200);assert.equal(await text(),goodSource);
    // A delayed save belongs to its original document even after New was used.
    let releaseSave;const late=path.join(root,path.dirname(files.control),'late-save.spell.js');
    dialog.showSaveDialog=()=>new Promise(resolve=>{releaseSave=resolve;});
    await click('export-document');await wait(async()=>!!releaseSave,'delayed save is pending');
    await click('new-document');await wait(async()=>(await text())!==goodSource,'new file while old save is pending');
    releaseSave({canceled:false,filePath:late});
    await wait(async()=>{try{return await readFile(late,'utf8')===goodSource;}catch{return false;}},'old source saved to its own file');
    await pause(200);assert.equal(await evaluate('document.getElementById("file-name").textContent'),'untitled.spell.js','late save cannot claim the new document');
    assert.equal(await evaluate('document.getElementById("file-dirty").hidden'),false);
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});await click('import-document');
    await wait(async()=>(await text())===goodSource&&await loaded()&&(await readStatus()).document.name==='JS Search','return to saved test source');
  }finally{dialog.showSaveDialog=originalSave;dialog.showOpenDialog=originalOpen;}

  // Diagnostics have real native file/line positions and never replace text.
  const goodRevision=(await readStatus()).documentRevision;
  const broken='// incomplete JS\nconst unfinished = 1;\nexport const spellCard = ;';
  await setText(broken);
  await wait(async()=>{const s=await readStatus();return s.requestedDocumentRevision>goodRevision&&!!s.error;},'native syntax error');
  assert.equal((await readStatus()).documentRevision,goodRevision,'keep the last working native scene');
  await wait(async()=>String(await evaluate('document.getElementById("source-error").textContent')).includes('.js:3'),'native source position');
  await wait(async()=>evaluate('!!document.querySelector(".cm-lintRange-error")'),'diagnostic underlined in CodeMirror');
  const diagnostic=await evaluate('document.getElementById("source-error").textContent');
  await interruptControl(async()=>{
    assert.equal(await evaluate('document.getElementById("source-error").textContent'),diagnostic);
    assert.equal(await evaluate('!!document.querySelector(".cm-lintRange-error")'),true,'communication warnings must not clear source diagnostics');
    assert.equal(await evaluate('document.getElementById("preview-state").textContent'),'运行错误');
  });
  assert.equal(await evaluate('document.getElementById("source-error").textContent'),diagnostic,'communication recovery does not acknowledge a failed import');
  await click('error-goto');
  assert.equal(await evaluate('globalThis.__checkCodeView.state.doc.lineAt(globalThis.__checkCodeView.state.selection.main.head).number'),3);
  assert.equal(await text(),broken);
  await wait(async()=>(await evaluate('window.spellCardEditor.loadDraft()')).source===broken,'invalid JS draft retained');
  await setText(goodSource);await wait(async()=>await loaded()&&(await readStatus()).documentRevision>goodRevision,'correction recovers');

  // Automatic mode can be suspended; Ctrl+Enter still applies the current file.
  revision=(await readStatus()).documentRevision;
  await click('auto-preview');
  const manual=goodSource.replace('JS Search','JS Manual');await setText(manual);
  await pause(650);assert.equal((await readStatus()).documentRevision,revision);
  await shortcut('Enter','Enter');
  await wait(async()=>await loaded()&&(await readStatus()).documentRevision>revision&&(await readStatus()).document.name==='JS Manual','manual Ctrl+Enter');
  await pause(200);assert.equal((await readStatus()).documentRevision,revision+1,'one shortcut submits exactly one source revision');
  await change('#seek','180','input');await wait(async()=>{const s=await readStatus();return s.frame===180&&!s.seeking&&!s.playing;},'stable code inspection frame');
  assert.equal(await text(),manual,'all preview controls leave the source untouched');

  // Focused native input and resize continue to use the full game renderer.
  const playerX=(await readStatus()).player.x;
  await click('play');await wait(async()=>(await readStatus()).playing,'resume for input');
  await evaluate(`{const canvas=document.getElementById('native-frame');canvas.focus();canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft',bubbles:true}));}`);
  await wait(async()=>(await readStatus()).player.x<playerX-8,'native player input');
  await evaluate(`document.getElementById('native-frame').dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowLeft',ctrlKey:true,bubbles:true}))`);
  await wait(async()=>(await control()).input===0,'Ctrl during key release cannot latch movement');
  await evaluate(`document.getElementById('native-frame').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',bubbles:true}))`);
  await wait(async()=>((await control()).input&16)!==0,'held fire reaches native engine');
  await evaluate('document.getElementById("native-frame").blur()');
  await wait(async()=>(await control()).input===0,'blur releases held input');
  await click('play');await wait(async()=>!(await readStatus()).playing,'pause after input');
  assert.equal(await evaluate(`(()=>{const button=document.getElementById('save-source');button.focus();const event=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true});button.dispatchEvent(event);return event.defaultPrevented;})()`),false,'Space must keep focused button behavior');
  await change('#seek','180','input');await wait(async()=>{const s=await readStatus();return s.frame===180&&!s.seeking;},'restore inspection frame');
  const before=JSON.parse(await readFile(path.join(root,files.bounds),'utf8'));win.setSize(1320,880);
  await wait(async()=>JSON.parse(await readFile(path.join(root,files.bounds),'utf8')).width!==before.width,'resize native viewport');
  const after=JSON.parse(await readFile(path.join(root,files.bounds),'utf8'));
  assert.ok(after.width>0&&after.height>0&&Math.abs(after.width/after.height-4/3)<.02);
  const oldSplit=await evaluate('document.getElementById("pane-divider").getAttribute("aria-valuenow")');
  await evaluate(`document.getElementById('pane-divider').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
  assert.notEqual(await evaluate('document.getElementById("pane-divider").getAttribute("aria-valuenow")'),oldSplit);
  await evaluate(`document.getElementById('pane-divider').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);
  const output=path.join(root,'reports/spellcard-editor');await mkdir(output,{recursive:true});
  await wait(async()=>Number(await evaluate('document.getElementById("native-frame").dataset.frame'))>0,'native pixels arrive');
  const colored=await evaluate(`(()=>{const canvas=document.getElementById('native-frame'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;
    for(let at=0;at<pixels.length;at+=16){const high=Math.max(pixels[at],pixels[at+1],pixels[at+2]),low=Math.min(pixels[at],pixels[at+1],pixels[at+2]);if(high>110&&high-low>50)count++;}return count;})()`);
  assert.ok(colored>1000,`Native canvas should contain game pixels: ${colored}`);
  await evaluate('globalThis.__checkCodeView.focus()');win.focus();await pause(250);
  const capture=await win.webContents.capturePage();assert.equal(capture.isEmpty(),false);
  await writeFile(path.join(output,'desktop-js.png'),capture.toPNG());
  const oldChild=child(),oldFrame=Number(await evaluate('document.getElementById("native-frame").dataset.frame'));
  oldChild.kill();await wait(async()=>!(await readStatus()).running,'owned preview exits');
  await click('native-preview');
  await wait(async()=>child()?.pid&&child().pid!==oldChild.pid&&await loaded()&&(await readStatus()).frame===180&&(await readStatus()).bullets>0,'restart restores authored scene');
  await wait(async()=>Number(await evaluate('document.getElementById("native-frame").dataset.frame'))>oldFrame,'restarted native pixels');
  await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:true,startupPath:initialDocument?.path??null,preview:await readStatus(),resize:after,
    verified:['source-only UI without event authoring','six-field rehearsal metadata','CodeMirror syntax and line numbers','JS closures and metadata expressions','automatic native reload','old JS draft preserved without JSON migration','temporary control loss freezes and resumes the same runner','communication warning leaves source diagnostics intact','pause','seeded seek','single step','find/replace','undo/redo and code folding','JS save/open roundtrip and mjs import','unsupported/cancelled import preserves code','late save preserves new document ownership','native diagnostics and goto line','syntax error retains scene and draft','automatic preview toggle and single Ctrl+Enter dispatch','focused native input and modified key release','blur releases keys','Space preserves button keyboard behavior','adjustable split and embedded resize','native RGBA pixels','source untouched by preview controls','native process exit and authored scene restart']},null,2));
}
