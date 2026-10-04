/** Parse the original TH20 0x5d4 SHT header and 0x78 shooter rows without relocating pointers. */
export function parseTh20Sht(source) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 0x5d4) throw new Error('Truncated TH20 SHT header');
  const count = view.getUint16(2, true);
  if (0x5d4 + count * 4 > bytes.length) throw new Error('Truncated TH20 SHT pattern table');
  const float = offset => view.getFloat32(offset, true), int = offset => view.getInt32(offset, true);
  const vec = offset => ({ x: float(offset), y: float(offset + 4) });
  const patterns = [];
  for (let pattern = 0; pattern < count; pattern++) {
    let offset = int(0x5d4 + pattern * 4); const records = [];
    if (offset < 0) { patterns.push([]); continue; }
    while (true) {
      if (offset < 0x5d4 || offset >= bytes.length) throw new Error(`SHT row outside resource: ${pattern}`);
      if (view.getInt8(offset) < 0) break;
      if (offset + 0x78 > bytes.length) throw new Error(`Truncated SHT row: ${pattern}`);
      records.push({ offset, period: view.getInt8(offset), phase: view.getInt8(offset + 1), damage: view.getInt16(offset + 2, true),
        origin: vec(offset + 4), size: vec(offset + 12), angle: float(offset + 20), angularVelocity: float(offset + 24),
        speed: float(offset + 28), acceleration: float(offset + 32), oscillation: float(offset + 36),
        source: view.getInt8(offset + 40), type: view.getInt8(offset + 41), animation: view.getInt16(offset + 42, true),
        sound: view.getInt16(offset + 44, true), hitAnimation: view.getInt16(offset + 46, true),
        field30: view.getUint16(offset + 48, true), secondaryPeriod: view.getInt8(offset + 50), secondaryPhase: view.getInt8(offset + 51),
        lifetime: int(offset + 52), group: int(offset + 56), fields3c: [int(offset + 60), int(offset + 64), int(offset + 68)],
        callbacks: [int(offset + 72), int(offset + 76), int(offset + 80), int(offset + 84)],
        parameters: Array.from({ length: 8 }, (_, i) => float(offset + 88 + i * 4)) });
      offset += 0x78;
      if (records.length > 255) throw new Error('TH20 shooter packed row index exceeds 8 bits');
    }
    patterns.push(records);
  }
  const offsets = [];
  for (let profile = 0; profile < 8; profile++) {
    const entry = { normal: [], focus: [] };
    for (let level = 0; level <= 4; level++) {
      for (const [name, starts] of [['normal', [0xd4, 0xd4, 0xdc, 0xec, 0x104]], ['focus', [0x124, 0x124, 0x12c, 0x13c, 0x154]]])
        entry[name][level] = Array.from({ length: Math.max(1, level) }, (_, index) => vec(profile * 0xa0 + starts[level] + index * 8));
    }
    offsets.push(entry);
  }
  return { format: 'ts-stg-th20-sht', version: 1, bytes: bytes.length,
    speeds: [float(16), float(20), float(24), float(28)], maxPower: int(32),
    damageCaps: Array.from({ length: 8 }, (_, i) => ({ normal: int(0x28 + i * 12), focus: int(0x2c + i * 12), special: int(0x30 + i * 12) })),
    optionScripts: Array.from({ length: 8 }, (_, i) => int(0x88 + i * 4)),
    fullPowerScripts: Array.from({ length: 8 }, (_, i) => int(0xa8 + i * 4)), offsets, patterns };
}
