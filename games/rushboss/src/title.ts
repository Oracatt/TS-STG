// SPDX-License-Identifier: GPL-3.0-only
import type {AnmDrawList as DrawList} from '@ts-stg/thlib/touhou';
import type {RushAssets} from './assets.js';
import type {MeshVertex} from './ui-types.js';
export interface RushTitleState {screen?:string;selection?:number;mainSelection?:number;selectionFrame?:number;difficulty?:number;character?:number|string;bossIndex?:number;spellIndex?:number;bossName?:string;spells?:{cardId:number;name:string}[];bgmVolume?:number;soundVolume?:number;frame?:number;screenFrame?:number;transition?:RushTitleTransition|null;wipeTarget?:number;}
export type RushMenuView=Required<Pick<RushTitleState,'screen'|'selection'|'mainSelection'|'difficulty'|'bossIndex'|'spellIndex'|'bossName'|'spells'|'bgmVolume'|'soundVolume'>>&{character:number;selectionFrame?:number};
export type RushTitleTransition={kind:'selection';from:RushMenuView;to:RushMenuView;age:number;duration:number;direction:number;delay?:never;leave?:never;enter?:never;phaseIndex?:never}|{kind:'screen';from:RushMenuView;to:RushMenuView;age:number;duration:number;delay:number;leave:number;enter:number;back:boolean;phaseIndex?:number;direction?:never};
type TitleAnimation=({selection:true;from:RushMenuView;direction:number}|{selection?:false;from?:string;direction?:number})&{age:number;leaving?:boolean;to?:string;confirmAge?:number};
// Ported from TouhouRushBoss TitleObjects.h / TitleFrame.h / Level.cpp.
import { rgba } from '@ts-stg/thlib';

export const TITLE_OPTIONS = Object.freeze(['Game Start', 'Practice Start', 'Replay', 'Option', 'Manual', 'Quit']);
const OPTION_ROWS = [0, 2, 4, 7, 8, 9];
const f32 = Math.fround;
const clamp = (n:number, min:number, max:number) => Math.min(max, Math.max(min, n));
const opacity = (alpha:number, brightness = 1) => rgba(Math.round(brightness * 255), Math.round(brightness * 255), Math.round(brightness * 255), Math.round(clamp(alpha, 0, 1) * 255));
const lookup = (array:number[][], frame:number) => array[clamp(Math.floor(frame), 0, array.length - 1)];

// Frame_Title / Frame_Difficulty / Frame_Player use GListen(20) before
// creating the next frame. Input stays with the outgoing frame until all of
// its overlapping leave/enter actors have finished their presentation.
export const TITLE_TIMING = Object.freeze({ entrance:80, confirm:20, characterSwitch:20, battleDelay:12, battleWipe:70 });
export function titleTransitionPlan(from:string, to:string, back = false) {
  if(to==='quit')return {delay:20,leave:20,enter:0,duration:40,back};
  if(to==='battle')return {delay:12,leave:0,enter:70,duration:82,back};
  if(from==='battle')return {delay:0,leave:20,enter:20,duration:40,back:true};
  const delay=back?0:20,leave=from==='title'?0:20;
  const enter=to==='title'?0:to==='difficulty'||to==='boss'?40:to==='spell'?24:20;
  return {delay,leave,enter,duration:delay+Math.max(leave,enter),back};
}

const movementCache = new Map<string,number[][]>();
function moveAt(fromX:number,fromY:number,toX:number,toY:number,maxSpeed:number,minSpeed:number,age:number) {
  const key=[fromX,fromY,toX,toY,maxSpeed,minSpeed].join(',');
  if(!movementCache.has(key))movementCache.set(key,movement(fromX,fromY,toX,toY,maxSpeed,minSpeed,Math.hypot(toX-fromX,toY-fromY)));
  return lookup(movementCache.get(key)!,age);
}
const progress=(age:number,duration:number)=>clamp(age/duration,0,1);
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const glint=(age:number)=>age>=0&&age<20?(Math.floor((20-age)/2)%2?0.5:1):1;

