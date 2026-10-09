import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TOUHOU_HUD_LABEL_SCRIPTS} from '../packages/thlib/dist/touhou/hud-label-data.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const word=value=>{const bytes=Buffer.alloc(4);bytes.writeFloatLE(value);return bytes.readUInt32LE();};

/** Append isolated original label pixels without replacing the TH20 animation
 * bank or importing a title's full frame/logo/seasonal mechanism. Source
 * rectangles and hashes live beside the audited extracted input texture. */
export function appendTouhouHudLabels(bank,files,manifest){
  const sourceBytes=readFileSync(new URL('./assets/touhou-hud-labels.json',import.meta.url));
  const source=JSON.parse(sourceBytes),pixels=readFileSync(new URL('./assets/touhou-hud-labels.png',import.meta.url));
  assert.equal(source.format,'ts-stg-original-hud-labels-v1');
  assert.equal(hash(pixels),source.texture.sha256,'Audited original HUD label pixels changed');
  assert.deepEqual([pixels.readUInt32BE(16),pixels.readUInt32BE(20)],[source.texture.width,source.texture.height]);
  const keys=Object.keys(TOUHOU_HUD_LABEL_SCRIPTS);
  assert.deepEqual(source.labels.map(label=>label.key),keys);
  assert.equal(bank.scripts.length,TOUHOU_HUD_LABEL_SCRIPTS.pointValue,'Appended HUD IDs overlap an existing source animation');
  const entryIndex=bank.entries.length,spriteBase=bank.sprites.length,scriptBase=bank.scripts.length;
  const file='textures/front/hud-labels.png',auditFile='hud-labels.json';
  files.set(file,pixels);files.set(auditFile,sourceBytes);manifest.hudLabels=auditFile;
  const texture={file,sha256:hash(pixels),source:{...source.source,pngSha256:source.source.pngSha256},
    operation:'Selected original HUD label RGBA copied exactly into isolated cells with two-pixel own-edge gutters',
    originalHudLabels:true,spriteMappings:source.labels.map((label,i)=>({sprite:spriteBase+i,source:label.sourceRect,destination:label.rect,paddingX:2,paddingY:2}))};
  manifest.textures.push(texture);
  bank.entries.push({index:entryIndex,offset:0,length:0,name:'<common-original-hud-labels>',
    width:source.texture.width,height:source.texture.height,format:1,x:0,y:0,memoryPriority:10,lowResScale:1,hasData:1,
    originalWidth:source.texture.width,originalHeight:source.texture.height,spriteBase,scriptBase,spriteCount:keys.length,scriptCount:keys.length,
    texture:{kind:'png',path:file,width:source.texture.width,height:source.texture.height,sha256:hash(pixels),sourceSha256:source.source.pngSha256}});
  const positions={pointValue:[888,408],graze:[888,452]};
  const additions=[];
  for(const [i,label]of source.labels.entries()){
    const sprite=spriteBase+i,script=scriptBase+i;
    assert.equal(script,TOUHOU_HUD_LABEL_SCRIPTS[label.key]);
    const r=label.rect;
    assert.ok(r.x>=2&&r.y>=2&&r.width>0&&r.height>0&&r.x+r.width+2<=source.texture.width&&r.y+r.height+2<=source.texture.height);
    bank.sprites.push({index:sprite,entry:entryIndex,storedId:i,...r,pivotX:0,pivotY:0,scaleX:1,scaleY:1,rotation:0});
    // Preserve the shared power-label fade (60..80), source pixel scale and
    // secondary layer; only the new sprite ID and fixed row anchor differ.
    const animation=structuredClone(bank.scripts[12]);
    Object.assign(animation,{index:script,entry:entryIndex,storedId:i,offset:0});
    for(const ins of animation.instructions){
      if(ins.opcode===300)ins.args[0]=sprite;
      if(ins.opcode===400)ins.args=[...positions[label.key].map(word),0];
      bank.opcodeCounts[ins.opcode]=(bank.opcodeCounts[ins.opcode]??0)+1;
    }
    bank.scripts.push(animation);additions.push({key:label.key,script,sprite,sourceSprite:label.sourceSprite});
  }
  bank.supplements=[{entry:entryIndex,source:source.source,labels:additions}];
  manifest.transformations.push({archive:'front',entry:entryIndex,operation:'append-original-hud-labels',
    provenance:auditFile,source:source.source,labels:additions,
    timing:'Shared front:12 fade and secondary HUD layer; only sprite ID and row anchor adapted. Original source bank records are unchanged.'});
}
