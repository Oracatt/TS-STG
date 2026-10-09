import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildTouhouCommonAssets,decodeRgbaPng,normalizeTouhouPlayerData,proceduralRingSprites} from '../tools/import-touhou-common-assets.mjs';
import {verifyCommonPack} from '../tools/verify-common-pack.mjs';
import {createTouhouResources} from '../packages/thlib/dist/touhou/resources.js';
import {getTouhouPlayerData} from '../packages/thlib/dist/touhou/player-data.js';
import {TouhouPlayer} from '../packages/thlib/dist/touhou/player.js';
import {AnmBank} from '../packages/thlib/dist/touhou/anm.js';
import {DrawList,Keys} from '../packages/thlib/dist/index.js';

const source='games/touhou20/assets',available=existsSync(`${source}/anm/pl00.json`)&&existsSync(`${source}/audio/manifest.json`);
let built;const pack=()=>built??=buildTouhouCommonAssets();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const host=()=>({readText:path=>{const file=path.replace(/^relocated\//,'');assert.ok(pack().files.has(file),`Runtime read outside portable resource pack: ${path}`);return pack().files.get(file).toString('utf8');},loadTexture:path=>{
  const match=path.match(/(?:textures\/)?(pl00|pl01|effect|bullet|enemy|ascii_960|screenswitch)\/entry-(\d+)\.png$/);assert.ok(match,`Unexpected texture ${path}`);return ['pl00','pl01','effect','bullet','enemy','ascii_960','screenswitch'].indexOf(match[1])*1000+Number(match[2])+1;
}});

test('headless shared player data is the complete original baseline, with no stone profiles',()=>{
  const resources=createTouhouResources();
  assert.equal(resources.shots[0],getTouhouPlayerData('reimu'));assert.equal(resources.shots.pl01,getTouhouPlayerData('marisa'));
  assert.deepEqual(resources.shots.map(s=>s.patterns.flat().length),[72,32]);
  for(const data of resources.shots){assert.equal(data.patterns.length,15);for(const name of ['offsets','optionScripts','fullPowerScripts','damageCaps'])assert.equal(data[name].length,1);assert.ok(Object.isFrozen(data.patterns));}
  assert.equal(resources.banks.pl00,null);assert.throws(()=>getTouhouPlayerData('stone'));
});

test('common pack preserves original baseline parameters and complete selected animation bytecode',{skip:!available},()=>{
  for(const [i,name]of ['pl00','pl01'].entries())assert.deepEqual(getTouhouPlayerData(i),normalizeTouhouPlayerData(read(`${source}/shots/${name}.json`),i));
  for(const [name,entry]of Object.entries(pack().manifest.archives)){
    const shared=JSON.parse(pack().files.get(entry.file)),original=read(`${source}/anm/${name}.json`);
    for(const id of shared.selection.scripts){
      const expected=structuredClone(original.scripts[id]);
      for(const change of shared.selection.transformations.filter(change=>change.script===id)){
        if(change.operation==='omit-child')Object.assign(expected.instructions.find(ins=>ins.offset===change.offset),{opcode:0,mask:0,args:[]});
        else if(change.operation==='baseline-sprite')expected.instructions.find(ins=>ins.offset===change.offset).args[0]=change.to;
        else if(change.operation==='clean-dialogue-body-skin')assert.equal(id,{pl00:62,pl01:73}[name],'Clean skin changes sprite records only, never body bytecode');
        else assert.fail(`Unaudited resource transformation ${JSON.stringify(change)}`);
      }
      assert.deepEqual(shared.scripts[id],expected,`${name}:${id} instructions/timing changed outside explicit source boundary transformations`);
    }
    assert.ok(!JSON.stringify(shared).includes('games/touhou20'));
  }
});

// Independent audit of the importer boundary: these source IDs and mappings
// are asserted here, rather than read back from the transformer's own table.
const dialogueBodies={
  pl00:{script:62,entry:24,sprites:[92,93,94,95],titleEntry:18,mapping:{scale:1.0715,x:450.5,y:0}},
  pl01:{script:73,entry:26,sprites:[107,108,109,110],titleEntry:23,mapping:{scale:1.1215,x:266,y:20}},
};
test('clean dialogue skins preserve source body bytecode and geometry while recording exact clean/source PNG provenance',{skip:!available},()=>{
  const title=read(`${source}/anm/title.json`),changes=pack().manifest.transformations.filter(change=>change.operation==='clean-dialogue-body-skin');
  assert.equal(changes.length,2);
  for(const [name,audit]of Object.entries(dialogueBodies)){
    const original=read(`${source}/anm/${name}.json`),shared=JSON.parse(pack().files.get(`anm/${name}.json`)),change=changes.find(value=>value.archive===name);
    assert.ok(change);assert.equal(change.script,audit.script);assert.deepEqual(change.sprites,audit.sprites);
    assert.equal(change.sourceBodyEntry,audit.entry);assert.equal(change.cleanArchive,'title.anm');
    assert.equal(change.cleanEntry,audit.titleEntry);assert.deepEqual(change.mapping,audit.mapping);
    assert.equal(change.cleanArchiveSha256,title.source.sha256);
    assert.deepEqual(shared.scripts[audit.script],original.scripts[audit.script],'All source offsets, operands, timing and interrupts are unchanged');
    const originalBytes=readFileSync(`${source}/textures/${name}/entry-${audit.entry}.png`),cleanBytes=readFileSync(`${source}/textures/title/entry-${audit.titleEntry}.png`);
    const output=pack().files.get(`textures/${name}/entry-${audit.entry}.png`),texture=pack().manifest.textures.find(value=>value.file===`textures/${name}/entry-${audit.entry}.png`);
    assert.equal(change.sourceBodyPngSha256,hash(originalBytes));assert.equal(change.sourceBodyPngSha256,original.entries[audit.entry].texture.sha256);
    assert.equal(change.cleanPngSha256,hash(cleanBytes));assert.equal(change.cleanPngSha256,title.entries[audit.titleEntry].texture.sha256);
    assert.notEqual(change.sourceBodyPngSha256,change.cleanPngSha256);assert.deepEqual(output,cleanBytes,'Clean image is copied without recoloring or synthesis');
    assert.equal(texture.sha256,hash(output));assert.equal(texture.source.archive,'title.anm');
    assert.equal(texture.source.archiveSha256,title.source.sha256);assert.equal(texture.source.entry,audit.titleEntry);assert.equal(texture.source.pngSha256,change.cleanPngSha256);
    const image=decodeRgbaPng(output),entry=shared.entries[audit.entry];
    assert.deepEqual([entry.width,entry.height],[title.entries[audit.titleEntry].width,title.entries[audit.titleEntry].height]);
    assert.deepEqual([entry.texture.width,entry.texture.height],[image.width,image.height]);
    assert.equal(entry.texture.sha256,texture.sha256);assert.equal(entry.texture.sourceSha256,change.cleanPngSha256);
    for(const id of audit.sprites){
      const sourceSprite=original.sprites[id],sprite=shared.sprites[id],k=audit.mapping.scale;
      assert.equal(sprite.entry,audit.entry);assert.equal(sprite.excluded,undefined);
      for(const key of ['index','storedId','pivotX','pivotY','rotation'])assert.equal(sprite[key],sourceSprite[key],`${name}:${id} ${key}`);
      assert.equal(sprite.x,audit.mapping.x+sourceSprite.x*k);assert.equal(sprite.y,audit.mapping.y+sourceSprite.y*k);
      assert.equal(sprite.width,sourceSprite.width*k);assert.equal(sprite.height,sourceSprite.height*k);assert.equal(sprite.scaleX,sprite.scaleY);
      assert.ok(Math.abs(sprite.width*sprite.scaleX-sourceSprite.width*sourceSprite.scaleX)<1e-9);
      assert.ok(Math.abs(sprite.height*sprite.scaleY-sourceSprite.height*sourceSprite.scaleY)<1e-9);
      assert.ok(sprite.x>=0&&sprite.y>=0&&sprite.x+sprite.width<=image.width&&sprite.y+sprite.height<=image.height,`${name}:${id} UV rectangle must fit actual clean PNG, including unpadded dimensions`);
    }
    assert.match(change.geometry,/uniform/);assert.ok(change.limitation.length>0,'Different underlying illustration is explicitly documented');
  }
});

test('clean dialogue skins ship no source stone-body PNG, including unreachable colored body entries',{skip:!available},()=>{
  const textureHashes=new Set(pack().manifest.textures.map(texture=>texture.sha256));
  for(const [name,audit]of Object.entries(dialogueBodies)){
    const original=read(`${source}/anm/${name}.json`),shared=JSON.parse(pack().files.get(`anm/${name}.json`));
    for(const id of audit.sprites){
      const sourceEntry=original.entries[original.sprites[id].entry],sourceBytes=readFileSync(`${source}/textures/${name}/entry-${sourceEntry.index}.png`);
      assert.equal(hash(sourceBytes),sourceEntry.texture.sha256);assert.equal(textureHashes.has(hash(sourceBytes)),false,'No retained texture matches a stone-body input');
      assert.equal(pack().manifest.textures.some(texture=>texture.source.archive===`${name}.anm`&&texture.source.entry===sourceEntry.index),false);
      if(sourceEntry.index!==audit.entry){
        assert.equal(shared.entries[sourceEntry.index].texture.kind,'excluded');
        assert.equal(pack().files.has(`textures/${name}/entry-${sourceEntry.index}.png`),false);
      }
    }
    assert.equal(shared.entries[audit.entry].texture.sourceSha256,pack().manifest.transformations.find(change=>change.archive===name&&change.operation==='clean-dialogue-body-skin').cleanPngSha256);
  }
});

test('clean body sprite geometry retains original ANM anchors, movement, colors, alpha and interrupts',{skip:!available},()=>{
  for(const [name,audit]of Object.entries(dialogueBodies)){
    const original=new AnmBank(read(`${source}/anm/${name}.json`)),shared=new AnmBank(JSON.parse(pack().files.get(`anm/${name}.json`)));
    const sourceBody=original.create(audit.script),cleanBody=shared.create(audit.script);
    for(let frame=0;frame<110;frame++){
      if(frame===25||frame===55){sourceBody.interrupt(frame===25?3:2);cleanBody.interrupt(frame===25?3:2);}
      sourceBody.update();cleanBody.update();
      for(const key of ['pc','time','alive','visible','spriteIndex','alpha','color','secondaryColor','x','y','z','scaleX','scaleY','rotation'])
        assert.equal(cleanBody[key],sourceBody[key],`${name} frame${frame} ${key}`);
      assert.equal(cleanBody.U(0x4a8),sourceBody.U(0x4a8));assert.equal(cleanBody.U(0x4ac),sourceBody.U(0x4ac));
      const expected=sourceBody.corners(),actual=cleanBody.corners();
      for(let corner=0;corner<4;corner++)for(const axis of ['x','y','z'])
        assert.ok(Math.abs(actual[corner][axis]-expected[corner][axis])<1/4096,`${name} frame${frame} corner${corner}/${axis}: uniform UV resizing must preserve body geometry within float32 rounding`);
    }
    original.dispose();shared.dispose();
  }
});

test('package-local verification accepts the audited clean bodies without reading either demo',{skip:!available||!existsSync('packages/thlib/assets/touhou-common/manifest.json')},()=>{
  const result=verifyCommonPack('packages/thlib/assets/touhou-common');assert.equal(result.archives,10);assert.ok(result.scripts>0);
});

test('mixed atlases retain selected RGBA exactly and remove every other pixel',{skip:!available},()=>{
  for(const texture of pack().manifest.textures){
    if(texture.originalHudLabels)continue; // Separate source/audit, not a TH20 reconstruction texture.
    const output=pack().files.get(texture.file),input=readFileSync(`${source}/textures/${texture.source.archive.slice(0,-4)}/entry-${texture.source.entry}.png`);
    assert.equal(hash(input),texture.source.pngSha256);assert.equal(hash(output),texture.sha256);
    if(texture.spriteMappings)continue; // UI packing has a separate pixel-by-pixel oracle below.
    if(!texture.rectangles){assert.deepEqual(output,input);continue;}
    const original=decodeRgbaPng(input),shared=decodeRgbaPng(output),mask=new Uint8Array(shared.width*shared.height);
    assert.equal(shared.width,original.width);assert.equal(shared.height,original.height);
    for(const r of texture.rectangles)for(let y=Math.max(0,r.y);y<Math.min(shared.height,r.y+r.height);y++)for(let x=Math.max(0,r.x);x<Math.min(shared.width,r.x+r.width);x++)mask[y*shared.width+x]=1;
    for(let p=0;p<mask.length;p++)for(let c=0;c<4;c++)assert.equal(shared.rgba[p*4+c],mask[p]?original.rgba[p*4+c]:0,`${texture.file} pixel ${p}, channel ${c}`);
  }
});

test('every common static UI cell preserves original RGBA and geometry with independent own-edge sampling gutters',{skip:!available},()=>{
  const counts={},nontransparentBlack={};
  for(const name of ['front','ascii_960','title']){
    const original=read(`${source}/anm/${name}.json`),shared=JSON.parse(pack().files.get(`anm/${name}.json`));counts[name]=0;nontransparentBlack[name]=0;
    assert.equal(shared.entries.length,original.entries.length+(name==='front'?1:0),'Only the separately audited common label atlas is appended');
    for(const entry of shared.entries.slice(0,original.entries.length)){
      if(!entry.texture.path){if(['dynamic','renderTarget'].includes(entry.texture.kind))assert.deepEqual(entry,original.entries[entry.index]);continue;}
      if(name==='ascii_960'&&entry.index===7)continue; // Audited source-margin loading atlas retains original UV quantization.
      const texture=pack().manifest.textures.find(t=>t.file===entry.texture.path),mappings=texture.spriteMappings;
      const image=decodeRgbaPng(pack().files.get(texture.file)),input=readFileSync(`${source}/textures/${name}/entry-${entry.index}.png`),sourceImage=decodeRgbaPng(input);
      assert.equal(texture.source.pngSha256,hash(input));assert.equal(texture.sha256,hash(pack().files.get(texture.file)));
      assert.deepEqual([entry.width,entry.height,entry.texture.width,entry.texture.height],[image.width,image.height,image.width,image.height]);
      assert.deepEqual(mappings.map(m=>m.sprite),shared.sprites.filter(s=>!s.excluded&&s.entry===entry.index).map(s=>s.index));
      const repeatX=name==='front'&&[7,9].includes(entry.index),occupied=new Set();
      const wrap=(v,size)=>((v%size)+size)%size;
      for(const m of mappings){
        counts[name]++;const s=original.sprites[m.sprite],d=m.destination,sprite=shared.sprites[m.sprite];
        assert.deepEqual(m.source,{x:s.x,y:s.y,width:s.width,height:s.height});
        assert.deepEqual({...sprite,x:s.x,y:s.y},s,'Only UV origin is remapped; complete quad geometry stays exact');
        const repeatY=name==='front'&&[183,184].includes(m.sprite);
        assert.equal(m.edgeSampling,repeatY?'source':'own');
        assert.deepEqual([m.paddingX,m.paddingY],[repeatX?0:2,repeatY?0:2]);assert.equal(m.sourceAddress,'wrap');
        assert.ok(d.x>=m.paddingX&&d.y>=m.paddingY&&d.x+d.width+m.paddingX<=image.width&&d.y+d.height+m.paddingY<=image.height);
        if(repeatX){assert.equal(d.x,0);assert.equal(image.width,sourceImage.width);assert.equal(d.width,image.width);}
        if(repeatY){assert.equal(d.y,0);assert.equal(image.height,sourceImage.height);assert.equal(d.height,image.height);}
        // Expected interior/gutter pixels come directly from immutable source
        // PNGs. Own-edge clamping is deliberately different from the source's
        // adjacent atlas texel; no mask inferred from the output is used.
        for(let dy=-m.paddingY;dy<s.height+m.paddingY;dy++){
          const expected=Buffer.alloc((s.width+m.paddingX*2)*4),sy=wrap(s.y+Math.max(0,Math.min(s.height-1,dy)),sourceImage.height);
          for(let dx=-m.paddingX;dx<s.width+m.paddingX;dx++){
            const sx=wrap(s.x+(repeatY?dx:Math.max(0,Math.min(s.width-1,dx))),sourceImage.width),from=(sy*sourceImage.width+sx)*4;
            sourceImage.rgba.copy(expected,(dx+m.paddingX)*4,from,from+4);
            if(dx>=0&&dx<s.width&&dy>=0&&dy<s.height&&sourceImage.rgba[from+3]&&sourceImage.rgba[from]+sourceImage.rgba[from+1]+sourceImage.rgba[from+2]===0)nontransparentBlack[name]++;
          }
          const begin=((d.y+dy)*image.width+d.x-m.paddingX)*4;
          assert.deepEqual(image.rgba.subarray(begin,begin+expected.length),expected,`${name}:${m.sprite} source RGBA/gutter row ${dy}`);
        }
        // Duplicate source rectangles may deliberately share a packed cell.
        const key=[d.x,d.y,d.width,d.height,m.paddingX,m.paddingY].join(':');
        if(occupied.has(key))continue;
        for(const previous of occupied){const [x,y,w,h,px,py]=previous.split(':').map(Number);
          assert.ok(d.x+d.width+m.paddingX<=x-px||x+w+px<=d.x-m.paddingX||d.y+d.height+m.paddingY<=y-py||y+h+py<=d.y-m.paddingY,'Packed cell gutters never overlap another cell');}
        occupied.add(key);
      }
    }
  }
  assert.deepEqual(counts,{front:127,ascii_960:912,title:28},'Covers HUD, result notices, STAGE CLEAR, dialogue balloons, bitmap fonts, menus and pause UI');
  assert.ok(Object.values(nontransparentBlack).every(n=>n>0),'Original black glyph/illustration pixels are present and preserved, never color-keyed');
  const text=JSON.parse(pack().files.get('anm/text.json')),originalText=read(`${source}/anm/text.json`);
  for(const entry of text.entries.filter(e=>['dynamic','renderTarget'].includes(e.texture.kind)))assert.deepEqual(entry,originalText.entries[entry.index]);
});

test('capture and failure notice gutters exclude opaque HUD-frame neighbours while keeping source animation geometry',{skip:!available},()=>{
  const original=read(`${source}/anm/front.json`),shared=JSON.parse(pack().files.get('anm/front.json'));
  const change=pack().manifest.transformations.find(c=>c.archive==='front'&&c.entry===0&&c.operation==='pad-ui-atlas');assert.ok(change);
  const entry=shared.entries[0],texture=pack().manifest.textures.find(t=>t.file===entry.texture.path);
  const bytes=pack().files.get(entry.texture.path),image=decodeRgbaPng(bytes);
  const sourceBytes=readFileSync(`${source}/textures/front/entry-0.png`),sourceImage=decodeRgbaPng(sourceBytes);
  assert.equal(texture.source.pngSha256,hash(sourceBytes));assert.equal(entry.texture.sourceSha256,hash(sourceBytes));
  assert.equal(texture.sha256,hash(bytes));assert.equal(entry.texture.sha256,hash(bytes));
  for(const [id,script] of [[39,49],[40,50]]){
    const sprite=shared.sprites[id],sourceSprite=original.sprites[id];
    assert.deepEqual({...sprite,x:sourceSprite.x,y:sourceSprite.y},sourceSprite,'only sprite UV origins change; source quad geometry stays exact');
    assert.deepEqual(shared.scripts[script],original.scripts[script],'notice ANM bytecode is unmodified');
    const mapping=texture.spriteMappings.find(m=>m.sprite===id);assert.ok(mapping.foreignBorderPixels>=64);
    let adjacentOpaque=0;
    for(let y=sourceSprite.y;y<sourceSprite.y+sourceSprite.height;y++){
      const adjacent=(y*1024+sourceSprite.x-1)*4;
      if(sourceImage.rgba[adjacent+3])adjacentOpaque++;
      for(const gutter of [1,2]){const fixed=((sprite.y+y-sourceSprite.y)*image.width+sprite.x-gutter)*4;
        assert.equal(image.rgba[fixed+3],0,'left sampling neighbours stay transparent instead of sampling HUD frame');}
    }
    assert.equal(adjacentOpaque,64,'regression fixture really borders the opaque frame on every source row');
    const sourceBank=new AnmBank(original),commonBank=new AnmBank(shared),a=sourceBank.create(script),b=commonBank.create(script);
    for(let frame=0;frame<140;frame++){
      assert.deepEqual(b.corners(),a.corners(),`script${script} frame${frame} world geometry`);
      assert.equal(b.alpha,a.alpha);assert.equal(b.alive,a.alive);a.update();b.update();
    }
    sourceBank.dispose();commonBank.dispose();
  }
  assert.equal(shared.sprites[1].entry,0,'Original HUD frame and notices retain their public entry IDs while sampling independent cells');
});

test('UI packing preserves original horizontal strip repeats and source UV animations',{skip:!available},()=>{
  const original=read(`${source}/anm/front.json`),shared=JSON.parse(pack().files.get('anm/front.json'));
  const sourceBank=new AnmBank(original),commonBank=new AnmBank(shared);
  // These source scripts interpolate from zero to positive/negative four UV
  // periods. Their Y period remains one. Keep all source ANM frames and sampler
  // flags, rather than replacing the strip with a stretched non-repeating cell.
  for(let id=166;id<=213;id++){
    const a=sourceBank.create(id),b=commonBank.create(id);
    for(let frame=0;frame<40;frame++){
      assert.equal(b.textureScaleX,a.textureScaleX);assert.equal(b.textureScaleY,1);assert.equal(b.textureScaleY,a.textureScaleY);
      assert.equal(b.U(0x4a0),a.U(0x4a0));assert.deepEqual(b.corners(),a.corners());a.update();b.update();
    }
  }
  for(const entry of [7,9]){
    const src=decodeRgbaPng(readFileSync(`${source}/textures/front/entry-${entry}.png`)),out=decodeRgbaPng(pack().files.get(`textures/front/entry-${entry}.png`));
    assert.equal(src.width,32);assert.equal(out.width,32);
    for(const s of shared.sprites.filter(s=>!s.excluded&&s.entry===entry)){
      const o=original.sprites[s.index];assert.equal(s.x,0);assert.equal(s.width,32);
      for(const period of [-4,-3,-1,0,1,3,4])for(const dx of [0,1,15,31])for(const y of [0,Math.floor(s.height/2),s.height-1]){
        const x=((period*32+dx)%out.width+out.width)%out.width;
        assert.deepEqual(out.rgba.subarray(((s.y+y)*out.width+x)*4,((s.y+y)*out.width+x+1)*4),
          src.rgba.subarray(((o.y+y)*src.width+dx)*4,((o.y+y)*src.width+dx+1)*4),'Positive and negative full-width repeats sample identical source pixels');
      }
    }
  }
  sourceBank.dispose();commonBank.dispose();
});

test('procedural ring repetition is detected from selected ANM dependencies rather than bank or sprite IDs',()=>{
  const ins=(opcode,args=[],mask=0)=>({opcode,args,mask});
  const bank={name:'consumer-atlas',scripts:[
    {instructions:[ins(300,[42]),ins(600,[32])]},
    {instructions:[ins(301,[70,2]),ins(601,[32])]},
    {instructions:[ins(300,[93]),ins(602,[32])]},
    {instructions:[ins(300,[150]),ins(603,[32])]},
    {instructions:[ins(300,[999]),ins(600,[32])]},
  ]};
  assert.deepEqual([...proceduralRingSprites(bank,[0,1,2,3])],[42,70,71,93]);
  for(const instructions of [[ins(602,[32])],[ins(300,[42],1),ins(602,[32])]])
    assert.throws(()=>proceduralRingSprites({name:'unreviewed',scripts:[{instructions}]},[0]),/requires review/);
});

test('packed Boss rings preserve whole-texture V sampling through full and half arcs, repeated periods and offsets',{skip:!available},()=>{
  const original=read(`${source}/anm/front.json`),shared=JSON.parse(pack().files.get('anm/front.json'));
  const sourceImage=decodeRgbaPng(readFileSync(`${source}/textures/front/entry-11.png`));
  const commonImage=decodeRgbaPng(pack().files.get('textures/front/entry-11.png'));
  const change=pack().manifest.transformations.find(c=>c.archive==='front'&&c.entry===11&&c.operation==='pad-ui-atlas');
  assert.deepEqual(change.repeatY,[183,184]);assert.equal(sourceImage.height,32);assert.equal(commonImage.height,32);
  assert.equal(shared.sprites[183].y,0);assert.equal(shared.sprites[184].y,0);assert.equal(shared.sprites[185].y,2,'The marker keeps its independent Y gutters');
  const sourceBank=new AnmBank(original,{loadTexture:()=>1}),commonBank=new AnmBank(shared,{loadTexture:()=>1});
  const sample=(image,u,v)=>{
    const x=u*image.width-.5,y=v*image.height-.5,x0=Math.floor(x),y0=Math.floor(y),dx=x-x0,dy=y-y0;
    const pixel=(px,py,c)=>image.rgba[((((py%image.height)+image.height)%image.height)*image.width+((px%image.width)+image.width)%image.width)*4+c];
    return Array.from({length:4},(_,c)=>(pixel(x0,y0,c)*(1-dx)+pixel(x0+1,y0,c)*dx)*(1-dy)+(pixel(x0,y0+1,c)*(1-dx)+pixel(x0+1,y0+1,c)*dx)*dy);
  };
  try{
    for(const script of [374,375,376])for(const fraction of [1,.5])for(const periods of [1,2])for(const offset of [0,.1375,-.3125]){
      const a=sourceBank.create(script),b=commonBank.create(script);
      for(const vm of [a,b]){vm.F(0x38,Math.fround(-Math.PI*2*fraction));vm.U(0x448,periods);vm.F(0x7c,offset);}
      const drawA=new DrawList(),drawB=new DrawList();a.draw(drawA);b.draw(drawB);
      const meshA=drawA.commands.find(c=>c[0]==='mesh'),meshB=drawB.commands.find(c=>c[0]==='mesh');
      assert.ok(meshA&&meshB);assert.deepEqual(meshB[3],meshA[3]);
      for(let i=0;i<meshA[2].length;i++){
        assert.deepEqual(meshB[2][i].slice(0,2),meshA[2][i].slice(0,2),'Packing never changes full/half arc geometry');
        assert.equal(meshB[2][i][3],meshA[2][i][3],'The original V coordinate is unchanged, including repeats and offsets');
      }
      const src=original.sprites[a.spriteIndex],dst=shared.sprites[b.spriteIndex];
      // Compare original strip edges as well as every interior texel along
      // actual mesh V values and interpolated midpoints. Ring X gutters retain
      // source neighbours, unlike ordinary UI's own-edge extrusion.
      for(let i=0;i<meshA[2].length-2;i+=2)for(const t of [0,.5,1]){
        const va=meshA[2][i][3]*(1-t)+meshA[2][i+2][3]*t,vb=meshB[2][i][3]*(1-t)+meshB[2][i+2][3]*t;
        for(const x of [0,.125,...Array.from({length:src.width},(_,i)=>i+.5),src.width-.125,src.width])assert.deepEqual(sample(commonImage,(dst.x+x)/commonImage.width,vb),sample(sourceImage,(src.x+x)/sourceImage.width,va),
          `script${script} fraction${fraction} periods${periods} offset${offset} segment${i/2}: ring strip must not sample empty atlas rows`);
        if(script===374)assert.deepEqual(sample(commonImage,(dst.x+4.5)/commonImage.width,vb),[255,255,255,255],'Every angular segment has a fully opaque white health core');
      }
      a.destroy();b.destroy();
    }
  }finally{sourceBank.dispose();commonBank.dispose();}
});

test('scene-switch textures retain exact source pixels and oversized wrapped UVs; NowLoading retains its complete tree',{skip:!available},()=>{
  const original=read(`${source}/anm/screenswitch.json`),shared=JSON.parse(pack().files.get('anm/screenswitch.json'));
  assert.deepEqual(shared.selection.scripts,Array.from({length:12},(_,i)=>i));
  assert.deepEqual(shared.scripts,original.scripts);assert.deepEqual(shared.sprites,original.sprites);
  assert.deepEqual(shared.sprites.map(s=>[s.x,s.y,s.width,s.height]),[[0,1,128,128],[0,0,1280,960]]);
  for(const entry of shared.entries){
    const texture=pack().manifest.textures.find(t=>t.file===entry.texture.path);
    assert.equal(texture.operation,'Byte-for-byte copy');assert.equal(texture.spriteMappings,undefined);
    assert.equal(texture.sha256,texture.source.pngSha256);
    assert.equal(texture.source.archiveSha256,original.source.sha256);
    assert.deepEqual(pack().files.get(texture.file),readFileSync(`${source}/textures/screenswitch/entry-${entry.index}.png`));
    assert.deepEqual([entry.width,entry.height],[original.entries[entry.index].width,original.entries[entry.index].height]);
  }
  const loading=JSON.parse(pack().files.get('anm/ascii_960.json')),sourceLoading=read(`${source}/anm/ascii_960.json`);
  for(const id of [14,15,16,17])assert.deepEqual(loading.scripts[id],sourceLoading.scripts[id]);
  assert.deepEqual(loading.scripts[17].instructions.filter(i=>i.opcode===501).map(i=>i.args[0]),[15,14,16]);
  assert.deepEqual(loading.sprites.filter(s=>s.entry===7).map(s=>s.index),[912,913,914]);
  for(const id of [912,913,914])assert.deepEqual(loading.sprites[id],sourceLoading.sprites[id]);
  assert.deepEqual(pack().files.get('textures/ascii_960/entry-7.png'),readFileSync(`${source}/textures/ascii_960/entry-7.png`));
});

test('portable loader excludes stone and specific artwork but includes original common Boss, transition and application effects',{skip:!available},()=>{
  const resources=createTouhouResources(host(),{basePath:'relocated'});
  for(const [name,ids]of Object.entries({pl00:[39,40],pl01:[34,35],bullet:[123,131,132,136],enemy:[272,326],ascii_960:[18,19],front:[13,150,165],title:[1,30,32,33]}))
    for(const id of ids)assert.throws(()=>resources.banks[name].create(id),/Excluded/);
  for(const [name,ids]of Object.entries({pl00:[0,7,8,37,38,46,61,62,64,66],pl01:[0,7,10,13,32,33,51,65,73,75,77],bullet:[115,122,137,144,162],effect:[4,5,6,13,19,21,22,94,148],front:[0,100,144,145,147,148,374,377],title:[0,12,31,34,35,58,134,135],text:[22,23,87],screenswitch:[0,1,2,3,4,5,6,7,8,9,10,11],ascii_960:[14,15,16,17]}))
    for(const id of ids)assert.ok(resources.banks[name].create(id));
  const sounds=resources.audioManifest;assert.deepEqual(sounds.music,[]);
  for(const id of [0,1,2,13,17,20,27,37,42,44,46,48,49,69,71,74])assert.ok(sounds.definitions.some(d=>d.id===id));
  assert.ok(sounds.files.every(f=>f.path.startsWith('relocated/audio/')));
  assert.ok(sounds.files.every(f=>!/(lgods|changeitem|release|warp|notice)/.test(f.name)));
  resources.dispose();
});

test('shared textures survive individual bank disposal and are released once by the resource owner',{skip:!available},()=>{
  const loaded=[],unloaded=[],soundLoads=[],soundPlays=[],soundStops=[],soundUnloads=[];
  const adapter={...host(),loadTexture:(...args)=>{loaded.push(args);return loaded.length;},unloadTexture:id=>unloaded.push(id),loadSound:path=>{soundLoads.push(path);return soundLoads.length;},playSound:(...args)=>soundPlays.push(args),stopSound:id=>soundStops.push(id),unloadSound:id=>soundUnloads.push(id)};
  const resources=createTouhouResources(adapter,{basePath:'relocated'}),bank=resources.banks.pl00,another=resources.createBank('pl00');
  bank.create(0).draw(new DrawList());another.create(0).draw(new DrawList());assert.equal(loaded.length,1);
  bank.dispose();another.draw(new DrawList());assert.equal(unloaded.length,0);
  resources.audio.request(49,0);resources.audio.flush();assert.equal(soundLoads[0],'relocated/audio/se_nep00.wav');assert.equal(soundPlays.length,1);
  resources.dispose();resources.dispose();assert.deepEqual(unloaded,[1]);assert.deepEqual(soundStops,[1]);assert.deepEqual(soundUnloads,[1]);
});

test('resource cleanup forgets banks retired by retries and rejects reuse after disposal',{skip:!available},()=>{
  const resources=createTouhouResources(host(),{basePath:'relocated'}),counts=[];
  for(let retry=0;retry<4;retry++){
    const bank=resources.createBank('pl00'),dispose=bank.dispose.bind(bank);counts[retry]=0;
    bank.dispose=()=>{counts[retry]++;dispose();};bank.create(0);bank.dispose();
  }
  const initial=resources.banks.pl00;initial.dispose();assert.equal(resources.banks.pl00,null);
  const active=resources.createBank('pl01'),disposeActive=active.dispose.bind(active);let activeDisposals=0;
  active.dispose=()=>{activeDisposals++;disposeActive();};
  resources.dispose();resources.dispose();
  assert.deepEqual(counts,[1,1,1,1],'Retired banks must not remain registered for another disposal');
  assert.equal(activeDisposals,1);assert.equal(resources.disposed,true);
  assert.ok(Object.values(resources.banks).every(bank=>bank===null));
  assert.throws(()=>resources.createBank('pl00'),/disposed/);
});

test('each dynamic ANM entry and consumer bank owns a distinct surface',{skip:!available},()=>{
  let next=0;const released=[];
  const resources=createTouhouResources({...host(),createRenderTarget:()=>++next,
    createTexture:()=>++next,unloadTexture:id=>released.push(id)},{basePath:'relocated'});
  const a=resources.banks.text,b=resources.createBank('text');
  const ids=[a.texture(0),a.texture(1),a.texture(2),a.texture(3),b.texture(0),b.texture(2)];
  assert.equal(new Set(ids).size,ids.length,'Equal names or sizes must not share mutable pixels');
  assert.equal(a.texture(0),ids[0]);a.dispose();
  assert.deepEqual(released,ids.slice(0,4));assert.equal(b.texture(2),ids[5]);
  resources.dispose();assert.deepEqual(released,ids);
});

test('shared animation banks reproduce original player state and render commands through movement, weapons, focus and both Bombs',{skip:!available},()=>{
  for(const character of [0,1]){
    const adapter=host(),shared=createTouhouResources(adapter,{basePath:'relocated'}),name=`pl0${character}`;
    const originalPlayer=new AnmBank(read(`${source}/anm/${name}.json`),adapter),originalEffect=new AnmBank(read(`${source}/anm/effect.json`),adapter);
    const reference=new TouhouPlayer({character,sht:read(`${source}/shots/${name}.json`),bank:originalPlayer,effectBank:originalEffect,power:400});
    const actual=new TouhouPlayer({character,sht:shared.shots[character],bank:shared.banks[name],effectBank:shared.banks.effect,power:400});
    const expectedSound=[],actualSound=[],contexts=[expectedSound,actualSound].map(sound=>({enemies:[{x:20,y:100,radius:14,hp:999999}],sound:(id,x)=>sound.push([id,x])}));
    for(let frame=0;frame<360;frame++){
      const mask=Keys.SHOOT|(frame>30&&frame<110?Keys.FOCUS:0)|(frame>40&&frame<70?Keys.LEFT:0)|(frame===115?Keys.BOMB:0);
      reference.update(mask,contexts[0]);actual.update(mask,contexts[1]);
      assert.deepEqual(actual.snapshot(),reference.snapshot(),`character=${character}, frame=${frame} gameplay`);
      const expectedDraw=new DrawList(),actualDraw=new DrawList();reference.draw(expectedDraw,{x:320,y:0,scale:1.5});actual.draw(actualDraw,{x:320,y:0,scale:1.5});
      assert.deepEqual(actualDraw.commands,expectedDraw.commands,`character=${character}, frame=${frame} animation commands`);
    }
    assert.deepEqual(actualSound,expectedSound);shared.dispose();originalPlayer.dispose();originalEffect.dispose();
  }
});
