
export const Keys: Readonly<{ LEFT: 1; RIGHT: 2; UP: 4; DOWN: 8; SHOOT: 16; BOMB: 32; FOCUS: 64; PAUSE: 128; CONFIRM: 256; CANCEL: 512 }> = Object.freeze({
  LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, SHOOT: 16, BOMB: 32,
  FOCUS: 64, PAUSE: 128, CONFIRM: 256, CANCEL: 512,
});

export class Input {

  declare mask: number;
  declare previous: number;

  constructor() { this.mask = 0; this.previous = 0; }
  update(mask: number = 0): this { this.previous = this.mask; this.mask = mask >>> 0; return this; }
  down(key: number): boolean { return (this.mask & key) !== 0; }
  pressed(key: number): boolean { return (this.mask & ~this.previous & key) !== 0; }
  released(key: number): boolean { return (~this.mask & this.previous & key) !== 0; }
  reset(): void { this.mask = this.previous = 0; }
  axis(negative: number, positive: number): number { return Number(this.down(positive)) - Number(this.down(negative)); }
}
