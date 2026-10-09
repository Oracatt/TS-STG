// SPDX-License-Identifier: GPL-3.0-only
import type {MeshVertex3D} from './ui-types.js';
import type {NativeHost} from '@ts-stg/thlib';
import type {AnmDrawList as DrawList} from '@ts-stg/thlib/touhou';
import type {RushBattle} from './runtime.js';
import type {BossKey} from './types.js';
import type {ArtworkAssets,StageObject,StageCard,StageObjectOptions} from './ui-types.js';

// RushBoss BackGroundDeriver.h / CardBackgroundDeriver.h business artwork.
// These scenes do not own thlib's warp, rings, opening, actors or interface.
import {PerspectiveCamera,multiplyPresentationMatrix,presentationWorldMatrix,
  presentationQuaternion,multiplyPresentationQuaternion,withAlpha,rgba} from '@ts-stg/thlib';
import {RushRandom} from './random.js';

const F=Math.fround,clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const identity=[0,0,0,1],indices=[0,1,2,1,3,2];
const groundRotation=presentationQuaternion(Math.PI/2);
const profiles:Readonly<Record<BossKey,{name:string;speed:number;pitch:number;fog:number[];fogStart:number}>>=Object.freeze({
  sunny:{name:'GrassLand',speed:2,pitch:Math.PI/4,fog:[.3,.3,.15],fogStart:2},
  monstone:{name:'RiverSide',speed:4,pitch:Math.PI/4,fog:[.8,.8,.9],fogStart:4},
  artia:{name:'FrozenForest',speed:5,pitch:Math.PI/7,fog:[0,0,0],fogStart:4},
});
export const RUSH_STAGE_ARTWORK_TEXTURES=Object.freeze({
  sunny:Object.freeze(['src_grassland','src_leaf','src_sunlight']),
  monstone:Object.freeze(['src_river_ground','src_water','src_cloud_1','src_cloud_2']),
  artia:Object.freeze(['src_snow_ground','src_forest1','src_tree1','src_tree2','src_snow']),
});
export const RUSH_SPELL_ARTWORK_TEXTURES=Object.freeze({
  sunny:Object.freeze(['src_dummy','src_sunnymilk_cdbg2','src_sunnymilk_cdbg1']),
  monstone:Object.freeze(['src_monstone_cdbg1','src_monstone_cdbg2']),
  artia:Object.freeze(['src_artia_cdbg1','src_artia_cdbg2']),
});

// Generic host GLSL, owned and compiled only by this private application.
// All vertices carry source world coordinates. Fog computes distance per
// fragment, as default.fx does, rather than interpolating a vertex fog factor.
const vertexSource=`#version 330
in vec3 vertexPosition;in vec2 vertexTexCoord;in vec4 vertexColor;
uniform mat4 mvp;uniform vec3 stageEye;
out vec2 fragTexCoord;out vec4 fragColor;out vec3 stagePosition;
void main(){fragTexCoord=vertexTexCoord;fragColor=vertexColor;
  stagePosition=vertexPosition-stageEye;gl_Position=mvp*vec4(vertexPosition,1.0);}`;
