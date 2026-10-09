import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const out=path.resolve(root,option('--out','reports/touhou-common/original-bitmap-text'));
const host=path.resolve(root,option('--host','build/Release/ts-stg.exe'));
const oracle=path.resolve(root,option('--oracle','build/bitmap-text-oracle/Release/tsstg-original-bitmap-text-oracle.exe'));
const reference=path.resolve(option('--reference','D:/AIWorkspace/Touhou20Reconstruction/source_reconstruction'));
fs.mkdirSync(out,{recursive:true});
const cases=[
 {name:'latin-spell',text:'Spell Card Attack',width:768,height:40},
 {name:'japanese-spell',text:'霊符「夢想封印」',width:768,height:40},
 {name:'mixed-marisa',text:'魔符「スターダストレヴァリエ」',width:768,height:40,color:0xffc080,shadowColor:0xc0204060},
 {name:'numeric',text:'BONUS 0123456789',width:512,height:48,font:5},
 {name:'no-outline',text:'恋符「マスタースパーク」',width:768,height:40,outline:false},
 {name:'small-font',text:'Reimu / 魔理沙',width:384,height:32,font:18},
 {name:'large-font',text:'Spell 123',width:768,height:84,font:10},
 {name:'serif-font',text:'東方 STG',width:512,height:72,font:15},
 {name:'positive-spacing',text:'STG 20',width:256,height:40,spacing:10},
 {name:'negative-spacing',text:'STG',width:256,height:40,spacing:-6},
 {name:'empty',text:'',width:256,height:40},
 {name:'unsupported-cp932',text:'STG 😀 Ω',width:512,height:40},
].map(value=>({font:4,spacing:0,color:0xffffff,shadowColor:0xff000000,outline:true,...value}));
const fixture=path.join(root,'build/touhou-text-native.js'),snapshot=path.join(out,'native.json');
fs.writeFileSync(fixture,`import {TouhouTextRenderer} from '../packages/thlib/dist/touhou/text-renderer.js';
const renderer=new TouhouTextRenderer({host:tsstg,bank:{}}),cases=${JSON.stringify(cases)};
const results=[];let frame=0;
globalThis.__tsstg_game={update(){const c=cases[frame++];if(c){const image=renderer.rasterize(c.text,c);results.push({name:c.name,...image,pixels:Array.from(image.pixels)});}},render(){return[];},snapshot(){return{modern:renderer.modern,mincho:renderer.mincho,results};}};
`);
function run(exe,args){const result=spawnSync(exe,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});if(result.error)throw result.error;if(result.status!==0)throw Error(`${path.basename(exe)} failed: ${result.stdout}\n${result.stderr}`);return result.stdout;}
run(host,[path.relative(root,fixture),'--root',root,'--headless','--frames',String(cases.length),'--snapshot',snapshot]);
const actual=JSON.parse(fs.readFileSync(snapshot,'utf8')),results=[];
for(const test of cases){
 const textFile=path.join(out,`${test.name}.txt`),expectedFile=path.join(out,`${test.name}.rgba`);fs.writeFileSync(textFile,test.text);
 const metadata=JSON.parse(run(oracle,[expectedFile,textFile,String(test.width),String(test.height),String(test.font),String(test.spacing),String((test.color|0xff000000)>>>0),String(test.shadowColor>>>0),String(+test.outline)]));
 const expected=fs.readFileSync(expectedFile),observed=Buffer.from(actual.results.find(result=>result.name===test.name).pixels);
 let differences=0,maxError=0,first=-1;
 for(let i=0;i<Math.max(expected.length,observed.length);i++)if(expected[i]!==observed[i]){differences++;if(first<0)first=i;maxError=Math.max(maxError,Math.abs((expected[i]??0)-(observed[i]??0)));}
 const result={...test,passed:differences===0,bytes:expected.length,differences,maxError,firstDifference:first,source:metadata};results.push(result);
 console.log(`${result.passed?'PASS':'FAIL'} ${test.name}: ${differences} differing bytes; max ${maxError}`);
}
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={passed:results.every(result=>result.passed),hostSha256:hash(host),oracleSha256:hash(oracle),publicTextRendererSha256:hash(path.join(root,'packages/thlib/dist/touhou/text-renderer.js')),modern:actual.modern,mincho:actual.mincho,
 sourceHashes:Object.fromEntries(['text_renderer/bitmap.cpp','text_renderer/raster.cpp','platform_window/fonts.cpp','text_renderer/centered_constants.hpp'].map(file=>[file,hash(path.join(reference,file))])),
 oracle:'Win32 build of original bitmap.cpp, fonts.cpp and exact rasterize_text function; only the application mutex is removed. Original game executable is never run.',results};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
