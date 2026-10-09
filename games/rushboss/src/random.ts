

// Port of TouhouRushBoss src/Rand.cpp (GPL-3.0), standard mt19937 stream.
// The game's inclusive integer sampler differs from thlib's generic RNG.
const f = Math.fround;
export class RushRandom {
 words:Uint32Array;index:number;calls:number;seed?:number;
  constructor(seed = 0) {
    this.words = new Uint32Array(624); this.words[0] = seed >>> 0;
    for (let i = 1; i < 624; i++) this.words[i] = (Math.imul(1812433253, this.words[i - 1] ^ (this.words[i - 1] >>> 30)) + i) >>> 0;
    this.index = 624; this.calls = 0;
  }
  nextUint() {
    if (this.index >= 624) {
      for (let i = 0; i < 624; i++) {
        const x = (this.words[i] & 0x80000000) | (this.words[(i + 1) % 624] & 0x7fffffff);
        this.words[i] = this.words[(i + 397) % 624] ^ (x >>> 1) ^ ((x & 1) ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = this.words[this.index++];
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    this.calls++; return y >>> 0;
  }
  float(min: number, max: number) { min=f(min);max=f(max);return f(f(f(f(this.nextUint()) / 4294967296) * f(max - min)) + min); }
  int(min: number, max: number) {
    const range = max - min + 1, mask = 0xffffffff;
    if (range === 4294967296) return (this.nextUint() + min) | 0;
    let value;
    do { value = this.nextUint(); } while (Math.floor(value / range) >= Math.floor(mask / range) && mask % range !== range - 1);
    return min + value % range;
  }
  snapshot() { return { calls: this.calls, index: this.index, words: Array.from(this.words) }; }
}
