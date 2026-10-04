const texture=tsstg.createTexture(2,1,new Uint8Array([255,0,0,0,255,0,0,255]));let frame=0;
globalThis.__tsstg_game={update(){frame++;},render:()=>[['clear',0x204060ff],['alphaTest',1/255],['sprite',texture,100,100,100,50,0,0xffffffff],['alphaTest',0]],snapshot:()=>({frame})};
