import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),reference=path.resolve(process.argv[2]??'D:/AIWorkspace/Touhou20Reconstruction');
const executable=path.join(root,'build/Release/ts-stg.exe'),reports=path.join(root,'reports/th20');
fs.mkdirSync(reports,{recursive:true});
function run(name,fixture){
 const snapshot=path.join(reports,`${name}.json`),screenshot=path.join(reports,`${name}.png`);
 const result=spawnSync(executable,[fixture,'--root',root,'--frames','3','--snapshot',snapshot,'--screenshot',screenshot],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
 if(result.error||result.status)throw new Error(`${name}: ${result.error??result.stderr}\n${result.stdout}`);
 return {snapshot:`reports/th20/${name}.json`,screenshot:`reports/th20/${name}.png`,result:JSON.parse(fs.readFileSync(snapshot,'utf8'))};
}
const tests=[run('alpha-state-gpu','tests/fixtures/th20/alpha-state-gpu.js'),run('alpha-presentation-fixed','tests/fixtures/th20/alpha-presentation.js')];
const sourceMap=[['source_reconstruction/platform_window/render_state.cpp','{0x19,7}'],['source_reconstruction/sprite_renderer/render_state.cpp','if(c.blend_mode!=blend)'],['source_reconstruction/platform_window/present.cpp','device->Present'],['source_reconstruction/sprite_renderer/texture_load.cpp','repair_transparent_texels']];
const sources=sourceMap.map(([file,expression])=>{const data=fs.readFileSync(path.join(reference,file));return {file,expression,line:data.toString('utf8').split(/\r?\n/).findIndex(line=>line.includes(expression))+1,sha256:crypto.createHash('sha256').update(data).digest('hex')};});
const report={description:'Actual OpenGL GPU readback of final-alpha threshold, all covered fragment products and offscreen presentation. The paired image draws identical original texture bytes through old alpha and opaque RGB presentation; original assets are not edited. Source matching is bounded to these blend and alpha-test operations, not whole-game pixel equivalence.',tests,sources};
fs.writeFileSync(path.join(reports,'alpha-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
