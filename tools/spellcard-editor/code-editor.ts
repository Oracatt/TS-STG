import {basicSetup} from 'codemirror';
import {EditorView,keymap} from '@codemirror/view';
import {EditorState,Prec,Transaction} from '@codemirror/state';
import {javascript} from '@codemirror/lang-javascript';
import {indentWithTab,undo,redo,undoDepth,redoDepth} from '@codemirror/commands';
import {openSearchPanel,gotoLine,search} from '@codemirror/search';
import {setDiagnostics,lintGutter} from '@codemirror/lint';
import {foldAll,unfoldAll,indentUnit,syntaxHighlighting,HighlightStyle} from '@codemirror/language';
import {tags} from '@lezer/highlight';

export interface EditorPosition {line: number; column: number; lines: number; undo: number; redo: number;}
export interface CodeEditorOptions {
  parent: HTMLElement; source: string;
  onChange: (source: string) => void; onUpdate: (position: EditorPosition) => void;
  onRun: () => void; onSave: (saveAs: boolean) => void;
}
export interface CodeDiagnostic {line: number; column?: number; message: string;}

const theme=EditorView.theme({
  '&':{height:'100%',color:'#d6dce5',backgroundColor:'#171b22',fontSize:'13px'},
  '.cm-scroller':{fontFamily:'"Cascadia Code",Consolas,"Microsoft YaHei",monospace',lineHeight:'1.75'},
  '.cm-content':{padding:'16px 0',caretColor:'#aecbff'},
  '.cm-line':{padding:'0 16px 0 9px'},
  '.cm-gutters':{backgroundColor:'#171b22',color:'#66717f',border:'none',minWidth:'53px'},
  '.cm-lineNumbers .cm-gutterElement':{padding:'0 10px 0 12px'},
  '.cm-foldGutter .cm-gutterElement':{padding:'0 5px'},
  '.cm-activeLine,.cm-activeLineGutter':{backgroundColor:'#ffffff05'},
  '.cm-cursor,.cm-dropCursor':{borderLeftColor:'#b9d2fc'},
  '&.cm-focused':{outline:'none'},
  '&.cm-focused .cm-selectionBackground,.cm-selectionBackground,::selection':{backgroundColor:'#35506c!important'},
  '.cm-selectionMatch':{backgroundColor:'#5f86b12b'},
  '.cm-searchMatch':{backgroundColor:'#ab8a3e55',outline:'1px solid #ab8a3e88'},
  '.cm-searchMatch.cm-searchMatch-selected':{backgroundColor:'#aa8d4266'},
  '.cm-panels':{backgroundColor:'#222933',color:'#d6dce5'},
  '.cm-panel.cm-search':{padding:'10px 13px',fontFamily:'"Segoe UI","Microsoft YaHei",sans-serif'},
  '.cm-textfield':{backgroundColor:'#171b22',border:'1px solid #455163',borderRadius:'3px',color:'#d6dce5'},
  '.cm-button':{backgroundImage:'none',backgroundColor:'#303a48',border:'1px solid #485568',borderRadius:'3px',color:'#d6dce5'},
  '.cm-tooltip':{backgroundColor:'#242c38',border:'1px solid #455163',color:'#d6dce5'},
  '.cm-tooltip-autocomplete > ul > li[aria-selected]':{backgroundColor:'#3d5474'},
  '.cm-foldPlaceholder':{backgroundColor:'#2c3542',border:'1px solid #455163',color:'#a5b7d0'},
  '.cm-diagnostic-error':{borderLeftColor:'#f18f99'},
},{dark:true});
const highlighting=HighlightStyle.define([
  {tag:tags.keyword,color:'#baabd8'},{tag:[tags.string,tags.special(tags.string)],color:'#a9c9a6'},
  {tag:[tags.number,tags.bool,tags.null],color:'#d9b882'},{tag:tags.comment,color:'#788895',fontStyle:'italic'},
  {tag:[tags.function(tags.variableName),tags.function(tags.propertyName)],color:'#a7c6e8'},
  {tag:[tags.propertyName,tags.variableName],color:'#d6dce5'},{tag:tags.typeName,color:'#83c0bc'},
  {tag:tags.operator,color:'#b5c0cf'},{tag:tags.punctuation,color:'#a0a9b7'},
]);
const phrases={Find:'查找',Replace:'替换',next:'下一个',previous:'上一个',all:'全部',replace:'替换','replace all':'全部替换',
  'match case':'区分大小写',regexp:'正则', 'by word':'全词',close:'关闭','Go to line':'跳转到行',go:'跳转'};

// Standard integration hook for editor commands and desktop automation.
export const getEditorView=(node: HTMLElement)=>EditorView.findFromDOM(node);

/** CodeMirror parses and edits text only. Authored modules execute in TS-STG. */
export function createCodeEditor({parent,source,onChange,onUpdate,onRun,onSave}: CodeEditorOptions){
  const view=new EditorView({parent,doc:source,extensions:[basicSetup,javascript({typescript:true}),theme,syntaxHighlighting(highlighting),
    indentUnit.of('  '),EditorState.tabSize.of(2),EditorState.phrases.of(phrases),search({top:true}),lintGutter(),
    Prec.highest(keymap.of([{key:'Mod-Enter',run:()=>{onRun();return true;}},
      {key:'Mod-s',run:()=>{onSave(false);return true;}},{key:'Mod-Shift-s',run:()=>{onSave(true);return true;}},
      {key:'Mod-h',run:openSearchPanel},indentWithTab])),
    EditorView.contentAttributes.of({'aria-label':'TypeScript / JavaScript 符卡源码',spellcheck:'false'}),
    EditorView.updateListener.of(update=>{
      if(update.docChanged)onChange(update.state.doc.toString());
      if(update.docChanged||update.selectionSet){const selection=update.state.selection.main,line=update.state.doc.lineAt(selection.head);
        onUpdate({line:line.number,column:selection.head-line.from+1,lines:update.state.doc.lines,undo:undoDepth(update.state),redo:redoDepth(update.state)});}
    }),
  ]});
  function position(line: number,column=1){const row=view.state.doc.line(Math.max(1,Math.min(view.state.doc.lines,Math.round(line))));return Math.min(row.to,row.from+Math.max(0,column-1));}
  return{
    getSource:()=>view.state.doc.toString(),
    setSource(source: string,{history=true}={}){if(typeof source!=='string')throw new TypeError('Expected TypeScript or JavaScript text');
      view.dispatch({changes:{from:0,to:view.state.doc.length,insert:source},selection:{anchor:0},annotations:Transaction.addToHistory.of(history)});},
    focus:()=>view.focus(),undo:()=>undo(view),redo:()=>redo(view),search:()=>openSearchPanel(view),gotoLine:()=>gotoLine(view),
    foldAll:()=>foldAll(view),unfoldAll:()=>unfoldAll(view),
    goto(line: number,column=1){const at=position(line,column);view.dispatch({selection:{anchor:at},effects:EditorView.scrollIntoView(at,{y:'center'})});view.focus();},
    diagnostics(items: CodeDiagnostic[]){view.dispatch(setDiagnostics(view.state,items.map(item=>{const from=position(item.line,item.column);return{from,to:Math.min(view.state.doc.length,from+1),severity:'error',message:item.message,source:'TS-STG'};})));},
    selection:()=>({from:view.state.selection.main.from,to:view.state.selection.main.to,line:view.state.doc.lineAt(view.state.selection.main.head).number}),
    destroy:()=>view.destroy(),
  };
}
