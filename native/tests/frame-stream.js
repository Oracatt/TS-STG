let frames = 0;
globalThis.__tsstg_game = {
  update(mask) { if (mask !== 0) throw new Error('Frame stream must not read native keyboard input'); frames++; },
  render() { return [
    ['clear', 0x00000000],
    ['rect', 4, 0, 476, 360, 0xff0000ff],
    ['rect', 480, 0, 480, 360, 0x00ff00ff],
    ['rect', 0, 360, 480, 360, 0x0000ffff],
    ['rect', 480, 360, 480, 360, 0xffffffff],
  ]; },
  snapshot() { return {frames}; },
};
