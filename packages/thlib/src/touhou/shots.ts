import type {AnmInstance} from './anm.js';
import type {TouhouPlayerOption,TouhouPlayer,TouhouPlayerContext,TouhouView,TouhouDamageTarget} from './player.js';
import type {TouhouShooter} from './shot-data.js';
import type {DrawList} from '../index.js';
import { f32, PI, add, sub, mul, div, polar, snap, wrapAngle, angleDifference, rotate, sqrt, sin, atan2, rectangleCircle, TouhouTimer } from './math.js';

// gameplay/enemy_variables.cpp::enemy_excluded, shared by target acquisition
// and collision. Hidden/noninteractive enemies must not consume a projectile.
const targetable = (enemy: TouhouDamageTarget) => enemy.alive !== false && !enemy.excluded &&
  !((enemy.primaryFlags??0)&0x21) && !((enemy.flags??0)&0xc00);
const active = (enemy: TouhouDamageTarget) => targetable(enemy) && !enemy.invulnerable;

function releaseLaserGroup(shot: TouhouShot) {
  // The original releases the group when retirement starts. Its ANM tail can
  // outlive a replacement beam, so later cleanup must only release this owner.
  const groups = shot.player.laserGroups;
  if (groups.get(shot.row.group) === shot) groups.delete(shot.row.group);
}

/** Original SHT projectile owner. Weapon selection supplies data; targeting,
 * contact effects and projectile lifetimes remain shared portable behavior. */
export class TouhouShot {
  player: TouhouPlayer;
  contact: boolean;
  contactVisual: boolean;
  option: TouhouPlayerOption | null;
  animation: AnmInstance | null;

  id:number;
  x:number;
  y:number;
  z:number;
  angle:number;
  speed:number;
  damage:number;
  damagePosition?:{x:number;y:number;z:number};
  width:number;
  height:number;
  state:number;
  alive:boolean;
  timer:TouhouTimer;
  pattern:number;
  index:number;
  row:TouhouShooter;
  target:TouhouDamageTarget|null=null;
  turnState=0;
  turnTimer=new TouhouTimer(0);
  turnTarget:{x:number;y:number}|null=null;

