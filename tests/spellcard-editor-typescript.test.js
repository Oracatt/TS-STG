import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSpellSource} from '../tools/spellcard-editor/source.js';
import {createTypeScriptSpellSource} from '../tools/spellcard-editor/typescript-source.js';
import {compileSpellSource,isSpellSourceFile,mapSpellSourceError,SpellSourceSyntaxError} from '../tools/spellcard-editor/source-compiler.mjs';

async function withCompiledModule(compiled,check){
  await mkdir('build',{recursive:true});
  const folder=await mkdtemp(path.join(process.cwd(),'build','typescript-spell-test-'));
  try{
    const file=path.join(folder,'spell.mjs');
    await writeFile(file,compiled.code,'utf8');
    await check(await import(pathToFileURL(file).href));
  }finally{await rm(folder,{recursive:true,force:true});}
}

test('a new TypeScript spell preserves the JavaScript example simulation after erasing types',async()=>{
  const source=createTypeScriptSpellSource();
  assert.match(source,/import type .* from '@ts-stg\/thlib\/touhou'/);
  assert.match(source,/context: SpellContext/);
  const compiled=compileSpellSource(source);
  assert.doesNotMatch(compiled.code,/import type|interface SpellContext|angle: number/);
  assert.ok(compiled.sourceMap);
  await withCompiledModule(compiled,async typed=>{
    await withCompiledModule(compileSpellSource(createSpellSource(),'legacy.js'),ordinary=>{
      const simulate=module=>{
        const shots=[],runner=module.createSpell({boss:{x:2,y:96},bullets:{emit:parameters=>shots.push(parameters)}});
        for(let frame=0;frame<1800;frame++)runner.update();
        return {shots,snapshot:runner.snapshot()};
      };
      assert.deepEqual(simulate(typed),simulate(ordinary));
    });
  });
});

test('TypeScript preview compilation never evaluates authored source and preserves value imports',()=>{
  const source=`import type {NeverLoaded} from './types.js';
import {emit} from './pattern.js';
globalThis.__spellCompilerExecuted = true;
export const seed: number = 7;
export async function pattern(): Promise<unknown> { return import('./dynamic.js'); }
export {emit};
`;
  const compiled=compileSpellSource(source,'draft.mts');
  assert.equal(globalThis.__spellCompilerExecuted,undefined);
  assert.match(compiled.code,/import \{ emit \} from '\.\/pattern\.js'/);
  assert.match(compiled.code,/import\('\.\/dynamic\.js'\)/);
  assert.doesNotMatch(compiled.code,/types\.js';|Promise<unknown>/);
  assert.match(compiled.code,/sourceMappingURL=data:application\/json/);
  assert.equal(compiled.sourceMap.payload.sourcesContent[0],source);
});

test('TypeScript syntax diagnostics point at the unchanged author line and column',()=>{
  const source='// incomplete draft\ninterface Point { x: number; }\nconst speed: number = ;\n';
  assert.throws(()=>compileSpellSource(source,'typed.spell.ts'),error=>{
    assert.ok(error instanceof SpellSourceSyntaxError);
    assert.equal(error.diagnostics[0].line,3);
    assert.equal(error.diagnostics[0].column,23);
    assert.match(error.message,/typed\.spell\.ts:3:23: TS\d+/);
    return true;
  });
});

test('native generated stack locations map back across erased multiline type declarations',()=>{
  const source=`interface Point {
  x: number;
  y: number;
}

export function createSpell(point: Point) {
  throw new Error('authored failure');
}
`;
  const compiled=compileSpellSource(source,'作者.spell.ts');
  const lines=compiled.code.split('\n'),index=lines.findIndex(line=>line.includes('throw new Error'));
  const column=lines[index].indexOf('new Error')+1;
  assert.equal(index,1,'erased types actually change generated line offsets');
  assert.match(mapSpellSourceError(`Error: authored failure\n    at createSpell(spell-9.js:${index+1}:${column})`,'spell-9.js',compiled),/作者\.spell\.ts:7:\d+/);
  assert.match(mapSpellSourceError(`    at createSpell (spell-9.js:${index+1})`,'spell-9.js',compiled),/作者\.spell\.ts:7:\d+/);
  const unrelated='at other.js:2:1';
  assert.equal(mapSpellSourceError(unrelated,'spell-9.js',compiled),unrelated);
});

test('legacy JS stays byte-for-byte unchanged including incomplete syntax for the native runtime',()=>{
  const source='// unchanged\r\nexport const card = ;\r\n';
  for(const extension of ['js','mjs']){
    const compiled=compileSpellSource(source,`legacy.${extension}`);
    assert.equal(compiled.code,source);
    assert.equal(compiled.sourceMap,null);
  }
  for(const extension of ['ts','mts','js','mjs'])assert.equal(isSpellSourceFile(`card.${extension}`),true);
  for(const extension of ['json','tsx','cts','d.ts','d.mts'])assert.equal(isSpellSourceFile(`card.${extension}`),false);
});
