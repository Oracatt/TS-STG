// Resource preview application. It consumes only the public thlib and its
// common asset pack: no version-specific game module or ANM runtime is loaded.
import { DrawList, SpriteAtlas } from '@ts-stg/thlib';
const host=globalThis.tsstg,basePath='packages/thlib/assets/reference-common';
const manifest=JSON.parse(host.readText(`${basePath}/manifest.json`));
const atlas=new SpriteAtlas(manifest,host,{basePath}).loadAll(),draw=new DrawList();
const names=[
  'bullet.rice.red','bullet.orb.blue','bullet.star.green','bullet.amulet.purple',
  'bullet.orb-large.cyan','laser.straight.yellow','effect.petal.pink','effect.leaf.maple',
  'bomb.orb','bomb.beam','bomb.beam-shell','bomb.radiant-orb',
  'effect.magic-circle','effect.focus.red','effect.death-ring.blue','effect.aura.butterfly',
  'effect.charge','effect.particle','effect.flower.blue','effect.trail',
];
const clips=['bullet.cancel','laser.flowing','effect.break-wave-round','effect.splash'].map(name=>atlas.clip(name,{loop:true}));
let frame=0;
function drawSprite(name,x,y){
  const sprite=atlas.getSprite(name),scale=Math.min(100/sprite.width,78/sprite.height,3);
  atlas.drawNamed(name,draw,x,y,{scale});
}
globalThis.__tsstg_game={
  update(){frame++;for(const clip of clips)clip.update();},
  render(){
    draw.reset().clear(0x121a2aff);
    draw.text('THLIB / COMMON BULLETS, BOMBS & EFFECTS',24,16,25,0xe0ecffff);
    const entries=[...names,...clips.map(clip=>clip.name)];
    for(let i=0;i<entries.length;i++){
      const x=16+(i%4)*236,y=58+Math.floor(i/4)*106;
      draw.rect(x,y,224,100,0x1c2940ff);
      draw.text(entries[i],x+8,y+79,13,0x94adcaff);
      const sprite=i<names.length?names[i]:clips[i-names.length].spriteName;
      if(entries[i].startsWith('bomb.')||entries[i].startsWith('effect.'))draw.blend('add');
      drawSprite(sprite,x+112,y+40);
      if(entries[i].startsWith('bomb.')||entries[i].startsWith('effect.'))draw.blendEnd();
    }
    draw.text('Public SpriteAtlas / SpriteClip - no game-specific modules',24,700,14,0x8b9bb5ff);
    return draw.commands;
  },
  snapshot(){return{frame,source:'thlib-common-assets',textures:atlas.handles.size,sprites:Object.keys(manifest.sprites).length,
    shown:names,clips:clips.map(clip=>clip.snapshot()),gameModules:false};}
};