  constructor(player: TouhouPlayer, row: TouhouShooter, pattern: number, index: number, context: TouhouPlayerContext, position?:{x:number;y:number}) {
    this.player = player; this.row = row; this.pattern = pattern; this.index = index;
    this.id = player.nextShotId++; this.alive = true; this.state = 1; this.timer = new TouhouTimer(0);
    this.angle = wrapAngle(row.angle); this.speed = row.speed; this.damage = row.damage;
    this.width = row.size.x; this.height = row.size.y; this.contact = false; this.contactVisual = false;
    const source=row.source&15;
    this.option = source && source!==6 ? player.options[source - 1]??null : null;
    const origin = source===6?{x:0,y:0}:this.option ?? position ?? player;
    // firing.cpp 5042d0: >=995 angles follow a moving option rather than
    // encoding literal radians; >=1000 additionally randomizes angle/speed.
    if(source&&row.angle>=995){
      this.angle=wrapAngle(this.option?.angle??0);
      if(row.angle>=1000){this.angle=wrapAngle(add(this.option?.angle??0,div(mul(player.rng.signed(),PI),12)));this.speed=add(mul(player.rng.signed(),2),row.speed);}
    }
    this.x = f32(origin?.x ?? 0); this.y = f32(origin?.y ?? 0); this.z = 0;
    const velocity = polar(this.angle, mul(context.timerRate ?? 1, this.speed));
    this.x = add(this.x, row.type >= 4 && row.type <= 6 ? row.origin.x : sub(row.origin.x, velocity.x));
    this.y = add(this.y, row.type >= 4 && row.type <= 6 ? row.origin.y : sub(row.origin.y, velocity.y));
    this.animation = player.bank?.create(row.animation, { x: this.x, y: this.y }) ?? null;
    if (this.animation) this.animation.scale2X = this.animation.scale2Y = row.type === 2 ? 1 : f32(1.1);
    this.initialize(context);
    if (row.sound >= 0) context.sound?.(row.sound, this.x);
    this.orientAnimation();
  }
  nearest(context:TouhouPlayerContext,radius:number):TouhouDamageTarget|null {
    let target:TouhouDamageTarget|null=null,distance=mul(radius,radius);
    for(const enemy of context.enemies??[]){
      if(!targetable(enemy))continue;
      const dx=sub(this.x,enemy.x),dy=sub(this.y,enemy.y),squared=add(mul(dx,dx),mul(dy,dy));
      if(squared<distance){target=enemy;distance=squared;}
    }
    return target;
  }
  targetAngle(target:{x:number;y:number}):number{return atan2(sub(target.y,this.y),sub(target.x,this.x));}
  /** player_entity/shot_callbacks.cpp, original initializers 500270..5009f0.
   * These are every initializer used by the eight ordinary/enhanced weapons. */
  initialize(context:TouhouPlayerContext):void {
    const row=this.row,player=this.player,rng=player.rng;
    switch(row.callbacks[0]){
      case 0:case 1:case 7:return;
      case 2:{
        const phase=wrapAngle(mul(div(mul(PI,2),120),player.shotAge.current%120));
        let amount=wrapAngle(mul(sin(phase),row.oscillation));
        if(row.angle<sub(div(-PI,2),.001))amount=wrapAngle(mul(amount,-1));
        else if(row.angle<add(div(-PI,2),.001))return;
        this.angle=wrapAngle(add(amount,row.angle));return;
      }
      case 3:case 6:{
        this.target=this.nearest(context,row.callbacks[0]===3?400:600);
        if(!this.target)this.angle=div(-PI,2);
        else this.angle=wrapAngle(add(this.targetAngle(this.target),row.callbacks[0]===6?div(mul(mul(rng.signed(),PI),5),180):0));
        return;
      }
      case 4:case 12:{
        let closest=999;
        for(const enemy of context.enemies??[]){
          if(!targetable(enemy))continue;
          if(row.callbacks[0]===4){
            if(enemy.y>=sub(this.y,24)){const distance=Math.abs(sub(enemy.x,this.x));if(distance<closest){closest=distance;this.angle=wrapAngle(this.targetAngle(enemy));}}
          }else{
            const distance=sub(enemy.y,this.y);
            if(distance<closest){closest=distance;this.angle=wrapAngle(add(this.targetAngle(enemy),mul(rng.signed(),row.parameters[4])));}
          }
        }
        return;
      }
      case 5:this.angle=wrapAngle(add(this.angle,div(mul(mul(rng.signed(),PI),5),180)));return;
      case 8:case 9:this.width=0;context.sound?.(20,player.x);return;
      case 10:this.angle=wrapAngle(add(this.angle,div(mul(mul(rng.signed(),PI),2),90)));return;
      case 11:this.angle=wrapAngle(add(this.angle,mul(rng.signed(),row.parameters[4])));return;
      default:throw new Error(`Unported TOUHOU shot initialization callback ${row.callbacks[0]}`);
    }
  }
  orientAnimation() {
    const animation = this.animation;
    if (!animation) return;
    switch (animation.orientation) {
      case 1: animation.rotation = this.angle; break;
      case 2:
        if (this.angle >= div(-PI, 2) && this.angle <= div(PI, 2)) { animation.rotation = this.angle; animation.scaleX = Math.abs(animation.scaleX); }
        else { animation.rotation = wrapAngle(add(this.angle, PI)); animation.scaleX = -Math.abs(animation.scaleX); }
        break;
      case 3: animation.rotation = wrapAngle(add(this.angle, PI)); break;
      case 4: animation.rotation = wrapAngle(add(this.angle, div(PI, 2))); break;
      case 5: animation.rotation = wrapAngle(angleDifference(this.angle, div(PI, 2))); break;
      default: break;
    }
  }
  update(context: TouhouPlayerContext): void {
    const row = this.row, rate = context.timerRate ?? 1;
    if (row.lifetime > 0 && this.timer.current >= row.lifetime) { this.animation?.interrupt(1); this.timer.set(-999); }
    this.updateBehavior(context);
    if (this.state !== 2) { this.angle = wrapAngle(add(this.angle, row.angularVelocity)); this.speed = add(this.speed, row.acceleration); }
    const velocity = polar(this.angle, mul(rate, this.speed));
    this.x = snap(add(this.x, velocity.x)); this.y = snap(add(this.y, velocity.y));
    if (this.animation && !this.animation.alive) { this.destroy(); return; }
    if (row.type !== 2 && row.type !== 8 && this.timer.current >= 15 && this.outside()) { this.destroy(); return; }
    this.orientAnimation();
    if (this.animation) { this.animation.x = this.x; this.animation.y = this.y; this.animation.update(); }
    this.timer.tick(rate);
  }
  /** 501820/501be0: homing turns for sixty frames; the right-angle weapon
   * locks a position and waits four frames before its horizontal leg. */
  updateBehavior(context:TouhouPlayerContext):void {
    switch(this.row.callbacks[1]){
      case 0:return;
      case 1:{
        if(this.state===2)return;
        if(context.enemyReady===false)this.target=null;
        else{
          if(!this.target)this.target=this.nearest(context,256);
          if(this.target){
            if(!(context.enemies??[]).includes(this.target)||!targetable(this.target))this.target=null;
            else{
              const delta=angleDifference(this.targetAngle(this.target),this.angle);
              if(this.timer.current<60){
                if(Math.abs(delta)<div(PI,4)){if(Math.abs(delta)<div(PI,12))this.speed=Math.min(16,add(this.speed,.2));}
                else this.speed=Math.max(4,sub(this.speed,.2));
                this.angle=wrapAngle(add(this.angle,mul(delta,.08)));return;
              }
              this.speed=add(this.speed,.2);return;
            }
          }
        }
        this.speed=Math.min(16,add(this.speed,.1));return;
      }
      case 3:{
        if(this.state===2)return;
        if(this.turnState===0&&context.enemyReady!==false){
          for(const enemy of context.enemies??[]){
            if(!targetable(enemy))continue;
            if(sub(enemy.y,16)<=this.y&&this.y<=add(enemy.y,16)&&!(sub(enemy.x,16)<this.x&&this.x<add(enemy.x,16))){
              this.turnState=1;this.animation?.interrupt(2);this.turnTimer.set(0);this.speed=0;this.turnTarget={x:enemy.x,y:enemy.y};break;
            }
          }
        }
        if(this.turnState===1){
          if(this.turnTimer.current===4){this.angle=this.x<=this.turnTarget!.x?0:-PI;this.speed=14;this.turnState=2;}
          this.turnTimer.tick(context.timerRate??1);
        }
        return;
      }
      case 4:case 5:this.updateLaser(context);return;
      case 6:if(this.state===1)this.speed=add(this.speed,.3);return;
      default:throw new Error(`Unported TOUHOU shot update callback ${this.row.callbacks[1]}`);
    }
  }
  outside() {
    const bounds = this.player.bounds ?? { x: -192, y: 0, width: 384, height: 448 };
    const right = bounds.x + bounds.width, bottom = bounds.y + bounds.height;
    // Uses transformed sprite corners when available (frame_helpers.cpp). No hitbox-as-sprite substitution.
    if (this.animation?.corners) return this.animation.corners().every(p => p.x <= bounds.x || p.x >= right || p.y <= bounds.y || p.y >= bottom);
    // Headless state-only callers provide no sprite; center plus original SHT full extents is conservative.
    return this.x + this.width < bounds.x || this.x - this.width > right || this.y + this.width < bounds.y || this.y - this.width > bottom;
  }
  updateLaser(context: TouhouPlayerContext) {
    const row = this.row, player = this.player, origin = this.option ?? player;
    const enhanced=row.callbacks[1]===5;
    this.x = add(origin.x, row.origin.x); this.y = add(origin.y, row.origin.y);
    const desired = wrapAngle(row.angle);
    if (Math.abs(wrapAngle(angleDifference(this.angle, desired))) <= f32(.001)) this.angle = desired;
    else this.angle = wrapAngle(add(wrapAngle(mul(wrapAngle(angleDifference(desired, this.angle)), enhanced?.1:.4)), this.angle));
    if (this.state === 2) return;
    if (this.width < 512) this.width = add(this.width, 18);
    const damageCenter=polar(this.angle,div(this.width,2));
    this.damagePosition={x:add(enhanced?this.x:origin.x,damageCenter.x),y:add(enhanced?this.y:origin.y,damageCenter.y),z:0};
    if (this.animation) { this.animation.width = this.width; this.animation.textureScaleX = div(this.width, 512); }
    this.damage = row.damage;
    if (!this.contact && this.contactVisual) { this.animation?.interrupt(3); this.contactVisual = false; }
    let keep = (row.fields3c[0] !== 0 || player.shootTimer.current >= 0) && !context.dialogue && context.enemyReady !== false;
    if(enhanced)keep=keep&&player.weaponPhaseActive;
    else{
      keep=keep&&player.state!==2&&player.state!==4&&!player.powerChanged&&!player.weaponSuppressOptions;
      if (row.fields3c[0] > 0 && this.timer.current >= row.fields3c[0]) keep = false;
      const selected = player.sht.patterns[player.weaponPattern??((player.focused ? 2 : 1) * (player.weaponLevels+1) + player.powerLevel)];
      if (this.option && !selected?.some(record => (record.source & 15) === this.option!.index + 1 && record.type === 2)) keep = false;
    }
    if (!keep) { this.state = 2; this.animation?.interrupt(1); releaseLaserGroup(this); context.stopSound?.(20); }
    this.contact = false;
  }
  collisions(context: TouhouPlayerContext): void {
    if (!this.alive || this.state !== 1) return;
    const laser = this.row.type === 2;
    for (const enemy of context.enemies ?? []) {
      if (!active(enemy)) continue;
      const center = laser ? this.damagePosition??this : this;
      if (!rectangleCircle(center.x, center.y, this.width, this.height,
        this.angle, enemy.x, enemy.y, enemy.radius ?? 0)) continue;
      const damage = this.hit(enemy, context);
      if (damage) {
        if (context.damageEnemy) context.damageEnemy(enemy, damage, this);
        else if (enemy.damage) enemy.damage(damage, this, context);
        else if (Number.isFinite(enemy.hp)) { enemy.hp! -= damage; if (enemy.hp! <= 0) enemy.alive = false; }
      }
      if (this.state !== 1) break;
    }
  }
  hit(enemy: TouhouDamageTarget, context: TouhouPlayerContext) {
    const callback = this.row.callbacks[3];
    if(callback===3){
      this.contact=true;if(!this.contactVisual){this.animation?.interrupt(2);this.contactVisual=true;}
      return this.timer.previous!==this.timer.current?this.damage:0;
    }
    if(callback===4||callback===6){
      // shot_hit.cpp 503b70/503d40: retire only direct contact. A separate
      // expanding region keeps dealing damage while the impact ANM plays.
      this.player.damageRegions.push({shape:'circle',x:this.x,y:this.y,radius:24,growth:callback===6?this.row.parameters[4]:1,
        remaining:callback===6?20:16,damage:this.row.damage,age:0,period:callback===6?4:2,
        speed:callback===6?2:.3,angle:callback===6?this.angle:div(-PI,2),bomb:false,source:this});
      this.animation?.interrupt(1);this.state=2;this.speed=callback===6?2:f32(.3);context.sound?.(65,this.x);
      return this.damage;
    }
    if (callback === 2) {
      this.contact = true;
      if (!this.contactVisual) { this.animation?.interrupt(2); this.contactVisual = true; }
      const local = rotate(sub(enemy.x, this.x), sub(enemy.y, this.y), -this.angle);
      const radius = add(div(this.height, 2), enemy.radius ?? 0);
      let near = 0;
      if (!(radius < Math.abs(local.y) || local.x < -radius || (local.x < 0 && mul(radius, radius) < add(mul(local.x, local.x), mul(local.y, local.y)))))
        near = sub(local.x, mul(radius, sqrt(sub(1, mul(div(local.y, radius), div(local.y, radius))))));
      this.width = Math.max(0, add(near, 8));
      if (this.timer.previous !== this.timer.current && this.timer.current % 2 === 0 && this.player.bank) {
        const end = polar(this.angle, this.width);
        const visual = this.player.bank.create(this.row.hitAnimation, { x: add(this.x, end.x), y: add(this.y, end.y) });
        visual.rotation = this.angle;
        this.player.effects.push({ animation: visual, age: 0, motion: { angle: this.angle, distance: 64, duration: 20, mode: 4 } });
      }
      return this.timer.previous !== this.timer.current && this.timer.current % 4 === 0 ? this.damage : 0;
    }
    if (callback !== 0 && callback !== 1 && callback!==5) throw new Error(`Unported TOUHOU shot hit callback ${callback}`);
    if(callback===5)context.sound?.(40,enemy.x);
    if (callback === 1 && this.player.effectBank) {
      const rng = this.player.rng;
      const angle = wrapAngle(add(wrapAngle(add(this.angle, mul(rng.signed(), mul(div(PI, 180), 20)))), PI));
      const visual = this.player.effectBank.create(148, { x: this.x, y: this.y }); visual.rotation = angle;
      const r = rng.next() % 128 + 127, g = rng.next() % 64 + 64, b = rng.next() % 64 + 64, a = rng.next() % 64 + 96;
      visual.color = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
      this.player.effects.push({ animation: visual, age: 0 });
    }
    // damage_regions/hit_callbacks.cpp: retain the ANM interrupt animation, stop damage, divide speed by eight.
    this.z = f32(.1); this.speed = div(this.speed, 8); this.state = 2; this.animation?.interrupt(1);
    return this.damage;
  }
  destroy(): void { this.alive = false; this.animation?.destroy(); if (this.row.type === 2) releaseLaserGroup(this); }
  draw(draw: DrawList, view?: TouhouView): void { this.animation?.draw(draw, view); }
}