// PrivateMoveBody's constructor records the distance before Frame_Title assigns
// its offscreen initial location. Preserve that initial-distance convention.
function movement(fromX:number, fromY:number, targetX:number, targetY:number, maxSpeed:number, minSpeed:number, maxDistance = Math.hypot(targetX, targetY)) {
  const frames = [[fromX, fromY]];
  let x = f32(fromX), y = f32(fromY), speed = f32(maxSpeed);
  for (let i = 0; i < 180; i++) {
    const distance = f32(Math.hypot(f32(targetX - x), f32(targetY - y)));
    const step = f32(speed / 60);
    if (distance < step) { x = targetX; y = targetY; }
    else if (distance > 0) {
      x = f32(x + f32(f32((targetX - x) / distance) * step));
      y = f32(y + f32(f32((targetY - y) / distance) * step));
      speed = f32(minSpeed + f32((maxSpeed - minSpeed) * f32(distance / maxDistance)));
    }
    frames.push([x, y]);
  }
  return frames;
}
const menuMovement = OPTION_ROWS.map((_:number, index:number) => movement(-340, 110 - index * 32, -240, 10 - index * 32, 1200, 150));
const logoBob = [0];
const bob = (frame:number) => {
  for (let index = logoBob.length; index <= frame; index++) logoBob.push(f32(logoBob[index - 1] + f32(0.05 * Math.sin(index / 30))));
  return logoBob[frame];
};

// Seeded particles reproduce source emission timing and velocity/force ranges.
// They are presentation only and do not consume the battle RNG stream.
function random(seed:number) { let n = seed >>> 0; n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296; }
const particleTrajectories = new Map<number,{size:number;fx:number;fy:number;states:number[][]}>();
function particle(index:number, age:number) {
  let trajectory = particleTrajectories.get(index);
  if (!trajectory) {
    const r = (channel:number) => random((index * 0x9e3779b1 + channel * 0x85ebca6b + 1) >>> 0);
    trajectory = {
      size: f32(4 + 8 * r(1)), fx: f32(-15 + 30 * r(4)), fy: f32(25 + 10 * r(6)),
      states: [[f32(-360 + 720 * r(2)), -252, f32(-25 + 50 * r(3)), f32(25 + 10 * r(5))]],
    };
    particleTrajectories.set(index, trajectory);
  }
  const dt = f32(1 / 60);
  while (trajectory.states.length <= age) {
    const [x, y, vx, vy] = trajectory.states[trajectory.states.length - 1];
    const speed = f32(Math.sqrt(f32(f32(vx * vx) + f32(vy * vy))));
    const dx = f32(f32(f32(0.5 * speed) * vx) / 100), dy = f32(f32(f32(0.5 * speed) * vy) / 100);
    const nextVX = f32(vx + f32(f32(trajectory.fx - dx) * dt));
    const nextVY = f32(vy + f32(f32(trajectory.fy - dy) * dt));
    trajectory.states.push([f32(x + f32(nextVX * dt)), f32(y + f32(nextVY * dt)), nextVX, nextVY]);
  }
  return { x: trajectory.states[age][0], y: trajectory.states[age][1], size: trajectory.size };
}
function drawParticles(draw:DrawList, assets:RushAssets, frame:number) {
  const image = assets.size('src_light');
  draw.blend('add');
  const newest = Math.floor(frame / 2), oldest = Math.max(1, newest - 150);
  for (const index of particleTrajectories.keys()) if (index < oldest || index > newest) particleTrajectories.delete(index);
  for (let index = oldest; index <= newest; index++) {
    const age = frame - index * 2;
    if (age >= 300) continue;
    const { x, y, size } = particle(index, age);
    const alpha = age > 270 ? Math.max(0, 0.75 - (age - 270) * 0.025) : 0.75;
    assets.region(draw, 'src_light', [0, image.height * 0.5, image.width * 0.18, image.height * 0.36], x, y, size, size, 0, opacity(alpha));
  }
  draw.blendEnd();
}

