import {AnmBank} from './anm.js';
import {TouhouBitmapFont} from './font.js';
import {TouhouAudio} from './audio.js';
import {TOUHOU_PLAYER_DATA} from './player-data.js';
import {TOUHOU_BULLET_STYLES} from './bullet-style-data.js';
import {TouhouTextRenderer} from './text-renderer.js';

export const TOUHOU_RESOURCE_BANKS=Object.freeze(['pl00','pl01','bullet','effect','enemy','ascii_960','front','text','title','screenswitch']);
/** Load the complete shared animation pack. A missing host selects exact-data,
 * headless simulation; it never substitutes a different weapon implementation. */
export function createTouhouResources(host=null,{basePath='packages/thlib/assets/touhou-common',environment={},audioVolume=100,
  bankNames=TOUHOU_RESOURCE_BANKS,archives={},shots:shotData={},styles=TOUHOU_BULLET_STYLES,players={}}={}){
  if(!Array.isArray(bankNames)||bankNames.some(name=>typeof name!=='string'||!name))throw new TypeError('Resource bank names must be nonempty strings');
  const shots=Object.assign([...TOUHOU_PLAYER_DATA],shotData);shots.pl00=shots[0];shots.pl01=shots[1];
  const playerProfiles={0:{bank:'pl00'},1:{bank:'pl01'},...players};
  const banks=Object.fromEntries(bankNames.map(name=>[name,null])),data=Object.create(null),textureHandles=new Map(),createdBanks=new Set(),soundHandles=new Set(),dynamicTextures=new Map(),textRenderers=new Map();
  const prefix=String(basePath).replace(/\\/g,'/').replace(/\/$/,''),path=file=>`${prefix}/${file}`;
  let disposed=false;
  const requireActive=()=>{if(disposed)throw new Error('Touhou resources have been disposed');};
  const resources={basePath:prefix,shots,styles,players:playerProfiles,banks,data,manifest:null,font:null,audio:null,audioManifest:null,
    get disposed(){return disposed;},
    /** Register decoded, caller-owned data. Its texture paths are already resolved.
     * Existing banks stay immutable so live scenes cannot silently change skin. */
    registerBank(name,archive){
      requireActive();if(typeof name!=='string'||!name)throw new TypeError('Resource bank name must be nonempty');
      if(Object.hasOwn(data,name))throw new Error(`Animation bank already registered: ${name}`);
      data[name]=archive;
      try{banks[name]=resources.createBank(name);return banks[name];}
      catch(error){delete data[name];throw error;}
    },
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
  if(!host?.readText){for(const [name,archive]of Object.entries(archives))resources.registerBank(name,archive);return resources;}
  const read=file=>JSON.parse(host.readText(path(file)));
  resources.manifest=read('manifest.json');
  if(resources.manifest.format!=='ts-stg-touhou-common-v1')throw new Error('Unsupported common Touhou resource pack');
  for(const name of new Set([...bankNames,...Object.keys(resources.manifest.archives),...Object.keys(archives)])){
    let archive=archives[name];
    if(!archive){const descriptor=resources.manifest.archives[name];if(!descriptor)throw new Error(`Missing common bank ${name}`);archive=read(descriptor.file);
      for(const entry of archive.entries)if(entry.texture.path)entry.texture.path=path(entry.texture.path);
    }
    resources.registerBank(name,archive);
  }
  if(data.ascii_960)resources.font=new TouhouBitmapFont(data.ascii_960,adapter);
  if(!resources.manifest.audio)return resources;
  resources.audioManifest=read(resources.manifest.audio);
  for(const file of resources.audioManifest.files)file.path=path(file.path);
  if(host.loadSound&&host.playSound)resources.audio=new TouhouAudio(resources.audioManifest,{
    load:file=>{requireActive();const id=host.loadSound(file);soundHandles.add(id);return id;},
    play:(id,{attenuation,pan,loop})=>{requireActive();host.playSound(id,Math.pow(10,attenuation/2000),Math.max(0,Math.min(1,.5-pan/2000)),loop);},
    stop:id=>host.stopSound?.(id),
  },{volume:audioVolume});
  return resources;
}