const fragmentSource=`#version 330
in vec2 fragTexCoord;in vec4 fragColor;in vec3 stagePosition;
uniform sampler2D texture0;uniform vec4 colDiffuse;
uniform vec3 stageFogColor;uniform float stageFogStart;uniform float stageFogRange;
uniform float stageAlpha;uniform int stageFogEnabled;uniform int stageWater;uniform float stageTime;
out vec4 finalColor;
const vec2 poisson[12]=vec2[12](vec2(-.326212,-.405810),vec2(-.840144,-.073580),
 vec2(-.695914,.457137),vec2(-.203345,.620716),vec2(.962340,-.194983),
 vec2(.473434,-.480026),vec2(.519456,.767022),vec2(.185461,-.893124),
 vec2(.507431,.064425),vec2(.896420,.412458),vec2(-.321940,-.932615),vec2(-.791559,-.597710));
void main(){vec2 uv=fragTexCoord;
 if(stageWater==1){vec2 delta=vec2(sin(stageTime+uv.x*20.0+uv.y*uv.y*23.0),
  cos(stageTime+uv.y*32.0+uv.x*uv.x*13.0))*.02;vec4 color=vec4(0.0);
  for(int i=0;i<12;i++)color+=texture(texture0,uv+delta+poisson[i]/30.0)/12.0;
  color+=texture(texture0,uv)/4.0;color.a=1.0;finalColor=color;return;}
 vec4 color=texture(texture0,uv)*colDiffuse*fragColor;
 if(color.a<.01)discard;
 if(stageFogEnabled==1)color.rgb=mix(color.rgb,stageFogColor,
  clamp((length(stagePosition)-stageFogStart)/stageFogRange,0.0,1.0));
 color.a*=stageAlpha;finalColor=color;}`;

/** Center-crop a sampled image region, maintaining the texels' aspect ratio.
 * Authored UV repetition/offset survives the crop (e.g. 2.4 x 1.8 makes
 * square overlay tiles in the original 640x480 composition).
 */
export function rushArtworkCoverUv(size:{width:number;height:number},viewport:{width:number;height:number},[u=0,v=0,du=1,dv=1]:number[]=[]){
  if(!(size?.width>0&&size?.height>0&&viewport?.width>0&&viewport?.height>0&&du>0&&dv>0))
    throw new RangeError('Artwork and viewport dimensions must be positive');
  const sourceAspect=size.width*du/(size.height*dv),viewAspect=viewport.width/viewport.height;
  if(sourceAspect>viewAspect){const width=du*viewAspect/sourceAspect;return[u+(du-width)/2,v,width,dv];}
  const height=dv*sourceAspect/viewAspect;return[u,v+(dv-height)/2,du,height];
}

/** Original stage geometry adapted to a portrait camera, without stretching
 * its world units. Call update once per integer battle frame. Drawing changes
 * no simulation state and leaves every shader/blend scope closed. The caller
 * owns render targets and clipping (the common thlib compositor does both).
 */
export class RushStageArtwork {
  declare assets: ArtworkAssets;
  declare seed: number;
  declare viewport: { x: number; y: number; width: number; height: number; };
  declare canvasWidth: number;
  declare canvasHeight: number;
  declare camera: PerspectiveCamera;
  declare shaderAttempted: boolean;
  declare disposed: boolean;
  declare frame: number;
  declare lastFrame: number;
  declare cameraZ: number;
  declare rng: RushRandom;
  declare serial: number;
  declare nextFloor: number;
  declare nextDecor: number;
  declare nextWeather: number;
  declare nextWater: number;
  declare cardSerial: number;
  declare matrix: number[];
  declare roll: number;

