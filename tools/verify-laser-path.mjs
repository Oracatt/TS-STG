import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';import{spawnSync}from'node:child_process';
import{verifyLaserVectors}from'../native/tests/laser-compare.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const oracle=process.argv[2]??path.join(root,'build/Release/tsstg-laser-oracle.exe');
const result=spawnSync(oracle,[],{encoding:'utf8',maxBuffer:8*1024*1024});if(result.status!==0)throw new Error(result.stderr||result.error||'Laser reference harness failed');
const vectors=JSON.parse(result.stdout);console.log('Node',verifyLaserVectors(vectors));fs.writeFileSync(path.join(root,'tests/fixtures/th20-laser-vectors.json'),JSON.stringify(vectors));
const host=process.argv[3]??path.join(root,'build/Release/ts-stg.exe'),native=spawnSync(host,['native/tests/laser-quickjs.js','--root',root,'--headless','--frames','1'],{encoding:'utf8'});
if(native.status!==0)throw new Error(native.stderr||'QuickJS laser verification failed');console.log(native.stdout.trim());
