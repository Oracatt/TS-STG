import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../..');
const compiler=path.join(root,'node_modules/typescript/bin/tsc');
// Node 24 executes this small typed bootstrap before the editor has been built.
for(const project of ['packages/thlib/tsconfig.json','tools/spellcard-editor/tsconfig.json']){
  const result=spawnSync(process.execPath,[compiler,'-p',project],{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
const output=path.resolve(directory,'../../build/spellcard-editor-ui');
await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(directory,'code-editor.js')],outfile:path.join(output,'code-editor.bundle.js'),
  bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked',logLevel:'info'});
const packages=['codemirror','@codemirror/state','@codemirror/view','@codemirror/commands','@codemirror/language',
  '@codemirror/lang-javascript','@codemirror/autocomplete','@codemirror/search','@codemirror/lint',
  '@lezer/common','@lezer/lr','@lezer/highlight','@lezer/javascript','style-mod','w3c-keyname','crelt'];
const notices=[];
for(const name of packages){const base=path.join(directory,'node_modules',name);const metadata=JSON.parse(await readFile(path.join(base,'package.json'),'utf8'));
  let license;for(const file of ['LICENSE','LICENSE.txt']){try{license=await readFile(path.join(base,file),'utf8');break;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  if(!license)throw new Error(`Missing license for ${name}`);notices.push(`${name} ${metadata.version}\n${license.trim()}`);}
await writeFile(path.join(output,'THIRD_PARTY_LICENSES.txt'),notices.join('\n\n----------------------------------------\n\n')+'\n');
