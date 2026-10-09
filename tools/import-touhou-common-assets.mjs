import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync,deflateSync} from 'node:zlib';
import {TOUHOU_PLAYER_DATA} from '../packages/thlib/dist/touhou/player-data.js';
import {TOUHOU_BULLET_STYLES} from '../packages/thlib/dist/touhou/bullet-style-data.js';
import {appendTouhouHudLabels} from './append-touhou-hud-labels.mjs';
import {appendTouhouChineseAssets} from './build-touhou-zh-assets.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const assert=(value,message)=>{if(!value)throw new Error(message);};
const range=(first,last)=>Array.from({length:last-first+1},(_,i)=>first+i);
const spawnOps=new Set([500,501,502,503,504,505,506,510]);
// Registered against unobstructed face/clothing pixels in the original body
// PNGs, excluding green stone pixels. These are skin mappings, not claims that
// the title illustration and dialogue illustration have identical pixels.
// The clean PNG is copied unchanged; UV selection and one uniform sprite scale
// recover the source body canvas without stretching or generated artwork.
export const TOUHOU_DIALOGUE_BODY_SKINS=Object.freeze({
  pl00:Object.freeze({bodyScript:62,entry:24,sprites:[92,93,94,95],titleEntry:18,scale:1.0715,x:450.5,y:0,
    difference:'Clean illustration has different ribbon extent and baseline facial shading; original expression sprites remain independent.'}),
  pl01:Object.freeze({bodyScript:73,entry:26,sprites:[107,108,109,110],titleEntry:23,scale:1.1215,x:266,y:20,
    difference:'Clean illustration has an open right hand instead of the stone-holding gesture; original expression sprites remain independent.'}),
});

// Lossless PNG decoding/encoding is used only for atlas extraction. Pixels inside
// the selected source rectangles remain identical; unrelated pixels become clear.
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let b=0;b<8;b++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(name,data){const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);result.write(name,4);data.copy(result,8);result.writeUInt32BE(crc32(result.subarray(4,-4)),result.length-4);return result;}
export function decodeRgbaPng(bytes){
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),depth=bytes[24],type=bytes[25],parts=[];
  assert(depth===8&&(type===6||type===2)&&bytes[28]===0,'Atlas must be noninterlaced 8-bit RGB/RGBA PNG');
  for(let p=8;p<bytes.length;){const size=bytes.readUInt32BE(p);if(bytes.toString('ascii',p+4,p+8)==='IDAT')parts.push(bytes.subarray(p+8,p+8+size));p+=12+size;}
  const input=inflateSync(Buffer.concat(parts)),channels=type===6?4:3,stride=width*channels,raw=Buffer.alloc(height*stride),rgba=Buffer.alloc(width*height*4);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=input[y*(stride+1)];assert(filter<=4,'Unknown PNG filter');for(let x=0;x<stride;x++){
    const a=x>=channels?raw[y*stride+x-channels]:0,b=y?raw[(y-1)*stride+x]:0,c=y&&x>=channels?raw[(y-1)*stride+x-channels]:0;
    raw[y*stride+x]=(input[y*(stride+1)+1+x]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;
  }}
  for(let i=0;i<width*height;i++){rgba[i*4]=raw[i*channels];rgba[i*4+1]=raw[i*channels+1];rgba[i*4+2]=raw[i*channels+2];rgba[i*4+3]=channels===4?raw[i*channels+3]:255;}
  return {width,height,rgba};
}
function encodeRgbaPng({width,height,rgba}){
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)rgba.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
function extractAtlas(bytes,sprites,samplingPadding=1){
  const image=decodeRgbaPng(bytes),pixels=Buffer.alloc(image.rgba.length);
  // Linear sampling reads the texel on both sides of the nominal UV boundary.
  // Original sprite rectangles commonly inset the artwork by one texel; removing
  // that border changes rotated/scaled option and shot edges despite equal UVs.
  const rectangles=sprites.map(s=>({sprite:s.index,samplingPadding,x:Math.floor(s.x)-samplingPadding,y:Math.floor(s.y)-samplingPadding,width:Math.ceil(s.x+s.width)-Math.floor(s.x)+samplingPadding*2,height:Math.ceil(s.y+s.height)-Math.floor(s.y)+samplingPadding*2}));
  for(const r of rectangles){const left=Math.max(0,r.x),right=Math.min(image.width,r.x+r.width),top=Math.max(0,r.y),bottom=Math.min(image.height,r.y+r.height);
    for(let y=top;y<bottom;y++)image.rgba.copy(pixels,(y*image.width+left)*4,(y*image.width+left)*4,(y*image.width+right)*4);
  }
  return {bytes:encodeRgbaPng({...image,rgba:pixels}),rectangles,width:image.width,height:image.height};
}

