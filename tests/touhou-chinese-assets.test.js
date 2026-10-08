import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {test} from 'node:test';
import {appendTouhouChineseAssets,decodeTouhouChinesePng} from '../tools/build-touhou-zh-assets.mjs';

const packRoot=fileURLToPath(new URL('../packages/thlib/assets/touhou-common/',import.meta.url));
const sourceRoot=fileURLToPath(new URL('../tools/assets/touhou-zh/',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(readFileSync(join(packRoot,'manifest.json'),'utf8'));
delete manifest.locales;
const originalManifest=structuredClone(manifest),files=new Map();
for(const entry of [...Object.values(manifest.archives),...manifest.textures])
  files.set(entry.file,readFileSync(join(packRoot,entry.file)));
const originalFiles=new Map(files),source=JSON.parse(readFileSync(join(sourceRoot,'source.json'),'utf8'));
const locale=appendTouhouChineseAssets({files,manifest});
const originalBanks=Object.fromEntries(Object.entries(originalManifest.archives).map(([name,entry])=>[name,JSON.parse(originalFiles.get(entry.file))]));
const localizedBanks=Object.fromEntries(Object.entries(locale.archives).map(([name,entry])=>[name,JSON.parse(files.get(entry.file))]));
const mappings=locale.textures.flatMap(texture=>texture.spriteMappings);
const decoded=new Map();
function image(bytes){const key=hash(bytes);if(!decoded.has(key))decoded.set(key,decodeTouhouChinesePng(bytes));return decoded.get(key);}
function pixel(input,x,y){return input.rgba.subarray((y*input.width+x)*4,(y*input.width+x+1)*4);}
function assertRows(input,sourceRect,output,destination,label){
  assert.deepEqual([sourceRect.width,sourceRect.height],[destination.width,destination.height],label);
  for(let row=0;row<sourceRect.height;row++){
    const a=((sourceRect.y+row)*input.width+sourceRect.x)*4,b=((destination.y+row)*output.width+destination.x)*4;
    assert.ok(input.rgba.subarray(a,a+sourceRect.width*4).equals(output.rgba.subarray(b,b+destination.width*4)),`${label}: RGBA row ${row}`);
  }
}

test('Chinese sources are audited generic UI cells with stable semantic rectangles',()=>{
  // This review snapshot pins all 41 source rectangles and original PNG/cell
  // hashes independently of the importer. It changes only after source review.
  assert.equal(hash(Buffer.from(JSON.stringify(source))),'dec0e7ff679bceae7352a0cf134c0891b2763bf6fcd4559844630a39db51ec4c');
  assert.equal(source.source.packageSha256,'3707f3bd3e935d2ebb001e0bbd1b1db2ecd00ecf41116571c98a74ae786ce4b0');
  assert.equal(source.source.databaseSha256,'3593e515c01f42664233e800d25495d41afe25a7c864a865f247ad3f941f0edc');
  assert.equal(source.cells.length,41);
  const allowed=/^data\/(?:front\/front00\.png|ascii\/pause(?:_title)?\.png|title\/(?:title_pl0[01]c\.png|rank00\.png|selecttitle\/sl_(?:rank|player|stage|spell|replay|playerdata|manual|savereplay|regist|weapon|music)\.png))$/;
  for(const cell of source.cells){
    assert.match(cell.source.file,allowed,'No title logo, stage, seasonal weapon or story donor is admitted');
    const bytes=readFileSync(join(sourceRoot,cell.file));assert.equal(hash(bytes),cell.sha256,cell.key);
    const png=image(bytes);assert.deepEqual([png.width,png.height],[cell.width,cell.height]);
    const parts=[{rect:cell.source.rect,x:cell.source.destination.x,y:cell.source.destination.y},...(cell.source.additionalParts??[])];
    for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++)if(!parts.some(part=>x>=part.x&&y>=part.y&&x<part.x+part.rect.width&&y<part.y+part.rect.height))
      assert.equal(png.rgba.readUInt32BE((y*png.width+x)*4),0,`${cell.key}: canvas outside the selected source remains clear`);
  }
  for(const [key,rect]of [
    ['high-score',{x:512,y:0,width:144,height:36}],['score',{x:512,y:36,width:144,height:36}],
    ['lives',{x:512,y:72,width:144,height:36}],['fragments',{x:576,y:108,width:80,height:36}],
    ['power',{x:664,y:108,width:144,height:36}],['point-value',{x:664,y:72,width:168,height:36}],
    ['graze',{x:704,y:36,width:128,height:36}],['spell-time',{x:672,y:608,width:128,height:64}],
  ])assert.deepEqual(source.cells.find(cell=>cell.key===key).source.rect,rect,'HUD rows use the actual 36-pixel source cadence');
  for(const key of ['point-value','graze'])assert.equal(source.cells.find(cell=>cell.key===key).displayHeight,36,'New common labels match the existing status-lettering height');
  const point=image(readFileSync(join(sourceRoot,'point-value.png')));
  assert.ok(Array.from({length:40*36},(_,i)=>{const x=i%40,y=Math.floor(i/40),p=(y*point.width+x)*4;return point.rgba[p+3]>128&&point.rgba[p+2]>point.rgba[p]+20;}).filter(Boolean).length>80,'The source blue point-item icon is included left of the maximum-value lettering');
  assert.ok(!source.cells.some(cell=>cell.source.file==='data/ascii/pause.png'&&cell.source.rect.y===512),'Return to Waypoint cannot become Options');
});

test('locale append leaves all base bytes, selection boundaries and ANM instructions unchanged',()=>{
  const {locales,...baseAfter}=manifest;assert.deepEqual(baseAfter,originalManifest);
  assert.equal(locales['zh-CN'],locale);assert.deepEqual(Object.keys(locale.archives),['front','ascii_960','title']);
  for(const [file,bytes]of originalFiles)assert.ok(files.get(file).equals(bytes),file);
  assert.ok(locale.textures.every(texture=>!manifest.textures.some(base=>base.file===texture.file)));
  assert.deepEqual(locale.textures.map(texture=>texture.spriteMappings.length),[27,26]);
  for(const [name,bank]of Object.entries(localizedBanks)){
    const base=originalBanks[name],changed=new Set(mappings.filter(mapping=>mapping.archive===name).map(mapping=>mapping.sprite));
    assert.deepEqual(bank.scripts,base.scripts,`${name}: complete script records unchanged`);
    assert.equal(bank.sprites.length,base.sprites.length);
    assert.deepEqual(bank.entries.slice(0,base.entries.length),base.entries);
    for(let id=0;id<base.sprites.length;id++)if(!changed.has(id))assert.deepEqual(bank.sprites[id],base.sprites[id],`${name}:${id}: no unrelated sprite substitution`);
    for(const id of changed)assert.ok(!base.sprites[id].excluded);
  }
  const {locale:metadata,...ascii}=localizedBanks.ascii_960;
  assert.equal(metadata.language,'zh-CN');assert.deepEqual(ascii,originalBanks.ascii_960,'Bitmap glyph indices, advances and textures remain original');
  assert.throws(()=>appendTouhouChineseAssets({files,manifest}),/already appended/);
});

test('every localized atlas interior and two-pixel gutter matches its exact source RGBA',()=>{
  for(const texture of locale.textures){
    const bytes=files.get(texture.file),atlas=image(bytes);assert.equal(hash(bytes),texture.sha256);
    assert.deepEqual([atlas.width,atlas.height],[texture.width,texture.height]);
    for(const mapping of texture.spriteMappings){
      const d=mapping.destination,cell=source.cells.find(value=>value.key===mapping.key);let expected;
      if(cell)expected=image(readFileSync(join(sourceRoot,cell.file)));
      else{
        const s=mapping.source,r=s.rect,original=image(originalFiles.get(s.file));
        assert.equal(hash(originalFiles.get(s.file)),s.pngSha256);
        expected={width:r.width,height:r.height,rgba:Buffer.alloc(r.width*r.height*4)};
        for(const region of s.regions)for(let row=0;row<region.height;row++){
          const input=((r.y+region.y+row)*original.width+r.x+region.x)*4,output=((region.y+row)*expected.width+region.x)*4;
          original.rgba.copy(expected.rgba,output,input,input+region.width*4);
        }
      }
      assertRows(expected,{x:0,y:0,width:expected.width,height:expected.height},atlas,d,`${mapping.archive}:${mapping.sprite}`);
      for(let y=-2;y<d.height+2;y++)for(let x=-2;x<d.width+2;x++)if(x<0||y<0||x>=d.width||y>=d.height)
        assert.ok(pixel(atlas,d.x+x,d.y+y).equals(pixel(expected,Math.min(d.width-1,Math.max(0,x)),Math.min(d.height-1,Math.max(0,y)))),`${mapping.key}: own-edge gutter ${x},${y}`);
    }
  }
});

test('fallback cells preserve only the reviewed English regions and explicitly disclose omissions',()=>{
  const fallbacks=mappings.filter(mapping=>mapping.source.kind==='base-English-mask');
  assert.equal(fallbacks.length,12);assert.equal(locale.untranslated.length,15);
  for(const mapping of fallbacks){
    const expected=mapping.archive==='front'?{x:0,y:40,width:512,height:24}:mapping.sprite===16?{x:0,y:58,width:512,height:82}:{x:0,y:76,width:512,height:38};
    assert.deepEqual(mapping.source.regions,[expected]);
    assert.ok(locale.untranslated.some(entry=>entry.archive===mapping.archive&&entry.sprite===mapping.sprite));
    const texture=locale.textures.find(texture=>texture.spriteMappings.includes(mapping)),atlas=image(files.get(texture.file)),d=mapping.destination;
    for(let y=0;y<d.height;y++)for(let x=0;x<d.width;x++)if(x<expected.x||y<expected.y||x>=expected.x+expected.width||y>=expected.y+expected.height)
      assert.equal(atlas.rgba.readUInt32BE(((d.y+y)*atlas.width+d.x+x)*4),0,`${mapping.key}: Japanese/exclusive source area is fully clear`);
  }
  for(const key of ['title-weapon','title-reimu-name','title-marisa-name']){
    const mapping=mappings.find(mapping=>mapping.key===key);assert.ok(locale.untranslated.some(entry=>entry.archive===mapping.archive&&entry.sprite===mapping.sprite));
  }
  assert.match(locale.retained[0].reason,/終/);
});

test('translated geometry uses one uniform scale and preserves original pivot/rotation/IDs',()=>{
  for(const mapping of mappings){
    const original=originalBanks[mapping.archive].sprites[mapping.sprite],sprite=localizedBanks[mapping.archive].sprites[mapping.sprite],d=mapping.destination;
    const height=mapping.geometry.displayHeight;
    const scale=height===undefined?Math.min(original.width*(original.scaleX??1)/d.width,original.height*(original.scaleY??1)/d.height):height/d.height;
    assert.equal(sprite.scaleX,scale);assert.equal(sprite.scaleY,scale);assert.ok(Number.isFinite(scale)&&scale>0);
    if(height===undefined)assert.ok(sprite.width*scale<=original.width*(original.scaleX??1)+1e-9&&sprite.height*scale<=original.height*(original.scaleY??1)+1e-9);
    else{assert.equal(mapping.archive,'front');assert.ok([186,187].includes(mapping.sprite));assert.equal(sprite.height*scale,36);assert.equal(scale,1);}
    for(const key of ['index','storedId','pivotX','pivotY','rotation'])assert.equal(sprite[key],original[key]);
    const texture=locale.textures.find(texture=>texture.spriteMappings.includes(mapping));
    assert.ok(d.x>=2&&d.y>=2&&d.x+d.width+2<=texture.width&&d.y+d.height+2<=texture.height);
  }
});
