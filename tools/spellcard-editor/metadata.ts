export interface SpellMetadata {
  id: string; name: string; duration: number; hp: number; seed: number;
  boss: {x: number; y: number};
}

/** Editor rehearsal settings. Attack behavior belongs entirely to authored code. */
export function createSpellMetadata(){
  return{id:'new-spellcard',name:'新符卡',duration:1800,hp:3000,seed:1,boss:{x:0,y:96}};
}

const fail: (path: string, message: string) => never = (path,message)=>{throw new TypeError(`${path}: ${message}`);};
function object(value: unknown,path: string,fields: string[]): asserts value is Record<string, unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))
    fail(path,'expected a plain data object');
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!fields.includes(key))fail(`${path}.${String(key)}`,'unknown field');
    if(!('value' in Object.getOwnPropertyDescriptor(value,key)!))fail(`${path}.${key}`,'accessors are not data');
  }
}
function number(value: unknown,path: string,min=-Infinity,max=Infinity): number{
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(path,`expected a finite number in ${min}..${max}`);
  return value;
}
function integer(value: unknown,path: string,min: number,max: number): number{
  if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)fail(path,`expected an integer in ${min}..${max}`);
  return value as number;
}
function string(value: unknown,path: string): string{
  if(typeof value!=='string'||!value.trim())fail(path,'expected a nonempty string');
  return value;
}

/** Copy validated metadata without evaluating getters or accepting event data. */
export function validateSpellMetadata(value: unknown): SpellMetadata{
  object(value,'spellCard',['id','name','duration','hp','seed','boss']);
  object(value.boss,'spellCard.boss',['x','y']);
  return{id:string(value.id,'spellCard.id'),name:string(value.name,'spellCard.name'),
    duration:integer(value.duration,'spellCard.duration',1,36000),hp:number(value.hp,'spellCard.hp',Number.MIN_VALUE),
    seed:integer(value.seed,'spellCard.seed',0,0xffffffff),
    boss:{x:number(value.boss.x,'spellCard.boss.x'),y:number(value.boss.y,'spellCard.boss.y')}};
}
