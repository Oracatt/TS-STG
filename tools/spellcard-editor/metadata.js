/** Editor rehearsal settings. Attack behavior belongs entirely to authored JS. */
export function createSpellMetadata(){
  return{id:'new-spellcard',name:'新符卡',duration:1800,hp:3000,seed:1,boss:{x:0,y:96}};
}

const fail=(path,message)=>{throw new TypeError(`${path}: ${message}`);};
function object(value,path,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))
    fail(path,'expected a plain data object');
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!fields.includes(key))fail(`${path}.${String(key)}`,'unknown field');
    if(!('value' in Object.getOwnPropertyDescriptor(value,key)))fail(`${path}.${key}`,'accessors are not data');
  }
}
function number(value,path,min=-Infinity,max=Infinity){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(path,`expected a finite number in ${min}..${max}`);
  return value;
}
function integer(value,path,min,max){
  if(!Number.isSafeInteger(value)||value<min||value>max)fail(path,`expected an integer in ${min}..${max}`);
  return value;
}
function string(value,path){
  if(typeof value!=='string'||!value.trim())fail(path,'expected a nonempty string');
  return value;
}

/** Copy validated metadata without evaluating getters or accepting event data. */
export function validateSpellMetadata(value){
  object(value,'spellCard',['id','name','duration','hp','seed','boss']);
  object(value.boss,'spellCard.boss',['x','y']);
  return{id:string(value.id,'spellCard.id'),name:string(value.name,'spellCard.name'),
    duration:integer(value.duration,'spellCard.duration',1,36000),hp:number(value.hp,'spellCard.hp',Number.MIN_VALUE),
    seed:integer(value.seed,'spellCard.seed',0,0xffffffff),
    boss:{x:number(value.boss.x,'spellCard.boss.x'),y:number(value.boss.y,'spellCard.boss.y')}};
}
