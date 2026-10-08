/** Original common-player defaults. Consumers may select a different profile
 * without changing the restored presets or patching per-frame methods. */
export const TOUHOU_PLAYER_RULES = Object.freeze({
  initialPower:100, initialLives:2, initialBombs:2,
  maxPower:400, powerPerLevel:100, startingPower:100, minimumPower:100,
  maxLives:7, maxBombs:7, bombStockLimit:10, respawnBombs:2,
  lifeFragmentThreshold:3, bombFragmentThreshold:3, fragmentLimit:10,
  lifeExtendLimit:30, extraLifeExtendLimit:9,
  collectSpeed:5, collectRadius:30, attractRadius:70, collectLine:128,
  normalRadius:3, focusRadius:3,
  normalExtent:Object.freeze({x:1.5,y:1.5}), focusExtent:Object.freeze({x:1.5,y:1.5}),
  deathbombFrames:8, hitInvulnerability:6, deathInvulnerability:180, respawnInvulnerability:280,
  deathPowerLoss:Object.freeze([40,40,50,60,80]), deathDropCount:7,
  pointValueMinimum:10000, pointValueMaximum:1000000,
  // The recovered no-stone reference remains the compatibility default.
  // TOUHOU_POINT_VALUE_PROFILES.classic opts into portable point-value growth.
  pointValueGrazeStep:0, pointValueGrazeGain:0, pointItemDivisor:2,
});

export function resolveTouhouPlayerRules(...profiles){
  const overrides=Object.assign({},...profiles),rules={...TOUHOU_PLAYER_RULES,...overrides};
  for(const key of Object.keys(overrides))if(!(key in TOUHOU_PLAYER_RULES))throw new TypeError(`Unknown Touhou player rule ${key}`);
  const fractions=new Set(['collectSpeed','collectRadius','attractRadius','collectLine','normalRadius','focusRadius']);
  for(const [key,value]of Object.entries(rules)){
    if(key==='normalExtent'||key==='focusExtent'){
      if(!value||![value.x,value.y].every(v=>Number.isFinite(v)&&v>=0))throw new RangeError(`${key} must have finite nonnegative extents`);
      rules[key]=Object.freeze({...value});
    }else if(key==='deathPowerLoss'){
      if(!Array.isArray(value)||!value.length||!value.every(v=>Number.isSafeInteger(v)&&v>=0))throw new RangeError('deathPowerLoss must contain nonnegative integer losses');
      rules[key]=Object.freeze([...value]);
    }else if(!Number.isFinite(value)||(!fractions.has(key)&&!Number.isSafeInteger(value))||value<0&&key!=='collectLine'){
      throw new RangeError(`${key} must be a finite ${fractions.has(key)?'number':'nonnegative integer'}`);
    }
  }
  for(const key of ['maxPower','powerPerLevel','startingPower','lifeFragmentThreshold','bombFragmentThreshold','pointItemDivisor'])if(rules[key]===0)throw new RangeError(`${key} must be positive`);
  if(rules.minimumPower>rules.maxPower)rules.minimumPower=rules.maxPower;
  if(rules.pointValueMinimum>rules.pointValueMaximum)throw new RangeError('Invalid point value range');
  if(overrides.bombStockLimit===undefined)rules.bombStockLimit=Math.max(rules.bombStockLimit,rules.maxBombs,rules.respawnBombs);
  if(overrides.fragmentLimit===undefined)rules.fragmentLimit=Math.max(rules.fragmentLimit,rules.lifeFragmentThreshold,rules.bombFragmentThreshold);
  if(rules.bombStockLimit<rules.maxBombs||rules.bombStockLimit<rules.respawnBombs)throw new RangeError('bombStockLimit must cover maxBombs and respawnBombs');
  return Object.freeze(rules);
}
