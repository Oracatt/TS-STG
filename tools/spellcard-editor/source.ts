import {createSpellMetadata} from './metadata.js';

const MAX_SOURCE_BYTES=1024*1024;

/** Bound text transport only. Incomplete TS/JS can still be saved; compilation
 * uses a separate preview copy and only the native script runtime executes it. */
export function validateSpellSource(source: unknown): string{
  if(typeof source!=='string')throw new TypeError('Spell source must be TypeScript or JavaScript text');
  if(source.length>MAX_SOURCE_BYTES)throw new RangeError('Spell source exceeds 1 MiB');
  let bytes=0;
  for(const character of source){
    const point=character.codePointAt(0)!;
    bytes+=point<=0x7f?1:point<=0x7ff?2:point<=0xffff?3:4;
    if(bytes>MAX_SOURCE_BYTES)throw new RangeError('Spell source exceeds 1 MiB');
  }
  return source;
}

/** Create a new JavaScript example. No document import or source rewriting. */
export function createSpellSource(){
  const metadata=createSpellMetadata();
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