function drawMain(draw:DrawList, assets:RushAssets, state:RushTitleState, frame:number, confirmAge = -1) {
  const selection = state.selection ?? 0;
  if (frame > 40) {
    const [x, y] = lookup(menuMovement[selection], frame - 10 - selection * 6);
    assets.sprite(draw, 'src_selector', x, y, 400, 24, 0, opacity(clamp((frame - 40) * 0.01, 0, 0.5)));
  }
  draw.blend('add');
  assets.sprite(draw, 'src_title_1', -224 + Math.min(frame, 40), 185 + bob(frame), 198, 129, 0, opacity(frame / 20));
  assets.sprite(draw, 'src_title_2', -36 - Math.min(frame, 40), 107 + bob(frame), 246, 66, 0, opacity(frame / 20));
  draw.blendEnd();
  for (let index = 0; index < OPTION_ROWS.length; index++) {
    const age = frame - 10 - index * 6;
    if (age < 0) continue;
    const [x, y] = lookup(menuMovement[index], age);
    const brightness = index === selection ? confirmAge>=0?glint(confirmAge):0.88 + 0.12 * Math.sin(frame / 10) : 0.5;
    const rollAge = frame - (state.selectionFrame ?? -1000);
    const height = index === selection && rollAge >= 0 && rollAge < 15 ? 31 * Math.cos(2 * Math.PI * rollAge / 15) : 31;
    assets.region(draw, 'src_title', [22, 16 + OPTION_ROWS[index] * 30, 135, 31], x + 67.5, y, 135, height, 0, opacity(age / 40, brightness));
  }
}

function drawSubmenuBackground(draw:DrawList, assets:RushAssets, age=40, alpha=1) {
  // Exact Frame_BackGround increments: sum(12 - n/3), n=1..18.
  const n=clamp(age,0,18),growth=12*n-n*(n+1)/6;
  assets.sprite(draw, 'src_titlebg_2', 0, 0, 640+growth, 480+growth*.75, 0, opacity(alpha*lerp(.5,1,progress(age,8))));
}

function drawDifficulty(draw:DrawList, assets:RushAssets, state:RushTitleState, anim:TitleAnimation={age:80}) {
  const selected = state.difficulty ?? 1;
  const age=anim.age,leaving=anim.leaving;
  const [hx,hy]=leaving?moveAt(-150,170,-150,300,600,100,age):moveAt(-140,300,-150,170,600,100,anim.selection?80:age);
  assets.region(draw, 'src_select', [0, 0, 577, 785 / 3], hx, hy, 577 * 0.5, 785 * 0.5 / 3,0,opacity(leaving?1-progress(age,20):1));
  for (let index = 3; index >= 0; index--) {
    const offset = index - selected;
    const spawnAge=age-(8-index*2);
    if(!leaving&&!anim.selection&&spawnAge<0)continue;
    const [x,y]=anim.selection?moveAt(20+180*(index-anim.from.difficulty),140*(index-anim.from.difficulty),20+180*offset,140*offset,1500,100,age):
      leaving?[20+180*offset,140*offset]:moveAt(-120+180*offset,120+140*offset,20+180*offset,140*offset,1000,100,spawnAge);
    const alpha=(index===selected?1:.5)*(leaving?1-progress(age,anim.to==='character'?10:20):1);
    assets.region(draw, 'src_difficulty', [0, index * 170, 477, 170], x,y,477*.8,170*.8,0,opacity(alpha,index===selected?glint(anim.confirmAge??-1):1));
  }
}

