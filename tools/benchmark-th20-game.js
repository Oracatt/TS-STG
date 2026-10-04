// Actual QuickJS game benchmark entry. Example:
// ts-stg tools/benchmark-th20-game.js --root . --headless --frames 480
//   --profile build/game-profile.json --profile-warmup 60
// A wrapper can set __TH20_PERF_GAME before dynamically importing this file.
// trace=true computes a full command-stream hash and adds substantial overhead;
// use it only for equality validation, never for performance measurements.
const options=globalThis.__TH20_PERF_GAME??{};
globalThis.__TH20_DEMO_OPTIONS={autostart:true,character:options.character??0,power:400,musicVolume:0};
await import('../games/touhou20/main.js');
const game=globalThis.__tsstg_game;
let frame=0,hash=0x811c9dc5,commandCount=0;
globalThis.__tsstg_game={
  update(){
    let mask=options.input??80;
    if(frame===options.bombAt)mask|=32;
    if(frame===options.pauseAt)mask=128;
    game.update(mask);frame++;
  },
  render(){
    const commands=game.render();commandCount+=commands.length;
    if(options.trace){const text=JSON.stringify(commands);for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),0x01000193)>>>0;}
    return commands;
  },
  snapshot(){return{hostFrames:frame,commandCount,...(options.trace?{renderHash:hash.toString(16).padStart(8,'0')}:{}),...game.snapshot()};},
};
