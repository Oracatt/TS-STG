const fragment=`#version 330
in vec2 fragTexCoord;uniform sampler2D texture0;uniform vec3 tint;uniform float gain;uniform int enabled;out vec4 finalColor;
void main(){finalColor=texture(texture0,fragTexCoord)*vec4(enabled==1?tint:vec3(1),gain);}`;
const shader=tsstg.createShader(fragment),texture=tsstg.createTexture(1,1,new Uint8Array([200,120,80,255]));
let frame=0,gpu=false;
function verifyPixel(pixels,x,y,expected){const offset=(y*960+x)*4;for(let c=0;c<4;c++)if(Math.abs(pixels[offset+c]-expected[c])>1)throw new Error(`Shader pixel ${x},${y}/${c}: ${pixels[offset+c]} != ${expected[c]}`);}
globalThis.__tsstg_game={
  update(mask){
    gpu=!!(mask&1);
    if(frame===1&&gpu){const canvas=tsstg.readTexturePixels();verifyPixel(canvas.pixels,10,10,[100,120,20,255]);verifyPixel(canvas.pixels,50,10,[30,80,140,255]);}
    frame++;
  },
  render(){return [['clear',0x000000ff],['alphaTest',.5],['rect',100,100,20,20,0xffffff33],
    ['statefulQuad',0,[0,0,1,0,0,1,1,1],150,150,1,0,0,0,0,1,1,0xffffffff,0xffffffff,0xffffffff,0xffffffff,false,[0,'one','zero','add','one','zero','add','point','clamp','clamp']],
    ['shaderBegin',shader,[['tint','vec3',[.5,1,.25]],['gain','float',[1]],['enabled','int',[1]]]],['sprite',texture,15,15,30,30,0,0xffffffff],['shaderEnd'],['rect',40,0,30,30,0x1e508cff]];},
  snapshot(){return {frame,gpu,shader,texture};},
};
