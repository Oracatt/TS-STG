import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createTouhouResources} from '../packages/thlib/src/touhou/resources.js';
import {TouhouHud,TOUHOU_HUD_LABEL_SCRIPTS} from '../packages/thlib/src/touhou/hud.js';
import {DrawList} from '../packages/thlib/src/render.js';

// Small decoded-bank fixtures test descriptor selection and handle ownership;
// they do not stand in for the separate original-artwork/pixel audit.
function archive(name,file,{dynamic=false}={}){
  return{format:'touhou-anm-v8',name,byteLength:0,entries:[{
    index:0,name:dynamic?'@R':name,width:8,height:8,
    texture:dynamic?{kind:'renderTarget'}:{kind:'png',path:file,width:8,height:8},
  }],sprites:[],scripts:[{index:0,entry:0,storedId:0,offset:0,instructions:[{offset:0,opcode:3,size:8,time:0,mask:0,args:[]}]}],opcodeCounts:{3:1}};
}
const descriptor=file=>({file,sha256:'fixture-only'});
function fixture(change=()=>{}){
  const manifest={format:'ts-stg-touhou-common-v1',archives:{
    front:descriptor('anm/front.json'),ascii_960:descriptor('anm/ascii_960.json'),effect:descriptor('anm/effect.json'),
  },locales:{
    'zh-CN':{archives:{front:descriptor('locales/zh-CN/anm/front.json'),title:descriptor('locales/zh-CN/anm/title.json')}},
    fr:{archives:{effect:descriptor('locales/fr/anm/effect.json')}},
    ja:{archives:{front:descriptor('intentionally-unread-ja-override.json')}},
  }};
  const files={
    'manifest.json':manifest,
    'anm/front.json':archive('front-ja','textures/front/base.png'),
    'anm/ascii_960.json':archive('ascii-base','textures/ascii/base.png'),
    'anm/effect.json':archive('effect-base','textures/effect/base.png'),
    'locales/zh-CN/anm/front.json':archive('front-zh','locales/zh-CN/textures/front.png'),
    'locales/zh-CN/anm/title.json':archive('title-zh','locales/zh-CN/textures/title.png'),
    'locales/fr/anm/effect.json':archive('effect-fr','locales/fr/textures/effect.png'),
  };
  change({manifest,files});const calls=[],prefix='fixture/pack/';let next=1;
  const host={
    readText(file){calls.push(['read',file]);assert.ok(file.startsWith(prefix));const key=file.slice(prefix.length);assert.ok(Object.hasOwn(files,key),`Unexpected fixture file ${file}`);return JSON.stringify(files[key]);},
    loadTexture(file,width,height){const id=next++;calls.push(['load',id,file,width,height]);return id;},
    createRenderTarget(width,height){const id=next++;calls.push(['target',id,width,height]);return id;},
    unloadTexture(id){calls.push(['unload',id]);},
  };
  return{host,calls,files,manifest,options:{basePath:'fixture\\pack',bankNames:['front']}};
}

test('base ja ignores locale overrides and exposes a read-only locale without changing loaded paths',()=>{
  const{host,calls,options}=fixture(),resources=createTouhouResources(host,options);
  assert.equal(resources.locale,'ja');assert.throws(()=>{resources.locale='fr';},TypeError);
  assert.equal(resources.data.front.name,'front-ja');assert.equal(resources.data.ascii_960.name,'ascii-base');
  assert.equal(resources.data.front.entries[0].texture.path,'fixture/pack/textures/front/base.png');
  assert.ok(!calls.some(call=>call[0]==='read'&&call[1].includes('intentionally-unread')));
  assert.ok(resources.font);resources.dispose();
});

test('declared locales select archive descriptors and fall back per bank without changing the manifest or source objects',()=>{
  const{host,calls,options,files,manifest}=fixture(),before=JSON.stringify({manifest,files});
  const resources=createTouhouResources(host,{...options,locale:'zh-CN'});
  assert.equal(resources.locale,'zh-CN');assert.equal(resources.data.front.name,'front-zh');
  assert.equal(resources.data.effect.name,'effect-base');assert.equal(resources.data.ascii_960.name,'ascii-base');
  assert.equal(resources.data.title.name,'title-zh','locale-only declared banks also load');
  assert.equal(resources.data.front.entries[0].texture.path,'fixture/pack/locales/zh-CN/textures/front.png');
  assert.equal(resources.data.effect.entries[0].texture.path,'fixture/pack/textures/effect/base.png');
  assert.ok(!calls.some(call=>call[0]==='read'&&call[1]==='fixture/pack/anm/front.json'));
  assert.equal(JSON.stringify({manifest,files}),before,'path resolution only mutates the freshly decoded per-owner archive');resources.dispose();
});

