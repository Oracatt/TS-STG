import {TouhouRandom} from './bullet-patterns.js';
import {f32,sub,atan2,PI,div} from './math.js';

/** Editable, portable data. Every event uses the same fixed 60 Hz frame clock. */
export function createTouhouSpellCard(){
  return{format:'ts-stg-spellcard',version:1,id:'new-spellcard',name:'新符卡',duration:1800,hp:3000,seed:1,
    boss:{x:0,y:96},events:[
      {id:'charge-1',type:'charge',frame:0,enabled:true,x:0,y:0,origin:'boss',color:'magenta',releaseColor:'white',
        releaseFrame:60,release:true,sound:54,releaseSound:6},
      {id:'bullet-1',type:'bullet',frame:60,enabled:true,duration:1740,interval:30,x:0,y:0,origin:'boss',
        bulletType:0,color:2,pattern:3,count:24,rows:1,speed:2,speedStep:0,angle:0,angleStep:0,rotation:.12},
    ]};
}

const colors=['magenta','red','blue','cyan','green','yellow','white'];
const baseFields=['id','type','frame','enabled'];
const positionFields=['x','y','origin'];
const eventFields={
  bullet:[...positionFields,'duration','interval','bulletType','color','pattern','count','rows','speed','speedStep','angle','angleStep','rotation'],
  laser:[...positionFields,'duration','interval','kind','color','angle','rotation','speed','width','length','delay','grow','sustain','shrink'],
  move:['duration','x','y','easing'],
  charge:[...positionFields,'color','releaseColor','releaseFrame','release','sound','releaseSound'],
  sound:['sound'],clear:[],
};
const fail=(path,message)=>{throw new TypeError(`${path}: ${message}`);};
function object(value,path,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))
    fail(path,'expected a plain data object');
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!fields.includes(key))fail(`${path}.${String(key)}`,'unknown field');
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!('value' in descriptor))fail(`${path}.${key}`,'accessors are not data');
  }
  return value;
}
function number(value,path,min=-Infinity,max=Infinity){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(path,`expected a finite number in ${min}..${max}`);
  return value;
}
function integer(value,path,min,max=Number.MAX_SAFE_INTEGER){
  if(!Number.isSafeInteger(value)||value<min||value>max)fail(path,`expected an integer in ${min}..${max}`);
  return value;
}
function string(value,path){if(typeof value!=='string'||!value.trim())fail(path,'expected a nonempty string');return value;}
function choice(value,path,values){if(!values.includes(value))fail(path,`expected one of ${values.join(', ')}`);return value;}
function boolean(value,path){if(typeof value!=='boolean')fail(path,'expected a boolean');return value;}
const sound=(value,path)=>value===null?null:integer(value,path,0,89);
function position(event,path){return{x:number(event.x,`${path}.x`),y:number(event.y,`${path}.y`),origin:choice(event.origin,`${path}.origin`,['boss','world'])};}
function window(event,path,duration){
  const length=integer(event.duration,`${path}.duration`,1,36000);
  if(event.frame+length>duration)fail(`${path}.duration`,'event extends beyond document.duration');
  return length;
}
function normalizedEvent(value,index,duration){
  const path=`document.events[${index}]`;
  object(value,path,[...baseFields,...Object.values(eventFields).flat()]);
  const type=choice(value.type,`${path}.type`,Object.keys(eventFields));
  object(value,path,[...baseFields,...eventFields[type]]);
  const event={id:string(value.id,`${path}.id`),type,frame:integer(value.frame,`${path}.frame`,0,duration-1),
    enabled:value.enabled===undefined?true:boolean(value.enabled,`${path}.enabled`)};
  if(type==='bullet'||type==='laser'){
    Object.assign(event,position(value,path),{duration:window(value,path,duration),interval:integer(value.interval,`${path}.interval`,1),
      color:integer(value.color,`${path}.color`,0,15),angle:number(value.angle,`${path}.angle`),rotation:number(value.rotation,`${path}.rotation`)});
    if(type==='bullet'){
      Object.assign(event,{bulletType:integer(value.bulletType,`${path}.bulletType`,0,49),pattern:integer(value.pattern,`${path}.pattern`,0,12),
        count:integer(value.count,`${path}.count`,1,2048),rows:integer(value.rows,`${path}.rows`,1,2048),
        speed:number(value.speed,`${path}.speed`),speedStep:number(value.speedStep,`${path}.speedStep`),angleStep:number(value.angleStep,`${path}.angleStep`)});
      if(event.count*event.rows>2048)fail(`${path}.count`,'count * rows exceeds 2048 projectiles per emission');
    }else{
      Object.assign(event,{kind:choice(value.kind,`${path}.kind`,['straight','infinite']),speed:number(value.speed,`${path}.speed`),
        width:number(value.width,`${path}.width`,0),length:number(value.length,`${path}.length`,0)});
      for(const key of ['delay','grow','sustain','shrink'])event[key]=integer(value[key],`${path}.${key}`,0,36000);
    }
  }else if(type==='move'){
    Object.assign(event,{duration:window(value,path,duration),x:number(value.x,`${path}.x`),y:number(value.y,`${path}.y`),
      easing:choice(value.easing,`${path}.easing`,['linear','smooth'])});
  }else if(type==='charge'){
    Object.assign(event,position(value,path),{color:choice(value.color,`${path}.color`,colors),releaseColor:choice(value.releaseColor,`${path}.releaseColor`,colors),
      releaseFrame:integer(value.releaseFrame,`${path}.releaseFrame`,0,duration-1-event.frame),release:boolean(value.release,`${path}.release`),
      sound:sound(value.sound===undefined?54:value.sound,`${path}.sound`),releaseSound:sound(value.releaseSound===undefined?6:value.releaseSound,`${path}.releaseSound`)});
  }else if(type==='sound')event.sound=integer(value.sound,`${path}.sound`,0,89);
  return event;
}

