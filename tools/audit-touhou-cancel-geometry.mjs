// Read-only audit of raw source data against the public cancellation path.
// The expected geometry uses neither decodeAnm, AnmInterpolation nor the
// production sprite geometry implementation. No original executable is run.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DrawList} from '@ts-stg/thlib';
import {AnmBank,createTouhouResources} from '@ts-stg/thlib/touhou';
import {rushTouhouBulletStyle} from '../games/rushboss/src/bullet-visuals.js';
import {BULLET_STYLES} from '../games/rushboss/src/bullet-styles.js';
import {expandQuad,expandStatefulQuad} from '../tests/fixtures/th20/quad.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const F=Math.fround;

// Narrow independent binary reader: only ANM v8 entry tables, sprite records
// and instruction words needed for this audit. Imported JSON is not its input.
export function readSourceCancelData(bytes){
  const scripts=[],sprites=[],entries=[];
  for(let base=0;;){
    assert.equal(bytes.readUInt32LE(base),8);
    const sc=bytes.readUInt16LE(base+4),ic=bytes.readUInt16LE(base+6);
    const texture=base+bytes.readUInt32LE(base+28),textureBytes=bytes.readUInt32LE(texture+12);
    entries.push({lowResScale:bytes[base+34],textureHash:hash(bytes.subarray(texture+16,texture+16+textureBytes))});
    for(let n=0;n<sc;n++){
      const at=base+bytes.readUInt32LE(base+64+n*4);
      sprites.push({entry:entries.length-1,width:bytes.readFloatLE(at+12),height:bytes.readFloatLE(at+16),
        pivotX:bytes.readFloatLE(at+20),pivotY:bytes.readFloatLE(at+24),scaleX:bytes.readFloatLE(at+28),scaleY:bytes.readFloatLE(at+32)});
    }
    for(let n=0;n<ic;n++){
      let cursor=base+bytes.readUInt32LE(base+64+sc*4+n*8+4);const instructions=[];
      for(;;){
        const opcode=bytes.readInt16LE(cursor),size=bytes.readUInt16LE(cursor+2),time=bytes.readInt16LE(cursor+4);
        if(opcode===-1&&size===0)break;
        assert.ok(size>=8&&size%4===0);
        const args=[],floats=[];
        for(let i=8;i<size;i+=4){args.push(bytes.readUInt32LE(cursor+i));floats.push(bytes.readFloatLE(cursor+i));}
        instructions.push({opcode,time,args,floats});cursor+=size;
      }
      scripts.push(instructions);
    }
    const next=bytes.readUInt32LE(base+36);if(!next)break;base+=next;
  }
  return{scripts,sprites,entries};
}

