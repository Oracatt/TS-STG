import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(root,process.argv[2]??'reports/th20/font-quickjs.json');
const result=spawnSync(path.join(root,'build/Release/ts-stg.exe'),['tools/benchmark-th20-font-quickjs.js','--root',root,'--headless','--frames','330','--snapshot',output],{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000});
if(result.error||result.status!==0)throw Error(`${result.error??result.stderr}\n${result.stdout}`);
const report=JSON.parse(fs.readFileSync(output,'utf8'));report.commandSha256=crypto.createHash('sha256').update(JSON.stringify(report.lastCommands)).digest('hex');delete report.lastCommands;
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
