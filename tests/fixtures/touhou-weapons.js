import {DrawList,Keys} from '@ts-stg/thlib';
import {TouhouPlayer,TouhouRenderQueue,TouhouRNG,createTouhouResources,createTouhouWeaponPreset} from '@ts-stg/thlib/touhou';

// Run 1800 native frames: sixteen weapons x five power levels x two focus
// modes, including sustained fire, target removal, ceasefire and reacquisition.
// No userdata or persistent game state is opened. Audio requests are counted;
// the regression workload does not play 16 simultaneous firing soundtracks.
export function createTouhouWeaponsFixture(host){
  const resources=createTouhouResources(host),draw=new DrawList(),queue=new TouhouRenderQueue();
  const framesPerCase=180,caseCount=10,completed=[],soundCounts={};
  let frame=0,caseIndex=-1,owners=[],hash=2166136261;
  const assertFinite=(value,path='state')=>{
    if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`Nonfinite weapon state: ${path}`);
    if(Array.isArray(value))value.forEach((entry,i)=>assertFinite(entry,`${path}[${i}]`));
    else if(value&&typeof value==='object')for(const key of Object.keys(value))assertFinite(value[key],`${path}.${key}`);
  };
  const digest=value=>{const text=JSON.stringify(value);for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0;}};
  const makeCase=index=>{
    for(const owner of owners)owner.player.destroy();
    for(const bank of Object.values(resources.banks))bank?.collect();
    caseIndex=index;owners=[];
    const power=Math.floor(index/2)*100,focused=!!(index%2);
    for(let character=0;character<2;character++)for(let weapon=0;weapon<8;weapon++){
      const player=new TouhouPlayer({...createTouhouWeaponPreset(character,weapon),bank:resources.banks[`pl0${character}`],
        effectBank:resources.banks.effect,power,seed:1000+index*16+character*8+weapon,visualRng:new TouhouRNG(2000+character*8+weapon)});
      const owner={character,weapon,player,power,focused,hits:0,damage:0,emitted:0,peakShots:0,sounds:0,
        targets:[{id:1,x:-80,y:170,radius:14,alive:true},{id:2,x:85,y:240,radius:12,alive:true}],context:null};
      owner.context={enemyReady:true,enemies:owner.targets,
        sound(id){owner.sounds++;soundCounts[id]=(soundCounts[id]??0)+1;},stopSound(){},
        damageEnemy(_enemy,amount){owner.hits++;owner.damage+=amount;},
        cancelCircle(){return 0;},onEvent(name){if(name==='shot')owner.emitted++;}};
      owners.push(owner);
    }
  };
  const sample=owner=>({character:owner.character,weapon:owner.weapon,power:owner.power,focused:owner.focused,
    hits:owner.hits,damage:owner.damage,emitted:owner.emitted,peakShots:owner.peakShots,sounds:owner.sounds,
    rng:owner.player.rng.state,visualRng:owner.player.weaponRng.state,state:owner.player.snapshot(),
    targets:owner.player.shots.map(shot=>({id:shot.id,target:shot.target?.id??null,turnState:shot.turnState,
      turnTimer:shot.turnTimer.current,turnTarget:shot.turnTarget}))});
  makeCase(0);
  return{
    update(){
      if(frame>=framesPerCase*caseCount)return;
      const index=Math.floor(frame/framesPerCase),local=frame%framesPerCase;
      if(index!==caseIndex)makeCase(index);
      for(const owner of owners){
        for(const [i,target]of owner.targets.entries()){
          target.alive=local<90||local>=150;target.x=(i?85:-80)+(local%60-30)*.5;
          if(i===1&&local>=45&&local<90){target.x=owner.player.x;target.y=owner.player.y-90;target.radius=30;}
          else{target.y=i?240:170;target.radius=i?12:14;}
        }
        owner.context.enemies=local<90||local>=150?owner.targets:[];
        const mask=(local<120||local>=150?Keys.SHOOT:0)|(owner.focused?Keys.FOCUS:0)|
          (local%80<20?Keys.LEFT:local%80<60?Keys.RIGHT:Keys.LEFT);
        owner.player.update(mask,owner.context);
        owner.peakShots=Math.max(owner.peakShots,owner.player.shots.length);
        const state=sample(owner);assertFinite(state);digest(state);
        if(local===149&&[...owner.player.laserGroups.values()].some(shot=>shot.state===1))throw new Error('Laser survived sustained ceasefire');
      }
      if(local===framesPerCase-1){
        for(const owner of owners){const state=sample(owner);if(!owner.emitted||!owner.hits)throw new Error('Weapon failed its emission/contact exercise');completed.push(state);}
      }
      frame++;
    },
    render(){
      draw.reset().clear(0x101825ff);
      draw.text('THLIB ORIGINAL WEAPONS / REIMU + MARISA',18,12,16,0xf1eefaff);
      draw.text(`Power ${Math.floor(caseIndex/2)} / ${caseIndex%2?'FOCUSED':'UNFOCUSED'} / frame ${frame}`,18,34,14,0xadc5eaff);
      owners.forEach((owner,index)=>{
        const x=(index%4)*240,y=60+Math.floor(index/4)*162,view={x:x+120,y:y+20,scale:.29,screenScale:1};
        draw.rect(x+6,y+4,228,155,0x1b293eff);draw.text(`${owner.character?'MARISA':'REIMU'} ${owner.weapon}`,x+12,y+8,12,0xf2e5d5ff);
        draw.scissor(x+8,y+25,224,132);queue.reset();owner.player.draw(queue,view);queue.flush(draw);
        for(const target of owner.context.enemies)draw.circle(view.x+target.x*view.scale,view.y+target.y*view.scale,target.radius*view.scale,0xf46b95ff);
        draw.scissorEnd();
      });
      return draw.commands;
    },
    snapshot(){return{frame,done:frame===framesPerCase*caseCount,casesCompleted:completed.length,expectedCases:160,
      hash:hash.toString(16).padStart(8,'0'),soundCounts,resourceBanks:Object.keys(resources.data),
      liveAnimations:Object.fromEntries(Object.entries(resources.banks).map(([name,bank])=>[name,bank?.instances.filter(vm=>vm.alive).length??0])),
      summaries:completed.map(({state,targets,...summary})=>summary),current:owners.map(sample)};},
    destroy(){for(const owner of owners)owner.player.destroy();resources.dispose();},
  };
}

if(globalThis.tsstg)globalThis.__tsstg_game=createTouhouWeaponsFixture(globalThis.tsstg);
