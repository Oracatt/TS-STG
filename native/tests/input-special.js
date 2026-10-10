// SPECIAL (C key, 1024) is the highest public input bit; --input must deliver it unchanged.
globalThis.__tsstg_game = {
  update(mask) { if (mask !== (1024 | 16)) throw new Error('Special input mask mismatch'); },
  render() { return [['clear', 0x000000ff]]; }
};
