import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getTouhouWeaponData,TOUHOU_WEAPON_DATA} from '../packages/thlib/dist/touhou/weapon-data.js';
import {getTouhouPlayerData} from '../packages/thlib/dist/touhou/player-data.js';
import {validateTouhouShots} from '../packages/thlib/dist/touhou/shot-data.js';
import {scriptClosure,decodeRgbaPng} from '../tools/import-touhou-common-assets.mjs';
import {writeTouhouWeaponData} from '../tools/import-touhou-weapon-data.mjs';

const common='packages/thlib/assets/touhou-common',source='games/demo/assets';
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceAvailable=existsSync(`${source}/shots/pl00.json`)&&existsSync(`${source}/anm/pl01.json`);

test('portable weapon data exposes all sixteen independently selectable frozen profiles without changing baseline data',()=>{
  assert.equal(TOUHOU_WEAPON_DATA.length,2);
  for(const [character,name]of ['reimu','marisa'].entries()){
    assert.equal(TOUHOU_WEAPON_DATA[character].length,8);
    const baseline=getTouhouPlayerData(character);
    assert.equal(baseline.patterns.length,15);assert.equal(baseline.profile,'standard');
    assert.deepEqual(baseline,read(`${common}/shots/pl0${character}.json`));
    const packaged=read(`${common}/shots/pl0${character}-weapons.json`);
    assert.deepEqual(TOUHOU_WEAPON_DATA[character],packaged);
    for(let weapon=0;weapon<8;weapon++){
      const data=getTouhouWeaponData(character,weapon);
      assert.equal(getTouhouWeaponData(name,weapon),data);assert.equal(validateTouhouShots(data),data);
      assert.equal(data.patterns.length,20);assert.equal(data.character,character);assert.equal(data.profile,`weapon-${weapon}`);
      for(const key of ['offsets','optionScripts','fullPowerScripts','damageCaps'])assert.equal(data[key].length,1);
      assert.ok(Object.isFrozen(data)&&Object.isFrozen(data.patterns)&&Object.isFrozen(data.offsets[0].normal));
      assert.throws(()=>{data.patterns[0][0].damage++;},TypeError);
    }
  }
  for(const character of [-1,2,'stone',undefined])assert.throws(()=>getTouhouWeaponData(character,2),RangeError);
  for(const weapon of [-1,8,0.5,NaN,Infinity,'2',undefined])assert.throws(()=>getTouhouWeaponData(0,weapon),RangeError);
});

test('weapon records preserve every original numeric row, callback, damage cap and option coordinate',{skip:!sourceAvailable},()=>{
  for(let character=0;character<2;character++){
    const original=read(`${source}/shots/pl0${character}.json`);
    for(let weapon=0;weapon<8;weapon++){
      const data=getTouhouWeaponData(character,weapon);
      assert.deepEqual(data.patterns,original.patterns.slice(weapon*20,weapon*20+20));
      for(const key of ['offsets','optionScripts','fullPowerScripts','damageCaps'])assert.deepEqual(data[key],[original[key][weapon]]);
      assert.deepEqual(data.speeds,original.speeds);assert.equal(data.maxPower,original.maxPower);
      assert.equal(data.source.file,original.source.file);assert.equal(data.source.sha256,original.source.sha256);
      assert.match(data.source.selection,new RegExp(`original patterns ${weapon*20}\\.\\.${weapon*20+19} mapped to local 0\\.\\.19`));
    }
  }
  assert.equal(writeTouhouWeaponData({checkOnly:true}).verified,true,'Checked-in TypeScript is reproducible from source SHT');
});

test('blue Reimu retains original homing artwork, unfocused/focused callbacks and active group',()=>{
  const data=getTouhouWeaponData('reimu',2),bank=read(`${common}/anm/pl00.json`);
  assert.equal(data.optionScripts[0],39);assert.equal(data.fullPowerScripts[0],40);
  assert.ok(data.patterns.slice(0,5).flat().every(row=>row.animation===6));
  for(const row of data.patterns.slice(6,10).flat()){
    assert.equal(row.animation,9);assert.equal(row.speed,4);assert.equal(row.period,5);assert.deepEqual(row.callbacks,[1,1,0,0]);
  }
  for(const row of data.patterns.slice(11,15).flat()){
    assert.equal(row.animation,11);assert.equal(row.speed,8);assert.equal(row.period,5);assert.deepEqual(row.callbacks,[3,1,0,0]);
  }
  assert.ok(data.patterns.slice(15).flat().length>0);
  for(const id of [6,9,10,11,12,13,14,19,39,40])assert.ok(!bank.scripts[id].excluded,`Blue Reimu animation ${id}`);
  for(const id of [24,25,26,27,28,38,39,40,41,42,43,65]){
    assert.ok(!bank.sprites[id].excluded);assert.equal(bank.sprites[id].entry,1);
  }
});