test('a second declared locale is data-driven and leaves banks without a translation on the base pack',()=>{
  const{host,options}=fixture(),resources=createTouhouResources(host,{...options,locale:'fr'});
  assert.equal(resources.locale,'fr');assert.equal(resources.data.front.name,'front-ja');
  assert.equal(resources.data.effect.name,'effect-fr');assert.equal(resources.banks.title,undefined);resources.dispose();
});

test('caller decoded archive overrides have precedence over locale files and retain already-resolved paths',()=>{
  const{host,calls,options}=fixture(({manifest})=>{manifest.locales['zh-CN'].archives.front=descriptor('must-not-load.json');});
  const decoded=archive('caller-front','caller/already/resolved.png'),resources=createTouhouResources(host,{...options,locale:'zh-CN',archives:{front:decoded}});
  assert.equal(resources.data.front,decoded);assert.equal(resources.data.front.entries[0].texture.path,'caller/already/resolved.png');
  resources.banks.front.texture(0);assert.ok(calls.some(call=>call[0]==='load'&&call[2]==='caller/already/resolved.png'));
  assert.ok(!calls.some(call=>call[0]==='read'&&call[1].includes('must-not-load')));resources.dispose();
});

test('unknown, malformed and non-string locale requests fail explicitly before any texture allocation',()=>{
  for(const locale of ['',null,2,'   ','unknown','toString']){
    const{host,calls,options}=fixture();assert.throws(()=>createTouhouResources(host,{...options,locale}),/locale/);
    assert.ok(!calls.some(call=>call[0]==='load'||call[0]==='target'));
  }
  for(const selected of [null,{}, {archives:null},{archives:[]}]){
    const{host,options}=fixture(({manifest})=>{manifest.locales['zh-CN']=selected;});
    assert.throws(()=>createTouhouResources(host,{...options,locale:'zh-CN'}),/Invalid common resource locale/);
  }
  const bad=fixture(({manifest})=>{manifest.locales['zh-CN'].archives.front={sha256:'fixture-only'};});
  assert.throws(()=>createTouhouResources(bad.host,{...bad.options,locale:'zh-CN'}),/Invalid common bank descriptor/);
});

test('headless default remains usable with decoded banks and never pretends to validate a locale without a manifest',()=>{
  const decoded=archive('decoded','already/resolved.png'),resources=createTouhouResources(null,{bankNames:[],archives:{front:decoded}});
  assert.equal(resources.locale,'ja');assert.equal(resources.data.front,decoded);resources.dispose();
  assert.throws(()=>createTouhouResources(null,{bankNames:[],archives:{front:decoded},locale:'zh-CN'}),/locale.*requires.*manifest/);
});

test('localized and base resource owners never share texture or dynamic handles and retries release only their own instances',()=>{
  const{host,calls,options}=fixture(),base=createTouhouResources(host,options),localized=createTouhouResources(host,{...options,locale:'zh-CN'});
  const a=base.banks.front.texture(0),b=localized.banks.front.texture(0);
  assert.notEqual(a,b);
  const baseSurface=base.registerBank('surface',archive('surface',null,{dynamic:true})),localizedSurface=localized.registerBank('surface',archive('surface',null,{dynamic:true}));
  const c=baseSurface.texture(0),d=localizedSurface.texture(0);assert.notEqual(c,d);
  const old=localized.banks.front,oldVM=old.create(0),fresh=localized.createBank('front'),freshVM=fresh.create(0);
  assert.equal(fresh.texture(0),b,'retry banks in one resource owner intentionally reuse immutable static textures');
  old.dispose();assert.equal(oldVM.alive,false);assert.equal(freshVM.alive,true);
  assert.ok(!calls.some(call=>call[0]==='unload'&&call[1]===b));
  base.dispose();assert.deepEqual(calls.filter(call=>call[0]==='unload').map(call=>call[1]).sort((x,y)=>x-y),[a,c].sort((x,y)=>x-y));
  assert.equal(freshVM.alive,true);assert.equal(localizedSurface.texture(0),d);
  localized.dispose();localized.dispose();
  assert.equal(freshVM.alive,false);assert.equal(localizedSurface.disposed,true);
  for(const id of [a,b,c,d])assert.equal(calls.filter(call=>call[0]==='unload'&&call[1]===id).length,1,`handle ${id} unloaded once`);
});

