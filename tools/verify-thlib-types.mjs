// Compile a real external consumer against the selected package's declarations.
// No workspace links, path aliases, Node/DOM ambient types or skipped .d.ts checks.
import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir,tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=resolve(import.meta.dirname,'..');
const gameplayConsumer=`
import {TouhouGameplayCompositor as RootGameplayCompositor,TOUHOU_OWNER_PRIORITIES as RootOwnerPriorities} from '@ts-stg/thlib';
import {TouhouRenderQueue,TouhouGame} from '@ts-stg/thlib/touhou';
import {TouhouGameplayCompositor} from '@ts-stg/thlib/touhou/gameplay-compositor';
import {TOUHOU_OWNER_PRIORITIES} from '@ts-stg/thlib/touhou/render-order';
import type {TouhouGameOptions} from '@ts-stg/thlib/touhou/game';
import type {TouhouCompositorViewport} from '@ts-stg/thlib/touhou/gameplay-compositor';

const rootCompositorExport:typeof TouhouGameplayCompositor=RootGameplayCompositor;
const rootPrioritiesExport:typeof TOUHOU_OWNER_PRIORITIES=RootOwnerPriorities;
const bulletOwnerPriority:41=TOUHOU_OWNER_PRIORITIES.bullet;
const sharedGameplayQueue=new TouhouRenderQueue();
const sharedCompositeTarget=host.createRenderTarget(960,720);
const gameplayViewport:TouhouCompositorViewport={x:48,y:24,width:576,height:672};
const gameplayCompositor=new TouhouGameplayCompositor({renderTarget:target,compositeTarget:sharedCompositeTarget,
 viewport:gameplayViewport,width:960,height:720,scale:1.5,clearColor:0x000000ff});
const gameplayOutput:DrawList=gameplayCompositor.draw(draw,sharedGameplayQueue,{
 drawBackground(output){output.rect(0,0,960,720,0x001020ff);},
 drawDistortion(output,backgroundTexture){const texture:number=backgroundTexture;output.sprite(texture,480,360,960,720);}
});
const gameplayBanks={front:resources.createBank('front'),bullet:resources.createBank('bullet'),effect:resources.createBank('effect'),
 enemy:resources.createBank('enemy'),ascii_960:resources.createBank('ascii_960'),text:resources.createBank('text'),pl00:resources.createBank('pl00')};
const gameplayOptions:TouhouGameOptions={banks:gameplayBanks,font:resources.font!,sht:resources.shots[0],styles:resources.styles,
 renderTarget:target,compositeTarget:sharedCompositeTarget,renderBackground(output,game){const frame:number=game.frame;output.rect(0,0,1,1,frame);}};
const sharedComposedGame=new TouhouGame(gameplayOptions);
const sharedGameCompositor:TouhouGameplayCompositor=sharedComposedGame.compositor;
sharedComposedGame.update();sharedComposedGame.render();sharedComposedGame.destroy();

// @ts-expect-error Render-target handles must retain the numeric host contract.
new TouhouGameplayCompositor({renderTarget:'target'});
// @ts-expect-error A camera viewport is numeric geometry.
new TouhouGameplayCompositor({viewport:{x:48,y:24,width:'576',height:672}});
// @ts-expect-error Composition requires a layered queue, not a plain command list.
gameplayCompositor.draw(draw,new DrawList());
// @ts-expect-error The distortion callback receives a numeric source texture.
gameplayCompositor.draw(draw,sharedGameplayQueue,{drawDistortion:(output,texture:string)=>{}});
// @ts-expect-error Verified owner priorities are immutable source constants.
TOUHOU_OWNER_PRIORITIES.bullet=40;
`;
function compilerPath(){
 const require=createRequire(import.meta.url);
 const candidates=[process.env.TSSTG_TYPESCRIPT,join(root,'node_modules/typescript/lib/tsc.js')];
 try{candidates.push(require.resolve('typescript/lib/tsc.js'));}catch{}
 // Reuse an already-installed npx compiler when present; never install one as
 // a side effect of verifying an artifact or access the network.
 const cache=process.env.npm_config_cache??(process.platform==='win32'&&process.env.LOCALAPPDATA?join(process.env.LOCALAPPDATA,'npm-cache'):join(homedir(),'.npm'));
 const npx=join(cache,'_npx');
 if(existsSync(npx))for(const entry of readdirSync(npx,{withFileTypes:true}))if(entry.isDirectory())candidates.push(join(npx,entry.name,'node_modules/typescript/lib/tsc.js'));
 const compiler=candidates.find(path=>path&&existsSync(path));
 assert.ok(compiler,'Install TypeScript locally, or set TSSTG_TYPESCRIPT to an existing typescript/lib/tsc.js; this check does not download dependencies.');
 return resolve(compiler);
}

export function verifyThlibTypes(library){
 const compiler=compilerPath(),consumer=mkdtempSync(join(tmpdir(),'tsstg-types-consumer-'));
 const installed=join(consumer,'node_modules/@ts-stg/thlib');mkdirSync(installed,{recursive:true});
 // Assets are already validated by the package checks. Copy the exact exported
 // source/declaration tree and manifest, rather than redirecting resolution.
 cpSync(join(library,'src'),join(installed,'src'),{recursive:true,errorOnExist:true});
 cpSync(join(library,'package.json'),join(installed,'package.json'));
 writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'independent-thlib-types',private:true,type:'module'}));
 const source=readFileSync(join(root,'tests/fixtures/thlib-consumer.ts'),'utf8')+gameplayConsumer;writeFileSync(join(consumer,'consumer.ts'),source);
 const compilerOptions={target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[],strict:true,
  noEmit:true,skipLibCheck:false,noUncheckedIndexedAccess:true,verbatimModuleSyntax:true};
 writeFileSync(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions,files:['consumer.ts']},null,2));
 function run(args){const result=spawnSync(process.execPath,[compiler,...args],{cwd:consumer,encoding:'utf8',windowsHide:true,timeout:60000});
  if(result.error)throw result.error;assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);return result.stdout.trim();}
 const version=run(['--version']);run(['--project','tsconfig.json','--pretty','false']);
 return {compiler:version,consumer,sourcePackage:resolve(library),compilerOptions,
  apiGroups:['application lifecycle','captured and direct title backgrounds','stage selection callbacks','dialogue lifecycle and portrait injection','CP936 text surfaces','public subpath and root exports','source laser origin factory','source gameplay passes and owner callback priorities','shared projectile collision and cancellation owners','scene transition ownership and early selection callback','generic Boss phase cues and fixed charge clock','bankless Boss defeat and cancellation wave owners','nearby bullet cancellation and public game defeat lifecycle','optional dialogue entrance profiles and staged events','dialogue exit profiles and early handoff callbacks','stage-clear rewards and bankless normal stage transitions','bankless music fading and source volume conversion','player stage visibility and transient reset lifecycle'],
  rejectedMisuses:[...source.matchAll(/@ts-expect-error/g)].length,workspaceLinks:false,ambientPlatformTypes:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=verifyThlibTypes(resolve(root,process.argv[2]??'packages/thlib'));
 mkdirSync(join(root,'build'),{recursive:true});writeFileSync(join(root,'build/thlib-types-verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
