import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {padUiAtlas} from './import-touhou-common-assets.mjs';

const args=process.argv.slice(2);
assert.equal(args.length,2,'Usage: node tools/prepare-touhou-hud-labels.mjs --source <THlib-Evo-hud checkout>');
assert.equal(args[0],'--source');
const source=resolve(args[1]),input=readFileSync(join(source,'packages/thlib-resources/THlib/UI/hint.png'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(input),'b9430aae9045af26b933b48b4cb7cc9a5194a0b917cab0b84d16dc8e30e2c5f3');
const script=readFileSync(join(source,'packages/thlib-scripts/THlib/UI/UI.lua'),'utf8');
const labels=[{key:'pointValue',sourceSprite:'hint.point',sourceRect:{x:160,y:12,width:120,height:32}},
  {key:'graze',sourceSprite:'hint.graze',sourceRect:{x:86,y:12,width:74,height:32}}];
for(const label of labels){
  const r=label.sourceRect,pattern=`LoadImage("${label.sourceSprite}", "hint", ${r.x}, ${r.y}, ${r.width}, ${r.height})`;
  assert.ok(script.includes(pattern),'Source Lua label geometry changed: '+label.key);
}
const packed=padUiAtlas(input,labels.map((label,index)=>({index,...label.sourceRect})));
const commit='863c7c19d4c8873f09be42fdc4fc25ee68422fd8';
const metadata={format:'ts-stg-original-hud-labels-v1',
  source:{title:'LuaSTG THlib-Evo (RyannLib resource replacement)',commit,
    url:`https://github.com/KaleiAlma/THlib-Evo/blob/${commit}/packages/thlib-resources/THlib/UI/hint.png`,
    geometryUrl:`https://github.com/KaleiAlma/THlib-Evo/blob/${commit}/packages/thlib-scripts/THlib/UI/UI.lua`,
    pngSha256:hash(input),width:512,height:256},
  texture:{width:packed.width,height:packed.height,sha256:hash(packed.bytes)},
  operation:'Copy only the two original source rectangles. Each interior RGBA byte remains identical; two-pixel gutters extrude its own edge. No generated artwork, color key, recoloring or resizing.',
  rights:'Original upstream resource, not engine MIT artwork. Upstream ryannlibcredits.txt: Non-commercial/personal use. Chinese localization uses the separately supplied TH16 Chinese patch, not this image.',
  labels:labels.map((label,i)=>({...label,rect:packed.mappings.find(mapping=>mapping.sprite===i).destination}))};
const output=resolve(import.meta.dirname,'assets');mkdirSync(output,{recursive:true});
writeFileSync(join(output,'touhou-hud-labels.png'),packed.bytes);
writeFileSync(join(output,'touhou-hud-labels.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata,null,2));
