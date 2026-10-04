/** ANM v8 data decoder. Layout evidence: sprite_renderer/animation_file.hpp,
 * postload_entry.cpp; instruction layout: anm_vm.hpp. No Node/native dependencies. */
export function decodeAnm(source, name = 'unnamed') {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (offset, size) => { if (!Number.isSafeInteger(offset) || offset < 0 || size < 0 || offset + size > bytes.length) throw new Error(`${name}: truncated ANM at ${offset}`); };
  const u16 = offset => { need(offset, 2); return data.getUint16(offset, true); };
  const i16 = offset => { need(offset, 2); return data.getInt16(offset, true); };
  const u32 = offset => { need(offset, 4); return data.getUint32(offset, true); };
  const f32 = offset => { need(offset, 4); return data.getFloat32(offset, true); };
  const cstring = offset => { need(offset, 1); let text = ''; for (let i = offset; i < bytes.length; i++) { if (!bytes[i]) return text; text += String.fromCharCode(bytes[i]); } throw new Error(`${name}: unterminated texture name`); };
  const result = { format: 'touhou-anm-v8', name, byteLength: bytes.length, entries: [], sprites: [], scripts: [], opcodeCounts: {} };
  let base = 0;
  while (true) {
    need(base, 64);
    const version = u32(base), spriteCount = u16(base + 4), scriptCount = u16(base + 6);
    if (version !== 8) throw new Error(`${name}: unsupported ANM version ${version}`);
    const next = u32(base + 36), end = next ? base + next : bytes.length;
    if (end <= base + 64 || end > bytes.length) throw new Error(`${name}: invalid entry link at ${base}`);
    const entry = { index: result.entries.length, offset: base, length: end - base,
      name: cstring(base + u32(base + 16)), width: u16(base + 10), height: u16(base + 12),
      format: u16(base + 14), x: i16(base + 20), y: i16(base + 22),
      memoryPriority: u32(base + 24), lowResScale: bytes[base + 34], hasData: bytes[base + 32],
      originalWidth: u16(base + 40), originalHeight: u16(base + 42),
      spriteBase: result.sprites.length, scriptBase: result.scripts.length, spriteCount, scriptCount,
      texture: null,
    };
    need(base + 64, spriteCount * 4 + scriptCount * 8);
    for (let i = 0; i < spriteCount; i++) {
      const offset = base + u32(base + 64 + i * 4); need(offset, 40);
      if (offset + 40 > end) throw new Error(`${name}: sprite crosses entry boundary`);
      result.sprites.push({ index: result.sprites.length, entry: entry.index, storedId: u32(offset),
        x: f32(offset + 4), y: f32(offset + 8), width: f32(offset + 12), height: f32(offset + 16),
        pivotX: f32(offset + 20), pivotY: f32(offset + 24), scaleX: f32(offset + 28), scaleY: f32(offset + 32), rotation: f32(offset + 36) });
    }
    for (let i = 0; i < scriptCount; i++) {
      const table = base + 64 + spriteCount * 4 + i * 8;
      const offset = base + u32(table + 4), script = { index: result.scripts.length, entry: entry.index, storedId: u32(table), offset, instructions: [] };
      let cursor = offset, instructions = 0;
      while (true) {
        need(cursor, 8);
        if (cursor + 8 > end || ++instructions > 100000) throw new Error(`${name}: unterminated script ${script.index}`);
        const opcode = i16(cursor), size = u16(cursor + 2), time = i16(cursor + 4), mask = u16(cursor + 6);
        if (opcode === -1 && size === 0) { script.instructions.push({ offset: cursor - offset, opcode, size: 0, time, mask, args: [] }); break; }
        if (size < 8 || size % 4 !== 0 || cursor + size > end) throw new Error(`${name}: invalid instruction size ${size} at ${cursor}`);
        const args = [];
        for (let parameter = cursor + 8; parameter < cursor + size; parameter += 4) args.push(u32(parameter));
        script.instructions.push({ offset: cursor - offset, opcode, size, time, mask, args });
        result.opcodeCounts[opcode] = (result.opcodeCounts[opcode] ?? 0) + 1;
        cursor += size;
      }
      result.scripts.push(script);
    }
    if (entry.hasData) {
      const textureOffset = base + u32(base + 28); need(textureOffset, 16);
      if (String.fromCharCode(...bytes.subarray(textureOffset, textureOffset + 4)) !== 'THTX') throw new Error(`${name}: missing THTX signature`);
      const length = u32(textureOffset + 12), offset = textureOffset + 16; need(offset, length);
      if (offset + length > end) throw new Error(`${name}: texture crosses entry boundary`);
      const png = bytes[offset] === 137 && bytes[offset + 1] === 80 && bytes[offset + 2] === 78 && bytes[offset + 3] === 71;
      const jpeg = bytes[offset] === 255 && bytes[offset + 1] === 216;
      entry.texture = { kind: png ? 'png' : jpeg ? 'jpeg' : 'unknown', offset, length,
        format: u16(textureOffset + 6), width: u16(textureOffset + 8), height: u16(textureOffset + 10) };
    } else entry.texture = { kind: entry.name.startsWith('@R') ? 'renderTarget' : entry.name.startsWith('@') ? 'dynamic' : 'external' };
    result.entries.push(entry);
    if (!next) break;
    base = end;
  }
  return result;
}

export { AnmBank, AnmInstance, UnsupportedAnmError, SUPPORTED_ANM_OPCODES } from './anm-vm.js';
