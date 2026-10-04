// A consumer-owned project with no dependency on repository examples or thlib.
let frame=0;
globalThis.__tsstg_game={
  update(){frame++;},
  render(){return [['clear',0x182838ff]];},
  snapshot(){return {entry:'main.js',project:'native-default-project',frame};}
};