 declare host:NativeHost|undefined;declare stage:BossKey|null;declare profile:(typeof profiles)[BossKey];declare shader:number|null;declare cards:StageCard[];declare activeCard:StageCard|null;declare usedTextures:Set<string>;declare floor:StageObject[];declare decor:StageObject[];declare water:StageObject[];declare weather:StageObject[];
  constructor(assets:ArtworkAssets,{viewport={x:48,y:24,width:576,height:672},canvasWidth=960,canvasHeight=720,
    host=assets?.host,seed=0}:{viewport?:{x:number;y:number;width:number;height:number};canvasWidth?:number;canvasHeight?:number;host?:NativeHost;seed?:number}={}){
    if(!assets?.texture||!assets?.size)throw new TypeError('Stage artwork needs texture and size adapters');
    if(!(viewport.width>0&&viewport.height>0&&canvasWidth>0&&canvasHeight>0))throw new RangeError('Invalid artwork viewport');
    this.assets=assets;this.host=host;this.seed=seed;this.viewport={...viewport};this.canvasWidth=canvasWidth;this.canvasHeight=canvasHeight;
    this.camera=new PerspectiveCamera({width:viewport.width,height:viewport.height,fieldOfView:Math.PI/3,
      near:.1,far:1000,viewport,canvasWidth,canvasHeight});
    // Title-only consumers need neither a graphics shader nor stage textures.
    this.shader=null;this.shaderAttempted=false;
    this.usedTextures=new Set();this.disposed=false;this.stage=null;this.cards=[];this.activeCard=null;
    this.setStage('sunny');
  }
  setStage(key:BossKey){
    if(this.disposed)throw new Error('Stage artwork has been destroyed');
    if(!profiles[key])throw new RangeError(`Unknown Rush stage: ${key}`);
    if(this.stage===key)return this;
    this.stage=key;this.profile=profiles[key];this.frame=0;this.lastFrame=-1;this.cameraZ=0;
    this.rng=new RushRandom(this.seed);this.serial=0;this.floor=[];this.decor=[];this.weather=[];
    this.nextFloor=0;this.nextDecor=0;this.nextWeather=key==='sunny'?26:10;
    this.nextWater=0;this.water=[];this.cards=[];this.activeCard=null;this.cardSerial=0;
    this.populate();this.updateMatrix();return this;
  }
  reset(key=this.stage??'sunny'){this.stage=null;return this.setStage(key);}
  ensureShader(){if(!this.shaderAttempted){this.shaderAttempted=true;
    this.shader=this.host?.createShader?.(fragmentSource,vertexSource)??null;}}
  object(list:StageObject[],name:string,x:number,y:number,z:number,width:number,height:number,{rotation=identity,alpha=1,uv=[0,0,1,1],kind='normal',removeBehind=10}:StageObjectOptions={}):StageObject{
    const object={name,x:F(x),y:F(y),z:F(z),width,height,rotation,alpha,uv,kind,removeBehind,birth:++this.serial};
    list.push(object);return object;
  }
  populate(){
    const far=this.cameraZ+100;
    if(this.stage==='sunny'){
      while(this.nextFloor<far){for(let x=-2;x<=2;x++)this.object(this.floor,'src_grassland',30*x,-12,this.nextFloor,30,30,
        {rotation:groundRotation,removeBehind:30});this.nextFloor+=30;}
      while(this.nextDecor<far){for(let x=-2;x<=2;x++)this.object(this.decor,'src_leaf',14*x,-10,this.nextDecor,14,14,
        {rotation:groundRotation,kind:'darken'});this.nextDecor+=14;}
      while(this.nextWeather<far){this.object(this.weather,'src_sunlight',3,-6,this.nextWeather,20,20,
        {rotation:presentationQuaternion(0,Math.PI/3.5),uv:[.01,0,.99,1]});this.nextWeather+=30;}
    }else if(this.stage==='monstone'){
      while(this.nextFloor<far){for(let x=-2;x<=2;x++)this.object(this.floor,'src_river_ground',10*x,-12,this.nextFloor,
        Math.abs(x)===1?-10:10,10,{rotation:groundRotation,kind:'waterShader'});this.nextFloor+=10;}
      while(this.nextWater<far){for(let x=-2;x<=2;x++)this.object(this.water,'src_water',10*x,-11,this.nextWater,10,10,
        {rotation:groundRotation,alpha:.6});this.nextWater+=10;}
      while(this.nextWeather<far){
        this.rng.int(0,1); // Both original Cloud_1 and Cloud_2 bind src_cloud_1.
        this.object(this.weather,'src_cloud_1',this.rng.float(-8,8),-4,this.nextWeather,10,10,
          {rotation:presentationQuaternion(Math.PI/4),alpha:.15});this.nextWeather=F(this.nextWeather+2.5);
      }
    }else{
      while(this.nextFloor<far){for(let x=-3;x<=3;x++)this.object(this.floor,'src_snow_ground',10*x,-12,this.nextFloor,10,10,
        {rotation:groundRotation});this.nextFloor+=10;}
      while(this.nextDecor<far){
        for(const [min,max,offset]of [[-14,-3,0],[3,14,3]]){
          const x=this.rng.float(min,max),z=this.nextDecor+offset;
          // Source InsertAfter(tree) reverses each Grass/Leaf/Tree triplet.
          this.object(this.decor,'src_forest1',x,-12+.4*3,z,6,3,{alpha:.9,uv:[0,this.rng.int(0,1)?0:.5,1,.5]});
          this.object(this.decor,'src_forest1',x,-12+1.9*5,z,10,5,{alpha:.5,uv:[0,this.rng.int(0,1)?0:.5,1,.5]});
          this.object(this.decor,this.rng.int(0,1)===0?'src_tree1':'src_tree2',x,-12+.5*12.5,z,10,12.5);
        }
        this.nextDecor+=6;
      }
    }
  }
  updateMatrix(){
    const roll=this.stage==='sunny'?F(-.06*Math.sin(this.frame/60/3)):0;
    const cameraWorld=presentationWorldMatrix({x:0,y:0,z:this.cameraZ},{x:1,y:1,z:1},presentationQuaternion(this.profile.pitch,0,roll));
    const view=[cameraWorld[0],cameraWorld[4],cameraWorld[8],0,cameraWorld[1],cameraWorld[5],cameraWorld[9],0,
      cameraWorld[2],cameraWorld[6],cameraWorld[10],0,F(-this.cameraZ*cameraWorld[2]),F(-this.cameraZ*cameraWorld[6]),F(-this.cameraZ*cameraWorld[10]),1];
    this.matrix=multiplyPresentationMatrix(view,this.camera.clip);this.roll=roll;
  }
  tickStage(){
    this.frame++;this.cameraZ=F(this.cameraZ+F(this.profile.speed/60));
    if(this.stage==='monstone')for(const cloud of this.weather)cloud.z=F(cloud.z-F(.05));
    if(this.stage==='artia'){
      for(const snow of this.weather){snow.y=F(snow.y-F(snow.speed!/60));
        snow.rotation=multiplyPresentationQuaternion(snow.rotation,presentationQuaternion(snow.spin![0]/60,snow.spin![1]/60,snow.spin![2]/60));}
    }
    for(const list of [this.floor,this.decor,this.water,this.weather]){
      for(let i=list.length-1;i>=0;i--)if(list[i].z-this.cameraZ < -list[i].removeBehind||this.stage==='artia'&&list[i].y<-13)list.splice(i,1);
    }
    this.populate();
    if(this.stage==='artia'){
      const spin=[this.rng.float(-.2,.2),this.rng.float(-.2,.2),this.rng.float(-4,4)],speed=this.rng.float(5,6);
      const snow=this.object(this.weather,'src_snow',this.rng.float(-30,30),this.rng.float(2,3),
        this.cameraZ+this.rng.float(5,45),.65,.65,{alpha:.5});snow.spin=spin;snow.speed=speed;
    }
  }
  tickCards(){
    for(const card of this.cards){
      card.age++;card.scroll=F(card.scroll+F(card.boss==='artia'?.005:.003));
      if(card.leaving){card.alpha=Math.max(0,F(card.alpha-F(.1)));card.overlayAlpha=Math.max(0,F(card.overlayAlpha-F(.1)));}
      else{card.alpha=Math.min(1,F(card.alpha+F(.02)));card.overlayAlpha=Math.min(card.boss==='monstone'?.75:1,F(card.overlayAlpha+F(.02)));}
    }
    this.cards=this.cards.filter(card=>!card.leaving||card.alpha>0||card.overlayAlpha>0);
  }
  update({frame,battle}:{frame?:number;battle?:RushBattle}={}){
    if(this.disposed)return this;
    if(battle?.bossKey&&battle.bossKey!==this.stage)this.setStage(battle.bossKey);
    frame=frame??battle?.frame??this.lastFrame+1;
    if(!Number.isInteger(frame)||frame<0)throw new RangeError('Stage artwork frame must be a nonnegative integer');
    if(frame===this.lastFrame)return this;
    if(frame<this.lastFrame)this.reset(this.stage!);
    const spell=battle?.presentation?.shared?.spell;
    const active=spell?spell.active:!!(battle?.phase?.spell&&battle.combatStarted&&!battle.finished&&!battle.transition);
    const key=active?`${this.stage}:${battle?.phaseIndex??spell?.spellIndex??0}`:null;
    if(this.activeCard?.key!==key){
      if(this.activeCard)this.activeCard.leaving=true;
      this.activeCard=key?{key,boss:this.stage!,id:++this.cardSerial,age:0,alpha:0,overlayAlpha:0,scroll:0,leaving:false}:null;
      if(this.activeCard)this.cards.push(this.activeCard);
    }
    const count=this.lastFrame<0?frame:frame-this.lastFrame;
    for(let i=0;i<count;i++){this.tickStage();this.tickCards();}
    this.lastFrame=frame;this.updateMatrix();return this;
  }
  texture(name:string){this.usedTextures.add(name);return this.assets.texture(name);}
  shaderBegin(draw:DrawList,alpha=1,water=false,fog=true){
    if(this.shader!==null)draw.shaderBegin(this.shader,[['stageEye','vec3',[0,0,this.cameraZ]],
      ['stageFogColor','vec3',this.profile.fog],['stageFogStart','float',[this.profile.fogStart]],['stageFogRange','float',[35]],
      ['stageAlpha','float',[alpha]],['stageFogEnabled','int',[+fog]],['stageWater','int',[+water]],['stageTime','float',[F(this.frame/60*4)]]]);
  }
  shaderEnd(draw:DrawList){if(this.shader!==null)draw.shaderEnd();}
  vertices(object:StageObject){
    const {x,y,z,width,height,rotation,uv}=object,m=presentationWorldMatrix({x,y,z},{x:width,y:height,z:1},rotation);
    const [u,v,du,dv]=uv,vertices:MeshVertex3D[]=[];
    for(const [lx,ly,tu,tv]of [[-.5,.5,u,v],[.5,.5,u+du,v],[-.5,-.5,u,v+dv],[.5,-.5,u+du,v+dv]])
      vertices.push([F(F(lx*m[0]+ly*m[4])+m[12]),F(F(lx*m[1]+ly*m[5])+m[13]),F(F(lx*m[2]+ly*m[6])+m[14]),tu,tv,
        this.shader!==null?0xffffffff:withAlpha(0xffffffff,object.alpha)]);
    return vertices;
  }
  drawObjects(draw:DrawList,objects:StageObject[]){
    // InsertAfter(group) puts newer instances first. Batch only adjacent
    // matching materials, preserving translucent tree/cloud overlap order.
    const sorted=objects.slice().sort((a,b)=>b.birth-a.birth);let batch:{key:string;object:StageObject;vertices:MeshVertex3D[];faces:number[]}|null=null;
    const flush=()=>{if(!batch)return;const {object,vertices,faces}=batch,texture=this.texture(object.name);
      this.shaderBegin(draw,object.alpha,object.kind==='waterShader');
      draw.blendFactors('srcAlpha',object.kind==='darken'?'one':'oneMinusSrcAlpha',object.kind==='darken'?'reverseSubtract':'add','one','one','add');
      draw.sampler(texture,'anisotropic4x','wrap','wrap').mesh3d(texture,vertices,faces,this.matrix).blendEnd();this.shaderEnd(draw);batch=null;};
    for(const object of sorted){
      const key=`${object.name}:${object.alpha}:${object.kind}`;
      if(batch&&batch.key!==key)flush();
      if(!batch)batch={key,object,vertices:[],faces:[]};
      const base=batch.vertices.length,vertices=this.vertices(object);
      if(object.name==='src_water'){const time=this.frame/60;for(const vertex of vertices){vertex[3]-=time*.1;vertex[4]+=time*.1;}}
      batch.vertices.push(...vertices);batch.faces.push(...indices.map((index)=>base+index));
    }flush();
  }
  drawStage(draw:DrawList){
    if(this.disposed)return draw;
    this.ensureShader();
    draw.rect(0,0,this.canvasWidth,this.canvasHeight,rgba(...this.profile.fog.map(c=>c*255) as [number,number,number],255));
    this.drawObjects(draw,this.floor);this.drawObjects(draw,this.decor);this.drawObjects(draw,this.water);this.drawObjects(draw,this.weather);
    if(this.stage==='artia'&&this.frame<50){draw.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','one','add');
      draw.rect(0,0,this.canvasWidth,this.canvasHeight,withAlpha(0x000000ff,Math.max(0,1-this.frame*.02))).blendEnd();}
    return draw;
  }
  fill(draw:DrawList,name:string,uv:number[],alpha:number,kind='normal',color=0xffffffff){
    if(alpha<=0)return;
    const texture=this.texture(name),[u,v,du,dv]=rushArtworkCoverUv(this.assets.size(name),this.viewport,uv),p=this.viewport;
    if(this.shader===null)color=withAlpha(color,alpha);
    this.shaderBegin(draw,alpha,false,false);
    draw.blendFactors('srcAlpha',kind==='normal'?'oneMinusSrcAlpha':'one',kind==='darken'?'reverseSubtract':'add','one','one','add');
    draw.sampler(texture,'anisotropic4x','wrap','wrap');
    draw.mesh(texture,[[p.x,p.y,u,v,color],[p.x+p.width,p.y,u+du,v,color],
      [p.x,p.y+p.height,u,v+dv,color],[p.x+p.width,p.y+p.height,u+du,v+dv,color]],indices).blendEnd();
    this.shaderEnd(draw);
  }
  drawSpell(draw:DrawList){
    if(this.disposed)return draw;
    this.ensureShader();
    for(const card of this.cards){
      const {alpha,overlayAlpha,scroll,boss}=card;
      if(boss==='sunny'){
        this.fill(draw,'src_dummy',[0,0,1,1],alpha,'normal',0x000000ff);
        this.fill(draw,'src_sunnymilk_cdbg2',[0,.125,1,.75],alpha);
        this.fill(draw,'src_sunnymilk_cdbg1',[scroll,0,2.4,1.8],overlayAlpha,'brighten');
      }else{
        this.fill(draw,`src_${boss}_cdbg1`,[0,0,1,1],alpha);
        this.fill(draw,`src_${boss}_cdbg2`,boss==='artia'?[0,scroll,2.5,1.6]:[scroll,scroll,2.4,1.8],
          overlayAlpha,boss==='artia'?'darken':'brighten');
      }
    }return draw;
  }
  draw(draw:DrawList,{spell=false}={}){this.drawStage(draw);if(spell)this.drawSpell(draw);return draw;}
  snapshot(){return{stage:this.stage,scene:this.profile.name,frame:this.frame,viewport:{...this.viewport},
    camera:{z:this.cameraZ,pitch:this.profile.pitch,roll:this.roll,fieldOfView:Math.PI/3,aspect:this.viewport.width/this.viewport.height},
    fog:{color:this.profile.fog.slice(),start:this.profile.fogStart,range:35},shaderAvailable:this.shader!==null,
    counts:{floor:this.floor.length,decor:this.decor.length,water:this.water.length,weather:this.weather.length},
    textureNames:[...this.usedTextures].sort(),randomCalls:this.rng.calls,
    cards:this.cards.map(card=>({...card})),limitations:['VirtualLib camera implementation is not present in the source checkout; near/far use generic .1/1000.','Visual-only seeded random stream is independent of gameplay RNG.'],
    sourceCloud2Texture:'src_cloud_1'};}
  destroy(){if(this.disposed)return;this.disposed=true;if(this.shader!==null)this.host?.unloadShader?.(this.shader);
    this.shader=null;this.floor.length=this.decor.length=this.weather.length=this.water.length=this.cards.length=0;this.activeCard=null;}
}
