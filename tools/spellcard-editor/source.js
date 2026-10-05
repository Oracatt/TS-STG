import {validateTouhouSpellCard} from '@ts-stg/thlib/touhou';

export const VISUAL_BLOCK_START='// @spellcard-editor:begin';
export const VISUAL_BLOCK_END='// @spellcard-editor:end';
const MAX_SOURCE_BYTES=1024*1024;

/** Source is text until the native script runtime loads the user's module.
 * This module never evaluates source, including the visual metadata region. */
export function validateSpellSource(source){
  if(typeof source!=='string')throw new TypeError('Spell source must be JavaScript text');
  if(source.length>MAX_SOURCE_BYTES)throw new RangeError('Spell source exceeds 1 MiB');
  let bytes=0;
  for(const character of source){
    const point=character.codePointAt(0);
    bytes+=point<=0x7f?1:point<=0x7ff?2:point<=0xffff?3:4;
    if(bytes>MAX_SOURCE_BYTES)throw new RangeError('Spell source exceeds 1 MiB');
  }
  return source;
}

// Locate real, top-level line comments without executing source. This is a
// conservative lexical reader, not an AST or a JavaScript round-trip compiler.
// Incomplete/ambiguous syntax is source-only rather than risking a rewrite.
function markers(source){
  const found=[];
  const identifierStart=/[A-Za-z_$\u0080-\uffff]/,identifierPart=/[\w$\u0080-\uffff]/;
  function quoted(start,quote){
    for(let i=start+1;i<source.length;i++){
      if(source[i]==='\\'){i++;continue;}
      if(source[i]===quote)return i+1;
      if(source[i]==='\n'||source[i]==='\r')break;
    }
    throw new SyntaxError('Incomplete source string');
  }
  function regex(start){
    let bracket=false;
    for(let i=start+1;i<source.length;i++){
      const ch=source[i];
      if(ch==='\\'){i++;continue;}
      if(ch==='\n'||ch==='\r')break;
      if(ch==='[')bracket=true;
      else if(ch===']')bracket=false;
      else if(ch==='/'&&!bracket){while(identifierPart.test(source[i+1]??''))i++;return i+1;}
    }
    throw new SyntaxError('Incomplete or ambiguous source regular expression');
  }
  function template(start){
    for(let i=start+1;i<source.length;i++){
      if(source[i]==='\\'){i++;continue;}
      if(source[i]==='`')return i+1;
      if(source[i]==='$'&&source[i+1]==='{')i=code(i+2,true)-1;
    }
    throw new SyntaxError('Incomplete source template');
  }
  function code(start,interpolation=false){
    const stack=[];let expression=true,lastWord='';
    for(let i=start;i<source.length;){
      const ch=source[i],next=source[i+1];
      if(/\s/.test(ch)){i++;continue;}
      if(ch==='/'&&next==='/'){
        const end=source.indexOf('\n',i),stop=end<0?source.length:end,lineStart=source.lastIndexOf('\n',i-1)+1;
        const content=source.slice(i,stop).trimEnd();
        if(!interpolation&&!stack.length&&/^[\t ]*$/.test(source.slice(lineStart,i))&&
          (content===VISUAL_BLOCK_START||content===VISUAL_BLOCK_END))
          found.push({kind:content,start:lineStart,end:stop,newline:source[stop-1]==='\r'?'\r\n':'\n'});
        i=stop;continue;
      }
      if(ch==='/'&&next==='*'){
        const end=source.indexOf('*/',i+2);
        if(end<0)throw new SyntaxError('Incomplete source comment');
        i=end+2;continue;
      }
      if(ch==='"'||ch==="'"){i=quoted(i,ch);expression=false;lastWord='';continue;}
      if(ch==='`'){i=template(i);expression=false;lastWord='';continue;}
      if(ch==='/'){
        if(expression){i=regex(i);expression=false;}
        else{i+=next==='='?2:1;expression=true;}
        lastWord='';continue;
      }
      if(identifierStart.test(ch)){
        const begin=i++;while(identifierPart.test(source[i]??''))i++;
        lastWord=source.slice(begin,i);
        expression=/^(return|throw|case|delete|void|typeof|new|in|of|instanceof|yield|await|else|do)$/.test(lastWord);
        continue;
      }
      if(/[0-9]/.test(ch)){
        i++;while(/[\w.]/.test(source[i]??''))i++;expression=false;lastWord='';continue;
      }
      if('([{'.includes(ch)){
        stack.push({ch,control:ch==='('&&/^(if|while|for|with|switch|catch)$/.test(lastWord)});
        i++;expression=true;lastWord='';continue;
      }
      if(')]}'.includes(ch)){
        if(ch==='}'&&interpolation&&!stack.length)return i+1;
        const open=stack.pop();
        if(!open||'([{'.indexOf(open.ch)!==')]}'.indexOf(ch))throw new SyntaxError('Unbalanced source delimiter');
        expression=ch==='}'||open.control;i++;lastWord='';continue;
      }
      // Postfix ++/-- can precede division. Other operators expect an operand.
      if((ch==='+'||ch==='-')&&ch===next){i+=2;lastWord='';continue;}
      expression=ch!=='.';lastWord='';i++;
    }
    if(interpolation||stack.length)throw new SyntaxError('Incomplete source delimiter');
    return source.length;
  }
  code(0);return found;
}

