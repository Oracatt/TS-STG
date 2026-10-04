// Independent DirectXMath values, not a JS round-trip or a second copy of the
// portable formulas. Numerical budgets are in binary32 ULPs per operation.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyPresentationVectors} from '../native/tests/presentation-compare.js';
const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let oracle=resolve(root,'build/Release/tsstg-rush-presentation-oracle.exe'),host=resolve(root,'build/Release/ts-stg.exe'),output=resolve(root,'reports/rushboss/presentation-numerics'),diagnostic=false;
for(let i=0;i<args.length;i++){if(args[i]==='--oracle')oracle=resolve(args[++i]);else if(args[i]==='--host')host=resolve(args[++i]);else if(args[i]==='--out')output=resolve(args[++i]);else if(args[i]==='--diagnostic')diagnostic=true;else throw Error(`Unknown option ${args[i]}`);}
const child=spawnSync(oracle,[],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(child.status,0,child.stderr);const data=JSON.parse(child.stdout);
const result=verifyPresentationVectors(data,{diagnostic});
mkdirSync(output,{recursive:true});const sourceFile=resolve(output,'oracle.json'),fixture=resolve(output,'quickjs.js'),snapshot=resolve(output,'quickjs.json');
writeFileSync(sourceFile,JSON.stringify(data,null,2));
const verifierPath=relative(output,resolve(root,'native/tests/presentation-compare.js')).replaceAll('\\','/'),inputPath=relative(root,sourceFile).replaceAll('\\','/');
writeFileSync(fixture,`import {verifyPresentationVectors} from ${JSON.stringify(verifierPath.startsWith('.')?verifierPath:`./${verifierPath}`)};\nconst result=verifyPresentationVectors(JSON.parse(tsstg.readText(${JSON.stringify(inputPath)})),{diagnostic:${diagnostic}});\nglobalThis.__tsstg_game={update(){},render(){return[];},snapshot(){return result;}};\n`);
const native=spawnSync(host,[relative(root,fixture),'--root',root,'--headless','--frames','1','--snapshot',snapshot],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(native.status,0,native.stderr||native.error?.message);assert.deepEqual(JSON.parse(readFileSync(snapshot,'utf8')),result,'QuickJS and Node presentation results differ');
writeFileSync(resolve(output,'report.json'),JSON.stringify({scope:'Original VirtualLib source expressions with independent Microsoft DirectXMath SSE binary32 oracle; no original executable',backends:['Node','QuickJS-NG'],...result},null,2));console.log(JSON.stringify(result,null,2));
