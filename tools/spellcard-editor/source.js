const MAX_SOURCE_BYTES=1024*1024;

/** Only bound the text transport. Incomplete JavaScript can still be saved;
 * the native script runtime owns syntax checking and execution. */
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

/** No editor-owned source regions: the returned module belongs to the author.
 * With a document, the caller has already validated a legacy JSON import. */
export function generateSpellSource(document){
  if(document!==undefined)return legacySource(document);
  const metadata={format:'ts-stg-spellcard',version:1,id:'new-spellcard',name:'新符卡',
    duration:1800,hp:3000,seed:1,boss:{x:0,y:96},events:[]};
  return validateSpellSource(`// A spell is ordinary JavaScript. Edit this module and apply it to preview.
export const spellCard = ${JSON.stringify(metadata,null,2)};

export function createSpell(context) {
  let frame = 0;
  let alive = true;
  const completed = () => frame >= spellCard.duration;

  function fireRing(angle) {
    context.bullets.emit({
      x: context.boss.x, y: context.boss.y,
      type: 0, color: 2, pattern: 3, count: 24, rows: 1,
      speed: 2, angle,
    });
  }

  return {
    get frame() { return frame; },
    get alive() { return alive; },
    get completed() { return completed(); },
    update() {
      if (!alive) return;
      if (frame >= 60 && frame % 30 === 0) {
        fireRing((frame - 60) / 30 * 0.12);
      }
      frame++;
      if (completed()) alive = false;
    },
    stop() { alive = false; },
    snapshot() { return {frame, alive, completed: completed(), documentId: spellCard.id}; },
  };
}
`);
}

function legacySource(document){
  if(!document||typeof document!=='object'||Array.isArray(document))throw new TypeError('Expected a validated spell card document');
  return validateSpellSource(`import {TouhouSpellCardTimeline} from '@ts-stg/thlib/touhou';

// Converted from a legacy JSON document. This entire file is editable.
export const spellCard = ${JSON.stringify(document,null,2)};

export function createSpell(context) {
  const timeline = new TouhouSpellCardTimeline(spellCard, context);

  return {
    get frame() { return timeline.frame; },
    get alive() { return timeline.alive; },
    get completed() { return timeline.completed; },
    update() {
      if (!timeline.alive) return;
      const frame = timeline.frame;
      // Add your own loops, functions and state here if needed.
      timeline.update();
    },
    stop() { timeline.stop(); },
    snapshot() { return timeline.snapshot(); },
  };
}
`);
}
