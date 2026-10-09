import test from 'node:test';
import assert from 'node:assert/strict';
import {TouhouMusicFade,touhouMusicVolume} from '../packages/thlib/dist/touhou/index.js';

test('music uses the source squared setting curve, separately from sound effects',()=>{
  // audio_runtime/audio_state.cpp::music_volume, units 1/100 dB.
  for(const [volume,expected]of [[0,[-10000,-10000,-10000,-10000]],[10,[-4050,-4058,-4525,-4993]],
    [50,[-1250,-1282,-3125,-4970]],[70,[-450,-489,-2725,-4963]],[100,[0,-42,-2500,-4959]]])
    assert.deepEqual([0,-42,-2500,-4959].map(attenuation=>touhouMusicVolume(attenuation,volume)),expected);
});

test('source two-second fade has 119 gain samples and stops exactly on its 120th fixed frame',()=>{
  const gains=[],stops=[];
  const fade=new TouhouMusicFade({setVolume:gain=>gains.push(gain),stop:()=>stops.push(fade.frame)});
  assert.deepEqual(fade.snapshot(),{frame:0,alive:true,remaining:120,duration:120,attenuation:0,volume:100});
  assert.deepEqual(gains,[]);
  fade.update();assert.equal(fade.attenuation,-42);assert.equal(gains[0],10**(-42/2000));
  for(let i=1;i<60;i++)fade.update();
  assert.equal(fade.attenuation,-2500);assert.equal(gains.at(-1),10**(-2500/2000));
  for(let i=60;i<119;i++)fade.update();
  assert.equal(fade.alive,true);assert.equal(fade.attenuation,-4959);assert.equal(gains.length,119);
  fade.update();assert.equal(fade.alive,false);assert.deepEqual(stops,[120]);assert.equal(gains.length,119);
  fade.update();assert.deepEqual(stops,[120]);
});

test('music fade settings do not retick, cancellation does not stop, and no host is required',()=>{
  let last,stopped=0;const fade=new TouhouMusicFade({volume:70,setVolume:gain=>last=gain,stop:()=>stopped++});
  for(let frame=0;frame<60;frame++)fade.update();assert.equal(last,10**(-2725/2000));
  fade.setVolume(50);assert.equal(last,10**(-3125/2000));assert.equal(fade.frame,60);
  fade.destroy();fade.update();fade.setVolume(100);assert.equal(fade.frame,60);assert.equal(stopped,0);
  assert.equal(last,10**(-3125/2000));
  const immediate=new TouhouMusicFade({seconds:0,stop:()=>stopped++});assert.equal(immediate.alive,true);
  immediate.update();assert.equal(immediate.alive,false);assert.equal(stopped,1);
  const headless=new TouhouMusicFade({seconds:.025});assert.equal(headless.duration,1);headless.update();assert.equal(headless.alive,false);
  for(const seconds of [-1,NaN,Infinity,1e20])assert.throws(()=>new TouhouMusicFade({seconds}),RangeError);
  for(const volume of [-1,101,Infinity,NaN])assert.throws(()=>new TouhouMusicFade({volume}),RangeError);
  assert.throws(()=>new TouhouMusicFade({setVolume:1}),TypeError);assert.throws(()=>new TouhouMusicFade({stop:true}),TypeError);
});
