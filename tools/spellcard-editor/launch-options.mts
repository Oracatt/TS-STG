import path from 'node:path';

/** Parse desktop arguments only. The document opener validates the selected
 * file's extension, existence and size using the same rules as the file picker. */
export function parseLaunchOptions(args: string[],{cwd=process.cwd()}={}){
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string'))throw new TypeError('Editor launch arguments must be strings');
  let filePath: string|null=null,selfTest=false,positionalOnly=false;
  function selectFile(value: string){
    if(!value.trim())throw new Error('Expected a file path');
    if(filePath!==null)throw new Error('Only one startup file can be specified');
    filePath=path.resolve(cwd,value);
  }
  for(let index=0;index<args.length;index++){
    const argument=args[index];
    if(positionalOnly){selectFile(argument);continue;}
    if(argument==='--'){positionalOnly=true;continue;}
    if(argument==='--self-test'){selfTest=true;continue;}
    if(argument==='--file'){
      const value=args[index+1];
      if(value===undefined||value.startsWith('-')||!value.trim())throw new Error('--file requires a file path');
      selectFile(value);index++;continue;
    }
    if(argument.startsWith('-'))throw new Error(`Unknown editor option: ${argument}`);
    selectFile(argument);
  }
  return{filePath,selfTest};
}
