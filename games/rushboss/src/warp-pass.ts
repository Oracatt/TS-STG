// SPDX-License-Identifier: GPL-3.0-only
import type {NativeHost,ShaderUniform} from '@ts-stg/thlib';
import type {AnmDrawList as DrawList} from '@ts-stg/thlib/touhou';

import type {RushActor} from './ui-types.js';

// GLSL translation of the application's shader/warp.fx pixel stage. The
// engine supplies generic shader scopes; it has no knowledge of this effect.
const f32=Math.fround;
export const RUSH_WARP_FRAGMENT=`#version 330
in vec2 fragTexCoord;
uniform sampler2D texture0;
uniform float warpScale;
uniform float radius;
uniform float limit;
uniform vec2 center;
uniform vec2 vpSize;
uniform int colorKey;
out vec4 finalColor;
void main(){
    // Native render-target UVs are bottom-up. The source shader uses top-down.
    vec2 pinTex=vec2(fragTexCoord.x,1.0-fragTexCoord.y);
    float x=pinTex.x,y=pinTex.y;
    float cx=center.x/vpSize.x,cy=center.y/vpSize.y;
    float dx=x-cx,dy=y-cy;
    dx*=vpSize.x/vpSize.y;
    float distance=dx*dx+dy*dy;
    float rtd=sqrt(distance);
    vec4 color;
    if(distance<=radius*radius){
        float angle=0.3*sin((warpScale-rtd)*40.0);
        float waveBase=0.03;
        float wave=waveBase-0.003*rtd*limit;
        if(wave<0.0)wave=0.0;
        float len=(sin((warpScale-rtd)*20.0)*sin((warpScale-rtd)*20.0))*wave*1.0;
        pinTex.x=x+len*cos(angle);
        pinTex.y=y-len*sin(angle);
        color=texture(texture0,vec2(pinTex.x,1.0-pinTex.y));
        float cost=mix(0.0,1.8,pow(wave/waveBase,1.5));
        float costmul=0.5;
        if(colorKey==0)color.rgb-=vec3(cost,cost*costmul,cost*costmul);
        else if(colorKey==1)color.rgb-=vec3(cost*costmul,cost,cost*costmul);
        else if(colorKey==2)color.rgb-=vec3(cost*costmul,cost*costmul,cost);
        else if(colorKey==3)color.rgb-=vec3(cost,cost,cost*costmul);
        else if(colorKey==4)color.rgb-=vec3(cost,cost*costmul,cost);
        else if(colorKey==5)color.rgb-=vec3(cost*costmul,cost,cost);
    }else color=texture(texture0,vec2(pinTex.x,1.0-pinTex.y));
    finalColor=color;
}`;

export class RushWarpPass {
 declare host:NativeHost;declare shader:number|null;declare uniforms:[string,ShaderUniform[1],number[]][];
  constructor(host:NativeHost){
    this.host=host;this.shader=host.createShader(RUSH_WARP_FRAGMENT);
    this.uniforms=[['warpScale','float',[0]],['radius','float',[.5]],['limit','float',[10000]],
      ['center','vec2',[10000,10000]],['vpSize','vec2',[640,480]],['colorKey','int',[0]]];
  }
  draw(draw:DrawList,texture:number,boss:RushActor,frame:number,warpFrame=20,colorKey=0,active=true){
    const uniforms=this.uniforms;
    uniforms[0][2][0]=f32(f32(frame/60)/f32(3.5));
    uniforms[2][2][0]=active?(warpFrame<=20?f32(f32(100)+f32(f32(28-100)*f32(Math.pow(f32(warpFrame/20),.3)))):28):10000;
    uniforms[3][2][0]=active?f32(f32(320)+f32(f32(boss.x)*f32(.8))):10000;
    uniforms[3][2][1]=active?f32(f32(240)-f32(f32(boss.y)*f32(.8))):10000;
    uniforms[5][2][0]=colorKey;
    draw.sampler(texture,'anisotropic4x','wrap','wrap');
    draw.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','one','add');
    draw.shaderBegin(this.shader!,uniforms);
    // GameScene draws the back target on an 800x600 source-space quad. This
    // is 125% of the game field; 960x720 is the demo's logical output canvas.
    draw.sprite(texture,480,360,1200,900,0,0xffffffff);
    draw.shaderEnd();
    draw.blendEnd();
    return draw;
  }
  dispose(){if(this.shader!==null){this.host.unloadShader(this.shader);this.shader=null;}}
}