/** UI cells are isolated before texture upload, not clipped in screen space.
 * Copy complete source RGBA and extrude each cell's own edge into a two-pixel
 * gutter. Transparent edges stay transparent; opaque frame edges, glyph black
 * outlines and intentional shadows are retained. Never borrow a neighbour.
 * Repeated axes keep the original complete texture period: a procedural ring
 * samples V directly, independently of its sprite's nominal UV rectangle. */
export function padUiAtlas(bytes,sprites,{repeatX=false,repeatY=new Set(),padding=2}={}){
  const source=decodeRgbaPng(bytes),power=value=>2**Math.ceil(Math.log2(Math.max(1,value)));
  const groups=new Map();
  for(const s of sprites){
    assert([s.x,s.y,s.width,s.height].every(Number.isInteger)&&s.width>0&&s.height>0,'UI atlas cells must have integer source bounds');
    const key=[s.x,s.y,s.width,s.height].join(':');
    if(!groups.has(key))groups.set(key,{source:{x:s.x,y:s.y,width:s.width,height:s.height},sprites:[],repeatY:false});
    const cell=groups.get(key);cell.sprites.push(s.index);cell.repeatY ||= repeatY.has(s.index);
  }
  const cells=[...groups.values()].sort((a,b)=>b.source.height-a.source.height||b.source.width-a.source.width||a.sprites[0]-b.sprites[0]);
  const fixedHeight=cells.some(cell=>cell.repeatY);
  for(const cell of cells)if(cell.repeatY)assert(cell.source.y===0&&cell.source.height===source.height,
    'Procedural ring UI sprites must span the complete source texture height; partial-height strips require an explicit sampling audit');
  const pack=width=>{let x=0,y=0,row=0;const positions=[];
    for(const cell of cells){const py=cell.repeatY?0:padding,w=cell.source.width+(repeatX?0:padding*2),h=cell.source.height+py*2;
      if(x+w>width){y+=row;x=0;row=0;}positions.push({cell,x:x+(repeatX?0:padding),y:y+py});x+=w;row=Math.max(row,h);}
    if(fixedHeight&&(y+row>source.height||positions.some(p=>p.cell.repeatY&&p.y!==0)))return null;
    return{width,height:fixedHeight?source.height:power(y+row),positions};
  };
  let packed;
  if(repeatX){assert(cells.every(c=>c.source.x===0&&c.source.width===source.width),'Repeated UI strips must span the source texture width');packed=pack(source.width);}
  else{
    const minimum=power(Math.max(...cells.map(c=>c.source.width+padding*2)));
    const maximum=fixedHeight?Math.max(2048,power(cells.reduce((sum,cell)=>sum+cell.source.width+padding*2,0))):Math.max(2048,minimum);
    for(let width=minimum;width<=maximum;width*=2){const candidate=pack(width);if(!candidate)continue;
      if(!packed||candidate.width*candidate.height<packed.width*packed.height||
        candidate.width*candidate.height===packed.width*packed.height&&Math.max(candidate.width,candidate.height)<Math.max(packed.width,packed.height))packed=candidate;}
  }
  assert(packed,'UI atlas cannot preserve the source repeat periods with independent gutters');
  const rgba=Buffer.alloc(packed.width*packed.height*4),mappings=[];
  const offset=(x,y)=>((((y%source.height)+source.height)%source.height)*source.width+((x%source.width)+source.width)%source.width)*4;
  for(const {cell,x,y} of packed.positions){const s=cell.source,px=repeatX?0:padding,py=cell.repeatY?0:padding;
    let foreignBorderPixels=0;
    for(let yy=-1;yy<=s.height;yy++)for(let xx=-1;xx<=s.width;xx++)if(xx===-1||xx===s.width||yy===-1||yy===s.height){
      if(repeatX&&(xx===-1||xx===s.width))continue;
      if(cell.repeatY&&(yy===-1||yy===s.height))continue;
      const a=offset(s.x+xx,s.y+yy),b=offset(s.x+Math.max(0,Math.min(s.width-1,xx)),s.y+Math.max(0,Math.min(s.height-1,yy)));
      if(source.rgba[a+3]&&(!source.rgba.subarray(a,a+4).equals(source.rgba.subarray(b,b+4))))foreignBorderPixels++;
    }
    for(let yy=-py;yy<s.height+py;yy++)for(let xx=-px;xx<s.width+px;xx++){
      // A ring's original X neighbours are part of its bilinear strip edge;
      // unlike ordinary UI quads, preserve this source sampling context.
      const input=offset(s.x+(cell.repeatY?xx:Math.max(0,Math.min(s.width-1,xx))),s.y+Math.max(0,Math.min(s.height-1,yy)));
      source.rgba.copy(rgba,((y+yy)*packed.width+x+xx)*4,input,input+4);
    }
    for(const sprite of cell.sprites)mappings.push({sprite,source:{...s},destination:{x,y,width:s.width,height:s.height},paddingX:px,paddingY:py,
      sourceAddress:'wrap',edgeSampling:cell.repeatY?'source':'own',foreignBorderPixels});
  }
  mappings.sort((a,b)=>a.sprite-b.sprite);
  return{bytes:encodeRgbaPng({width:packed.width,height:packed.height,rgba}),width:packed.width,height:packed.height,mappings,repeatX,
    repeatY:cells.filter(cell=>cell.repeatY).flatMap(cell=>cell.sprites).sort((a,b)=>a-b)};
}