function drawCharacter(draw:DrawList, assets:RushAssets, state:RushTitleState, anim:TitleAnimation={age:80}) {
  const selected = state.character === 'marisa' || state.character === 1 ? 1 : 0;
  const age=anim.age,leave=anim.leaving,fade=leave?1-progress(age,10):1;
  const [hx,hy]=leave?moveAt(150,170,-150,300,600,100,age):moveAt(140,300,150,170,600,100,anim.selection?80:age);
  assets.region(draw,'src_select',[0,785/3,577,785/3],hx,hy,577*.5,785*.5/3,0,opacity(leave?1-progress(age,20):1));
  const badgeMove=anim.from==='difficulty'&&!leave?progress(age,15):leave&&anim.to==='difficulty'?1-progress(age,15):1;
  assets.region(draw,'src_difficulty',[0,(state.difficulty??1)*170,477,119],lerp(20,0,badgeMove),lerp(0,-200,badgeMove),lerp(477*.8,477*.4,badgeMove),lerp(170*.56,170*.28,badgeMove),0,opacity(leave?lerp(1,anim.to==='difficulty'?.1:0,progress(age,15)):anim.selection?1:lerp(.5,1,progress(age,15))));
  const portrait=(index:number,x:number,alpha:number)=>assets.sprite(draw,index?'src_ps01':'src_ps00',x,-10,(index?1030:1071)*.4,(index?1071:1170)*.4,0,opacity(alpha,glint(anim.confirmAge??-1)));
  const intro=(index:number,x:number,width:number,alpha:number)=>assets.region(draw,'src_playerintro',[367*index,0,367,285],x,-40,width,285,0,opacity(alpha,glint(anim.confirmAge??-1)));
  if(anim.selection){
    const p=progress(age,20),left=anim.direction<0,old=anim.from.character;
    const [oldX]=moveAt(-200,-10,left?-250:-150,-10,300,100,age);
    const [newX]=moveAt(left?-150:-250,-10,-200,-10,300,100,age);
    portrait(old,oldX,1-progress(age,8));portrait(selected,newX,progress(age,8));
    intro(old,lerp(130,left?80:180,p),367*Math.cos(p*Math.PI/2),1-p);
    intro(selected,lerp(left?180:80,130,p),367*Math.sin(p*Math.PI/2),p);
  }else{
    portrait(selected,-200,fade*(leave?1:progress(age,8)));
    intro(selected,130,367,fade*(leave?1:progress(age,20)));
  }
  const arrowAlpha=fade*(leave||anim.selection?1:progress(age,10));
  assets.sprite(draw,'src_arrow',-45,30,22.5,41.5,0,opacity(arrowAlpha));
  assets.sprite(draw,'src_arrow',290,30,-22.5,41.5,0,opacity(arrowAlpha));
}

function drawBossSelect(draw:DrawList, assets:RushAssets, state:RushTitleState, anim:TitleAnimation={age:80}) {
  const age=anim.age,leave=anim.leaving,[hx,hy]=leave?moveAt(0,170,0,300,600,100,age):moveAt(0,300,0,170,600,100,anim.selection?80:age);
  assets.region(draw, 'src_select', [0, 785 * 2 / 3, 577, 785 / 3], hx,hy,577*.5,785*.5/3,0,opacity(leave?1-progress(age,20):1));
  for (let index = 0; index < 3; index++) {
    const selected = (state.bossIndex ?? 0) === index;
    const height=selected&&anim.selection?31*Math.cos(2*Math.PI*age/15):31;
    assets.region(draw,'src_title',[174,16+30*index,69,31],0,70-30*index,69,height,0,opacity(leave?1-progress(age,15):anim.selection?1:progress(age,40),selected?glint(anim.confirmAge??-1):.5));
  }
  const alpha=leave?1-progress(age,15):anim.selection?1:progress(age,20);
  assets.text(draw,state.bossName??'',-72,-45,24,opacity(alpha));
  assets.text(draw,'选择 Boss',-80,222,18,opacity(alpha));
}

