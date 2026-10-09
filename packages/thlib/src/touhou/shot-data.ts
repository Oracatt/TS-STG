export interface TouhouShooter{offset:number;period:number;phase:number;damage:number;origin:{x:number;y:number};size:{x:number;y:number};angle:number;angularVelocity:number;speed:number;acceleration:number;oscillation:number;source:number;type:number;animation:number;sound:number;hitAnimation:number;field30:number;secondaryPeriod:number;secondaryPhase:number;lifetime:number;group:number;fields3c:number[];callbacks:number[];parameters:number[];}
export interface TouhouSht{format:'ts-stg-touhou-shots'|'ts-stg-th20-sht';version:number;bytes?:number;speeds:number[];maxPower:number;damageCaps:Array<{normal:number;focus:number;special:number}>;optionScripts:number[];fullPowerScripts:number[];offsets:Array<{normal:Array<Array<{x:number;y:number}>>;focus:Array<Array<{x:number;y:number}>>}>;patterns:TouhouShooter[][];source?:{file:string;sha256:string;selection?:string};character?:number;profile?:string;}
/** Validate the main, unfocused and focused weapon groups for every selected
 * power level. Binary game formats are imported by applications. */
export function validateTouhouShots(source: unknown): TouhouSht {
  const data = source as TouhouSht;
  if (!['ts-stg-touhou-shots', 'ts-stg-th20-sht'].includes(data?.format)) throw new TypeError('TouhouPlayer requires decoded Touhou shot data');
  if (!Array.isArray(data.speeds) || data.speeds.length !== 4 || !data.speeds.every(Number.isFinite)) throw new TypeError('Touhou shot data requires four finite movement speeds');
  const levels=data.maxPower??4;
  if(!Number.isSafeInteger(levels)||levels<0)throw new RangeError('SHT maxPower must be a nonnegative weapon level count');
  const count=3*(levels+1);
  if(!Array.isArray(data.patterns)||data.patterns.length<count)throw new TypeError(`Touhou shot data requires main/unfocused/focused patterns 0 through ${count-1}`);
  for(let index=0;index<count;index++)if(!Array.isArray(data.patterns[index]))throw new TypeError(`Missing SHT pattern ${index}`);
  if(!data.optionScripts?.length||!data.fullPowerScripts?.length)throw new TypeError('Touhou shot data requires option animation scripts');
  for(const mode of ['normal','focus'] as const){
    const offsets=data.offsets?.[0]?.[mode];
    if(!Array.isArray(offsets)||offsets.length<=levels)throw new TypeError(`SHT ${mode} offsets must cover levels 0 through ${levels}`);
    for(let level=0;level<=levels;level++){
      const positions=offsets[level];
      if(!Array.isArray(positions)||positions.length<level)throw new TypeError(`SHT ${mode} level ${level} requires ${level} option offsets`);
      for(let index=0;index<level;index++)if(!Number.isFinite(positions[index]?.x)||!Number.isFinite(positions[index]?.y))
        throw new TypeError(`SHT ${mode} level ${level} option ${index} requires finite x/y offsets`);
    }
  }
  return data;
}
