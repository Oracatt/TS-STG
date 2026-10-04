// SPDX-License-Identifier: GPL-3.0-only
// Frozen MoveBody before the zero-drag/force optimization. Source equations:
// TouhouRushBoss UserComponent.h; keep the explicit binary32 operations.
const f=Math.fround,DT=f(1/60);
export function referenceStepBody(body){
  const speed=f(Math.sqrt(f(f(body.vx*body.vx)+f(body.vy*body.vy))));
  const dx=typeof body.drag==='number'?body.drag:body.drag?.x??0;
  const dy=typeof body.drag==='number'?body.drag:body.drag?.y??0;
  const dragX=f(f(f(dx*speed)*body.vx)/100),dragY=f(f(f(dy*speed)*body.vy)/100);
  body.vx=f(body.vx+f(f((body.fx??0)-dragX)*DT));
  body.vy=f(body.vy+f(f((body.fy??0)-dragY)*DT));
  body.x=f(body.x+f(body.vx*DT));body.y=f(body.y+f(body.vy*DT));
}
