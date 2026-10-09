import type {BrowserWindow,Dialog} from 'electron';
import type {ChildProcess} from 'node:child_process';
import type {PreviewStatus,SourceDocument} from './protocol.js';

/** JavaScript end-to-end fixture deliberately exercises the emitted editor. */
export function verifyDesktop(options:{
  win:BrowserWindow;
  root:string;
  files:{control:string;bounds:string;status:string};
  readStatus:()=>Promise<PreviewStatus>;
  dialog:Dialog;
  child:()=>ChildProcess|null;
  initialDocument:SourceDocument|null;
}):Promise<void>;