export function fireTouhouPattern(player: TouhouPlayer, pattern: number, frame: number, secondary: number, context: TouhouPlayerContext,origin?:{x:number;y:number}): void {
  if (!Number.isInteger(pattern)||pattern < 0 || pattern >= player.sht.patterns.length) throw new RangeError(`Invalid TOUHOU weapon pattern: ${pattern}`);
  const rows = player.sht.patterns[pattern];
  if (!rows) throw new Error(`Missing SHT pattern ${pattern}`);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.period && (row.secondaryPeriod ? secondary % row.secondaryPeriod !== row.secondaryPhase : frame % row.period !== row.phase)) continue;
    if (row.type === 2 && player.laserGroups.has(row.group)) {
      const existing = player.laserGroups.get(row.group)!; existing.row = row; existing.pattern = pattern; existing.index = index; continue;
    }
    const shot = player.shotFactory?player.shotFactory(player,row,pattern,index,context,origin):new TouhouShot(player, row, pattern, index, context,origin);
    if(!shot||typeof shot.update!=='function'||typeof shot.collisions!=='function'||typeof shot.draw!=='function'||typeof shot.destroy!=='function')throw new TypeError('Shot factory must return an update/collisions/draw/destroy owner');
    // Original active list prepends, so newer shots update and collide first.
    player.shots.unshift(shot);
    if (row.type === 2) player.laserGroups.set(row.group, shot);
    context.onEvent?.('shot', { shot });
  }
}

/** Default main and focused/unfocused option emission. A custom shoot strategy
 * may call this before or after emitting its own weapons. */
export function fireTouhouPlayerWeapons(player: TouhouPlayer,frame: number,secondary: number,context: TouhouPlayerContext): void{
  fireTouhouPattern(player,player.powerLevel,frame,secondary,context);
  fireTouhouPattern(player,(player.focused?2:1)*(player.weaponLevels+1)+player.powerLevel,frame,secondary,context);
}
