// Source port: bullet_system/shot_pattern.cpp, original VA 0x4818e0.
// Operations intentionally retain SSE float32 evaluation order.
const f = Math.fround, add = (a,b) => f(f(a)+f(b)), sub = (a,b) => f(f(a)-f(b));
const mul = (a,b) => f(f(a)*f(b)), div = (a,b) => f(f(a)/f(b)), pi = f(Math.PI);
const int = value => f(value | 0);

/** Original Park-Miller stream, including unsigned raw-state folding. */
export class TouhouRandom {
  constructor(seed = 1) { this.seed(seed); }
  seed(value) { this.last = value >>> 0; this.state = this.last % 0x7fffffff || 1; this.modulus = 0x7fffffff; return this; }
  next() {
    const product = this.state * 48271;
    let folded = Math.floor(product / 0x80000000) + product % 0x80000000;
    if (folded >= 0x7fffffff) folded -= 0x7fffffff;
    this.state = folded >>> 0; this.last = this.state;
    if (!this.modulus) throw new RangeError('Original RNG division by zero');
    return this.last % this.modulus;
  }
  unit() { return div(f(this.next()), sub(f(this.modulus),1)); }
  signedUnit() { return sub(div(f(this.next()), sub(div(f(this.modulus),2),1)),1); }
  snapshot() { return { state:this.state,last:this.last,modulus:this.modulus }; }
}

export function touhouShotTrajectory(parameters, pattern, column, row, playerAngle, random) {
  const p = { count:parameters.count ?? 1, rows:parameters.rows ?? 1,
    speed:f(parameters.speed ?? 0), speed_step:f(parameters.speedStep ?? 0),
    angle:f(parameters.angle ?? 0), angle_step:f(parameters.angleStep ?? 0) };
  if (!Number.isInteger(pattern) || pattern < 0 || pattern > 12) throw new RangeError('Original pattern must be 0..12');
  if (!Number.isInteger(p.count) || p.count < 1 || !Number.isInteger(p.rows) || p.rows < 1)
    throw new RangeError('Positive original column and row counts required');
  const c = column | 0, r = row | 0;
  let angle = 0, speed = p.rows < 2 ? p.speed : sub(p.speed,div(mul(sub(p.speed,p.speed_step),int(r)),sub(int(p.rows),1)));
  const initialSpeed = speed;
  const circle = () => div(mul(int(c),mul(pi,2)),int(p.count));
  const rowAngle = () => add(mul(int(r),p.angle_step),p.angle);
  switch (pattern) {
    case 0: case 1: {
      const offset = (p.count & 1) ? mul(int(((column + 1) | 0) / 2 | 0),p.angle_step) : add(mul(int(c/2|0),p.angle_step),mul(p.angle_step,.5));
      angle = add(angle,offset); if (column & 1) angle = mul(angle,-1);
      if (pattern === 0) angle = add(angle,playerAngle);
      angle = add(angle,p.angle); break;
    }
    case 2: case 3:
      if (pattern === 2) angle = add(angle,playerAngle);
      angle = add(circle(),angle); angle = add(rowAngle(),angle); break;
    case 4: case 5:
      if (pattern === 4) angle = add(angle,playerAngle);
      angle = add(div(pi,int(p.count)),angle); angle = add(circle(),angle); angle = add(rowAngle(),angle); break;
    case 6:
      if (!random) throw new TypeError('Original random pattern requires TouhouRandom');
      angle = add(mul(random.signedUnit(),p.angle_step),p.angle); break;
    case 7:
      if (!random) throw new TypeError('Original random pattern requires TouhouRandom');
      speed = add(mul(random.unit(),p.speed_step),p.speed); angle = add(circle(),angle); angle = add(rowAngle(),angle); break;
    case 8:
      if (!random) throw new TypeError('Original random pattern requires TouhouRandom');
      angle = add(mul(random.signedUnit(),p.angle_step),p.angle); speed = add(mul(random.unit(),p.speed_step),p.speed); break;
    case 9: case 10:
      angle = circle();
      if (!(p.rows & 1)) {
        angle = add(add(mul(int(r/2|0),p.angle_step),mul(p.angle_step,.5)),angle);
        if (p.rows > 1) speed = add(div(mul(int(row & 0xfffe),sub(p.speed_step,p.speed)),int(p.rows-1)),p.speed);
      } else {
        angle = add(mul(int(((row+1)|0)/2|0),p.angle_step),angle);
        if (p.rows > 1) speed = add(div(mul(int((row+1)&0xfffe),sub(p.speed_step,p.speed)),int(p.rows-1)),p.speed);
      }
      if (row & 1) angle = mul(angle,-1);
      if (pattern === 9) angle = add(angle,playerAngle);
      angle = add(angle,p.angle); break;
    case 11: {
      angle = circle(); const x=mul(f(Math.cos(angle)),p.speed), y=mul(f(Math.sin(angle)),p.speed_step);
      speed=f(Math.sqrt(add(mul(x,x),mul(y,y)))); angle=add(f(Math.atan2(y,x)),p.angle); break;
    }
    case 12: {
      const sample=add(circle(),div(pi,int(p.count))); angle=add(add(sample,p.angle),angle);
      speed=mul(sub(1,mul(Math.abs(f(Math.sin(sample))),p.speed_step)),speed); break;
    }
  }
  return { angle,speed,initialSpeed };
}

export function touhouStyle(styles, type, color = 0) {
  if (!Number.isInteger(type) || type < 0 || type >= 50 || !Number.isInteger(color) || color < 0 || color >= 16)
    throw new RangeError('Original bullet style/color index outside source tables');
  const s=styles[type], colors=s.colors[color];
  let cancelScript;
  switch(s.cancelType) {
    case 0: cancelScript=color*2+6; break;
    case 1: cancelScript=[6,10,14,18,22,26,30,36][color]??0; break;
    case 2: cancelScript=-1; break;
    case 3: cancelScript=18; break;
    case 4: cancelScript=8; break;
    case 5: cancelScript=14; break;
    case 6: cancelScript=colors[3]; break;
    case 7: cancelScript=0x107; break;
    case 8: cancelScript=0x10a; break;
    case 9: cancelScript=0x10d; break;
    case 10: cancelScript=0x116; break;
    default: throw new RangeError('Unknown original cancel type');
  }
  return { ...s,color,cancelScript,remapSprite:id => (s.colors[0][0]|0)>=0 ? (colors[id]|0) : id };
}
