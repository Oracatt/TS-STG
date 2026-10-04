await import('./main.js');
const application=globalThis.__tsstg_game;let frame=0;
globalThis.__tsstg_game={
 update(){
  let mask=0;
  if([150,185,225].includes(frame))mask=256;
  if(frame===215)mask=2;
  if(frame>=245)mask=16|64;
  if(frame===320)mask|=32;
  application.update(mask);frame++;
 },
 render(){return application.render();},
 snapshot(){return {testFrame:frame,...application.snapshot()};}
};
