import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {AnmBank,SUPPORTED_ANM_OPCODES} from '../packages/thlib/dist/touhou/anm.js';
import {createTouhouResources} from '../packages/thlib/dist/touhou/resources.js';
import {createTouhouPrefabCatalog,TOUHOU_ENEMY_PRESETS,TOUHOU_EFFECT_PRESETS,TOUHOU_BULLET_PRESETS,TouhouEffectPreset} from '../packages/thlib/dist/touhou/prefabs.js';
import {TouhouEnemy} from '../packages/thlib/dist/touhou/enemy.js';
import {DrawList} from '../packages/thlib/dist/render.js';
const base='packages/thlib/assets/touhou-common',original='games/touhou20/assets/anm';
const available=existsSync(`${base}/manifest.json`)&&existsSync(`${original}/enemy.json`);
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const host={readText:file=>readFileSync(file,'utf8'),loadTexture:()=>1,createTexture:()=>2,createRenderTarget:()=>3};

test('common prefab inventory covers all source non-stone enemy scripts and all effect scripts',{skip:!available},()=>{
  const enemy=read(`${original}/enemy.json`),effect=read(`${original}/effect.json`),catalog=read(`${base}/prefabs.json`);
  const ordinary=enemy.scripts.filter(script=>!enemy.entries[script.entry].name.includes('stone'));
  assert.equal(ordinary.length,272);
  assert.deepEqual(TOUHOU_ENEMY_PRESETS.map(p=>p.script),ordinary.map(s=>s.index));
  for(const preset of TOUHOU_ENEMY_PRESETS)assert.equal(preset.sourceTexture,enemy.entries[enemy.scripts[preset.script].entry].name);
  assert.deepEqual(TOUHOU_EFFECT_PRESETS.map(p=>p.script),effect.scripts.map(s=>s.index));
  assert.deepEqual(catalog.counts,{bulletStyles:50,bulletColorRows:800,enemyAnimations:272,effectAnimations:193});
  assert.deepEqual(catalog.animations.enemy.map(p=>p.script),ordinary.map(s=>s.index));
  const supported=new Set(SUPPORTED_ANM_OPCODES);
  for(const bank of Object.keys(catalog.animations))for(const script of read(`${base}/anm/${bank}.json`).scripts.filter(s=>!s.excluded))
    for(const ins of script.instructions)assert.ok(supported.has(ins.opcode),`${bank}:${script.index} opcode ${ins.opcode}`);
});

test('every enemy preset is a real common actor and remains renderable without either demo',{skip:!available},()=>{
  const resources=createTouhouResources(host),catalog=createTouhouPrefabCatalog(resources),enemyData=resources.data.enemy;
  for(const preset of catalog.enemies){
    const bank=new AnmBank(enemyData,{loadTexture:()=>1}),local={...resources,banks:{...resources.banks,enemy:bank}},factory=createTouhouPrefabCatalog(local);
    const enemy=factory.createEnemy(preset.id,{x:0,y:120,hp:100});
    assert.ok(enemy instanceof TouhouEnemy);assert.equal(enemy.animation.scriptId,preset.script);
    for(let frame=0;frame<60;frame++){enemy.update();bank.updateDetached();}
    const draw=new DrawList();enemy.draw(draw,{x:320,y:0,scale:1.5});bank.drawDetached(draw,{x:320,y:0,scale:1.5});
    assert.ok(draw.commands.every(command=>command.every(value=>typeof value!=='number'||Number.isFinite(value))),preset.id);
    bank.dispose();
  }
  assert.throws(()=>catalog.createEnemy(272),/Unknown enemy/);
  assert.throws(()=>catalog.createAnimation('enemy:272'),/Unavailable common/);
  resources.dispose();assert.throws(()=>catalog.createEnemy(0),/disposed/);
});

test('every standard bullet style and color uses original thlib animation and collision table',{skip:!available},()=>{
  const resources=createTouhouResources(host),catalog=createTouhouPrefabCatalog(resources),field=catalog.createBulletField();
  assert.equal(TOUHOU_BULLET_PRESETS.length,50);
  for(const preset of catalog.bullets)for(let color=0;color<16;color++){
    const [bullet]=catalog.emitBullet(field,preset.id,color,{x:0,y:100,speed:0,shotSound:-1});
    assert.equal(bullet.type,preset.type);assert.equal(bullet.radius,resources.styles[preset.type].radius);
    assert.equal(bullet.animation.bank,resources.banks.bullet);assert.equal(bullet.style.script,preset.script);
  }
  assert.equal(field.count,800);field.update(null);
  const draw=new DrawList();field.draw(draw,{x:320,y:0,scale:1.5});assert.ok(draw.commands.length>800);
  resources.dispose();
});

