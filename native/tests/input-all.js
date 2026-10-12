// The inclusive native override boundary must preserve every public input bit.
globalThis.__tsstg_game = {
  update(mask) { if (mask !== 4095) throw new Error('Full public input mask mismatch'); },
  render() { return [['clear', 0x000000ff]]; }
};
