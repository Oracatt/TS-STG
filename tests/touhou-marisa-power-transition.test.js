import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Keys} from '@ts-stg/thlib';
import {AnmBank,TouhouItems,TouhouPlayer,getTouhouPlayerData} from '@ts-stg/thlib/touhou';

const data=JSON.parse(readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/pl01.json',import.meta.url)));

function fixture(power,focused){
  const bank=new AnmBank(data,{loadTexture:()=>1});
  const player=new TouhouPlayer({character:1,sht:getTouhouPlayerData(1),bank,power});
  const items=new TouhouItems({player});
  const mask=Keys.SHOOT|(focused?Keys.FOCUS:0);
  for(let frame=0;frame<60;frame++)player.update(mask);
  return {bank,player,items,mask};
}

function collect(f,type,count=1){
  for(let index=0;index<count;index++)f.items.spawn({type,x:f.player.x,y:f.player.y,speed:0});
  f.items.update();
  assert.equal(f.items.items.length,0,'all nearby power items are collected during the same item update');
}

function assertBeams(player,label,{settled=true}={}){
  const beams=player.shots.filter(shot=>shot.row.type===2&&shot.state===1&&shot.alive);
  const groups=new Map();
  for(const beam of beams){
    const same=groups.get(beam.row.group)??[];same.push(beam.id);groups.set(beam.row.group,same);
    assert.equal(player.laserGroups.get(beam.row.group),beam,`${label}: current beam ${beam.id} retains its group ownership`);
  }
  for(const [group,ids]of groups)assert.equal(ids.length,1,`${label}: option group ${group} has duplicate damaging beams ${ids}`);
  for(const [group,beam]of player.laserGroups){
    assert.equal(beam.alive,true,`${label}: registered group ${group} is alive`);
    assert.equal(beam.state,1,`${label}: registered group ${group} still deals damage`);
    assert.ok(beams.includes(beam),`${label}: registered group ${group} belongs to the active shots`);
  }
  if(settled)assert.equal(beams.length,player.powerLevel,`${label}: one damaging beam per powered option`);
  return beams;
}

for(const focused of [false,true]){
  const mode=focused?'focused':'unfocused';
  for(const from of [100,200,300])test(`Marisa ${mode} sustained firing retains one beam per option after ${from} -> ${from+100}`,()=>{
    const f=fixture(from,focused);
    try{
      assertBeams(f.player,'before pickup');
      collect(f,'largePower');
      assert.equal(f.player.power,from+100);
      let sawRetiringBeam=false;
      for(let frame=0;frame<60;frame++){
        f.player.update(f.mask);
        sawRetiringBeam ||= f.player.shots.some(shot=>shot.row.type===2&&shot.state===2&&shot.animation?.alive);
        assertBeams(f.player,`pickup frame ${frame}`,{settled:frame>1});
      }
      assert.equal(sawRetiringBeam,true,'old beams retain their source interruption animation while the new weapons take over');
    }finally{f.bank.dispose();}
  });

  test(`Marisa ${mode} collecting multiple small P items in one frame does not duplicate lasers`,()=>{
    const f=fixture(199,focused);
    try{
      collect(f,'power',7);
      assert.equal(f.player.power,206);
      for(let frame=0;frame<60;frame++){
        f.player.update(f.mask);
        assertBeams(f.player,`same-frame pickup ${frame}`,{settled:frame>1});
      }
    }finally{f.bank.dispose();}
  });

  test(`Marisa ${mode} rapid power upgrades keep retirement tails separate from current laser owners`,()=>{
    const f=fixture(100,focused);
    try{
      let lastPickup=-100;
      for(let frame=0;frame<70;frame++){
        if(frame===0||frame===3||frame===6){collect(f,'largePower');lastPickup=frame;}
        f.player.update(f.mask);
        assertBeams(f.player,`rapid pickup frame ${frame}`,{settled:frame-lastPickup>1});
      }
      assert.equal(f.player.power,400);
    }finally{f.bank.dispose();}
  });

  test(`Marisa ${mode} small P within the same power level preserves its current beams`,()=>{
    const f=fixture(220,focused);
    try{
      const before=assertBeams(f.player,'before same-level pickup');
      collect(f,'power',7);
      assert.equal(f.player.power,227);
      for(let frame=0;frame<30;frame++){
        f.player.update(f.mask);
        const beams=assertBeams(f.player,`same-level frame ${frame}`);
        assert.deepEqual(beams.map(beam=>beam.id),before.map(beam=>beam.id),'changing the fractional power does not restart sustained lasers');
      }
    }finally{f.bank.dispose();}
  });

  test(`Marisa starting ${mode} keeps the same beams and option owners through focus switches`,()=>{
    const f=fixture(300,focused);
    try{
      const before=assertBeams(f.player,'before focus switches');
      const owners=before.map(beam=>({beam,option:beam.option}));
      for(let frame=0;frame<36;frame++){
        const focus=frame<18?!focused:focused;
        f.player.update(Keys.SHOOT|Keys.RIGHT|(focus?Keys.FOCUS:0));
        const beams=assertBeams(f.player,`focus switch frame ${frame}`);
        assert.deepEqual(beams.map(beam=>beam.id),before.map(beam=>beam.id),'focus selection changes the current weapon rows without duplicating or replacing lasers');
        for(const {beam,option}of owners){
          assert.equal(beam.option,option,'beam keeps its corresponding option actor while the formation moves');
          assert.ok(Math.abs(beam.x-option.x)<.011&&Math.abs(beam.y-option.y)<.011,'beam origin follows the moving option within the source position quantization');
        }
      }
    }finally{f.bank.dispose();}
  });

  test(`Marisa ${mode} re-pressing fire during the old beams' exit keeps both lifetimes independent`,()=>{
    const f=fixture(200,focused);
    try{
      const previous=assertBeams(f.player,'before release');
      let releaseFrames=0;
      while(previous.some(beam=>beam.state===1)&&releaseFrames<15){
        f.player.update(focused?Keys.FOCUS:0);releaseFrames++;
      }
      assert.ok(releaseFrames>1&&releaseFrames<=15,'release finishes the current source firing cycle before ending its lasers');
      assert.ok(previous.every(beam=>beam.state===2&&beam.animation.alive),'old lasers are visual exit tails when fire restarts');
      const origins=previous.map(beam=>({beam,option:beam.option,x:beam.x,scale:beam.animation.scaleY}));
      let replacement=null;
      for(let frame=0;frame<12;frame++){
        f.player.update(f.mask|Keys.RIGHT);
        const beams=assertBeams(f.player,`re-press frame ${frame}`);
        replacement??=beams;
        assert.deepEqual(beams.map(beam=>beam.id),replacement.map(beam=>beam.id),'old-tail cleanup cannot cause another replacement generation');
        assert.ok(beams.every(beam=>!previous.includes(beam)),'new damaging beams are distinct from old visual tails');
        if(frame<7)for(const entry of origins){
          const {beam,option}=entry;
          assert.equal(beam.option,option);
          assert.ok(beam.x>entry.x,'retiring beam keeps moving with the option instead of freezing in space');
          assert.ok(Math.abs(beam.x-option.x)<.011&&Math.abs(beam.y-option.y)<.011);
          assert.ok(beam.animation.scaleY<entry.scale,'the old visual shrinks while the replacement remains active');
          entry.scale=beam.animation.scaleY;
        }
        if(frame===6)assert.ok(previous.every(beam=>beam.animation.scaleY===0),'source ANM completes its eight-frame shrink including the release update');
        if(frame===7)assert.ok(previous.every(beam=>!beam.animation.alive),'the finished exit animation retires');
        if(frame===8)assert.ok(previous.every(beam=>!beam.alive&&!f.player.shots.includes(beam)),'the next owner update removes the finished old shots');
      }
    }finally{f.bank.dispose();}
  });
}
