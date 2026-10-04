import {AnmBank} from './anm.js';
import {TouhouBitmapFont} from './font.js';
import {TouhouAudio} from './audio.js';
import {TOUHOU_PLAYER_DATA} from './player-data.js';
import {TOUHOU_BULLET_STYLES} from './bullet-style-data.js';
import {TouhouTextRenderer} from './text-renderer.js';

export const TOUHOU_RESOURCE_BANKS=Object.freeze(['pl00','pl01','bullet','effect','enemy','ascii_960','front','text','title','screenswitch']);
const bankNames=TOUHOU_RESOURCE_BANKS;
/** Load the complete shared animation pack. A missing host selects exact-data,
 * headless simulation; it never substitutes a different weapon implementation. */
export function createTouhouResources(host=null,{basePath='packages/thlib/assets/touhou-common',environment={},audioVolume=100}={}){
  const shots=[...TOUHOU_PLAYER_DATA];shots.pl00=shots[0];shots.pl01=shots[1];
  const banks=Object.fromEntries(bankNames.map(name=>[name,null])),data={},textureHandles=new Map(),createdBanks=new Set(),soundHandles=new Set(),dynamicTextures=new Map(),textRenderers=new Map();
  const prefix=String(basePath).replace(/\\/g,'/').replace(/\/$/,''),path=file=>`${prefix}/${file}`;
  let disposed=false;
  const requireActive=()=>{if(disposed)throw new Error('Touhou resources have been disposed');};
  const resources={basePath:prefix,shots,styles:TOUHOU_BULLET_STYLES,banks,data,manifest:null,font:null,audio:null,audioManifest:null,
    get disposed(){return disposed;},
    createBank(name){
      requireActive();if(!data[name])throw new Error(`Shared animation bank unavailable: ${name}`);
      const bank=new AnmBank(data[name],adapter),disposeBank=bank.dispose.bind(bank);let bankDisposed=false;
      if(name==='text'&&host?.rasterizeBitmapText&&host?.encodeText){
        const renderer=new TouhouTextRenderer({host,bank});textRenderers.set(bank,renderer);
        bank.environment={...bank.environment,createNameAnimation:(text,options)=>renderer.createNameAnimation(text,options)};
      }
      bank.dispose=()=>{
        if(bankDisposed)return;bankDisposed=true;
        // Retries create fresh VM/template tables while reusing resource data.
        // Do not keep retired banks alive in the owner's cleanup registry.
        createdBanks.delete(bank);if(banks[name]===bank)banks[name]=null;
        disposeBank();
        textRenderers.get(bank)?.dispose();textRenderers.delete(bank);
        const owned=dynamicTextures.get(bank);if(owned){for(const handle of owned.values())host?.unloadTexture?.(handle);dynamicTextures.delete(bank);}
      };
      createdBanks.add(bank);return bank;
    },
    createNameAnimation(text,options={},bank=banks.text){
      requireActive();const renderer=textRenderers.get(bank);
      if(!renderer)throw new Error('Dynamic spell names require a text bank and platform bitmap-text adapter');
      return renderer.createNameAnimation(text,options);
    },
    writeAnimationText(vm,text,options={}){
      requireActive();const renderer=textRenderers.get(vm.bank);
      if(!renderer)throw new Error('Dialogue text requires a text bank and platform bitmap-text adapter');
      return renderer.writeAnimationText(vm,text,options);
    },
    encodeText(text,codePage=932){
      requireActive();if(!host?.encodeText)throw new Error('Touhou text requires a platform code-page encoder');
      return host.encodeText(String(text),codePage);
    },
    dispose(){
      if(disposed)return;disposed=true;
      for(const bank of createdBanks)bank.dispose();createdBanks.clear();
      for(const handle of soundHandles){host?.stopSound?.(handle);host?.unloadSound?.(handle);}soundHandles.clear();
      if(!environment.loadTexture)for(const handle of textureHandles.values())host?.unloadTexture?.(handle);textureHandles.clear();
    }
  };
  const adapter={...environment,loadTexture:(file,width,height)=>{
    requireActive();
    const key=`${file}:${width}:${height}`;
    if(!textureHandles.has(key)){const load=environment.loadTexture??host?.loadTexture?.bind(host);if(!load)throw new Error('A texture loader is required to draw Touhou resources');textureHandles.set(key,load(file,width,height));}
    return textureHandles.get(key);
  },resolveTexture:(entry,bank)=>{
    requireActive();
    if(environment.resolveTexture)return environment.resolveTexture(entry,bank);
    let surfaces=dynamicTextures.get(bank);if(!surfaces)dynamicTextures.set(bank,surfaces=new Map());
    // postload_animation_entry allocates each dynamic entry separately. Both
    // text render targets are named @R and must never alias each other's pixels.
    const key=entry.index;
    if(!surfaces.has(key)){
      let handle;
      if(entry.texture.kind==='renderTarget'&&host?.createRenderTarget)handle=host.createRenderTarget(entry.width,entry.height);
      else if(host?.createTexture)handle=host.createTexture(entry.width,entry.height,new Uint8Array(entry.width*entry.height*4));
      else throw new Error(`Dynamic animation surface requires a texture adapter: ${entry.name}`);
      surfaces.set(key,handle);
    }
    return surfaces.get(key);
  },unloadTexture:()=>{}};
  if(!host?.readText)return resources;
  const read=file=>JSON.parse(host.readText(path(file)));
  resources.manifest=read('manifest.json');
  if(resources.manifest.format!=='ts-stg-touhou-common-v1')throw new Error('Unsupported common Touhou resource pack');
  for(const name of bankNames){const archive=resources.manifest.archives[name];if(!archive)throw new Error(`Missing common bank ${name}`);data[name]=read(archive.file);
    for(const entry of data[name].entries)if(entry.texture.path)entry.texture.path=path(entry.texture.path);
    banks[name]=resources.createBank(name);
  }
  resources.font=new TouhouBitmapFont(data.ascii_960,adapter);
  resources.audioManifest=read(resources.manifest.audio);
  for(const file of resources.audioManifest.files)file.path=path(file.path);
  if(host.loadSound&&host.playSound)resources.audio=new TouhouAudio(resources.audioManifest,{
    load:file=>{requireActive();const id=host.loadSound(file);soundHandles.add(id);return id;},
    play:(id,{attenuation,pan,loop})=>{requireActive();host.playSound(id,Math.pow(10,attenuation/2000),Math.max(0,Math.min(1,.5-pan/2000)),loop);},
    stop:id=>host.stopSound?.(id),
  },{volume:audioVolume});
  return resources;
}
