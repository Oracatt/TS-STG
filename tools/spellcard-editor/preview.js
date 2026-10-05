import {AnmBank,TouhouBulletField,TouhouLaserField,TouhouBossCharge,TouhouRandom,
  TouhouRNG,TOUHOU_BULLET_STYLES,TouhouSpellCardTimeline,validateTouhouSpellCard} from '@ts-stg/thlib/touhou';

/** Geometry preview adapter. Motion, birth timing, bounds and laser geometry
 * run through thlib; Canvas is only an editor overlay, not an ANM renderer. */
export class SpellCardPreviewModel {
  constructor(document,{bulletArchive,effectArchive}={}) {
    this.document=validateTouhouSpellCard(document);
    this.archives={bulletArchive,effectArchive};this.generation=0;this.disposed=false;
    this.target={x:0,y:400};this.reset();
  }
  reset(){
    this.timeline?.stop();this.bulletBank?.dispose();this.effectBank?.dispose();
    const doc=this.document;
    this.boss={...doc.boss};this.player={...this.target};this.charges=[];
    this.bulletBank=new AnmBank(this.archives.bulletArchive,{loadTexture:()=>1,rng:new TouhouRNG(doc.seed)});
    this.effectBank=new AnmBank(this.archives.effectArchive,{loadTexture:()=>2,rng:new TouhouRNG(doc.seed^0x12345)});
    this.field=new TouhouBulletField({bank:this.bulletBank,styles:TOUHOU_BULLET_STYLES,random:new TouhouRandom(doc.seed)});
    this.laserField=new TouhouLaserField({styles:TOUHOU_BULLET_STYLES});
    this.timeline=new TouhouSpellCardTimeline(doc,{boss:this.boss,player:this.player,bullets:this.field,lasers:this.laserField,
      presentation:{beginCharge:options=>{const charge=new TouhouBossCharge(this.effectBank,options);this.charges.push(charge);return charge;}},
      sound:()=>{},clear:()=>this.clear()});
  }
  get frame(){return this.timeline.frame;}
  get bullets(){return this.field.bullets.filter(b=>b.state!==0);}
  get lasers(){return this.laserField.lasers.filter(l=>l.alive);}
  clear(){
    for(const bullet of this.field.bullets)this.field.cancel(bullet,0);
    for(const laser of this.laserField.lasers)this.laserField.erase(laser);
  }
  setTarget(x,y){
    if(!Number.isFinite(x)||!Number.isFinite(y))throw new TypeError('Target coordinates must be finite');
    this.target={x:Math.max(-192,Math.min(192,x)),y:Math.max(0,Math.min(448,y))};
    Object.assign(this.player,this.target);
  }
  step(){
    if(this.disposed||!this.timeline.alive)return;
    this.timeline.update();this.field.update(null);this.laserField.update(null);
    for(const charge of this.charges)charge.update();this.charges=this.charges.filter(c=>c.alive);
    for(const bank of [this.bulletBank,this.effectBank]){bank.updateDetached();bank.collect();}
  }
  /** Re-simulate from seed instead of rewinding a partially mutated world. */
  async seek(frame,{signal}={}){
    if(!Number.isInteger(frame)||frame<0||frame>this.document.duration)throw new RangeError('Preview frame outside document');
    const generation=++this.generation;this.reset();
    while(this.frame<frame){
      if(signal?.aborted||this.disposed||generation!==this.generation)return false;
      const stop=Math.min(frame,this.frame+30);while(this.frame<stop)this.step();
      if(this.frame<frame)await new Promise(resolve=>setTimeout(resolve,0));
    }
    return !signal?.aborted&&!this.disposed&&generation===this.generation;
  }
  laserSegments(){
    return this.lasers.flatMap(laser=>this.laserField.segments(laser).map(s=>({
      x1:s.position.x,y1:s.position.y,x2:s.position.x+Math.cos(s.angle)*s.length,
      y2:s.position.y+Math.sin(s.angle)*s.length,width:s.width,color:laser.p.color,
    })));
  }
  snapshot(){return{frame:this.frame,boss:{...this.boss},player:{...this.player},
    bullets:this.field.snapshot(),lasers:this.laserField.snapshot(),timeline:this.timeline.snapshot()};}
  dispose(){
    if(this.disposed)return;this.disposed=true;this.generation++;this.timeline.stop();
    for(const charge of this.charges)charge.destroy();this.bulletBank.dispose();this.effectBank.dispose();
  }
}

let archives;
export async function createBrowserPreview(document){
  if(!archives)archives=Promise.all(['bullet','effect'].map(async name=>{
    const response=await fetch(`/assets/touhou-common/anm/${name}.json`);
    if(!response.ok)throw new Error('缺少公共动画素材，请先导入 thlib 公共资源');
    return response.json();
  })).catch(error=>{archives=null;throw error;});
  const [bulletArchive,effectArchive]=await archives;
  return new SpellCardPreviewModel(document,{bulletArchive,effectArchive});
}
