const target=tsstg.createRenderTarget(16,16),state=[0,'one','zero','add','one','zero','add','point','clamp','clamp'];
globalThis.__tsstg_game={update(){},render:()=>[['targetBegin',target],['statefulQuad',target,[0,0,1,0,0,1,1,1],0,0,1,0,0,0,0,1,1,0xffffffff,0xffffffff,0xffffffff,0xffffffff,false,state],['targetEnd']]};
