// Graphical-only readback validation: previous completed target/canvas orientation.
const target=tsstg.createRenderTarget(4,4);let frame=0,capture=0;
const assertColor=(pixels,x,y,w,rgba)=>{const actual=[...pixels.subarray((y*w+x)*4,(y*w+x)*4+4)];if(actual.some((c,i)=>c!==rgba[i]))throw new Error(`Capture (${x},${y}) ${actual} != ${rgba}`);};
globalThis.__tsstg_game={update(){frame++;if(frame===2){
 const result=tsstg.readTexturePixels(target);assertColor(result.pixels,0,0,4,[255,0,0,255]);assertColor(result.pixels,0,3,4,[0,0,255,255]);
 const screen=tsstg.readTexturePixels();assertColor(screen.pixels,0,0,screen.width,[32,64,128,255]);capture=tsstg.createTexture(result.width,result.height,result.pixels);
}},render(){const commands=[['clear',0x204080ff],['targetBegin',target,0],['rect',0,0,4,2,0xff0000ff],['rect',0,2,4,2,0x0000ffff],['targetEnd'],['sprite',target,150,150,200,200,0,0xffffffff]];if(capture)commands.push(['sprite',capture,400,150,200,200,0,0xffffffff]);return commands;},snapshot(){if(!capture)throw new Error('Capture test did not complete');return{frame,capture:true};}};