function drawSpellSelect(draw:DrawList,assets:RushAssets,state:RushTitleState,anim:TitleAnimation={age:80}) {
  // The source only selects a stage. Individual spell-card selection is this
  // demo's additional business page; keep its 24-frame slide/fade explicit.
  const p=progress(anim.age,24),alpha=anim.leaving?1-p:anim.selection?1:p,dy=anim.leaving?-30*p:anim.selection?0:30*(1-p);
  assets.text(draw,`${state.bossName??''} · 符卡练习`,-225,175+dy,22,opacity(alpha));
  for(let index=0;index<(state.spells??[]).length;index++){
    const selected=index===(state.spellIndex??0),y=105-index*36+dy;
    if(selected)draw.rect(110,(240-y)*1.5-5,745,45,rgba(29,82,113,Math.round(187*alpha)));
    const spell=state.spells![index];
    assets.text(draw,`${String(spell.cardId).padStart(2,'0')}  ${spell.name}`,-225,y,18,opacity(alpha,selected?glint(anim.confirmAge??-1):.6));
  }
  assets.text(draw,'Z 确认    X 返回',-105,-205+dy,14,opacity(alpha,.8));
}

function drawOption(draw:DrawList, assets:RushAssets, state:RushTitleState, anim:TitleAnimation={age:80}) {
  const alpha=anim.leaving?1-progress(anim.age,10):anim.selection?1:progress(anim.age,20);
  const row = [10, 11, 9];
  for (let index = 0; index < row.length; index++) {
    assets.region(draw, 'src_title', [22, 16 + row[index] * 30, 135, 31], -120 + 67.5, -54 - 32 * index, 135, 31, 0, opacity(alpha, index === (state.selection ?? 0) ? 1 : 0.5));
  }
  assets.text(draw, `${Math.round((state.bgmVolume ?? 1) * 100)}%`, -20, -45, 20,opacity(alpha));
  assets.text(draw, `${Math.round((state.soundVolume ?? 1) * 100)}%`, -20, -77, 20,opacity(alpha));
}

function drawPage(draw:DrawList,assets:RushAssets,state:RushTitleState,anim:TitleAnimation) {
  const screen=state.screen;
  if(screen==='difficulty')drawDifficulty(draw,assets,state,anim);
  else if(screen==='character'||screen==='player')drawCharacter(draw,assets,state,anim);
  else if(screen==='boss'||screen==='stage')drawBossSelect(draw,assets,state,anim);
  else if(screen==='spell')drawSpellSelect(draw,assets,state,anim);
  else if(screen==='option')drawOption(draw,assets,state,anim);
  else if(screen==='replay'||screen==='manual'){
    const alpha=anim.leaving?1-progress(anim.age,20):progress(anim.age,20),dy=30*(1-progress(anim.age,20));
    if(screen==='replay'){
      assets.sprite(draw,'src_replay',0,200+dy,197*.75,60*.75,0,opacity(alpha));
      assets.text(draw,'No.01 -------- --/--/-- ------ ------- St.-',-210,162+dy,15,opacity(alpha,.6),'digit');
      assets.text(draw,'暂无录像',-55,40+dy,20,opacity(alpha,.7));
    }else{
      assets.text(draw,'操作方法',-190,150+dy,25,opacity(alpha));
      assets.text(draw,'方向键：移动 / 选择\nZ：射击 / 确认\nX：Bomb / 返回\nShift：低速移动\nEsc：暂停',-190,90+dy,18,opacity(alpha));
    }
  }
}

/** EnterSwitch's original fourteen wavy strips write the mask to a transparent
 * render target. Its background then uses the same destination-alpha blend as
 * Main.cpp; the generic target is shared with the mutually exclusive battle
 * background renderer. No title-specific native renderer is needed. */
