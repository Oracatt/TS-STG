import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const bossKeys={SunnyMilk:'sunny',Monstone:'monstone',Artia:'artia'};
const decode=value=>JSON.parse(`"${value}"`);
export function importRushDialogue(reference='D:/c++/TouhouRushBoss-main'){
  const sources={};for(const file of ['src/DialogDeriver.h','src/Dialog.h','src/Dialog.cpp','src/Face.h','src/GSObjects.h']){const bytes=readFileSync(resolve(reference,file));sources[file]={sha256:hash(bytes),bytes:bytes.length};}
  const source=readFileSync(resolve(reference,'src/DialogDeriver.h'),'utf8'),classes=[...source.matchAll(/^class\s+(Dialog_(Reimu|Marisa)_([A-Za-z]+)(_2)?)\s*:public Dialog/gm)],sequences={};
  let lineCount=0,stepCount=0;
  for(let c=0;c<classes.length;c++){
    const match=classes[c],name=match[1],character=match[2]==='Reimu'?0:1,bossId=bossKeys[match[3]],phase=match[4]?'after':'before';
    if(!bossId)throw Error(`Unmapped source boss ${match[3]}`);
    const text=source.slice(match.index,classes[c+1]?.index??source.length),cases=[...text.matchAll(/^\s*case\s+(\d+):/gm)];
    const state={left:{character:match[2].toLowerCase(),active:false,emotion:'NOTICE'},right:{character:bossId,active:false,emotion:'NOTICE'}},steps=[];
    for(let i=0;i<cases.length;i++){
      const part=text.slice(cases[i].index,cases[i+1]?.index??text.length),step=Number(cases[i][1]),events=[];
      if(step!==i)throw Error(`Noncontiguous original dialogue ${name}:${step}`);
      const record={step,sourceLine:source.slice(0,match.index+cases[i].index).split('\n').length,coldFrames:step===0?30:2,autoFrames:step===0?300:500,events};
      for(const rawLine of part.split(/\r?\n/)){
        const line=rawLine.trim();let m;
        if((m=/coldFrame\s*=\s*(\d+)/.exec(line)))record.coldFrames=Number(m[1]);
        if((m=/(left|right)\s*=.*new Face_(\w+)/.exec(line))){state[m[1]].present=true;events.push({type:'portrait',side:m[1],character:m[2].toLowerCase()});}
        if((m=/(left|right)->(Activate|Deactivate)\(\)/.exec(line))){state[m[1]].active=m[2]==='Activate';events.push({type:'active',side:m[1],value:state[m[1]].active});}
        if((m=/(left|right)->SetFaceType\(FACE_(\w+)\)/.exec(line))){state[m[1]].emotion=m[2];events.push({type:'emotion',side:m[1],value:m[2]});}
        if((m=/new (Artia|Monstone|SunnyMilk)\b/.exec(line)))events.push({type:'spawnBoss',bossId:bossKeys[m[1]]});
        if((m=/bossLife\s*=\s*(\d+)/.exec(line)))events.push({type:'bossLife',value:Number(m[1])});
        if((m=/boss->transform->location\s*=\s*\{\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\s*\}/.exec(line)))events.push({type:'bossPosition',position:m.slice(1).map(Number)});
        if(line.includes('new BossShowing(boss)'))events.push({type:'revealBoss'});
        if((m=/new BossNameSprite\((\d+)\)/.exec(line)))events.push({type:'bossName',index:Number(m[1])});
        if((m=/SetBalloon\(new Balloon_(\d+)\(\{\s*([\d.-]+),\s*([\d.-]+)\s*\},\s*(\d+),\s*(true|false)\),\s*L"((?:[^"\\]|\\.)*)"\)/.exec(line))){
          const side=Number(m[2])<0?'left':'right';record.text=decode(m[6]);record.speaker=side;record.emotion=state[side].emotion;
          record.balloon={sourceType:Number(m[1]),position:[Number(m[2]),Number(m[3])],length:Number(m[4]),inverted:m[5]==='true'};
          events.push({type:'text',speaker:side,text:record.text});lineCount++;
        }else if(line.includes('SetBalloon('))throw Error(`Unparsed dialogue string: ${name}:${step}: ${line}`);
        if(line.includes('ShowMagicSquare()'))events.push({type:'bossMagicSquare'});
        if((m=/new (\w+_SC_\d+)/.exec(line)))events.push({type:'startAttack',attack:m[1]});
        if(line.includes('Destroy();')){record.terminal=true;events.push({type:'complete'});}
        if(line.includes('ClearLevel();'))events.push({type:'clearLevel'});
        if(line.includes('StopBgm();'))events.push({type:'music',action:'stop'});
        if((m=/PlayBgm\(bgm_(\w+)\.Get\(\)\)/.exec(line)))events.push({type:'music',action:'play',track:m[1]});
        if((m=/new BgmText\(L"((?:[^"\\]|\\.)*)"\)/.exec(line)))events.push({type:'music',action:'caption',text:decode(m[1])});
      }
      record.portraits=structuredClone(state);steps.push(record);stepCount++;
    }
    if(!steps.at(-1)?.terminal)throw Error(`Dialogue does not terminate: ${name}`);
    const id=`${bossId}:${character}:${phase}`;if(sequences[id])throw Error(`Duplicate ${id}`);
    sequences[id]={id,sourceClass:name,bossId,character,phase,startDelayFrames:phase==='after'?50:0,steps};
  }
  const sourceTextCount=[...source.matchAll(/SetBalloon\(/g)].length;if(lineCount!==sourceTextCount)throw Error(`Lost lines ${lineCount}/${sourceTextCount}`);
  return{format:'ts-stg-rush-dialogue-v1',sources,counts:{classes:classes.length,steps:stepCount,lines:lineCount},missing:{'artia:0:after':'No source after-battle dialogue; GSObjects::Victory provides results only','artia:1:after':'No source after-battle dialogue; GSObjects::Victory provides results only'},sequences};
}
export function writeRushDialogue({reference,check=false}={}){
  const data=importRushDialogue(reference),out=resolve(root,'games/rushboss/src/dialogue-data.ts'),contents="// SPDX-License-Identifier: GPL-3.0-only\nimport type {TouhouDialogueStep} from '@ts-stg/thlib/touhou';\nexport interface RushDialogueStep extends TouhouDialogueStep{step:number;sourceLine:number;balloon?:{sourceType:number;position:number[];length:number;inverted:boolean};portraits?:{left?:{character:string;active:boolean;emotion:string;present?:boolean};right?:{character:string;active:boolean;emotion:string;present?:boolean}}}\nexport interface RushDialogueSequence{id:string;sourceClass:string;bossId:string;character:number;phase:string;startDelayFrames:number;steps:RushDialogueStep[];}\n// Generated from RushBoss DialogDeriver.h; do not hand-edit source dialogue.\nexport const RUSH_DIALOGUE_DATA: {format:string;sources:Record<string,{sha256:string;bytes:number}>;counts:{classes:number;steps:number;lines:number};missing:Record<string,string>;sequences:Record<string,RushDialogueSequence>} = "+JSON.stringify(data,null,2)+';\n';
  if(check){if(readFileSync(out,'utf8')!==contents)throw Error('Generated Rush dialogue differs from original source');}else writeFileSync(out,contents);
  const report={...data,sequences:Object.fromEntries(Object.entries(data.sequences).map(([id,s])=>[id,{sourceClass:s.sourceClass,steps:s.steps.length,lines:s.steps.filter(s=>s.text!==undefined).length,revealSteps:s.steps.filter(s=>s.events.some(e=>e.type==='revealBoss')).map(s=>s.step),musicSteps:s.steps.filter(s=>s.events.some(e=>e.type==='music')).map(s=>s.step)}])),outputSha256:hash(contents),verified:check};
  const path=resolve(root,'reports/rushboss/dialogue-source.json');mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2));return{...data.counts,verified:check,report:path};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(writeRushDialogue({check:process.argv.includes('--check')})));