/** Data only: reject unknown versions, event kinds and fields instead of
 * silently changing an imported document's meaning. No scripts are evaluated. */
export function validateTouhouSpellCard(value){
  object(value,'document',['format','version','id','name','duration','hp','seed','boss','events']);
  choice(value.format,'document.format',['ts-stg-spellcard']);
  integer(value.version,'document.version',1,1);
  const duration=integer(value.duration,'document.duration',1,36000);
  object(value.boss,'document.boss',['x','y']);
  if(!Array.isArray(value.events)||value.events.length>256)fail('document.events','expected an array of at most 256 events');
  const document={format:'ts-stg-spellcard',version:1,id:string(value.id,'document.id'),name:string(value.name,'document.name'),duration,
    hp:number(value.hp,'document.hp',Number.MIN_VALUE),seed:integer(value.seed,'document.seed',0,0xffffffff),
    boss:{x:number(value.boss.x,'document.boss.x'),y:number(value.boss.y,'document.boss.y')},
    events:Array.from(value.events,(event,index)=>normalizedEvent(event,index,duration))};
  const ids=new Set(),moves=[],emissions=new Uint32Array(duration);
  for(let index=0;index<document.events.length;index++){
    const event=document.events[index],path=`document.events[${index}]`;
    if(ids.has(event.id))fail(`${path}.id`,'duplicate event id');ids.add(event.id);
    if(!event.enabled)continue;
    if(event.type==='move'){
      if(moves.some(previous=>event.frame<previous.frame+previous.duration&&previous.frame<event.frame+event.duration))
        fail(`${path}.frame`,'enabled move events overlap');
      moves.push(event);
    }else if(event.type==='bullet'||event.type==='laser'){
      const count=event.type==='bullet'?event.count*event.rows:1;
      for(let frame=event.frame;frame<event.frame+event.duration;frame+=event.interval){
        emissions[frame]+=count;
        if(emissions[frame]>8192)fail(path,`emission budget exceeds 8192 projectiles at frame ${frame}`);
      }
    }
  }
  return document;
}
export function parseTouhouSpellCard(jsonText){
  if(typeof jsonText!=='string')fail('document','expected JSON text');
  let value;
  try{value=JSON.parse(jsonText);}catch(error){throw new SyntaxError(`document: invalid JSON (${error.message})`);}
  return validateTouhouSpellCard(value);
}
export function serializeTouhouSpellCard(document){return`${JSON.stringify(validateTouhouSpellCard(document),null,2)}\n`;}

function freezeData(value){
  if(value&&typeof value==='object'){for(const item of Object.values(value))freezeData(item);Object.freeze(value);}
  return value;
}
function point(value,path){
  if(!value||typeof value!=='object')fail(path,'expected a position');
  return{x:number(value.x,`${path}.x`),y:number(value.y,`${path}.y`)};
}
function required(owner,method,path){if(typeof owner?.[method]!=='function')fail(path,`context requires ${method}()`);}

/** Executes authored actions only. The game owns entity updates, combat start,
 * spell settlement, cancellation policy and the render/audio frame. */
