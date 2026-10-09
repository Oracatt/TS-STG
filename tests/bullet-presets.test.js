import test from 'node:test';
import assert from 'node:assert/strict';
import { Bullet, StandardBulletPresets, getBulletPreset, bulletIntersectsCircle } from '../packages/thlib/dist/index.js';

test('standard bullet presets are immutable and colours are not geometry names', () => {
  assert.equal(Object.keys(StandardBulletPresets).length,26);
  assert.ok(Object.isFrozen(StandardBulletPresets));
  for(const preset of Object.values(StandardBulletPresets)){
    assert.ok(Object.isFrozen(preset));
    assert.ok([8,16,32,64].includes(preset.size));
    assert.ok(preset.radius>0&&preset.radius<preset.size/2);
  }
  assert.throws(()=>{StandardBulletPresets.orb.radius=99},TypeError);
  for(const name of ['orb.gray','bullet.orb.gray','gray','unknown','__proto__','constructor',null]) assert.throws(()=>getBulletPreset(name),RangeError);
});

test('circular presets include tangency and scale only their own geometry', () => {
  const position={x:10,y:20};
  assert.equal(bulletIntersectsCircle('orb',position,16,20,2),true);
  assert.equal(bulletIntersectsCircle('orb',position,16.00001,20,2),false);
  assert.equal(bulletIntersectsCircle('orb',{...position,scale:2},20,20,2),true);
  assert.equal(bulletIntersectsCircle('orb',{...position,scale:2},20.00001,20,2),false);
  assert.equal(bulletIntersectsCircle('orb',{...position,scale:0},12,20,2),true);
});

test('capsules rotate their entire centre segment and retain rounded end caps', () => {
  const preset=getBulletPreset('rice'), extent=preset.halfLength+preset.halfWidth;
  assert.equal(preset.halfLength,preset.radius*1.15);
  assert.equal(bulletIntersectsCircle(preset,{x:0,y:0},extent+1,0,1),true);
  assert.equal(bulletIntersectsCircle(preset,{x:0,y:0},extent+1.00001,0,1),false);
  assert.equal(bulletIntersectsCircle(preset,{x:0,y:0,angle:Math.PI/2},0,extent,0),true);
  assert.equal(bulletIntersectsCircle(preset,{x:0,y:0,angle:Math.PI/2},extent,0,0),false);
  assert.equal(bulletIntersectsCircle(preset,{x:0,y:0},0,preset.halfWidth+1,1),true);
  assert.equal(bulletIntersectsCircle(preset,{x:0,y:0},0,preset.halfWidth+1.00001,1),false);
});

test('rectangular talisman corners use circle distance and rotate with their pose', () => {
  const preset=getBulletPreset('amulet'), position={x:0,y:0};
  assert.equal(bulletIntersectsCircle(preset,position,4,2,0),true);
  assert.equal(bulletIntersectsCircle(preset,position,4.6,2.8,1),true);
  assert.equal(bulletIntersectsCircle(preset,position,4.60001,2.8,1),false);
  assert.equal(bulletIntersectsCircle(preset,{...position,angle:Math.PI/2},1,3.9,0),true);
  assert.equal(bulletIntersectsCircle(preset,{...position,angle:Math.PI/2},3.9,1,0),false);
});

test('inactive standard bullets never hit and invalid geometry fails explicitly', () => {
  for(const flag of ['active','alive','isActive']) assert.equal(bulletIntersectsCircle('orb',{x:0,y:0,[flag]:false},0,0,100),false);
  for(const transform of [{x:NaN,y:0},{x:0,y:Infinity},{x:0,y:0,scale:-1},{x:0,y:0,angle:NaN}]) assert.throws(()=>bulletIntersectsCircle('orb',transform,0,0,1),RangeError);
  assert.throws(()=>bulletIntersectsCircle('orb',{x:0,y:0},0,0,-1),RangeError);
});

test('preset helper and Bullet retain a single collision implementation', () => {
  for(const name of ['orb','rice','amulet']) {
    const preset=getBulletPreset(name), position={x:17,y:29,angle:.37,scale:1.75};
    const bullet=new Bullet({...preset,...position});
    for(let x=-5;x<=40;x+=3)for(let y=7;y<=52;y+=3) assert.equal(bulletIntersectsCircle(preset,position,x,y,2),bullet.collidesCircle(x,y,2));
  }
  const existing=new Bullet();
  assert.equal(existing.radius,4);assert.equal(existing.hitbox,'circle');
});