function visualRegion(source){
  validateSpellSource(source);
  const all=markers(source);
  const starts=all.filter(marker=>marker.kind===VISUAL_BLOCK_START);
  const ends=all.filter(marker=>marker.kind===VISUAL_BLOCK_END);
  if(starts.length!==1||ends.length!==1)throw new SyntaxError('Expected exactly one visual metadata block');
  const start=starts[0],end=ends[0];
  const bodyStart=start.end+1;
  if(bodyStart>=end.start)throw new SyntaxError('Visual metadata block markers are out of order');
  const body=source.slice(bodyStart,end.start);
  const declaration=/^\s*export\s+const\s+spellCard\s*=\s*([\s\S]*?)\s*;\s*$/.exec(body);
  if(!declaration)throw new SyntaxError('Visual metadata must export a spellCard JSON literal');
  let value;
  try{value=JSON.parse(declaration[1]);}
  catch{throw new SyntaxError('Visual metadata is custom JavaScript; edit it in the source view');}
  return{start:bodyStart,end:end.start,newline:start.newline,document:validateTouhouSpellCard(value)};
}

/** null means source-only editing. It never means that the source is invalid JS. */
export function readVisualDocument(source){
  try{return visualRegion(source).document;}
  catch{return null;}
}

function declaration(document,newline='\n'){
  return`export const spellCard = ${JSON.stringify(validateTouhouSpellCard(document),null,2)};\n`.replace(/\n/g,newline);
}

/** Replace only a readable managed literal. Imports, custom update functions
 * and all text outside the marker lines are preserved byte for byte. */
export function replaceVisualDocument(source,document){
  const region=visualRegion(source);
  return validateSpellSource(source.slice(0,region.start)+declaration(document,region.newline)+source.slice(region.end));
}

/** The saved artifact is a regular ESM module that depends only on thlib. */
export function generateSpellSource(document){
  return validateSpellSource(`import {TouhouSpellCardTimeline} from '@ts-stg/thlib/touhou';

// The visual editor maintains only this JSON literal. All other code is yours.
${VISUAL_BLOCK_START}
${declaration(document)}${VISUAL_BLOCK_END}

export function createSpell(context) {
  const timeline = new TouhouSpellCardTimeline(spellCard, context);

  return {
    get frame() { return timeline.frame; },
    get alive() { return timeline.alive; },
    get completed() { return timeline.completed; },

    update() {
      if (!timeline.alive) return;
      const frame = timeline.frame;

      // Add ordinary JavaScript here: loops, functions and your own state.
      // Example: emit a second ring every 60 frames before the visual events.
      // if (frame % 60 === 0) {
      //   context.bullets.emit({
      //     x: context.boss.x, y: context.boss.y, type: 0, color: 6,
      //     pattern: 3, count: 12, rows: 1, speed: 2,
      //     angle: context.random.unit() * Math.PI * 2,
      //   });
      // }

      timeline.update();
    },
    stop() { timeline.stop(); },
    snapshot() { return timeline.snapshot(); },
  };
}
`);
}
