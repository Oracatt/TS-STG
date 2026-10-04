import './mesh3d.js';
const fixture=globalThis.__tsstg_game;let frame=0;
globalThis.__tsstg_game={
  update(){
    if(frame===1){const capture=tsstg.readTexturePixels();
      const equal=(x,y,expected)=>{const rgba=Array.from(capture.pixels.subarray((y*capture.width+x)*4,(y*capture.width+x)*4+4));if(rgba.some((value,i)=>value!==expected[i]))throw new Error(`Perspective/matrix restore pixel ${x},${y}: ${rgba}`);};
      equal(250,403,[255,0,0,255]);equal(880,40,[0,255,0,255]);equal(940,600,[0,0,0,255]);
    }
    fixture.update();frame++;
  },render:()=>fixture.render(),snapshot:()=>({frame,perspectiveCorrect:true,matrixRestored:true})
};