test('every weapon and controller-created phase effect retains its source ANM dependency tree and sampled RGBA',{skip:!sourceAvailable},()=>{
  for(let character=0;character<2;character++){
    const name=`pl0${character}`,original=read(`${source}/anm/${name}.json`),shared=read(`${common}/anm/${name}.json`);
    // These controller roots are independently audited from BarWeapon::start_phase
    // and YellowWeapon::end_phase, not inferred from the importer's root list.
    const roots=character===0?[25,31]:[24,27];
    for(const data of TOUHOU_WEAPON_DATA[character])roots.push(...data.optionScripts,...data.fullPowerScripts,...data.patterns.flat().flatMap(row=>[row.animation,row.hitAnimation]));
    const closure=scriptClosure(original,roots);
    const full=decodeRgbaPng(readFileSync(`${source}/textures/${name}/entry-1.png`));
    const output=decodeRgbaPng(readFileSync(`${common}/textures/${name}/entry-1.png`));
    assert.equal(output.width,full.width);assert.equal(output.height,full.height);
    for(const id of closure.scripts)assert.deepEqual(shared.scripts[id],original.scripts[id],`${name}:${id} source instructions and interrupt times`);
    for(const id of closure.sprites){
      const sprite=original.sprites[id];assert.deepEqual(shared.sprites[id],sprite,`${name} sprite${id} original UV and geometry`);
      if(sprite.entry!==1)continue;
      for(let y=Math.max(0,Math.floor(sprite.y)-1);y<Math.min(full.height,Math.ceil(sprite.y+sprite.height)+1);y++){
        const left=Math.max(0,Math.floor(sprite.x)-1),right=Math.min(full.width,Math.ceil(sprite.x+sprite.width)+1);
        const start=(y*full.width+left)*4,end=(y*full.width+right)*4;
        assert.deepEqual(output.rgba.subarray(start,end),full.rgba.subarray(start,end),`${name} sprite${id} row${y}: source pixels and sampling margin`);
      }
    }
  }
  const manifest=read(`${common}/manifest.json`);
  assert.equal(manifest.archives.aura,undefined,'Stone owner aura is not part of standalone weapons');
  const bullet=read(`${common}/anm/bullet.json`),enemy=read(`${common}/anm/enemy.json`);
  for(let id=123;id<=136;id++)assert.equal(bullet.scripts[id].excluded,true,'Stone item animations stay excluded');
  for(let id=272;id<=417;id++)assert.equal(enemy.scripts[id].excluded,true,'Stone enemies stay excluded');
});

test('weapon tables, sprites and additional shot sounds ship with hashes and original provenance',()=>{
  const manifest=read(`${common}/manifest.json`),catalog=read(`${common}/prefabs.json`),audio=read(`${common}/audio/manifest.json`);
  assert.equal(manifest.counts.weaponProfiles,16);assert.equal(manifest.counts.weaponPatterns,320);
  assert.equal(catalog.weapons.length,16);assert.equal(manifest.weapons.length,2);
  for(const descriptor of manifest.weapons){
    assert.equal(descriptor.profiles,8);assert.equal(descriptor.patterns,160);
    assert.equal(hash(readFileSync(`${common}/${descriptor.file}`)),descriptor.sha256);
    assert.equal(descriptor.source.sha256,getTouhouWeaponData(descriptor.character,0).source.sha256);
  }
  for(const [id,name,expectedHash]of [[64,'se_msl.wav','e0dd89c26fa2d59c066d5e5905360152ff08fa336c9de8b7d18bdb0b4271fa0e'],[65,'se_msl2.wav','ed72ab58e7cd763f993240d986b4ace83afddb0f1278ca6e42cff348e673c67c']]){
    const definition=audio.definitions.find(value=>value.id===id);assert.ok(definition,`Weapon sound ${id}`);
    const file=audio.files[definition.fileIndex];assert.equal(file.name,name);assert.equal(file.sha256,expectedHash);
    assert.equal(hash(readFileSync(`${common}/${file.path}`)),expectedHash);
    const provenance=manifest.sounds.find(value=>value.file===file.path);assert.ok(provenance);
    assert.equal(provenance.source.sha256,expectedHash);assert.equal(provenance.operation,'Byte-for-byte copy');
  }
});
