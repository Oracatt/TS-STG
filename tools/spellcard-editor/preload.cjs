const {contextBridge,ipcRenderer}=require('electron');
// The renderer can edit data and operate its preview, never choose a command,
// executable, arbitrary filesystem path or IPC channel.
contextBridge.exposeInMainWorld('spellCardEditor',{
  desktop:true,
  loadDraft:()=>ipcRenderer.invoke('document:load-draft'),
  saveDraft:document=>ipcRenderer.invoke('document:save-draft',document),
  openDocument:()=>ipcRenderer.invoke('document:open'),
  saveDocument:(document,options={})=>ipcRenderer.invoke('document:save',document,options),
  preview:{
    update:document=>ipcRenderer.invoke('preview:update',document),
    bounds:bounds=>ipcRenderer.invoke('preview:bounds',bounds),
    control:command=>ipcRenderer.invoke('preview:control',command),
    status:()=>ipcRenderer.invoke('preview:status'),
    input:mask=>ipcRenderer.invoke('preview:input',mask),
    onFrame:callback=>{
      const listener=(_event,frame)=>{try{callback(frame);}finally{ipcRenderer.send('preview:frame-ack',frame.id);}};
      ipcRenderer.on('preview:frame',listener);return()=>ipcRenderer.removeListener('preview:frame',listener);
    },
  },
});
