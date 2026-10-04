let frame=0;
globalThis.__tsstg_game={update(){frame++;},render(){return [['clear',0x203040ff],['quad',0,[-.1,-.1,10,-.1,-.1,10,10,10],30.1,40.2,1.5,0,0,0,0,1,1,0xff0000ff,0x00ff00ff,0x0000ffff,0xffffffff,true]];},snapshot(){return {frame,quad:true};}};
