import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {parseLaunchOptions} from '../tools/spellcard-editor/launch-options.mjs';

const cwd=path.resolve('build','caller 目录');

test('editor launch defaults to draft restoration without a startup file',()=>{
  assert.deepEqual(parseLaunchOptions([]),{filePath:null,selfTest:false});
  assert.deepEqual(parseLaunchOptions(['--self-test'],{cwd}),{filePath:null,selfTest:true});
});

test('positional and named files resolve relative to the caller directory, including spaces and Chinese',()=>{
  const file=path.join('符卡 项目','借光的纸鹤.spell.js'),expected=path.resolve(cwd,file);
  assert.deepEqual(parseLaunchOptions([file],{cwd}),{filePath:expected,selfTest:false});
  assert.deepEqual(parseLaunchOptions(['--file',file],{cwd}),{filePath:expected,selfTest:false});
  const moduleFile=path.join(cwd,'module with spaces.mjs');
  assert.equal(parseLaunchOptions(['--file',moduleFile],{cwd:path.dirname(cwd)}).filePath,moduleFile);
  assert.equal(parseLaunchOptions(['../relative.js'],{cwd}).filePath,path.resolve(cwd,'../relative.js'));
  assert.equal(parseLaunchOptions(['current.js']).filePath,path.resolve(process.cwd(),'current.js'));
});

test('self-test works before or after a startup file, and -- makes the following path literal',()=>{
  const expected={filePath:path.resolve(cwd,'check.js'),selfTest:true};
  assert.deepEqual(parseLaunchOptions(['--self-test','--file','check.js'],{cwd}),expected);
  assert.deepEqual(parseLaunchOptions(['check.js','--self-test'],{cwd}),expected);
  assert.deepEqual(parseLaunchOptions(['--self-test','--','check.js'],{cwd}),expected);
  assert.equal(parseLaunchOptions(['--','-leading-dash.mjs'],{cwd}).filePath,path.resolve(cwd,'-leading-dash.mjs'));
});

test('ambiguous files, unsupported flags and incomplete --file options are rejected',()=>{
  for(const args of [
    ['first.js','second.js'],['first.js','--file','second.js'],['--file','first.js','first.js'],
    ['--file','first.js','--file','first.js'],['--','first.js','second.js'],
  ])assert.throws(()=>parseLaunchOptions(args,{cwd}),/Only one startup file/);
  for(const args of [['--unknown'],['--file=first.js'],['-f','first.js']])
    assert.throws(()=>parseLaunchOptions(args,{cwd}),/Unknown editor option/);
  for(const args of [['--file'],['--file',''],['--file',' '],['--file','--self-test'],['--file','--']])
    assert.throws(()=>parseLaunchOptions(args,{cwd}),/--file requires/);
  assert.throws(()=>parseLaunchOptions([''],{cwd}),/Expected a file path/);
});

test('argument parsing does not replace the desktop document opener validation',()=>{
  const missing=path.join(cwd,'not-created.txt');
  assert.equal(parseLaunchOptions(['--file',missing],{cwd}).filePath,missing);
  assert.throws(()=>parseLaunchOptions('spell.js'),TypeError);
  assert.throws(()=>parseLaunchOptions([null]),TypeError);
});