export class TouhouSpellCardTimeline {
  constructor(document,context){
    this.document=freezeData(validateTouhouSpellCard(document));
    point(context?.boss,'context.boss');if(context.player!==undefined)point(context.player,'context.player');
    for(const key of ['onComplete','onEvent'])if(context[key]!==undefined&&typeof context[key]!=='function')fail(`context.${key}`,'expected a function');
    this.context=context;this.frame=0;this.alive=true;this.completed=false;
    this.random=new TouhouRandom(this.document.seed);this._clockFrame=0;this._stopped=false;this._charges=[];this._moves=new Map();
  }
  update(){
    if(!this.alive)return this;
    this._clockFrame=this.frame;
    try{
      for(let index=0;index<this.document.events.length&&this.alive;index++){
        const event=this.document.events[index];if(!event.enabled)continue;
        const age=this.frame-event.frame;
        if(age<0)continue;
        const due=event.type==='bullet'||event.type==='laser'?age<event.duration&&age%event.interval===0:
          event.type==='move'?age<event.duration:event.type==='charge'?age===0||event.release&&age===event.releaseFrame:age===0;
        if(!due)continue;
        this.context.onEvent?.(event,this.frame);if(!this.alive)break;
        this._execute(event,age,`document.events[${index}]`);
      }
      this.frame++;
      if(this.alive&&this.frame>=this.document.duration){
        this.completed=true;this.alive=false;this.context.onComplete?.(this);
      }
    }catch(error){this.stop();throw error;}
    return this;
  }
  stop(){
    if(this._stopped)return;this._stopped=true;this.alive=false;
    for(const charge of this._charges)charge.stop();this._charges.length=0;this._moves.clear();
  }
  snapshot(){return{frame:this.frame,alive:this.alive,completed:this.completed,documentId:this.document.id};}
  _position(event){
    if(event.origin==='world')return{x:event.x,y:event.y};
    const boss=point(this.context.boss,'context.boss');return{x:boss.x+event.x,y:boss.y+event.y};
  }
  _execute(event,age,path){
    const context=this.context;
    if(event.type==='bullet'){
      required(context.bullets,'emit',path);const position=this._position(event),player=context.player?point(context.player,'context.player'):null;
      const dx=player?sub(player.x,position.x):0,dy=player?sub(player.y,position.y):0;
      context.bullets.emit({...position,type:event.bulletType,color:event.color,pattern:event.pattern,count:event.count,rows:event.rows,
        speed:event.speed,speedStep:event.speedStep,angle:event.angle+event.rotation*(age/event.interval),angleStep:event.angleStep,
        playerAngle:dx===0&&dy===0?div(PI,2):atan2(dy,dx)},{random:this.random});
    }else if(event.type==='laser'){
      const method=event.kind==='straight'?'spawnStraight':'spawnInfinite';required(context.lasers,method,path);
      context.lasers[method]({...this._position(event),type:0,color:event.color,angle:event.angle+event.rotation*(age/event.interval),
        speed:event.speed,width:event.width,length:event.length,delay:event.delay,grow:event.grow,sustain:event.sustain,shrink:event.shrink});
    }else if(event.type==='move'){
      if(!this._moves.has(event.id))this._moves.set(event.id,point(context.boss,'context.boss'));
      const start=this._moves.get(event.id),progress=(age+1)/event.duration,t=event.easing==='smooth'?progress*progress*(3-2*progress):progress;
      context.boss.x=f32((1-t)*start.x+t*event.x);context.boss.y=f32((1-t)*start.y+t*event.y);
      if(age+1===event.duration)this._moves.delete(event.id);
    }else if(event.type==='charge'){
      if(age===0){
        required(context.presentation,'beginCharge',path);
        if(event.sound!==null||event.release&&event.releaseSound!==null)required(context,'sound',path);
        const owner=this,follow=event.origin==='boss'?{get x(){return owner._position(event).x;},get y(){return owner._position(event).y;}}:null;
        const charge=context.presentation.beginCharge({...this._position(event),color:event.color,releaseColor:event.releaseColor,
          releaseFrame:event.releaseFrame,release:event.release,follow,clock:()=>Math.max(0,this._clockFrame-event.frame)});
        required(charge,'stop',`${path}.charge`);this._charges.push(charge);
        if(event.sound!==null)context.sound(event.sound,this._position(event).x);
      }
      if(this.alive&&event.release&&age===event.releaseFrame&&event.releaseSound!==null)context.sound(event.releaseSound,this._position(event).x);
    }else if(event.type==='sound'){
      required(context,'sound',path);context.sound(event.sound,point(context.boss,'context.boss').x);
    }else if(event.type==='clear'){
      required(context,'clear',path);context.clear();
    }
  }
}
