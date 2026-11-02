import type {NativeHost,ResourceKind} from './native-host.js';

export interface AssetRequest {kind:ResourceKind;path:string;width?:number;height?:number;}
interface Entry {asset:AssetRequest;handle?:number;ticket?:number;references:number;}
const key=(a:AssetRequest)=>JSON.stringify([a.kind,a.path.replace(/\\/g,'/'),a.width??0,a.height??0]);

/** Resource lifetime and a CPU-worker upload queue, independent of game clocks.
 * Use the decorated host for all consumers. preload() pins cache entries until
 * retainOnly()/dispose(); normal load/unload calls retain/release their handles.
 * Sounds share decoded samples, but each acquisition owns a playback voice.
 * Mutable textures/render targets are deliberately never cached here. */
export class AssetLoader {
  readonly host:NativeHost;
  private entries=new Map<string,Entry>();
  private handles=new Map<number,Entry>();
  private soundVoices=new Map<number,Entry>();
  private active:AssetLoadBatch|null=null;
  private disposed=false;
  synchronousMisses=0;
  constructor(private native:NativeHost){
    this.host=Object.create(native) as NativeHost;
    for(const kind of ['texture','model','sound','music'] as const){
      const suffix=kind[0].toUpperCase()+kind.slice(1);
      Object.defineProperty(this.host,`load${suffix}`,{value:(path:string,width?:number,height?:number)=>this.acquire({kind,path,width,height})});
      Object.defineProperty(this.host,`unload${suffix}`,{value:(handle:number)=>this.release(kind,handle)});
    }
  }
  private check(){if(this.disposed)throw new Error('Asset loader is disposed');}
  private unload(kind:ResourceKind,handle:number){
    if(kind==='texture')this.native.unloadTexture(handle);else if(kind==='model')this.native.unloadModel(handle);
    else if(kind==='sound')this.native.unloadSound(handle);else this.native.unloadMusic(handle);
  }
  private acquire(asset:AssetRequest){
    this.check();const id=key(asset);let entry=this.entries.get(id);
    if(entry&&entry.handle===undefined)throw new Error(`Asset is not ready: ${asset.path}`);
    if(!entry){
      let handle:number;this.synchronousMisses++;
      if(asset.kind==='texture')handle=asset.width===undefined?this.native.loadTexture(asset.path):this.native.loadTexture(asset.path,asset.width,asset.height);
      else if(asset.kind==='model')handle=this.native.loadModel(asset.path);
      else if(asset.kind==='sound')handle=this.native.loadSound(asset.path);else handle=this.native.loadMusic(asset.path);
      entry={asset,handle,references:0};this.entries.set(id,entry);this.handles.set(handle,entry);
    }
    if(asset.kind==='sound'){
      const voice=this.native.cloneSound(entry.handle!);
      entry.references++;this.soundVoices.set(voice,entry);return voice;
    }
    entry.references++;return entry.handle!;
  }
  private release(kind:ResourceKind,handle:number){
    const voice=this.soundVoices.get(handle);
    if(voice){
      if(kind!=='sound')throw new Error('Cached sound voice released as another resource kind');
      this.native.unloadSound(handle);this.soundVoices.delete(handle);voice.references--;return;
    }
    const entry=this.handles.get(handle);
    // Dynamically created surfaces remain owned by their original consumer.
    if(!entry){this.unload(kind,handle);return;}
    if(entry.asset.kind!==kind||entry.references===0)throw new Error('Unbalanced cached resource release');
    entry.references--;
  }
  preload(assets:readonly AssetRequest[]):AssetLoadBatch{
    this.check();if(this.active&&!this.active.done)throw new Error('A resource batch is already loading');
    const entries=[...new Map(assets.map(asset=>[key(asset),asset])).entries()].map(([id,asset])=>{
      let entry=this.entries.get(id);if(!entry){entry={asset:{...asset},references:0};this.entries.set(id,entry);}return entry;
    });
    this.active=new AssetLoadBatch(this.native,entries,entry=>this.handles.set(entry.handle!,entry),()=>{
      for(const entry of entries)if(entry.handle===undefined)this.entries.delete(key(entry.asset));
    });return this.active;
  }
  /** Call after outgoing scene owners release their references. */
  retainOnly(assets:readonly AssetRequest[]){
    const retained=new Set(assets.map(key));
    for(const [id,entry]of this.entries)if(!retained.has(id)&&!entry.references&&entry.handle!==undefined){
      this.unload(entry.asset.kind,entry.handle);this.handles.delete(entry.handle);this.entries.delete(id);
    }
  }
  dispose(){
    if(this.disposed)return;this.active?.cancel();
    for(const handle of this.soundVoices.keys())this.native.unloadSound(handle);
    this.soundVoices.clear();
    for(const entry of this.entries.values())if(entry.handle!==undefined)this.unload(entry.asset.kind,entry.handle);
    this.entries.clear();this.handles.clear();this.disposed=true;
  }
}

/** Presentation updates only. Never call from a replay fast-forward loop.
 * A poll commits at most one GPU allocation, including individual GLB parts.
 * Errors/cancellation consume no simulation frames and release pending work. */
export class AssetLoadBatch {
  error:Error|null=null;
  cancelled=false;
  constructor(private native:NativeHost,private entries:Entry[],private ready:(entry:Entry)=>void,private cleanup:()=>void){}
  get completed(){return this.entries.filter(e=>e.handle!==undefined).length;}
  get total(){return this.entries.length;}
  get done(){return !!this.error||this.cancelled||this.completed===this.total;}
  get progress(){return this.total?this.completed/this.total:1;}
  update(){
    if(this.done)return;
    try{
      let pending=this.entries.filter(e=>e.ticket!==undefined).length;
      for(const e of this.entries){
        if(pending>=2)break;
        if(e.handle===undefined&&e.ticket===undefined){
          e.ticket=this.native.loadResourceAsync(e.asset.kind,e.asset.path,e.asset.width??0,e.asset.height??0);pending++;
        }
      }
      const entry=this.entries.find(e=>e.ticket!==undefined);if(!entry)return;
      const status=this.native.pollResourceLoad(entry.ticket!);
      if(status.state==='pending')return;
      delete entry.ticket;
      if(status.state==='error')throw new Error(`Cannot load ${entry.asset.path}: ${status.error}`);
      entry.handle=status.handle;this.ready(entry);
    }catch(error){this.error=error instanceof Error?error:new Error(String(error));this.cancelPending();}
  }
  private cancelPending(){
    for(const entry of this.entries)if(entry.ticket!==undefined){this.native.cancelResourceLoad(entry.ticket);delete entry.ticket;}
    this.cleanup();
  }
  cancel(){if(this.cancelled||this.completed===this.total)return;this.cancelled=true;this.cancelPending();}
}
