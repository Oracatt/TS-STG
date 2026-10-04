import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {AnmBank} from '../packages/thlib/src/touhou/anm.js';
import {DrawList} from '../packages/thlib/src/render.js';
import {createTouhouCamera} from '../packages/thlib/src/touhou/anm-projection.js';
const root=resolve(import.meta.dirname,'..'),base=resolve(root,'packages/thlib/assets/touhou-common');
const manifest=JSON.parse(readFileSync(resolve(base,'manifest.json'))),report={format:'ts-stg-touhou-prefab-audit-v1',passed:true,
  scope:'Actual portable JS ANM create/update/draw for each selected source script; static default data, not a GPU/original-game image equivalence claim',explicitStageCamera:{bank:'effect',scripts:[95,96,97,98,133,134],viewport:{x:272,y:120,width:416,height:480},billboardAxis:{x:1,y:0,z:0}},manifestSha256:createHash('sha256').update(readFileSync(resolve(base,'manifest.json'))).digest('hex'),banks:{},failures:[]};
const finite=value=>Array.isArray(value)?value.every(finite):typeof value!=='number'||Number.isFinite(value);
for(const[name,archive]of Object.entries(manifest.archives)){
  const data=JSON.parse(readFileSync(resolve(base,archive.file))),bank=new AnmBank(data,{loadTexture:()=>1,resolveTexture:()=>2}),results=[];
  for(const descriptor of data.scripts.filter(s=>!s.excluded)){
    const result={script:descriptor.index,updates:0,draws:0,maxCommands:0};
    try{
      const vm=bank.create(descriptor.index,{x:0,y:180});
      for(let frame=0;frame<=240;frame++){
        if(frame){bank.update();result.updates++;}
        if([0,1,15,30,60,120,240].includes(frame)){
          const stageCamera=name===report.explicitStageCamera.bank&&report.explicitStageCamera.scripts.includes(descriptor.index)?{...createTouhouCamera(report.explicitStageCamera.viewport),billboardAxis:report.explicitStageCamera.billboardAxis}:undefined;
          const draw=new DrawList();bank.draw(draw,{x:336,y:24,scale:1,screenScale:1.5,projection:stageCamera});
          if(!finite(draw.commands))throw new Error('Non-finite render command');result.draws++;result.maxCommands=Math.max(result.maxCommands,draw.commands.length);
        }
      }
      if(vm.attachedEffect?.snapshot){const state=vm.attachedEffect.snapshot();result.attachedEffect=state;delete result.attachedEffect.stages;
        if(state.spawned!==200||state.active!==0||vm.alive)throw new Error('Converging charge did not complete original 200-particle lifecycle');}
    }catch(error){result.error=String(error.stack??error);report.failures.push({bank:name,...result});report.passed=false;}
    for(const vm of bank.instances)vm.destroy();bank.collect();results.push(result);
  }
  bank.dispose();report.banks[name]={scripts:results.length,results};
}
report.scripts=Object.values(report.banks).reduce((sum,bank)=>sum+bank.scripts,0);
const out=resolve(root,process.argv[2]??'reports/touhou-common/prefab-audit/report.json');mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,scripts:report.scripts,failures:report.failures.map(({bank,script,error})=>({bank,script,error:error.split('\n')[0]})),report:out}));
if(!report.passed)process.exitCode=1;
