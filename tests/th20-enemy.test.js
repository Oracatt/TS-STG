import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Th20Enemy,Th20Motion,th20EnemyDeathScript} from '../games/touhou20/src/enemy.js';
import {AnmBank} from '../games/touhou20/src/anm.js';
import {DrawList} from '../packages/thlib/src/render.js';
const stubBank={create(scriptId,options={}){return {scriptId,...options,alive:true,width:24,height:24,scaleX:1,scaleY:1,update(){},destroy(){this.alive=false;}};}};

test('enemy spawn defaults preserve original base-script death effect and parity sound',()=>{
  for(const [script,effect] of [[0,37],[20,37],[59,37],[62,37],[104,37],[5,33],[25,33],[53,33],[94,33],[10,41],[56,41],[99,41],[15,45],[109,45],[30,51],[35,50],[40,49],[123,37]]){
    assert.equal(th20EnemyDeathScript(script),effect);assert.equal(th20EnemyDeathScript(script,1),37);
    const enemy=new Th20Enemy({id:script,bank:stubBank,script}),sounds=[];
    enemy.defeat(null,{effectBank:stubBank,sound:(...args)=>sounds.push(args)});
    assert.equal(enemy.effects[0].scriptId,effect);assert.deepEqual(sounds,[[(script&1)+3,0]]);
  }
  const disabled=new Th20Enemy({bank:stubBank,deathScript:-1,deathSound:-1});disabled.defeat(null,{effectBank:stubBank,sound:()=>assert.fail()});assert.equal(disabled.effects.length,0);
});

test('enemy damage countdown records blocked damage and spell HP retains seventh remainders',()=>{
  const e=new Th20Enemy({bank:stubBank,hp:10,y:100});e.damage(9);assert.equal(e.hp,10);assert.equal(e.damageTotal,9);
  e.update();e.damage(9);assert.equal(e.hp,10);e.update();e.damage(1);assert.equal(e.hp,9);
  e.prepareSpellHealth(20);e.damage(1);assert.equal(e.hp,19);e.damage(6);assert.equal(e.hp,19);e.damage(7);assert.equal(e.hp,18);
  e.primaryFlags=0x10;e.damage(50);assert.equal(e.hp,18);e.primaryFlags=0;e.prepareNormalHealth(5);e.damage(5);assert.equal(e.alive,false);
});

test('original enemy contact masks, swapped rectangle dimensions and six-frame graze',()=>{
  let circle,rectangle,grazes=0;const p={collisionCircle(...args){circle=args;return 2;},collisionRectangle(...args){rectangle=args;return 2;},addGraze(){grazes++;}};
  const e=new Th20Enemy({bank:stubBank,x:17,y:90,contactWidth:30,contactHeight:14});
  assert.equal(e.collidePlayer(p),2);assert.deepEqual(circle.slice(0,3),[17,90,15]);
  e.primaryFlags=0x1200;e.age=6;e.collidePlayer(p);assert.deepEqual(rectangle.slice(0,5),[17,90,0,14,30]);assert.equal(grazes,1);
  e.age=7;e.collidePlayer(p);assert.equal(grazes,1);
  for(const primary of [2,32,0x1020]){e.primaryFlags=primary;assert.equal(e.collidePlayer(p),0);}
  e.primaryFlags=0;e.flags=0x400;assert.equal(e.collidePlayer(p),0);e.flags=0;assert.equal(e.collidePlayer(p,{enemyContactBlocked:true}),0);
  e.flags=0x80;assert.equal(e.collidePlayer(p,{enemyContactBlocked:true}),2);e.contactInvulnerability.set(1);assert.equal(e.collidePlayer(p),0);
});

test('original minor enemy destruction scripts execute and draw against imported effect ANM',()=>{
  const load=name=>new AnmBank(JSON.parse(fs.readFileSync(new URL(`../games/touhou20/assets/anm/${name}.json`,import.meta.url))),{loadTexture:()=>1});
  const bank=load('enemy'),effectBank=load('effect'),draw=new DrawList();
  for(const script of [0,5,10,15,30,35,40]){
    const enemy=new Th20Enemy({bank,script,x:10,y:90,motion:new Th20Motion({position:{x:10,y:90},speed:2,angle:0})});enemy.update();enemy.lastHitPosition={x:10,y:90,z:0};enemy.defeat(null,{effectBank});
    assert.equal(enemy.effects[0].rotation,0);
    for(let frame=0;frame<40;frame++){enemy.update();enemy.draw(draw,{x:336,y:24,scale:1.5,screenScale:1});}
  }
  assert.ok(draw.commands.length>0);
});