export function auditTouhouCancelGeometry({reference='D:/AIWorkspace/Touhou20Reconstruction'}={}){
  const sourceFiles=['assets/raw/bullet.anm','source_reconstruction/bullet_system/style_data.cpp',
    'source_reconstruction/bullet_system/cancellation.cpp','source_reconstruction/bullet_system/player_collision.cpp',
    'source_reconstruction/sprite_renderer/named_spawn.cpp','source_reconstruction/sprite_renderer/binding.cpp',
    'source_reconstruction/sprite_renderer/quad.cpp','source_reconstruction/platform_window/layout.cpp'];
  const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,hash(readFileSync(resolve(reference,file)))]));
  const raw=readSourceCancelData(readFileSync(resolve(reference,'assets/raw/bullet.anm')));
  const commonPath='packages/thlib/assets/touhou-common/anm/bullet.json';
  const common=JSON.parse(readFileSync(commonPath,'utf8'));
  const texturePath=resolve('packages/thlib/assets/touhou-common',common.entries[5].texture.path);
  assert.equal(hash(readFileSync(texturePath)),raw.entries[5].textureHash,'etbreak pixels remain byte-identical to source');
  // Fixed RNG removes random offsets/rotation/waits, so all five (or nine)
  // child rectangles have an independently known center and birth frame.
  const bank=new AnmBank(common,{loadTexture:()=>1,rng:{next:()=>0,signed:()=>0,modulus:0x7fffffff}});
  const families=[],mappedStyles=[];let cornerSamples=0,maxCornerError=0;
  try{
    for(let id=540;id<=547;id++){
      const source=raw.sprites[id];
      assert.deepEqual(source,{entry:5,width:62,height:62,pivotX:0,pivotY:0,scaleX:1,scaleY:1});
      assert.equal(raw.entries[source.entry].lowResScale,0);
    }
    for(const rootId of [173,221,269,284]){
      const instructions=raw.scripts[rootId];
      const pair=instructions.filter(i=>i.opcode===500&&i.time===0).slice(0,3).map(i=>i.args[0]);
      const loops=instructions.find(i=>i.opcode===100&&i.args[0]===10008).args[1];
      const expectedIds=[pair[0],...Array.from({length:loops},()=>pair.slice(1)).flat()];
      const root=bank.create(rootId,{x:12,y:100});
      assert.deepEqual(root.children.map(c=>c.scriptId),expectedIds);
      const family={root:rootId,fragments:expectedIds.length,children:[]};
      const duration=raw.scripts[pair[0]].find(i=>i.opcode===1).time;
      for(let age=0;age<duration;age++){
        const draw=new DrawList();root.draw(draw,{x:336,y:24,scale:1.5,screenScale:1});
        const quads=draw.commands.filter(c=>c[0]==='statefulQuad'||c[0]==='quad');
        assert.equal(quads.length,expectedIds.length);
        // Public drawing sorts source layer20 before layer21.
        const ids=expectedIds.slice().sort((a,b)=>raw.scripts[a].find(i=>i.opcode===304).args[0]-raw.scripts[b].find(i=>i.opcode===304).args[0]);
        for(let n=0;n<ids.length;n++){
          const id=ids[n],source=raw.scripts[id];
          const start=source.find(i=>i.opcode===402).floats[0];
          const tween=source.find(i=>i.opcode===412),end=tween.floats[2],length=tween.args[0];
          assert.equal(tween.args[1],0,'source size interpolation is linear');
          const scale=age+1>=length?end:F(start+F(F(end-start)*F((age+1)/length)));
          const sprite=source.filter(i=>i.opcode===300&&i.time<=age).at(-1).args[0];
          assert.equal(root.children.find(c=>c.scriptId===id).spriteIndex,sprite);
          // Source quad.cpp first includes window_scale in the ANM size;
          // Rush maps its logical quad at the end. Compare the final corners
          // with explicit source rounding, allowing <0.0001px ordering noise.
          const half=F(31*F(scale*1.5)),cx=354,cy=174;
          const expected=[[F(cx-half),F(cy-half)],[F(cx+half),F(cy-half)],
            [F(cx-half),F(cy+half)],[F(cx+half),F(cy+half)]];
          const command=expandStatefulQuad(quads[n]).find(c=>c[0]==='quad');
          const vertices=expandQuad(command)[2];
          const alpha=source.find(i=>i.opcode===403).args[0];
          const blend=source.find(i=>i.opcode===303)?.args[0]??0;
          assert.equal(quads[n][0],'statefulQuad');
          assert.deepEqual(quads[n][17].slice(1,4),['srcAlpha',blend?'one':'oneMinusSrcAlpha','add']);
          for(let v=0;v<4;v++){
            assert.equal(vertices[v][4]&255,alpha);
            for(let axis=0;axis<2;axis++){
              const error=Math.abs(vertices[v][axis]-expected[v][axis]);
              maxCornerError=Math.max(maxCornerError,error);cornerSamples++;
              assert.ok(error<.0001,`root${rootId}/child${id}/age${age}/corner${v}/${axis}: ${error}`);
            }
          }
          if(age===0&&!family.children.some(c=>c.script===id))family.children.push({script:id,
            duration:length,firstVisibleEdge:62*F(start+F(F(end-start)*F(1/length)))*1.5,
            finalVisibleEdge:62*end*1.5,alpha,blend});
        }
        root.update();
      }
      assert.equal(root.alive,false);families.push(family);
    }
    // Read each type's cancellation family from recovered C++ initializer,
    // independently of the imported styles JSON and touhouStyle calculation.
    const cpp=readFileSync(resolve(reference,'source_reconstruction/bullet_system/style_data.cpp'),'utf8');
    const sourceStyles=new Map([...cpp.matchAll(/\{(0x[0-9a-f]+)u,\{ \/\/ type (\d+)\s*([\s\S]*?)\},std::bit_cast<float>\((0x[0-9a-f]+)u\),((?:0x[0-9a-f]+u,){3}0x[0-9a-f]+u)\}/g)].map(m=>[+m[2],{
      cancelType:parseInt(m[5].split(',')[1]),rows:[...m[3].matchAll(/\{\{(.*?)\}\}/g)].map(row=>[...row[1].matchAll(/0x([0-9a-f]+)u/g)].map(v=>parseInt(v[1],16)))}]));
    const resources=createTouhouResources();
    try{
      for(const [kind,style]of Object.entries(BULLET_STYLES))for(let color=0;color<style.colors;color++){
        const actual=rushTouhouBulletStyle(resources,{kind,color},true),source=sourceStyles.get(actual.type);
        assert.equal(source.cancelType,6,'all Rush portrait mappings use source color table cancellation');
        assert.equal(actual.cancelScript,source.rows[actual.color][3]);
        mappedStyles.push({kind,color,type:actual.type,sourceColor:actual.color,cancelScript:actual.cancelScript});
      }
    }finally{resources.dispose();}
  }finally{bank.dispose();}
  return{status:'passed',reference,sourceHashes,commonDataHash:hash(readFileSync(commonPath)),textureHash:raw.entries[5].textureHash,
    cornerSamples,maxCornerError,families,mappedStyles,
    scope:'Raw source ANM bytes, recovered C++ style tables, zero-random child sequence and source-derived 960x720 quad geometry. No original executable run.',
    limitations:['Random timing/rotation uses other tests, not the zero-random corner oracle.',
      'This checks geometry and source layer/blend/alpha inputs, not original final framebuffer pixels.',
      'Kind2 ShortLine20 supplementary effect is outside this size audit; Rush ordinary/Bomb cancellation uses kind0.']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const report=auditTouhouCancelGeometry(),out=resolve('reports/rushboss/cancel-source-audit/report.json');
  mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,cornerSamples:report.cornerSamples,maxCornerError:report.maxCornerError,
    mappedStyles:report.mappedStyles.length,families:report.families,out},null,2));
}
