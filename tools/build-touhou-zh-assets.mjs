import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync,deflateSync} from 'node:zlib';

const assetRoot=fileURLToPath(new URL('./assets/touhou-zh/',import.meta.url));
const defaultSource='D:/AIWorkspace/references/TH16-zh-patch/extracted-ui';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const rect=(x,y,width,height)=>({x,y,width,height});
const provenance=Object.freeze({
  package:'【喵玉×THB】东方天空璋汉化补丁[支持Steam版].rar',
  packageSha256:'3707f3bd3e935d2ebb001e0bbd1b1db2ecd00ecf41116571c98a74ae786ce4b0',
  database:'th16.sdb',databaseSha256:'3593e515c01f42664233e800d25495d41afe25a7c864a865f247ad3f941f0edc',
  documentationDate:'2017-11-17',originalGameVersion:'1.00a',
  originalAuthors:'Team Shanghai Alice / ZUN',translationAuthors:'喵玉汉化组 & THB学园',
  imageEditors:['hgs1220','黄金琪露诺','鸠子','莱亚'],
  license:'Original game and fan translation resources; not MIT. No new redistribution grant is implied.',
  acquisition:'User supplied local translation patch; original SQLite PNG blobs extracted without executing package code.',
});

// Independent PNG codec avoids importing the common importer back into itself.
// Atlas preparation copies complete RGBA bytes; it never keys colors or redraws.
const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function chunk(name,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(name,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
export function decodeTouhouChinesePng(bytes){
  assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Not a PNG');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),type=bytes[25],channels=type===6?4:3,idat=[];
  assert.ok(width>0&&height>0&&width<=8192&&height<=8192&&bytes[24]===8&&[2,6].includes(type)&&bytes[28]===0,'Expected bounded noninterlaced RGB/RGBA PNG');
  for(let offset=8;offset<bytes.length;){const length=bytes.readUInt32BE(offset),end=offset+length+12;
    assert.ok(end<=bytes.length,'Truncated PNG');assert.equal(crc32(bytes.subarray(offset+4,end-4)),bytes.readUInt32BE(end-4),'PNG CRC mismatch');
    if(bytes.toString('ascii',offset+4,offset+8)==='IDAT')idat.push(bytes.subarray(offset+8,end-4));offset=end;
  }
  const stride=width*channels,packed=inflateSync(Buffer.concat(idat)),raw=Buffer.alloc(stride*height),rgba=Buffer.alloc(width*height*4);
  assert.equal(packed.length,(stride+1)*height,'Unexpected PNG row length');
  const paeth=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;};
  for(let y=0;y<height;y++){const f=packed[y*(stride+1)];assert.ok(f<=4,'Unknown PNG filter');for(let x=0;x<stride;x++){
    const a=x>=channels?raw[y*stride+x-channels]:0,b=y?raw[(y-1)*stride+x]:0,c=y&&x>=channels?raw[(y-1)*stride+x-channels]:0;
    raw[y*stride+x]=(packed[y*(stride+1)+1+x]+(f===1?a:f===2?b:f===3?(a+b)>>1:f===4?paeth(a,b,c):0))&255;
  }}
  for(let i=0;i<width*height;i++){raw.copy(rgba,i*4,i*channels,i*channels+3);rgba[i*4+3]=channels===4?raw[i*channels+3]:255;}
  return{width,height,rgba};
}
function encodePng({width,height,rgba}){const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;
  const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)rgba.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
function copyRect(source,r,target,x=0,y=0){
  assert.ok(Object.values(r).every(Number.isInteger)&&r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&r.x+r.width<=source.width&&r.y+r.height<=source.height,'Source rectangle out of bounds');
  assert.ok(x>=0&&y>=0&&x+r.width<=target.width&&y+r.height<=target.height,'Destination rectangle out of bounds');
  for(let row=0;row<r.height;row++)source.rgba.copy(target.rgba,((y+row)*target.width+x)*4,((r.y+row)*source.width+r.x)*4,((r.y+row)*source.width+r.x+r.width)*4);
}
const canvas=(width,height)=>({width,height,rgba:Buffer.alloc(width*height*4)});
const cell=(key,bank,sprites,file,r,label,extra={})=>({key,bank,sprites:Array.isArray(sprites)?sprites:[sprites],file,rect:r,label,...extra});
const cells=[
  cell('high-score','front',4,'data/front/front00.png',rect(512,0,144,36),'最高得分'),
  cell('score','front',5,'data/front/front00.png',rect(512,36,144,36),'得分'),
  cell('lives','front',6,'data/front/front00.png',rect(512,72,144,36),'剩余人数'),
  cell('fragments','front',7,'data/front/front00.png',rect(576,108,80,36),'碎片'),
  cell('bombs','front',8,'data/front/front00.png',rect(656,0,176,36),'Spell Card'),
  cell('power','front',11,'data/front/front00.png',rect(664,108,144,36),'灵力'),
  cell('point-value','front',186,'data/front/front00.png',rect(664,72,168,36),'最大得点',{displayHeight:36}),
  cell('graze','front',187,'data/front/front00.png',rect(704,36,128,36),'Graze',{displayHeight:36}),
  cell('spell-time','front',56,'data/front/front00.png',rect(672,608,128,64),'击破时间 / 实际时间'),
  cell('reimu-name','front',73,'data/title/title_pl00c.png',rect(383,80,222,58),'博丽 灵梦'),
  cell('marisa-name','front',74,'data/title/title_pl01c.png',rect(363,80,275,58),'雾雨 魔理沙'),
  ...['解除游戏暂停','结束游戏','保存录像后结束游戏','操作说明','从头重新开始','继续游戏','保存游戏录像','再次播放录像'].map((label,i)=>cell(`pause-${i}`,'front',85+i,'data/ascii/pause.png',rect(0,i*64,512,64),label)),
  cell('confirm','front',95,'data/ascii/pause.png',rect(0,576,512,64),'真的可以吗？'),
  cell('yes','front',96,'data/ascii/pause.png',rect(0,640,512,64),'好的'),
  cell('no','front',97,'data/ascii/pause.png',rect(0,704,512,64),'算了'),
  ...['游戏暂停','满身疮痍','播放完毕','攻略失败'].map((label,i)=>cell(`pause-title-${i}`,'front',98+i,'data/ascii/pause_title.png',rect(0,i*64,192,64),label)),
  ...[[4,'sl_rank','选择游戏难度'],[5,'sl_player','选择一位主人公'],[7,'sl_stage','选择关卡'],[8,'sl_spell','选择符卡'],[9,'sl_replay','选择游戏录像'],[10,'sl_playerdata','展示战斗经历'],[12,'sl_manual','游戏方法'],[13,'sl_savereplay','保存游戏录像'],[14,'sl_regist','输入得分者的名字'],[15,'sl_playerdata','展示战斗经历']].map(([sprite,name,label])=>cell(`title-${sprite}`,'title',sprite,`data/title/selecttitle/${name}.png`,rect(0,0,512,256),label)),
  // TH16's weapon subtitle describes its seasonal mechanic. Only its generic
  // English heading is shared; the season text and ornament are not imported.
  cell('title-weapon','title',6,'data/title/selecttitle/sl_weapon.png',rect(10,90,502,58),'SubWeapon Select',{canvas:{width:512,height:256,x:5,y:88},untranslated:'No generic Chinese weapon heading exists in this patch; seasonal subtitle omitted.'}),
  cell('title-music','title',11,'data/title/selecttitle/sl_music.png',rect(285,145,112,42),'音乐室',{canvas:{width:512,height:256,x:200,y:146},additionalParts:[{rect:rect(24,70,476,75),x:24,y:70}],note:'The generic English heading and contiguous 音乐室 substring are copied separately; the TH16 four-seasons qualifier is not imported.'}),
  cell('clear-stamp','title',27,'data/title/rank00.png',rect(0,896,128,128),'已通关'),
  cell('title-reimu-name','title',38,'data/title/title_pl00c.png',rect(383,80,222,58),'博丽 灵梦',{canvas:{width:603,height:357,x:190,y:70},untranslated:'The source TH20 biography and the patch TH16 seasonal biography are different title-specific stories. Both paragraphs are omitted; only the common character name is retained.'}),
  cell('title-marisa-name','title',39,'data/title/title_pl01c.png',rect(363,80,275,58),'雾雨 魔理沙',{canvas:{width:603,height:357,x:164,y:70},untranslated:'The source TH20 biography and the patch TH16 seasonal biography are different title-specific stories. Both paragraphs are omitted; only the common character name is retained.'}),
];

/** One-time local source preparation. Only these selected generic UI cells are
 * stored in tools/assets; the complete TH16 atlases never enter the pack. */
export function prepareTouhouChineseAssets({source=defaultSource,out=assetRoot}={}){
  const upstream=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8'));
  assert.equal(upstream.databaseSha256,provenance.databaseSha256,'Wrong translation patch database');
  const sourceCache=new Map(),prepared=[];mkdirSync(out,{recursive:true});
  for(const spec of cells){let original=sourceCache.get(spec.file);if(!original){const bytes=readFileSync(join(source,spec.file)),descriptor=upstream.entries.find(e=>e.filename===spec.file);
    assert.ok(descriptor,`Missing extraction provenance: ${spec.file}`);assert.equal(sha(bytes),descriptor.sha256,'Extracted upstream PNG changed');
    original={bytes,image:decodeTouhouChinesePng(bytes)};sourceCache.set(spec.file,original);}
    const c=spec.canvas??{width:spec.rect.width,height:spec.rect.height,x:0,y:0},image=canvas(c.width,c.height);copyRect(original.image,spec.rect,image,c.x??0,c.y??0);
    for(const part of spec.additionalParts??[])copyRect(original.image,part.rect,image,part.x,part.y);
    const bytes=encodePng(image),file=`${spec.key}.png`;writeFileSync(join(out,file),bytes);
    prepared.push({...spec,file,width:image.width,height:image.height,sha256:sha(bytes),source:{file:spec.file,pngSha256:sha(original.bytes),width:original.image.width,height:original.image.height,rect:spec.rect,destination:rect(c.x??0,c.y??0,spec.rect.width,spec.rect.height),additionalParts:spec.additionalParts},operation:'Selected source RGBA copied exactly; no redrawing, color keying, resampling or source program execution.'});
  }
  const metadata={format:'ts-stg-touhou-zh-source-v1',source:provenance,cells:prepared};
  writeFileSync(join(out,'source.json'),JSON.stringify(metadata,null,2)+'\n');return metadata;
}

function sourceCell(spec,source){const bytes=readFileSync(join(source,spec.file));assert.equal(sha(bytes),spec.sha256,`Chinese source cell changed: ${spec.key}`);
  const image=decodeTouhouChinesePng(bytes);assert.deepEqual([image.width,image.height],[spec.width,spec.height]);return{...spec,bytes,image};}
function baseMask(bank,sprite,files,regions,key,reason){const old=bank.sprites[sprite],entry=bank.entries[old.entry],bytes=files.get(entry.texture.path);
  assert.ok(bytes,`Missing base atlas ${entry.texture.path}`);const image=canvas(old.width,old.height),input=decodeTouhouChinesePng(bytes);
  for(const r of regions)copyRect(input,{...r,x:old.x+r.x,y:old.y+r.y},image,r.x,r.y);
  return{key,bank:bank.name,sprites:[sprite],label:'Original English fallback',image,bytes:encodePng(image),baseSource:{file:entry.texture.path,pngSha256:sha(bytes),sprite,rect:rect(old.x,old.y,old.width,old.height),regions},untranslated:reason};
}
function packCells(specs){const padding=2,ordered=[...specs].sort((a,b)=>b.image.height-a.image.height||b.image.width-a.image.width||a.key.localeCompare(b.key));let best;
  for(const width of [1024,2048,4096]){const placements=[];let x=0,y=0,row=0;
    for(const spec of ordered){const w=spec.image.width+4,h=spec.image.height+4;assert.ok(w<=width,'Chinese source cell too wide');if(x+w>width){x=0;y+=row;row=0;}placements.push({spec,x:x+padding,y:y+padding});x+=w;row=Math.max(row,h);}
    const height=2**Math.ceil(Math.log2(Math.max(1,y+row)));assert.ok(height<=8192,'Chinese atlas too tall');
    if(!best||width*height<best.width*best.height||width*height===best.width*best.height&&Math.max(width,height)<Math.max(best.width,best.height))best={width,height,placements};
  }
  const {width,height,placements}=best,image=canvas(width,height);
  for(const p of placements){const src=p.spec.image;for(let dy=-padding;dy<src.height+padding;dy++)for(let dx=-padding;dx<src.width+padding;dx++){
    const input=(Math.max(0,Math.min(src.height-1,dy))*src.width+Math.max(0,Math.min(src.width-1,dx)))*4;
    src.rgba.copy(image.rgba,((p.y+dy)*width+p.x+dx)*4,input,input+4);
  }}return{...image,placements,bytes:encodePng(image)};
}

/** Append independent localized banks to an importer result. Base descriptors,
 * bytes, script records and textures stay unchanged. Runtime resolves the
 * locale's bank descriptor first, while every texture path remains pack-relative. */
export function appendTouhouChineseAssets({files,manifest,source=assetRoot}={}){
  assert.ok(files instanceof Map&&manifest?.archives,'Importer files/manifest required');
  assert.ok(!manifest.locales?.['zh-CN'],'Chinese locale already appended');
  const metadata=JSON.parse(readFileSync(join(source,'source.json'),'utf8'));assert.equal(metadata.format,'ts-stg-touhou-zh-source-v1');
  assert.deepEqual(metadata.source,provenance,'Unreviewed Chinese source provenance');
  const locale={format:'ts-stg-touhou-locale-v1',language:'zh-CN',source:metadata.source,archives:{},textures:[],untranslated:[],
    retained:[{archive:'ascii_960',reason:'Digits, ASCII, English notices, NowLoading and 少女祈祷中 stay original. The patch itself retains the 終 bitmap control glyph; it supplies no distinct simplified glyph. No glyph indices, advances or font contracts change.'}]};
  const localeFiles=new Map();
  for(const name of ['front','ascii_960','title']){
    const descriptor=manifest.archives[name];assert.ok(descriptor,`Missing base bank ${name}`);
    const baseBytes=files.get(descriptor.file);assert.ok(baseBytes,`Missing base bank bytes ${descriptor.file}`);assert.equal(sha(baseBytes),descriptor.sha256);
    const bank=JSON.parse(baseBytes),scriptSignature=JSON.stringify(bank.scripts),specs=metadata.cells.filter(c=>c.bank===name).map(c=>sourceCell(c,source));
    if(name==='front')specs.push(baseMask(bank,93,files,[rect(0,40,512,24)],'option-english','TH16 pause row 8 means Return to Waypoint, not Options. Only the existing English Option subtitle is retained; its Japanese line is omitted.'));
    if(name==='title'){
      specs.push(baseMask(bank,16,files,[rect(0,58,512,82)],'achievement-english','This patch has no matching generic Chinese achievement heading. Existing English Achievement is retained; its Japanese subtitle is omitted.'));
      for(let sprite=17;sprite<=26;sprite++)specs.push(baseMask(bank,sprite,files,[rect(0,76,512,38)],`difficulty-${sprite}-english`,'Chinese TH16 difficulty titles are season-specific and cannot translate the source stone grades. Only the corresponding existing English difficulty name is retained; title-specific grades and Japanese explanations are omitted.'));
    }
    if(specs.length){for(const spec of specs)if(spec.baseRegions){const old=bank.sprites[spec.sprites[0]],entry=bank.entries[old.entry],input=decodeTouhouChinesePng(files.get(entry.texture.path));
        for(const r of spec.baseRegions)copyRect(input,{...r,x:old.x+r.x,y:old.y+r.y},spec.image,r.x,r.y);}
      const atlas=packCells(specs),entryIndex=bank.entries.length,file=`locales/zh-CN/textures/${name}.png`,mappings=[];
      for(const {spec,x,y}of atlas.placements)for(const sprite of spec.sprites){const old=bank.sprites[sprite];assert.ok(old&&!old.excluded&&old.width>0&&old.height>0,`Missing semantic sprite ${name}:${sprite}`);
        // These two appended labels originally used much narrower LuaSTG
        // artwork. Match the shared 36-pixel label height rather than shrinking
        // the original TH16 lettering to that unrelated source width.
        if(spec.displayHeight!==undefined)assert.ok(name==='front'&&[186,187].includes(sprite)&&Number.isFinite(spec.displayHeight)&&spec.displayHeight>0,'Only supplementary HUD labels may select their shared display height');
        const scale=spec.displayHeight===undefined?Math.min(old.width*(old.scaleX??1)/spec.image.width,old.height*(old.scaleY??1)/spec.image.height):spec.displayHeight/spec.image.height;
        bank.sprites[sprite]={...old,entry:entryIndex,x,y,width:spec.image.width,height:spec.image.height,scaleX:scale,scaleY:scale};
        mappings.push({archive:name,sprite,key:spec.key,label:spec.label,source:spec.baseSource?{...spec.baseSource,kind:'base-English-mask'}:{file:`tools/assets/touhou-zh/${spec.file}`,sha256:spec.sha256,originalFile:spec.source.file,originalPngSha256:spec.source.pngSha256,originalRect:spec.source.rect,originalDestination:spec.source.destination},
                sourceRect:spec.baseSource?.rect??rect(0,0,spec.image.width,spec.image.height),destination:rect(x,y,spec.image.width,spec.image.height),paddingX:2,paddingY:2,
          baseRegions:spec.baseRegions,geometry:{originalWidth:old.width,originalHeight:old.height,originalScaleX:old.scaleX??1,originalScaleY:old.scaleY??1,scaleX:scale,scaleY:scale,displayHeight:spec.displayHeight},operation:`Exact source RGBA copy with own-edge gutters; uniform ${spec.displayHeight===undefined?'contain scale':'shared HUD label height'}; source ANM scripts unchanged.`});
        if(spec.untranslated)locale.untranslated.push({archive:name,sprite,reason:spec.untranslated,fallback:spec.label});
      }
      bank.entries.push({index:entryIndex,offset:0,length:0,name:`<zh-CN-common-${name}>`,width:atlas.width,height:atlas.height,format:1,x:0,y:0,memoryPriority:10,lowResScale:1,hasData:1,originalWidth:atlas.width,originalHeight:atlas.height,spriteBase:0,scriptBase:0,spriteCount:mappings.length,scriptCount:0,texture:{kind:'png',path:file,width:atlas.width,height:atlas.height,sha256:sha(atlas.bytes)}});
      localeFiles.set(file,atlas.bytes);locale.textures.push({file,sha256:sha(atlas.bytes),width:atlas.width,height:atlas.height,operation:'Independent Chinese common UI cells; exact source pixels and two-pixel own-edge gutters',spriteMappings:mappings});
    }
    assert.equal(JSON.stringify(bank.scripts),scriptSignature,`Localization changed ${name} scripts`);
    bank.locale={language:'zh-CN',baseBankSha256:sha(baseBytes),sourcePackageSha256:provenance.packageSha256};
    const file=`locales/zh-CN/anm/${name}.json`,bytes=Buffer.from(JSON.stringify(bank));localeFiles.set(file,bytes);
    locale.archives[name]={...descriptor,file,sha256:sha(bytes),baseSha256:descriptor.sha256,textures:bank.entries.filter(e=>e.texture.path).length};
  }
  const sourceFile='locales/zh-CN/source.json';localeFiles.set(sourceFile,Buffer.from(JSON.stringify(metadata,null,2)));locale.provenance=sourceFile;
  for(const [file,bytes]of localeFiles){assert.ok(!files.has(file),`Locale output already exists: ${file}`);files.set(file,bytes);}
  manifest.locales={...manifest.locales,'zh-CN':locale};return locale;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv[2],'--prepare','This module is called by the common importer. Use --prepare only to regenerate audited selected source cells.');
  const source=process.argv[3]??defaultSource,result=prepareTouhouChineseAssets({source});console.log(JSON.stringify({output:assetRoot,cells:result.cells.length,source:result.source.packageSha256}));
}
