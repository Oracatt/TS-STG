import type {EditorBridge,DesktopFrame} from './protocol.js';
import type {IpcRendererEvent} from 'electron';
const {contextBridge,ipcRenderer}:typeof import('electron')=require('electron');
// Authored JS is transported as text and runs only in the native script host.
// The renderer never chooses a shell command, executable, file path or IPC name.
contextBridge.exposeInMainWorld('spellCardEditor',{
  desktop:true,
  loadInitialDocument:()=>ipcRenderer.invoke('document:initial'),
  loadDraft:()=>ipcRenderer.invoke('document:load-draft'),
  saveDraft:source=>ipcRenderer.invoke('document:save-draft',source),
  openDocument:()=>ipcRenderer.invoke('document:open'),
  saveDocument:(source,options={})=>ipcRenderer.invoke('document:save',source,options),
  preview:{
    update:revision=>ipcRenderer.invoke('preview:update',revision),
    bounds:bounds=>ipcRenderer.invoke('preview:bounds',bounds),
    control:command=>ipcRenderer.invoke('preview:control',command),
    status:()=>ipcRenderer.invoke('preview:status'),
    input:mask=>ipcRenderer.invoke('preview:input',mask),
    onFrame:callback=>{
const listener=(_event:IpcRendererEvent,frame:DesktopFrame)=>{try{callback(frame);}finally{ipcRenderer.send('preview:frame-ack',frame.id);}};
      ipcRenderer.on('preview:frame',listener);return()=>ipcRenderer.removeListener('preview:frame',listener);
    },
  },
} satisfies EditorBridge);
