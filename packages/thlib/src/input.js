export const Keys = Object.freeze({
  LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, SHOOT: 16, BOMB: 32,
  FOCUS: 64, PAUSE: 128, CONFIRM: 256, CANCEL: 512,
});

export class Input {
  constructor() { this.mask = 0; this.previous = 0; }
  update(mask = 0) { this.previous = this.mask; this.mask = mask >>> 0; return this; }
  down(key) { return (this.mask & key) !== 0; }
  pressed(key) { return (this.mask & ~this.previous & key) !== 0; }
  released(key) { return (~this.mask & this.previous & key) !== 0; }
  reset() { this.mask = this.previous = 0; }
  axis(negative, positive) { return Number(this.down(positive)) - Number(this.down(negative)); }
}