test('original spell presets use the actual source child graph and application catalog is complete',{skip:!available},()=>{
  const resources=createTouhouResources(host),catalog=createTouhouPrefabCatalog(resources);
  const circles=catalog.createEffect(TouhouEffectPreset.SPELL_DOUBLE_CIRCLES);
  assert.deepEqual(circles.children.map(vm=>vm.scriptId),[4,5]);
  const attack=catalog.createEffect(TouhouEffectPreset.SPELL_CARD_ATTACK);
  assert.deepEqual(attack.children.slice(0,4).map(vm=>vm.scriptId),[9,10,11,12]);
  const originalBank=new AnmBank(read(`${original}/effect.json`));originalBank.create(6);
  assert.deepEqual(attack.children.map(vm=>vm.scriptId),originalBank.create(13).children.map(vm=>vm.scriptId));originalBank.dispose();
  for(const id of ['front:0','front:144','front:148','front:374','text:22','text:23','text:87','title:0','title:12','title:58'])assert.ok(catalog.animations.some(p=>p.id===id),id);
  assert.equal(catalog.animations.length,resources.manifest.counts.scripts);
  for(const character of ['reimu','marisa']){const player=catalog.createPlayer(character);assert.equal(player.bank,resources.banks[character==='reimu'?'pl00':'pl01']);}
  resources.dispose();
});

test('baseline title skin preserves source timelines and excludes title branding and stone variants',{skip:!available},()=>{
  const data=read(`${base}/anm/title.json`),front=read(`${base}/anm/front.json`);
  for(const entry of data.entries)if(entry.texture.kind!=='excluded')assert.ok(!/title_(?:bk|ch|logo|copy)|title_pl0[01]b[rbyG]/.test(entry.name),entry.name);
  for(const [script,sprite]of [[6,28],[7,33]])for(const ins of data.scripts[script].instructions)if(ins.opcode===300)assert.equal(ins.args[0],sprite);
  assert.ok(front.scripts[13].excluded);
  assert.ok(!front.scripts[0].instructions.some(ins=>ins.opcode===500&&ins.args[0]===13));
  for(const id of [0,31])assert.equal(data.scripts[id].instructions.find(ins=>ins.offset===36).opcode,0,'Retired child opcode is same-size NOP, retaining VM fallthrough addresses');
});

test('all 42 converging charge presets execute original 200-particle graphs and retire',{skip:!available},()=>{
  const data=read(`${base}/anm/effect.json`);
  for(let script=151;script<=192;script++){
    const bank=new AnmBank(data,{loadTexture:()=>1}),vm=bank.create(script,{x:10,y:100}),owner=vm.attachedEffect;
    assert.equal(owner.spawned,0,'Original callback is attached during spawn, first update runs on the following tick');
    bank.update();assert.equal(owner.spawned,4);assert.deepEqual(owner.particles.map(p=>p.vm.scriptId),[149,149,149,150]);
    for(let tick=1;tick<240;tick++){
      bank.update();if(tick===30){const draw=new DrawList();bank.draw(draw,{x:336,y:24,scale:1,screenScale:1.5});assert.ok(draw.commands.length>100);}
    }
    assert.equal(owner.spawned,200,`effect:${script}`);assert.equal(vm.alive,false);assert.equal(bank.instances.length,0);
    assert.ok(owner.particles.every(p=>p.stage===2),'Each particle reaches the second original Hermite curve');bank.dispose();
  }
});

test('charge interrupt stops new particles while existing particles finish; retirement closes independent children',{skip:!available},()=>{
  const bank=new AnmBank(read(`${base}/anm/effect.json`),{loadTexture:()=>1}),vm=bank.create(151);
  for(let frame=0;frame<10;frame++)bank.update();assert.equal(vm.attachedEffect.spawned,40);
  vm.interrupt(1);for(let frame=0;frame<250;frame++)bank.update();assert.equal(vm.attachedEffect.spawned,40);assert.equal(vm.alive,false);assert.equal(bank.instances.length,0);
  const second=bank.create(151);bank.update();const particles=second.attachedEffect.particles.map(p=>p.vm);second.destroy();assert.ok(particles.every(p=>!p.alive));bank.dispose();
});

test('camera-dependent common ANMs use injectable stage camera components and source float32 offset accumulation',{skip:!available},()=>{
  const bank=new AnmBank(read(`${base}/anm/effect.json`),{loadTexture:()=>1,cameraOffset:()=>({x:.25,y:-.5,z:1.25}),cameraComponent:index=>index-10016});
  const vm=bank.create(95,{x:10,y:20,z:3}),before={x:vm.x,y:vm.y,z:vm.z};vm.update();
  assert.equal(vm.x,Math.fround(before.x+.25));assert.equal(vm.y,Math.fround(before.y-.5));assert.equal(vm.z,Math.fround(before.z+1.25));
  for(let variable=10016;variable<=10021;variable++)assert.equal(vm.floatVariable(variable),variable-10016);
  bank.dispose();
});