test('shipped Chinese pack loads front/title/ASCII descriptors, retains source scripts and falls back for every untranslated bank',()=>{
  const root=new URL('../',import.meta.url),loads=[],released=[];let next=1;
  const host={
    readText:file=>readFileSync(new URL(file,root),'utf8'),
    loadTexture(file,width,height){
      const path=new URL(file,root);assert.ok(existsSync(path),`Selected texture exists: ${file}`);
      const bytes=readFileSync(path);assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[width,height],`Selected PNG dimensions: ${file}`);
      const handle=next++;loads.push({file,handle});return handle;
    },
    unloadTexture:handle=>released.push(handle),
  };
  const base=createTouhouResources(host),localized=createTouhouResources(host,{locale:'zh-CN'}),huds=[];
  try{
    assert.equal(base.locale,'ja');assert.equal(localized.locale,'zh-CN');
    const translation=localized.manifest.locales['zh-CN'];
    for(const name of ['front','title','ascii_960']){
      const descriptor=translation.archives[name];assert.ok(descriptor,`Declared localized ${name}`);
      assert.match(descriptor.file,/^locales\/zh-CN\/anm\//);
      assert.equal(localized.data[name].locale.language,'zh-CN');
      assert.equal(localized.data[name].locale.baseBankSha256,base.manifest.archives[name].sha256);
      assert.deepEqual(localized.data[name].scripts,base.data[name].scripts,`${name} localization never replaces the source bytecode, timing or interrupts`);
    }
    for(const name of Object.keys(base.manifest.archives))if(!Object.hasOwn(translation.archives,name))
      assert.deepEqual(localized.data[name],base.data[name],`Untranslated ${name} resolves to the complete base bank`);
    assert.deepEqual(localized.data.ascii_960.sprites,base.data.ascii_960.sprites,'existing ASCII/digits/control glyphs retain their exact indices and metrics');
    assert.deepEqual(localized.data.ascii_960.entries,base.data.ascii_960.entries,'ASCII continues using the source bitmap textures');
    for(const name of ['front','title']){
      const texture=translation.textures.find(texture=>texture.file===`locales/zh-CN/textures/${name}.png`);assert.ok(texture);
      const entry=localized.data[name].entries.find(entry=>entry.texture.path?.endsWith(texture.file));assert.ok(entry);
      localized.banks[name].texture(entry.index);
    }
    const frontMappings=translation.textures.find(texture=>texture.file.endsWith('/front.png')).spriteMappings;
    for(const sprite of [4,5,6,7,8,11,73,74,186,187])assert.ok(frontMappings.some(mapping=>mapping.sprite===sprite),`Chinese public status/name sprite ${sprite}`);
    for(const resources of [base,localized]){
      const hud=new TouhouHud({bank:resources.banks.front,textBank:resources.banks.ascii_960,font:resources.font,replay:true,characterScript:101});huds.push(hud);
      for(let frame=0;frame<100;frame++)hud.update();
      assert.equal(hud.labels.pointValue.scriptId,TOUHOU_HUD_LABEL_SCRIPTS.pointValue);assert.equal(hud.labels.graze.scriptId,TOUHOU_HUD_LABEL_SCRIPTS.graze);
      const draw=new DrawList();hud.draw(draw,{score:12345,pointValue:10000,graze:9});
      assert.ok(draw.commands.some(command=>command[0]==='statefulQuad'),'real common ANM image labels produce drawable quads');
      assert.ok(draw.commands.some(command=>command[0]==='spriteRegion'),'real original bitmap glyphs draw status values and Replay');
      assert.ok(!draw.commands.some(command=>command[0]==='text'),'neither language falls back to a system text label');
    }
    assert.ok(loads.some(load=>load.file.includes('/locales/zh-CN/textures/front.png')));
    assert.ok(loads.some(load=>load.file.includes('/locales/zh-CN/textures/title.png')));
  }finally{
    for(const hud of huds)hud.destroy();base.dispose();localized.dispose();
  }
  assert.equal(new Set(loads.map(load=>load.handle)).size,loads.length);
  assert.deepEqual([...released].sort((a,b)=>a-b),loads.map(load=>load.handle).sort((a,b)=>a-b),'both complete resource owners release every selected static handle exactly once');
});
