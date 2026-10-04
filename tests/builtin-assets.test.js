import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const assetRoot=new URL('../packages/thlib/assets/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',assetRoot),'utf8'));
test('shared audio manifest contains exactly the six original portable PCM cues',()=>{
 assert.equal(manifest.format,'ts-stg-builtin-sounds-v1');assert.equal(manifest.license,'MIT');
 assert.deepEqual(Object.keys(manifest.sounds).sort(),['bomb','graze','hit','pickup','select','shot']);
 for(const clip of Object.values(manifest.sounds)){
  assert.equal(path.isAbsolute(clip.file),false);assert.equal(clip.file.includes('..'),false);assert.match(clip.file,/^audio\/[a-z]+\.wav$/);
  const bytes=fs.readFileSync(new URL(clip.file,assetRoot));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),clip.sha256);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,16),'WAVEfmt ');assert.equal(bytes.toString('ascii',36,40),'data');
  assert.equal(bytes.readUInt16LE(20),1);assert.equal(bytes.readUInt16LE(22),clip.channels);assert.equal(bytes.readUInt32LE(24),clip.sampleRate);
  assert.equal(bytes.readUInt16LE(34),16);assert.equal(clip.format,'pcm-s16le');assert.equal(bytes.length,44+clip.frames*2);
 }
 assert.equal(fs.existsSync(new URL('moonlit.wav',assetRoot)),false);assert.equal(fs.existsSync(new URL('audio/moonlit.wav',assetRoot)),false);
 assert.ok(fs.existsSync(new URL('../examples/danmaku/assets/moonlit.wav',import.meta.url)));
});