/** ANM 600/601/602 sample a whole-texture V period. Detect their retained
 * sprite dependencies before packing; do not infer this property from IDs or
 * filenames. Unknown/dynamic bindings fail closed rather than corrupt UVs. */
export function proceduralRingSprites(bank,selectedScripts){
  const sprites=new Set();
  for(const id of selectedScripts){const script=bank.scripts[id];
    if(!script.instructions.some(ins=>[600,601,602].includes(ins.opcode)))continue;
    let found=false;
    for(const ins of script.instructions){
      if(ins.opcode===300){assert(!(ins.mask&1)&&ins.args[0]>=0,`Procedural ring sprite requires review: ${bank.name}:${id}`);sprites.add(ins.args[0]);found=true;}
      if(ins.opcode===301){assert(!(ins.mask&3),`Procedural ring random sprite requires review: ${bank.name}:${id}`);
        for(const sprite of range(ins.args[0],ins.args[0]+ins.args[1]-1))sprites.add(sprite);found=true;}
    }
    assert(found,`Procedural ring inherited sprite requires review: ${bank.name}:${id}`);
  }
  return sprites;
}

export function normalizeTouhouPlayerData(source,character){
  return {...source,format:'ts-stg-touhou-shots',character,profile:'standard',damageCaps:source.damageCaps.slice(0,1),optionScripts:source.optionScripts.slice(0,1),fullPowerScripts:source.fullPowerScripts.slice(0,1),offsets:source.offsets.slice(0,1),patterns:source.patterns.slice(0,15),source:{...source.source,selection:'Baseline normal/focused patterns 0..14; magic-stone variants omitted'}};
}
export function scriptClosure(bank,roots){
  const scripts=new Set(roots),sprites=new Set(),queue=[...scripts];
  for(let p=0;p<queue.length;p++){
    const id=queue[p],script=bank.scripts[id];assert(script,`Missing dependency ${bank.name}:${id}`);
    for(const ins of script.instructions){
      if(spawnOps.has(ins.opcode)){assert(!(ins.mask&1),`Dynamic child dependency requires review: ${bank.name}:${id}`);const child=ins.args[0];if(!scripts.has(child)){scripts.add(child);queue.push(child);}}
      if(ins.opcode===300){assert(!(ins.mask&1),`Dynamic sprite requires review: ${bank.name}:${id}`);if((ins.args[0]|0)>=0)sprites.add(ins.args[0]);}
      if(ins.opcode===301){assert(!(ins.mask&3),`Dynamic random sprite requires review: ${bank.name}:${id}`);for(const s of range(ins.args[0],ins.args[0]+ins.args[1]-1))sprites.add(s);}
    }
  }
  return {scripts,sprites};
}
export function buildTouhouCommonAssets({source=join(root,'games/touhou20/assets')}={}){
  source=resolve(source);const files=new Map(),manifest={format:'ts-stg-touhou-common-v1',version:2,ticksPerSecond:60,
    license:'Original resources; not MIT',notice:'NOTICE.md',archives:{},shots:['shots/pl00.json','shots/pl01.json'],styles:'bullet-styles.json',audio:'audio/manifest.json',textures:[],sounds:[],
    catalog:'prefabs.json',transformations:[],
    boundary:{included:['Reimu/Marisa body, standard option and weapon animations, complete Bomb animation trees','All 50 standard bullet styles with all 16 source color rows, lasers and cancellation animation, common item IDs 1..8','Every non-stone enemy animation, particles, focus, graze/death and charge effects','Original Boss double circles, Spell Card Attack, countdown and health bar primitives','Reusable application HUD, pause, game-over, difficulty and baseline character selection, dynamic text surfaces and bitmap glyphs','Generic screenswitch scene-cover/reveal animations and NowLoading indicator'],excluded:['Magic-stone player profiles, colored selection variants, item icons/animations, stone enemies and WeaponStoneInf aura','Specific Bosses, names, portraits/cut-ins, title logo/background/illustration and copyright artwork, stages/backgrounds and game-specific loading illustrations']}};
  const catalog={format:'ts-stg-touhou-prefabs-v1',animations:{},sources:{},excluded:{enemy:{scripts:range(272,417),reason:'enemy_stone.png and enemy_stone2.png'},bullet:{scripts:range(123,136),reason:'Magic-stone item animations'},aura:{reason:'WeaponStoneInf overlay; overlay_system/lifecycle.cpp loads aura.anm exclusively for the stone controller'}}};
  const shots=['pl00','pl01'].map((name,i)=>normalizeTouhouPlayerData(read(join(source,'shots',`${name}.json`)),i));
  assert(JSON.stringify(shots)===JSON.stringify(TOUHOU_PLAYER_DATA),'Checked-in baseline player data changed: audit and regenerate player-data.js');
  const styleData=read(join(source,'bullet-styles.json'));
  assert(JSON.stringify(styleData.styles)===JSON.stringify(TOUHOU_BULLET_STYLES),'Checked-in bullet styles changed: audit the public numeric table');
  for(let i=0;i<2;i++)files.set(`shots/pl0${i}.json`,Buffer.from(JSON.stringify(shots[i])));
  files.set('bullet-styles.json',Buffer.from(JSON.stringify({format:'ts-stg-touhou-bullet-styles',styles:styleData.styles,sourceSha256:styleData.sourceSha256})));
  const originalAudio=read(join(source,'audio/manifest.json'));
  // card_system/finish.cpp uses69 (se_fault.wav) for ordinary spell timeout.
  // Its position beside stone-only IDs does not make it stone-specific.
  const audioIds=new Set([...range(0,58),69,71,72,74,84,85,86,87,88,89]);
  const definitions=originalAudio.definitions.filter(d=>audioIds.has(d.id)),fileIndices=[...new Set(definitions.map(d=>d.fileIndex))],audioFiles=[];
  for(const index of fileIndices){const original=originalAudio.files[index],bytes=readFileSync(join(source,'audio',original.name)),file=`audio/${original.name}`;
    assert(sha(bytes)===original.sha256,`Source audio changed: ${original.name}`);files.set(file,bytes);
    audioFiles.push({...original,path:file});manifest.sounds.push({file,sha256:sha(bytes),source:{name:original.name,sha256:original.sha256},operation:'Byte-for-byte copy'});
  }
  files.set('audio/manifest.json',Buffer.from(JSON.stringify({format:'ts-stg-touhou-audio',definitions:definitions.map(d=>({...d,fileIndex:fileIndices.indexOf(d.fileIndex)})),files:audioFiles,music:[]})));
  for(const name of ['pl00','pl01','bullet','effect','enemy','ascii_960','front','text','title','screenswitch']){
    const metadata=readFileSync(join(source,'anm',`${name}.json`)),original=JSON.parse(metadata),isPlayer=name==='pl00'||name==='pl01';
    // Keep source instruction offsets and branch destinations. Only the named
    // title/stone child creation instructions are removed; all other timing,
    // transforms, interrupts and baseline image pixels remain source data.
    const transformed=structuredClone(original),changes=[];
    const omitChild=(script,children,reason)=>{
      for(const ins of transformed.scripts[script].instructions)if(spawnOps.has(ins.opcode)&&children.includes(ins.args[0])){
        changes.push({script,offset:ins.offset,operation:'omit-child',child:ins.args[0],reason});ins.opcode=0;ins.mask=0;ins.args=[];
      }
    };
    if(name==='front')omitChild(0,[13],'Magic-stone anomaly gauge label');
    const bodySkin=TOUHOU_DIALOGUE_BODY_SKINS[name];
    let cleanBodyEntry=null;
    if(bodySkin){
      assert(sha(readFileSync(join(source,'textures',name,`entry-${bodySkin.entry}.png`)))===original.entries[bodySkin.entry].texture.sha256,
        `Source dialogue body changed: ${name}/${bodySkin.entry}`);
      const clean=read(join(source,'anm','title.json'));cleanBodyEntry=clean.entries[bodySkin.titleEntry];
      for(const id of bodySkin.sprites){const s=original.sprites[id];transformed.sprites[id]={...s,entry:bodySkin.entry,
        x:bodySkin.x+s.x*bodySkin.scale,y:bodySkin.y+s.y*bodySkin.scale,
        width:s.width*bodySkin.scale,height:s.height*bodySkin.scale,scaleX:1/bodySkin.scale,scaleY:1/bodySkin.scale};}
      const change={script:bodySkin.bodyScript,operation:'clean-dialogue-body-skin',sprites:bodySkin.sprites,
        sourceBodyEntry:bodySkin.entry,sourceBodyPngSha256:original.entries[bodySkin.entry].texture.sha256,
        cleanArchive:'title.anm',cleanArchiveSha256:clean.source.sha256,cleanEntry:bodySkin.titleEntry,
        cleanPngSha256:cleanBodyEntry.texture.sha256,mapping:{scale:bodySkin.scale,x:bodySkin.x,y:bodySkin.y},
        geometry:'Original body width, height, top-left anchors, movement, color, alpha and expression overlays retained; source UV crop uses a single uniform scale.',
        limitation:bodySkin.difference};changes.push(change);
    }
    if(name==='title'){
      omitChild(0,[1,30],'Application supplies its own title background and illustration');
      omitChild(31,[32,33],'Application supplies its own title and attribution');
      for(const [script,sprite]of[[6,28],[7,33]])for(const ins of transformed.scripts[script].instructions)if(ins.opcode===300&&ins.args[0]!==sprite){changes.push({script,offset:ins.offset,operation:'baseline-sprite',from:ins.args[0],to:sprite,reason:'Keep baseline character instead of magic-stone color profile'});ins.args[0]=sprite;}
    }
    for(const change of changes)manifest.transformations.push({archive:name,...change});
    let roots;
    if(isPlayer){const sht=shots[Number(name.at(-1))];roots=[...range(0,5),...sht.patterns.flat().flatMap(s=>[s.animation,s.hitAnimation]),sht.optionScripts[0],sht.fullPowerScripts[0],...(name==='pl00'?[...range(46,61),66]:[...range(51,65),77])];}
    else if(name==='bullet')roots=range(0,333).filter(id=>id<123||id>=137);
    else if(name==='effect')roots=range(0,192);
    else if(name==='enemy')roots=range(0,271);
    // front84 is the common spell clear-time / best-time panel registered by
    // hud_system/notifications.cpp for both capture and failure.
    // front111 is the generic STAGE CLEAR banner. Its score rows are drawn
    // by the stage-clear owner, so no magic-stone statistics enter this bank.
    else if(name==='front')roots=[0,...range(32,84),100,101,102,111,...range(113,149),...range(166,373),...range(374,377)];
    else if(name==='text')roots=range(0,93);
    else if(name==='title')roots=[0,12,31,...range(34,59),134,135];
    else if(name==='screenswitch')roots=range(0,11);
    // ascii_960:17 is NowLoading and spawns the generic14..16 indicator.
    else roots=range(0,17);
    const selection=scriptClosure(transformed,roots);
    if(name==='bullet')for(const sprite of original.sprites)if(sprite.index<516||sprite.index>=524)selection.sprites.add(sprite.index);
    if(name==='effect')for(const sprite of original.sprites)if(sprite.entry>=2)selection.sprites.add(sprite.index);
    if(name==='enemy')for(const sprite of original.sprites)if(sprite.entry<7)selection.sprites.add(sprite.index);
    if(name==='ascii_960')for(const sprite of original.sprites)if(sprite.entry<=7)selection.sprites.add(sprite.index);
    if(['front','ascii_960','title'].includes(name))for(const id of selection.scripts){
      // Packing is valid only when UVs stay inside a cell. The sole audited
      // exception is front's full-width horizontal repeat strip. Refuse future
      // UV-scroll/vertical-repeat additions until their texture layout is reviewed.
      for(const ins of transformed.scripts[id].instructions){
        assert(![425,426,427,428].includes(ins.opcode),`UI UV scrolling needs a packing audit: ${name}:${id}`);
        if(ins.opcode===429||ins.opcode===430){
          const y=ins.opcode===429?1:3;
          assert(name==='front'&&id>=166&&id<=213&&!(ins.mask&(1<<y))&&ins.args[y]===0x3f800000,
            `UI UV scaling needs a packing audit: ${name}:${id}`);
        }
      }
    }
    const selectedEntries=new Set([...selection.sprites].map(id=>transformed.sprites[id]?.entry));
    selectedEntries.delete(undefined);
    // No source-specific table is retained behind an unreachable script ID.
    const result={...original,format:'touhou-anm-v8',name,source:{...original.source,metadataSha256:sha(metadata)},selection:{scripts:[...selection.scripts].sort((a,b)=>a-b),sprites:[...selection.sprites].sort((a,b)=>a-b),transformations:changes},opcodeCounts:{}};
    result.scripts=transformed.scripts.map(s=>selection.scripts.has(s.index)?s:{index:s.index,entry:0,storedId:s.storedId,offset:0,excluded:true,instructions:[{offset:0,opcode:-1,size:0,time:-1,mask:0,args:[]}]});
    for(const script of result.scripts)if(!script.excluded)for(const ins of script.instructions)result.opcodeCounts[ins.opcode]=(result.opcodeCounts[ins.opcode]??0)+1;
    result.sprites=transformed.sprites.map(s=>selection.sprites.has(s.index)?s:{index:s.index,entry:0,storedId:s.storedId,x:0,y:0,width:0,height:0,pivotX:0,pivotY:0,scaleX:1,scaleY:1,rotation:0,excluded:true});
    // screenswitch deliberately samples outside its64/512-pixel textures:
    // retain both PNGs and all sprite UVs unchanged so their wrap repeats survive.
    const ui=name==='front'||name==='ascii_960'||name==='title';
    const repeatY=ui?proceduralRingSprites(transformed,selection.scripts):new Set();
    result.entries=original.entries.map(e=>{
      if(!selectedEntries.has(e.index))return {...e,name:'<excluded>',spriteCount:0,scriptCount:0,texture:{kind:'excluded'}};
      if(e.texture.kind==='dynamic'||e.texture.kind==='renderTarget')return {...e,texture:{...e.texture}};
      const reskinned=bodySkin&&e.index===bodySkin.entry;
      const input=join(source,'textures',reskinned?'title':name,`entry-${reskinned?bodySkin.titleEntry:e.index}.png`),originalBytes=readFileSync(input),textureSource=reskinned?cleanBodyEntry:e;
      assert(sha(originalBytes)===textureSource.texture.sha256,`Source texture changed: ${name}/${e.index}`);
      const selectedSprites=transformed.sprites.filter(s=>s.entry===e.index&&selection.sprites.has(s.index));
      const mixed=isPlayer&&e.index===1||name==='bullet'&&(e.index===2||e.index===3);
      // front entries7/9 intentionally tile horizontally (UV scale reaches ±4).
      // Keep those full-width strips full-width; only separate their Y edges.
      // Loading particles already have source sampling margins. Preserve this
      // atlas: doubling its width changes native UV quantization at particle edges.
      const padded=ui&&!(name==='ascii_960'&&e.index===7)?padUiAtlas(originalBytes,selectedSprites,{repeatX:name==='front'&&(e.index===7||e.index===9),repeatY}):null;
      if(padded){
        for(const mapping of padded.mappings)Object.assign(result.sprites[mapping.sprite],{x:mapping.destination.x,y:mapping.destination.y});
        const change={operation:'pad-ui-atlas',entry:e.index,padding:2,repeatX:padded.repeatX,repeatY:padded.repeatY,
          sourceWidth:e.texture.width,sourceHeight:e.texture.height,width:padded.width,height:padded.height,
          sprites:padded.mappings.map(mapping=>mapping.sprite),
          geometry:'Only atlas UV positions and texture dimensions change; source sprite size, scale, pivot, rotation, IDs and ANM bytecode are retained.',
          pixels:'Source RGBA copied exactly. Ordinary UI gutters extrude each cell\'s own edge; procedural ring X gutters retain source wrap neighbours for bilinear sampling. Repeated axes retain their complete original texture period.'};
        changes.push(change);manifest.transformations.push({archive:name,...change});
      }
      const extracted=mixed?extractAtlas(originalBytes,selectedSprites):null,bytes=padded?.bytes??extracted?.bytes??originalBytes,file=`textures/${name}/entry-${e.index}.png`;
      files.set(file,bytes);
      manifest.textures.push({file,sha256:sha(bytes),source:{archive:reskinned?'title.anm':`${name}.anm`,archiveSha256:reskinned?changes.find(c=>c.operation==='clean-dialogue-body-skin').cleanArchiveSha256:original.source.sha256,entry:reskinned?bodySkin.titleEntry:e.index,name:textureSource.name,pngSha256:sha(originalBytes)},operation:padded?'Independent UI cells with two-pixel own-edge gutters; complete source RGBA and geometry retained, atlas UVs remapped':reskinned?'Clean body illustration copied byte-for-byte; source body sprite geometry retained by documented uniform UV mapping':mixed?'Selected sprite rectangles copied pixel-exactly into a transparent canvas; dimensions and coordinates unchanged':'Byte-for-byte copy',rectangles:extracted?.rectangles,spriteMappings:padded?.mappings});
      const dimensions=padded?{width:padded.width,height:padded.height}:{};
      return {...e,...(reskinned?{name:`<clean-dialogue-body:${textureSource.name}>`,width:textureSource.width,height:textureSource.height}:{}),...dimensions,texture:{...textureSource.texture,...dimensions,path:file,sha256:sha(bytes),sourceSha256:sha(originalBytes)}};
    });
    if(name==='front')appendTouhouHudLabels(result,files,manifest);
    const file=`anm/${name}.json`,bytes=Buffer.from(JSON.stringify(result));files.set(file,bytes);
    manifest.archives[name]={file,sha256:sha(bytes),sourceSha256:original.source.sha256,scripts:result.scripts.filter(s=>!s.excluded).length,sprites:result.sprites.filter(s=>!s.excluded).length,textures:result.entries.filter(e=>e.texture.path).length,surfaces:result.entries.filter(e=>['dynamic','renderTarget'].includes(e.texture.kind)).length};
    catalog.sources[name]={archiveSha256:original.source.sha256,metadataSha256:sha(metadata),originalScripts:original.scripts.length,originalSprites:original.sprites.length};
    catalog.animations[name]=result.scripts.filter(s=>!s.excluded).map(s=>({id:`${name}:${s.index}`,bank:name,script:s.index,entry:s.entry,sourceTexture:original.entries[s.entry]?.name??result.entries[s.entry].name}));
  }
  catalog.counts={bulletStyles:styleData.styles.length,bulletColorRows:styleData.styles.reduce((n,s)=>n+s.colors.length,0),enemyAnimations:catalog.animations.enemy.length,effectAnimations:catalog.animations.effect.length};
  files.set('prefabs.json',Buffer.from(JSON.stringify(catalog,null,2)));
  manifest.counts={archives:Object.keys(manifest.archives).length,textures:manifest.textures.length,sounds:new Set(manifest.sounds.map(s=>s.file)).size,scripts:Object.values(manifest.archives).reduce((n,a)=>n+a.scripts,0),sprites:Object.values(manifest.archives).reduce((n,a)=>n+a.sprites,0),shotRows:shots.map(s=>s.patterns.flat().length)};
  files.set('NOTICE.md',Buffer.from(`# Touhou common resources\n\nOriginal resources by Team Shanghai Alice / ZUN, obtained from the user's existing local Touhou 20 reconstruction. These graphics are not TS-STG MIT artwork; this extraction does not grant redistribution rights. Do not publish the original resources.\n\nCommon refers to reusable game systems and motifs, not a claim that all bytes occur in every Touhou release. Included: complete Reimu/Marisa baseline body/option/shot/Bomb animations, all standard bullet styles/colors and lasers, cancellation, common items, every non-stone enemy animation, all effect.anm primitives (including original double circles and Spell Card Attack), original application HUD/pause/game-over/difficulty/character selection, dynamic text surfaces and bitmap glyphs. Excluded: magic-stone variants/icons/enemies and WeaponStoneInf aura, named Bosses/names/cut-ins, title logo/background/illustration/copyright, stages/backgrounds and game-specific loading illustrations. The generic STAGE CLEAR banner (front:111, sprite83) is included; its game-specific magic-stone score rows and formula are not. Generic screenswitch cover/reveal textures and the ascii_960 NowLoading indicator are included.\n\nANM script instructions, timing, sprite IDs, blending, transforms, children and texture dimensions are retained for the selected animation dependency graph, except the explicit manifest.transformations: omit the HUD stone gauge label and application-specific title children, and map stone-color character choices to the baseline character sprite. These changes preserve instruction offsets and all remaining source timing. Excluded IDs are explicit tombstones, not alternate animations. Mixed player/item atlases copy only selected sprite rectangles plus the original one-pixel sampling border to otherwise transparent canvases. Selected RGBA pixels are unchanged. manifest.json records source hashes, exact extraction rectangles and output hashes. Shared atlases outside the explicit UI packing and body reskins remain byte-for-byte copies. Dynamic text/capture surfaces are blank runtime resources, not copied images. No executable code is included, and the original inputs remain untouched.\n\nprefabs.json inventories every selected animation with source archive/script IDs; animation counts include directional/auxiliary scripts and do not represent distinct enemy species. Baseline shot tables retain exact normal/focused patterns 0..14 and profile 0; all other weapon profiles are excluded. Runtime loading is relative to this directory and has no dependency on either demo.\n`));
  files.set('NOTICE.md',Buffer.concat([files.get('NOTICE.md'),Buffer.from('\nDialogue bodies retain the original pl00:62/pl01:73 ANM scripts and independent pl00:64/pl01:75 expression overlays. The original body PNGs contain embedded magic stones; no stone body pixels are included. Four body variants use a documented clean illustration UV mapping with one uniform inverse sprite scale to retain the original body geometry. The clean title PNG is copied byte-for-byte, not generated or repainted. manifest.transformations records the original-body and clean-source hashes, mapping and known artwork differences (notably Marisa\'s open-hand gesture). This reskin is not a claim of original dialogue pixel identity.\n')]));
  files.set('NOTICE.md',Buffer.concat([files.get('NOTICE.md'),Buffer.from('\nSelected static UI cells from front/ascii_960/title (except the source-margin loading atlas ascii_960 entry7) are packed into independent cells with two-pixel gutters copied from each cell\'s own edge. Transparent edges stay transparent; opaque edges, original black text outlines and shadows are retained. No color key, generated artwork or interior cropping is used. Sprite IDs, sizes, pivots, scales, rotations and ANM bytecode are unchanged; only UV origins and texture dimensions are remapped. Full-width repeating front strips retain their original width and horizontal repeat behavior, with vertical gutters only. Sprites used by retained ANM 600/601/602 procedural rings are detected from script dependencies; their full-height texture strips retain the original texture height and Y origin with horizontal gutters only. These procedural X gutters preserve the exact source wrap neighbours used by bilinear sampling (edgeSampling: source); ordinary UI and markers retain own-edge gutters (edgeSampling: own). This preserves whole-texture V repetition, including multiple periods and offsets. Other cells in the same atlas retain independent vertical gutters. repeatY records the affected sprite IDs; an unsupported partial-height or dynamic ring dependency fails import for review. Dynamic text/capture surfaces are unchanged. manifest.transformations and textures[].spriteMappings record source rectangles, wrapped source addressing, destination UVs, padding, potential foreign border pixel counts and source/output hashes. These counts identify possible adjacent-atlas sampling differences, not a claim that every detected neighbour was visibly defective. Capture/failure sprites39/40 previously sampled the opaque HUD frame at original x511; their isolated transparent left edge eliminates that foreign line without erasing glyph outlines.\n')]));
  files.set('NOTICE.md',Buffer.concat([files.get('NOTICE.md'),Buffer.from('\nScene transitions retain screenswitch.anm scripts0..11, both source textures and both sprite records unchanged. Sprite0 spans128x128 over a64x64 texture; sprite1 spans1280x960 over a512x512 texture. These are intentional wrapped UVs, so the transition textures are never repacked or edge-extruded. The generic NowLoading root ascii_960:17 and children14..16 use entry7 ascii/loading.png with original source timing, PNG and UVs; its source sampling margins are retained to avoid particle-edge UV quantization changes; game-specific loading illustrations are excluded.\n')]));
  files.set('NOTICE.md',Buffer.concat([files.get('NOTICE.md'),Buffer.from('\nThe two supplementary status labels front:378..379 are extracted original artwork, not generated graphics. hud-labels.json records their separate upstream source, original texture hash, exact rectangles and output hash. Only these selected labels are shipped, with pixel-exact interiors and independent two-pixel own-edge gutters. The animation wrapper uses the common front:12 entry fade and HUD layer with adapted sprite IDs and row anchors. No additional title branding, frame art or title-specific gameplay is included. These images retain their upstream rights and are not covered by the engine MIT license.\n')]));
  appendTouhouChineseAssets({files,manifest});
  files.set('NOTICE.md',Buffer.concat([files.get('NOTICE.md'),Buffer.from('\nThe optional zh-CN locale uses selected common UI artwork from the user-provided Touhou 16 Chinese Steam patch by 喵玉汉化组 and THB学园 (2017-11-17). Original graphics remain Team Shanghai Alice / ZUN artwork; translated image edits retain their credited authors. locales/zh-CN/source.json records the supplied archive/database hashes, image credits, exact source PNG hashes and crop rectangles. Only image data was extracted from the SQLite patch database; no patch executable was run or included. The locale overrides common HUD, pause/confirmation/result and application heading sprites without changing their ANM instructions or game clocks. Each selected cell retains its original RGBA pixels and independent sampling gutters; uniform sprite scaling fits the existing layout. Source-specific season, equipment, character, story and stage artwork is excluded. Where no matching translation exists, original English headings remain and Japanese explanatory lines are omitted; the manifest lists these fallbacks. The patch retains the original 終 bitmap glyph and provides no separate simplified replacement. These resources are not MIT artwork and the patch supplies no independent redistribution grant.\n')]));
  files.set('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)));
  return {manifest,files};
}
export function writeTouhouCommonAssets({out=join(root,'packages/thlib/assets/touhou-common'),checkOnly=false,...options}={}){
  const destination=resolve(out),source=resolve(options.source??join(root,'games/touhou20/assets'));
  assert(destination!==source&&!destination.startsWith(source+sep),'Never write inside the source assets');
  const pack=buildTouhouCommonAssets(options),expected=new Set(pack.files.keys());
  const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[relative(destination,join(dir,e.name)).split(sep).join('/')]);
  if(existsSync(destination))for(const file of walk(destination))assert(expected.has(file),`Unexpected file in common resource pack: ${file}`);
  for(const [file,bytes]of pack.files){const path=join(destination,file);if(checkOnly)assert(existsSync(path)&&readFileSync(path).equals(bytes),`Shared resource differs: ${file}`);else{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}}
  return {output:destination,...pack.manifest.counts,verified:checkOnly};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){if(args[i]==='--source')options.source=args[++i];else if(args[i]==='--out')options.out=args[++i];else if(args[i]==='--check')options.checkOnly=true;else throw new Error(`Unknown option ${args[i]}`);}
  console.log(JSON.stringify(writeTouhouCommonAssets(options),null,2));
}