export function drawTitleWipe(draw:DrawList,assets:RushAssets,age:number,target:number) {
  const strips=[[2,-580,450,0],[3,-600,320,0],[8,-620,250,0],[9,-640,120,1/8],[14,-660,50,1/7],[15,-680,-50,1/6],[19,-700,-150,1/5],
    [6,580,450,0],[7,600,320,0],[12,620,250,0],[13,640,120,1/8],[21,660,50,1/7],[22,680,-50,1/6],[18,700,-150,1/5]];
  const texture=assets.texture('src_switchbg');
  const vertex=(x:number,y:number):MeshVertex=>[(x+320)*1.5,(240-y)*1.5,1.5*(x+320)/640-age*.001,1.5*(320-y)/640-age*.001,0xffffffff];
  draw.targetBegin(target,0);draw.alphaTest(0);
  draw.sampler(assets.texture('src_switch'),'bilinear','clamp','clamp');
  for(const [birth,fromX,fromY,offset] of strips){
    if(age<birth)continue;
    const left=fromX<0,angle=left?-Math.PI/12+offset:Math.PI*13/12-offset;
    const elapsed=clamp(age-birth,0,20),x=fromX+Math.cos(angle)*40*elapsed,y=fromY+Math.sin(angle)*40*elapsed;
    assets.sprite(draw,'src_switch',x,y,left?280:-280,1100,-Math.PI/2+angle);
  }
  draw.sampler(texture,'bilinear','wrap','wrap');
  draw.blendFactors('dstAlpha','zero','add','zero','one','add');
  draw.mesh(texture,[vertex(-320,240),vertex(320,240),vertex(-320,-240),vertex(320,-240)],[0,1,2,1,3,2]);
  draw.blendEnd();draw.targetEnd();draw.sprite(target,480,360,960,720);
  draw.alphaTest(.01);
}

/** Source actors stay layered while incoming frames enter and old ones leave.
 * `transition` contains immutable outgoing/incoming menu views and frame age. */
export function drawTitle(draw:DrawList, assets:RushAssets, state:RushTitleState) {
  const frame = Math.max(0, Math.floor(state.frame ?? 0));
  draw.clear(0x000000ff);
  draw.alphaTest(0.01);
  assets.sprite(draw, 'src_titlebg', 0, 0, 640, 480);
  drawParticles(draw, assets, frame);
  const screen=state.screen??'title',transition=state.transition;
  const mainState={...state,selection:screen==='title'||screen==='main'?state.selection:state.mainSelection??0};
  drawMain(draw,assets,mainState,frame,transition?.from.screen==='title'&&transition.kind!=='selection'?transition.age:-1);
  if(transition?.kind==='selection'){
    if(screen!=='title')drawSubmenuBackground(draw,assets);
    drawPage(draw,assets,transition.to,{age:transition.age,selection:true,from:transition.from,direction:transition.direction});
  }else if(transition&&transition.to.screen!=='quit'&&transition.to.screen!=='battle'){
    const age=transition.age-transition.delay!;
    if(transition.from.screen==='title'){
      if(age>=0){drawSubmenuBackground(draw,assets,age);drawPage(draw,assets,transition.to,{age,from:'title'});}
    }else{
      const returning=transition.to.screen==='title';
      drawSubmenuBackground(draw,assets,40,returning?1-progress(age,transition.leave):1);
      if(age<0)drawPage(draw,assets,transition.from,{age:80,confirmAge:transition.age});
      else{
        drawPage(draw,assets,transition.from,{age,leaving:true,to:transition.to.screen});
        if(!returning)drawPage(draw,assets,transition.to,{age,from:transition.from.screen});
      }
    }
  }else if(screen!=='title'&&screen!=='main'){
    drawSubmenuBackground(draw,assets);
    drawPage(draw,assets,state,{age:state.screenFrame??frame,confirmAge:transition?.age??-1});
  }
  if(transition?.to.screen==='battle'&&transition.age>=transition.delay!)drawTitleWipe(draw,assets,transition.age-transition.delay!,state.wipeTarget!);
  if(transition?.to.screen==='quit'&&transition.age>=transition.delay!)draw.rect(0,0,960,720,opacity(progress(transition.age-transition.delay!,transition.leave!),0));
  if (frame < 40) draw.rect(0, 0, 960, 720, opacity(1 - frame / 40, 0));
  draw.alphaTest(0);
  return draw;
}
