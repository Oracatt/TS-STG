import { Th20EnemyDistortion, Th20StageDistortion } from '../../games/touhou20/src/distortion.js';
export function compareDistortion(records) {
  const buffer = new ArrayBuffer(4), floats = new Float32Array(buffer), words = new Uint32Array(buffer);
  const fromBits = b => { words[0] = b; return floats[0]; };
  const toBits = f => { floats[0] = f; return words[0]; };
  let values = 0;
  function equal(actual, expected, label) { values++; if ((actual >>> 0) !== (expected >>> 0)) throw new Error(`${label}: ${actual >>> 0} != ${expected >>> 0}`); }
  function vertex(actual, expected, label) {
    for (const [i, key] of ['x', 'y', 'z', 'rhw', 'color', 'u', 'v'].entries()) equal(key === 'color' ? actual[key] : toBits(actual[key]), expected[i], `${label}.${key}`);
  }
  for (const [index, record] of records.entries()) {
    const options = { ...record, phaseX: fromBits(record.phaseX), phaseY: fromBits(record.phaseY), currentRadius: fromBits(record.currentRadius), radius: fromBits(record.radius), mode: record.type };
    const effect = record.type === 0 ? new Th20EnemyDistortion(options) : new Th20StageDistortion(options);
    const center = Object.fromEntries(['x', 'y', 'z'].map((key, i) => [key, fromBits(record.center[i])]));
    for (let frame = 0; frame < record.frames; frame++) {
      if (record.type === 0) effect.update(center, fromBits(record.clock)); else effect.update(fromBits(record.clock));
    }
    equal(toBits(effect.phaseX), record.finalPhaseX, `${index}.phaseX`);
    equal(toBits(effect.phaseY), record.finalPhaseY, `${index}.phaseY`);
    if (record.type === 0) equal(toBits(effect.currentRadius), record.finalRadius, `${index}.radius`);
    effect.mesh.vertices.forEach((v, i) => vertex(v, record.vertices[i], `${index}.vertices[${i}]`));
    effect.mesh.strips.flat().forEach((v, i) => vertex(v, record.strips[i], `${index}.strips[${i}]`));
    effect.mesh.positions.forEach((p, i) => ['x', 'y', 'z'].forEach((key, j) => equal(toBits(p[key]), record.positions[i][j], `${index}.positions[${i}].${key}`)));
  }
  return { cases: records.length, comparedUint32Values: values, mismatches: 0 };
}
