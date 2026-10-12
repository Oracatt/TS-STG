// Both native script backends receive Ctrl independently of Shift and shooting.
// The keyboard maps either Ctrl key to 2048; this CLI fixture exercises the ABI.
globalThis.__tsstg_game = {
  update(mask) {
    if (mask !== (2048 | 64 | 16)) throw new Error('Control/focus/shoot input mask mismatch');
  },
  render() { return [['clear', 0x000000ff]]; }
};
