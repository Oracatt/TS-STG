import type {AnmDrawList as DrawList} from './anm.js';
import type {AnmQuadCache,AnmRootQuadCache,AnmUVCache} from './anm-render.js';
import type {TouhouProjectionCamera} from './anm-projection.js';
import type {AnmInstruction, AnmData, AnmEntry, AnmScript, AnmSprite, AnmView, AnmEnvironment, AnmCreateOptions, TouhouAnmAttachedEffect} from './anm.js';
import { f32, PI, add, sub, mul, div, sin, cos, wrapAngle, polar, rotate, trunc32, TouhouRNG } from './math.js';
import { AnmInterpolation } from './anm-interpolation.js';
import {effectiveAnmLayer,anmDrawPriority} from './render-order.js';
import {createTouhouAttachedEffect} from './converging-particles.js';

const bits = new DataView(new ArrayBuffer(4));
const asFloat = (value: number) => { bits.setUint32(0, value >>> 0, true); return bits.getFloat32(0, true); };
const asBits = (value: number) => { bits.setFloat32(0, value, true); return bits.getUint32(0, true); };
const rgba = (argb: number) => (((argb & 0xffffff) << 8) | (argb >>> 24)) >>> 0;
const argb = (color: number) => ((color >>> 8) | (color << 24)) >>> 0;
const identityView = Object.freeze({ x: 0, y: 0, scale: 1 });
// Typed views avoid a native DataView call for each aligned render field.
// The byte-backed public accessors keep their original offset semantics.
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const interpolationOrder = ['position','rgb','alpha','scale','scale2','uvScale','rotation','rotationZ','rgb2','alpha2','uvSpeedX','uvSpeedY'];
const supported = [-1, 0, 1, 2, 3, 4, 5, 6, 7,
  ...Array.from({ length: 32 }, (_, i) => 100 + i), ...Array.from({ length: 14 }, (_, i) => 200 + i),
  ...Array.from({ length: 20 }, (_, i) => 300 + i),
  ...Array.from({ length: 42 }, (_, i) => 400 + i).filter(op => ![418, 422, 439].includes(op)),
  500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510,
  600, 601, 602, 603, 604, 605, 606, 607, 608, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 628, 629, 630, 631, 632];
export const SUPPORTED_ANM_OPCODES = Object.freeze(supported);
const supportedSet = new Set(supported);
let registrationOrder = 0;

export class UnsupportedAnmError extends Error {
  name: string;

  constructor(instance: AnmInstance, feature: string) { super(`Unsupported ANM ${instance.bank.data.name}:${instance.scriptId} pc=${instance.pc} time=${instance.time}: ${feature}`); this.name = 'UnsupportedAnmError'; }
}

/** Owns decoded original data and explicitly supplied platform services. */
export class AnmBank {
  nextId: number;
  offsets: Map<number, number>[];
  templates: (AnmInstance | UnsupportedAnmError)[];
  disposed: boolean;

  data:AnmData;
  environment:AnmEnvironment;
  instances:AnmInstance[];
  scripts:AnmScript[];
  textures:Map<number,number>;
  rng:NonNullable<AnmEnvironment['rng']>;

  constructor(data: AnmData, environment: AnmEnvironment = {}) {
    if (!['touhou-anm-v8', 'th20-anm-v8'].includes(data?.format)) throw new TypeError('AnmBank requires decoded ANM v8 data');
    this.data = data; this.environment = { paddedTextures: true, ...environment }; this.rng = environment.rng ?? new TouhouRNG(1);
    this.textures = new Map(); this.instances = []; this.nextId = 1;
    this.scripts = data.scripts.map(script => ({ ...script, instructions: script.instructions.map(ins => ({ ...ins, args: ins.args.slice() })) }));
    this.offsets = this.scripts.map(script => new Map(script.instructions.map((ins, index) => [ins.offset, index])));
    // postload_file.cpp runs every template at -1 once, before any instance
    // installs a sprite-remapping callback. Keep unsupported dependencies
    // attached to that template, and fail explicitly if it is requested.
    this.templates = this.scripts.map((_,id) => {
      try { return new AnmInstance(this,id,{templateOnly:true}); }
      catch(error) { if(error instanceof UnsupportedAnmError)return error;throw error; }
    });
  }
  create(scriptId: number, options: AnmCreateOptions = {}): AnmInstance {
    if(this.disposed)throw new Error(`ANM bank ${this.data.name} has been disposed`);
    if (!Number.isInteger(scriptId) || !this.scripts[scriptId]) throw new RangeError(`Missing ANM script ${this.data.name}:${scriptId}`);
    if (this.scripts[scriptId].excluded) throw new RangeError(`Excluded ANM script ${this.data.name}:${scriptId}`);
    const instance = new AnmInstance(this, scriptId, options);
    instance.renderSecondary = options.secondary ?? this.environment.defaultSecondary ?? false;
    instance.renderFront = !!options.front;
    instance.renderOrder = ++registrationOrder * (instance.renderFront ? -1 : 1);
    this.instances.push(instance);
    return instance;
  }
  texture(entryIndex: number): number {
    if(this.disposed)throw new Error(`ANM bank ${this.data.name} has been disposed`);
    if (this.textures.has(entryIndex)) return this.textures.get(entryIndex)!;
    const entry = this.data.entries[entryIndex];
    const id = entry.texture.path ? this.environment.loadTexture?.(entry.texture.path, entry.width, entry.height) : this.environment.resolveTexture?.(entry, this);
    if (typeof id !== 'number') throw new Error(`ANM ${this.data.name}: texture ${entryIndex} (${entry.name}) requires a texture adapter`);
    this.textures.set(entryIndex, id); return id;
  }
  textureFor(sprite: number|AnmSprite): number { return this.texture((typeof sprite === 'number' ? this.data.sprites[sprite] : sprite).entry); }
  update(): void { const roots = this.instances.filter(vm => vm.alive && !vm.parent); for (const root of roots) root.update(); this.instances = this.instances.filter(vm => vm.alive); }
  /** For applications that advance actor-owned VMs directly, once per frame. */
  updateDetached(): void { const roots = this.instances.filter(vm => vm.alive && vm.detachedRoot); for (const root of roots) root.update(); }
  drawDetached(draw: DrawList, view: AnmView = identityView): void { for (const root of this.instances.filter(vm => vm.alive && vm.detachedRoot).sort((a,b) => a.layer-b.layer || a.id-b.id)) root.draw(draw, view); }
  collect(): number { this.instances = this.instances.filter(vm => vm.alive); for (const vm of this.instances) { if(vm.children.length)vm.children = vm.children.filter(child => child.alive); if(vm.detached.length)vm.detached = vm.detached.filter(child => child.alive); } return this.instances.length; }
  pruneDead(): number { return this.collect(); }
  dispose(): void {
    for(const vm of this.instances)vm.destroy();this.instances.length=0;
    for(const [entryIndex,id]of this.textures)if(this.data.entries[entryIndex].texture.path)this.environment.unloadTexture?.(id);
    this.textures.clear();this.disposed=true;
  }
  draw(draw: DrawList, view: AnmView = identityView): void {
    if(draw.enqueueAnm){for(const vm of this.instances)vm.drawSelf(draw,view);return;}
    const instances = this.instances.filter(vm => vm.alive).sort((a, b) => a.layer - b.layer || a.id - b.id);
    for (const vm of instances) vm.drawSelf(draw, view);
  }
  coverage(scriptId: number): number[] {
    const script = this.scripts[scriptId];
    if (!script) throw new RangeError(`Missing ANM script ${scriptId}`);
    return [...new Set(script.instructions.filter(ins => !supportedSet.has(ins.opcode)).map(ins => ins.opcode))];
  }
}

/** Byte-backed state retains the recovered field layout for trace comparison.
 * Source: sprite_renderer/anm_vm.cpp, binding.cpp, animation.cpp and quad.cpp. */
export class AnmInstance {
  renderFloats: Float32Array<ArrayBufferLike> | null;
  renderWords: Uint32Array<ArrayBufferLike> | null;
  renderBytes: Uint8Array<ArrayBufferLike>;
  spriteRemap: ((sprite: number, vm: AnmInstance) => number) | null;
  waitInstruction: AnmInstruction | null;
  interpolations: Map<string, {address:number;count:number;bytes?:boolean;integer?:boolean;rgb?:boolean;angle?:boolean;tangents?:[number[],number[]];value:AnmInterpolation}>;
  geometryCapacity:number;
  spriteColorCache?:number[];
  spritePositionCache?:{x:number;y:number;z:number};
  spriteQuadCache?:AnmQuadCache;
  spriteRootQuadCache?:AnmRootQuadCache;
  spriteUVCache?:AnmUVCache;

  bank:AnmBank;
  scriptId:number;
  id:number;
  renderOrder:number;
  renderSecondary:boolean;
  renderFront:boolean;
  alive:boolean;
  stopped:boolean;
  memory:DataView;
  parent:AnmInstance|null;
  transformParent:AnmInstance|null;
  children:AnmInstance[];
  detached:AnmInstance[];
  detachedRoot:boolean;
  pc:number;
  time:number;
  pendingInterrupt:number;
  returnTime:number;
  returnPc:number;
  attachedEffect?:TouhouAnmAttachedEffect;
  effectTrackedAge?:number;

  constructor(bank: AnmBank, scriptId: number, options: AnmCreateOptions & {templateOnly?:boolean} = {}) {
    this.bank = bank; this.scriptId = scriptId; this.id = options.templateOnly ? 0 : bank.nextId++;
    this.memory = new DataView(new ArrayBuffer(0x5e4)); this.alive = true; this.stopped = false;
    this.renderFloats = littleEndian ? new Float32Array(this.memory.buffer) : null;
    this.renderWords = littleEndian ? new Uint32Array(this.memory.buffer) : null;
    this.renderBytes = new Uint8Array(this.memory.buffer);
    this.parent = options.parent ?? null; this.transformParent = this.parent?.transformParent ?? this.parent; this.children = []; this.detached = []; this.detachedRoot = !!options.detached;
    this.spriteRemap = options.spriteRemap ?? null; this.interpolations = new Map();
    this.pc = 0; this.time = -1; this.pendingInterrupt = 0; this.returnTime = 0; this.returnPc = 0;
    for (const offset of [0x50, 0x54, 0x58, 0x5c, 0x68, 0x6c]) this.F(offset, 1);
    this.U(0x490, 0xffffffff); this.U(0x49c, 1); this.B(0x4a0, 2);
    this.F(0x478, 1); this.F(0x47c, PI); this.U(0x480, 65536);
    if(options.templateOnly){this.executeFrame();return;}
    const template=bank.templates[scriptId];if(template instanceof Error)throw template;
    new Uint8Array(this.memory.buffer,0,0x4c0).set(new Uint8Array(template.memory.buffer,0,0x4c0));
    this.pc=template.pc;this.time=0;this.stopped=template.stopped;
    for(const[key,track]of template.interpolations){const value=Object.assign(Object.create(AnmInterpolation.prototype),track.value) as AnmInterpolation;for(const p of['start','end','current','tangentStart','tangentEnd'] as const)value[p]=track.value[p].slice();this.interpolations.set(key,{...track,value});}
    if (this.parent) this.flag(0x1000000, this.parent.U(0x49c) & 0x1000000);
    this.x = options.x ?? 0; this.y = options.y ?? 0; this.z = options.z ?? 0;
    if (options.rotation !== undefined) this.rotation = options.rotation;
    // named_spawn installs this after template copy, before frame zero.
    // pool_spawn's attached child writes it before bind, so template copy
    // intentionally overwrites it there; detached spawns retain the flag.
    if(!this.parent)this.flag(0x40000,(options.secondary??bank.environment.defaultSecondary??false)?0x40000:0);
    if (options.beforeStart) options.beforeStart(this);
    this.executeFrame(); // Original named/child spawn executes frame zero immediately.
  }
  F(offset: number, value?: number): number { if (value !== undefined) this.memory.setFloat32(offset, value, true); return this.memory.getFloat32(offset, true); }
  U(offset: number, value?: number): number { if (value !== undefined) this.memory.setUint32(offset, value >>> 0, true); return this.memory.getUint32(offset, true); }
  B(offset: number, value?: number): number { if (value !== undefined) this.memory.setUint8(offset, value); return this.memory.getUint8(offset); }
  bit(offset: number, mask: number, value: number): void { this.B(offset, (this.B(offset) & ~mask) | (value & mask)); }
  flag(mask: number, value: number): void { this.U(0x49c, (this.U(0x49c) & ~mask) | (value & mask)); }
  get x(): number { return this.F(0x5bc); } set x(value: number) { this.F(0x5bc, value); }
  get y(): number { return this.F(0x5c0); } set y(value: number) { this.F(0x5c0, value); }
  get z(): number { return this.F(0x5c4); } set z(value: number) { this.F(0x5c4, value); }
  get effectiveLayer(): number { return (this.bank.environment.effectiveLayer ?? effectiveAnmLayer)(this.layer,this.renderSecondary); }
  get drawPriority(): number|undefined { const priorities = this.bank.environment.layerPriorities; return priorities ? priorities[this.effectiveLayer] : anmDrawPriority(this.layer,this.renderSecondary); }
  get rotation(): number { return this.F(0x40); } set rotation(value: number) { this.F(0x40, value); }
  get scaleX(): number { return this.F(0x50); } set scaleX(value: number) { this.F(0x50, value); }
  get scaleY(): number { return this.F(0x54); } set scaleY(value: number) { this.F(0x54, value); }
  get scale2X(): number { return this.F(0x58); } set scale2X(value: number) { this.F(0x58, value); }
  get scale2Y(): number { return this.F(0x5c); } set scale2Y(value: number) { this.F(0x5c, value); }
  get textureScaleX(): number { return this.F(0x68); } set textureScaleX(value: number) { this.F(0x68, value); }
  get textureScaleY(): number { return this.F(0x6c); } set textureScaleY(value: number) { this.F(0x6c, value); }
  get width(): number { return this.F(0x70); } set width(value: number) { this.F(0x70, value); }
  get height(): number { return this.F(0x74); } set height(value: number) { this.F(0x74, value); }
  get alpha(): number { return this.B(0x493); } set alpha(value: number) { this.B(0x493, value); }
  get color(): number { return rgba(this.U(0x490)); } set color(value: number) { this.U(0x490, argb(value)); }
  get secondaryColor(): number { return rgba(this.U(0x494)); } set secondaryColor(value: number) { this.U(0x494, argb(value)); }
  get flashColor(): number|null { return (this.U(0x4a0) & 0x1c00) === 0x400 ? this.U(0x494) : null; }
  set flashColor(value: number|null) { this.U(0x4a0, this.U(0x4a0) & ~0x1c00); if (value !== null && value !== undefined) { this.U(0x494, value); this.U(0x4a0, this.U(0x4a0) | 0x400); } }
  get spriteIndex(): number { return this.U(0x20) | 0; }
  get layer(): number { return this.U(0x14) | 0; } set layer(value: number) { this.setLayer(value); }
  get orientation(): number { return (this.U(0x4a0) >>> 21) & 7; } set orientation(value: number) { this.bit(0x4a2, 0xe0, value << 5); }
  get visible(): boolean { return !!(this.B(0x49a) & 1) && !!(this.U(0x49c) & 1); }
  set visible(value: boolean) { this.bit(0x49a, 1, value ? 1 : 0); }
  get renderType(): number { return this.B(0x498); }
  corners(): Array<{x:number;y:number;z:number}> { return anmSpriteVertices(this, { pixelSnap: false }).map(vertex => ({ x: vertex[0], y: vertex[1], z: this.worldPosition().z })); }
  setLayer(layer: number): void {
    this.U(0x14, layer); const mode = layer >= 3 && layer <= 19 ? 1 : layer >= 20 && layer <= 23 ? 2 : 0;
    this.U(0x4a0, (this.U(0x4a0) & ~0x03000000) | (mode << 24));
    if (((layer > 19 && layer < 37) || (layer > 44 && layer < 54)) && !(this.U(0x49c) & 0x800000)) this.B(0x4a4, 1);
  }
  setSprite(index: number, remap: boolean = false): this {
    if (remap && this.spriteRemap) index = this.spriteRemap(index, this);
    if (index < 0) {
      // Original uses TextRenderer sprite 0x120. Procedural shapes do not sample it.
      this.U(0x20, index); this.visible = true; return this;
    }
    const sprite = this.bank.data.sprites[index];
    if (!sprite) throw new RangeError(`Missing ANM sprite ${this.bank.data.name}:${index}`);
    if (sprite.excluded) throw new RangeError(`Excluded ANM sprite ${this.bank.data.name}:${index}`);
    this.U(0x20, index); this.width = sprite.width; this.height = sprite.height; this.visible = true;
    return this;
  }
  interrupt(label: number, recursive: boolean = false): this {
    this.attachedEffect?.interrupt?.(label|0);
    this.pendingInterrupt = label | 0;
    if (recursive) for (const child of this.children) child.interrupt(label, true);
    return this;
  }
  interruptNow(label: number, recursive: boolean = false): this {
    const addressed:AnmInstance[] = [], visit = (vm: AnmInstance) => { if (!vm.alive) return; addressed.push(vm); if (recursive) for (const child of vm.children) visit(child); };
    visit(this); for (const vm of addressed) { vm.interrupt(label); vm.executeFrame(); } return this;
  }
  destroy(): void { const wasAlive=this.alive;this.alive = false;if(wasAlive)this.attachedEffect?.retire?.(); for (const child of this.children) child.destroy(); }
  integerVariable(value: number) {
    if (value >= 10000 && value <= 10003) return this.U(0x444 + (value - 10000) * 4) | 0;
    if (value >= 10004 && value <= 10007) return trunc32(this.F(0x444 + (value - 10000) * 4));
    if (value === 10008 || value === 10009) return this.U(0x470 + (value - 10008) * 4) | 0;
    if (value === 10022) return this.randomBounded(this.U(0x480)) | 0;
    if (value === 10027 || value === 10028) return trunc32(this.F(0x478 + (value - 10027) * 4));
    if (value === 10029) return this.U(0x480) | 0;
    if (value >= 10033 && value <= 10035) return trunc32(this.F(0x464 + (value - 10033) * 4));
    return value;
  }
  randomNext() { return this.bank.rng.next(); }
  randomBounded(count: number) { return count ? this.randomNext() % count : 0; }
  randomUnit() { return div(f32(this.randomNext()), sub(f32(this.bank.rng.modulus ?? 0x7fffffff), 1)); }
  randomSigned() { if (this.bank.rng.signed) return this.bank.rng.signed(); throw new UnsupportedAnmError(this, 'RNG adapter requires signed()'); }
  floatVariable(value: number) {
    const v = trunc32(value);
    if (v >= 10000 && v <= 10003) return f32(this.U(0x444 + (v - 10000) * 4) | 0);
    if (v >= 10004 && v <= 10007) return this.F(0x444 + (v - 10000) * 4);
    if (v === 10008 || v === 10009) return f32(this.U(0x470 + (v - 10008) * 4) | 0);
    if (v === 10010 || v === 10030) return mul(this.randomSigned(), this.F(0x47c));
    if (v === 10011 || v === 10031) return mul(this.randomUnit(), this.F(0x478));
    if (v === 10012 || v === 10032) return mul(this.randomSigned(), this.F(0x478));
    if (v >= 10013 && v <= 10015) return this.F(0x2c + (v - 10013) * 4);
    if (v >= 10016 && v <= 10021) return f32(this.bank.environment.cameraComponent?.(v)??0);
    if (v === 10022) return f32(this.randomNext());
    if (v >= 10023 && v <= 10025) return this.F(0x38 + (v - 10023) * 4);
    if (v === 10026) return this.inheritedRotation();
    if (v === 10027 || v === 10028) return this.F(0x478 + (v - 10027) * 4);
    if (v === 10029) return f32(this.U(0x480) | 0);
    if (v >= 10033 && v <= 10035) return this.F(0x464 + (v - 10033) * 4);
    return value;
  }
  destination(ins: AnmInstruction, index: number, floating: boolean, value?: number) {
    let offset = null;
    if (ins.mask & (1 << (index & 31))) {
      const variable = floating ? trunc32(asFloat(ins.args[index])) : ins.args[index];
      if (!floating) {
        if (variable >= 10000 && variable <= 10003) offset = 0x444 + (variable - 10000) * 4;
        else if (variable === 10008 || variable === 10009) offset = 0x470 + (variable - 10008) * 4;
        else if (variable === 10029) offset = 0x480;
      } else {
        for (const [start, end, base] of [[10004, 10007, 0x454], [10013, 10015, 0x2c], [10023, 10025, 0x38], [10027, 10028, 0x478], [10033, 10035, 0x464]]) if (variable >= start && variable <= end) offset = base + (variable - start) * 4;
      }
    }
    if (offset !== null) return floating ? this.F(offset, value) : this.U(offset, value) | 0;
    if (value !== undefined) ins.args[index] = floating ? asBits(value) : value >>> 0;
    return floating ? asFloat(ins.args[index]) : ins.args[index] | 0;
  }
  interpolate(key: string, address: number, count: number, end: number[], duration: number, mode: number, options: {bytes?:boolean;integer?:boolean;rgb?:boolean;angle?:boolean;tangents?:[number[],number[]]} = {}): void {
    const start = Array.from({ length: count }, (_, i) => options.bytes ? this.B(address + i) : this.F(address + i * 4));
    this.interpolations.set(key, { address, count, ...options, value: new AnmInterpolation(start, end, duration, mode, options) });
  }
  dispatch(ins: AnmInstruction) {
    // A live wait instruction is revisited on every tick by idle bullets and
    // shots. Its operation has no operands; avoid five argument-reader
    // closures while retaining the original subtract/advance clock sequence.
    if(ins.opcode===3){this.time=sub(this.time,1);return 'wait';}
    const I = (i: number) => { if (i >= ins.args.length) throw new Error('ANM integer argument missing'); const value = ins.args[i] | 0; return ins.mask & (1 << (i & 31)) ? this.integerVariable(value) : value; };
    const F = (i: number) => { if (i >= ins.args.length) throw new Error('ANM float argument missing'); const value = asFloat(ins.args[i]); return ins.mask & (1 << (i & 31)) ? this.floatVariable(value) : value; };
    const D = (floating: boolean, index = 0, value?: number) => this.destination(ins, index, floating, value);
    const op = ins.opcode, args = ins.args;
    const jump = (index: number) => { this.time = args[index + 1] | 0; this.pc = args[index]; return 'jump'; };
    const vec = (address: number, count: number, arg = 0) => { for (let i = 0; i < count; i++) this.F(address + i * 4, F(arg + i)); };
    if (!supportedSet.has(op)) throw new UnsupportedAnmError(this, `opcode ${op}`);
    switch (op) {
      case -1: case 1: this.pc = 0xffffffff; this.visible = false; this.destroy(); return 'stop';
      case 0: case 5: break;
      case 2: this.pc = 0xffffffff; this.stopped = true; return 'stop';
      case 4: this.visible = false; // falls through to original wait
      case 3: this.time = sub(this.time, 1); return 'wait';
      case 6: this.time = add(this.time, f32(-I(0))); break;
      case 7: this.time = this.returnTime; this.pc = this.returnPc; return 'jump';
      case 100: D(false, 0, I(1)); break;
      case 101: D(true, 0, F(1)); break;
      case 102: case 104: case 106: case 108: case 110: {
        const v = I(1), u = D(false); if ((op === 108 || op === 110) && v === 0) throw new Error('ANM integer divide by zero');
        D(false, 0, op === 102 ? u + v : op === 104 ? u - v : op === 106 ? Math.imul(u, v) : op === 108 ? Math.trunc(u / v) : u % v); break;
      }
      case 103: case 105: case 107: case 109: case 111: { const v = F(1), u = D(true); D(true, 0, op === 103 ? add(u, v) : op === 105 ? sub(u, v) : op === 107 ? mul(u, v) : op === 109 ? div(u, v) : f32(u % v)); break; }
      case 112: case 114: case 116: case 118: case 120: { const u = I(1), v = I(2); if ((op === 118 || op === 120) && v === 0) throw new Error('ANM integer divide by zero'); D(false, 0, op === 112 ? u + v : op === 114 ? u - v : op === 116 ? Math.imul(u, v) : op === 118 ? Math.trunc(u / v) : u % v); break; }
      case 113: case 115: case 117: case 119: case 121: { const u = F(1), v = F(2); D(true, 0, op === 113 ? add(u, v) : op === 115 ? sub(u, v) : op === 117 ? mul(u, v) : op === 119 ? div(u, v) : f32(u % v)); break; }
      case 122: D(false, 0, this.randomBounded(I(1))); break;
      case 123: D(true, 0, mul(this.randomUnit(), F(1))); break;
      case 124: case 125: case 126: case 127: case 128: { const v = F(1); D(true, 0, op === 124 ? sin(v) : op === 125 ? cos(v) : f32(op === 126 ? Math.tan(v) : op === 127 ? Math.acos(v) : Math.atan(v))); break; }
      case 129: D(true, 0, wrapAngle(F(0))); break;
      case 130: { const result = polar(F(2), F(3)); D(true, 0, result.x); D(true, 1, result.y); break; }
      case 131: { const low = F(2), high = F(3), radius = add(mul(sub(high, low), this.randomSigned()), low), angle = mul(this.randomSigned(), PI), result = polar(angle, radius); D(true, 0, result.x); D(true, 1, result.y); break; }
      case 200: return jump(0);
      case 201: D(false, 0, D(false) - 1); if (I(0) > 0) return jump(1); break;
      case 202: case 203: case 204: case 205: case 206: case 207: case 208: case 209: case 210: case 211: case 212: case 213: {
        const a = op & 1 ? F(0) : I(0), b = op & 1 ? F(1) : I(1), mode = Math.floor((op - 202) / 2);
        if ([a === b, a !== b, a < b, a <= b, a > b, a >= b][mode]) return jump(2); break;
      }
      case 300: this.setSprite(I(0), true); break;
      case 301: { const first = I(0), span = I(1); if (!span) throw new Error('ANM random sprite has zero span'); this.setSprite(((this.randomNext() % (span >>> 0)) + first) | 0, true); break; }
      case 302: this.B(0x498, args[0]); this.bit(0x4a0, 0x30, 0); break;
      case 303: this.B(0x499, args[0]); break;
      case 304: this.setLayer(args[0] & 255); break;
      case 305: this.flag(0x10, (args[0] & 1) << 4); break;
      case 306: this.bit(0x4a1, 2, (args[0] & 1) << 1); break;
      case 307: this.flag(0x200, (args[0] & 1) << 9); break;
      case 308: this.B(0x4a0, this.B(0x4a0) ^ 0x40); this.scaleX *= -1; break;
      case 309: this.B(0x4a0, this.B(0x4a0) ^ 0x80); this.scaleY *= -1; break;
      case 310: this.visible = !!(args[0] & 255); break;
      case 311: this.bit(0x4a0, 0xc, (args[0] & 3) << 2); break;
      case 312: this.bit(0x4a2, 3, I(0) & 3); this.bit(0x4a1, 0x60, (I(1) & 3) << 5); break;
      case 313: this.B(0x4a4, I(0)); this.flag(0x800000, 0x800000); break;
      case 314: this.flag(0x20, (I(0) & 1) << 5); break;
      case 315: this.flag(0x1000000, (args[0] & 1) << 24); break;
      case 316: this.flag(1, 1); break;
      case 317: this.flag(1, 0); break;
      case 318: this.flag(0x400000, (I(0) & 1) << 22); break;
      case 319: { const a = this.rotation; this.setSprite(I(a > -PI / 4 && a < PI / 4 ? 0 : a >= PI / 4 && a < PI * .75 ? 3 : a <= -PI / 4 && a > -PI * .75 ? 2 : 1), true); break; }
      case 400: case 441: vec(op === 441 || (this.U(0x49c) & 0x40) ? 0x484 : 0x2c, 3); break;
      case 401: vec(0x38, 3); break;
      case 402: vec(0x50, 2); break;
      case 403: this.alpha = I(0); break;
      case 404: for (let i = 0; i < 3; i++) this.B(0x492 - i, I(i)); break;
      case 405: this.B(0x497, I(0)); break;
      case 406: for (let i = 0; i < 3; i++) this.B(0x496 - i, I(i)); break;
      case 407: case 410: case 433: {
        const address = op === 410 ? 0x38 : this.U(0x49c) & 0x40 ? 0x484 : 0x2c;
        const point = op === 433 ? polar(F(2), F(3)) : null;
        this.interpolate(op === 410 ? 'rotation' : 'position', address, 3, point ? [point.x, point.y, 0] : [F(2), F(3), F(4)], I(0), args[1]); break;
      }
      case 408: case 413: this.interpolate(op === 408 ? 'rgb' : 'rgb2', op === 408 ? 0x490 : 0x494, 3, [I(4) & 255, I(3) & 255, I(2) & 255], I(0), args[1] & 255, { bytes: true, integer: true, rgb: true }); if (op === 413 && !(this.B(0x4a1) & 0x1c)) this.bit(0x4a1, 0x1c, 4); break;
      case 409: case 414: this.interpolate(op === 409 ? 'alpha' : 'alpha2', op === 409 ? 0x493 : 0x497, 1, [I(2) & 255], I(0), args[1] & 255, { bytes: true, integer: true }); if (op === 414 && !(this.B(0x4a1) & 0x1c)) this.bit(0x4a1, 0x1c, 4); break;
      case 411: this.interpolate('rotationZ', 0x40, 1, [wrapAngle(F(2))], I(0), args[1], { angle: true }); break;
      case 412: case 430: case 435: this.interpolate(op === 412 ? 'scale' : op === 430 ? 'uvScale' : 'scale2', op === 412 ? 0x50 : op === 430 ? 0x68 : 0x58, 2, [F(2), F(3)], I(0), args[1] & 255); break;
      case 415: vec(0x44, 3); this.flag(0x80000, 0x80000); break;
      case 416: vec(0x60, 2); this.flag(0x80000, 0x80000); break;
      case 417: this.interpolate('alpha', 0x493, 1, [args[0] & 255], I(1), 0, { bytes: true, integer: true }); break;
      case 419: this.flag(0x800, (I(0) & 1) << 11); break;
      case 420: this.interpolate('position', this.U(0x49c) & 0x40 ? 0x484 : 0x2c, 3, [F(4), F(5), F(6)], I(0), 8, { tangents: [[F(1), F(2), F(3)], [F(7), F(8), F(9)]] }); break;
      case 421: this.U(0x4a8, args[0] & 0xffff); this.U(0x4ac, args[0] >>> 16); break;
      case 423: this.bit(0x4a1, 0x1c, (args[0] & 7) << 2); break;
      case 424: this.bit(0x4a2, 0xe0, args[0] << 5); break;
      case 425: this.F(0x3a0, F(0)); this.flag(0x80000, 0x80000); break;
      case 426: this.F(0x3a4, F(0)); this.flag(0x80000, 0x80000); break;
      case 427: case 428: this.interpolate(op === 427 ? 'uvSpeedX' : 'uvSpeedY', 0x3a0 + (op - 427) * 4, 1, [F(2)], I(0), args[1]); break;
      case 429: vec(0x68, 2); break;
      case 431: this.flag(0x80, (args[0] & 1) << 7); break;
      case 432: this.flag(0x100, (I(0) & 1) << 8); break;
      case 434: vec(0x58, 2); break;
      case 436: vec(0x80, 2); break;
      case 437: this.bit(0x4a2, 0x1c, (I(0) & 7) << 2); break;
      case 438: this.bit(0x4a3, 3, args[0] & 3); break;
      case 440: if (this.B(0x4a0) & 0x40) this.scaleX *= -1; if (this.B(0x4a0) & 0x80) this.scaleY *= -1; this.bit(0x4a0, 0xc0, 0); break;
      case 500: case 501: case 502: case 503: this.spawn(I(0), false, [0,4,2,6][op-500]); break;
      case 504: this.spawn(I(0), true); break;
      case 505: case 510: { const child = this.spawn(I(0),false,(this.U(0x49c)&0x40000?4:0)+(op===510?2:0)); child.F(0x484, F(1)); child.F(0x488, F(2)); break; }
      case 506: { const child = this.spawn(I(0), true), point = this.transformOffset(F(1), F(2), true, true); child.F(0x484, point.x); child.F(0x488, point.y); break; }
      case 507: this.flag(0x1000, (I(0) & 1) << 12); break;
      case 508: this.attachedEffect=(this.bank.environment.spawnEffect??createTouhouAttachedEffect)(this,I(0));break;
      case 509: if (this.parent) for (let i = 0; i < 16; i++) this.U(0x444 + i * 4, this.parent.U(0x444 + i * 4)); break;
      case 600: case 601: case 602: this.B(0x498, op === 600 ? 9 : op === 601 ? 13 : 14); this.geometryCapacity = I(0); break;
      case 603: case 606: case 607: case 608: case 612: case 613: case 614: this.B(0x498, ({603:16,606:20,607:21,608:22,612:27,613:26,614:28})[op]); vec(0x70, 2); break;
      case 618: this.B(0x498, 32); break;
      case 604: case 605: case 617: case 619: case 628: case 629: this.B(0x498, ({604:17,605:18,617:31,619:33,628:42,629:43})[op]); this.width = F(0); this.U(0x444, op >= 628 ? I(1) << 1 : I(1)); break;
      case 611: case 615: case 616: case 620: case 621: case 622: case 630: case 631: case 632: this.B(0x498, ({611:19,615:29,616:30,620:34,621:35,622:36,630:44,631:45,632:46})[op]); vec(0x70, 2); this.U(0x444, op >= 630 ? I(2) << 1 : I(2)); break;
      default: throw new UnsupportedAnmError(this, `opcode ${op}`);
    }
    return 'advance';
  }
  spawn(scriptId: number, detached = false, flags = 0) {
    // Attached children inherit their parent; only a detached root consumes
    // the recursively resolved position at the moment it is created.
    const position = detached ? this.detachedPosition() : null;
    const child = this.bank.create(scriptId, detached ? {secondary:!!(flags&4),front:!!(flags&2), detached: true, x: position!.x, y: position!.y, z: position!.z, rotation: this.rotation, beforeStart: vm => {
      vm.U(0x14, this.U(0x14)); vm.flag(0x200,0x200); vm.flag(0x1000000,this.U(0x49c)&0x1000000);
      for(let i=0;i<3;i++){vm.F(0x38+i*4,this.F(0x38+i*4));vm.F(0x484+i*4,this.F(0x2c+i*4));}
    } } : {secondary:!!(flags&4),front:!!(flags&2), parent: this });
    if (detached) this.detached.push(child); else this.children.push(child);
    if (flags & 4) child.bit(0x4a0, 3, 0);
    return child;
  }
  executeFrame(): void {
    if (!this.alive || this.stopped) return;
    // Source invokes the attached EffectInf callback before this VM's ANM
    // timer/instructions, including when its script is parked on wait.
    if(this.attachedEffect&&this.attachedEffect.update()!==0){this.destroy();return;}
    if(this.effectTrackedAge!==undefined)this.effectTrackedAge++;
    const wait=this.waitInstruction;
    if(wait&&this.pendingInterrupt===0&&this.pc===wait.offset&&wait.opcode===3&&this.time>=wait.time){
      const flags=this.renderWords?this.renderWords[0x49c>>>2]:this.memory.getUint32(0x49c,true);
      // A stationary leaf's live wait still performs the two source rounding
      // steps. Motion, interpolation, interrupts and unsupported flags retain
      // the ordinary instruction path; no animation tick is omitted.
      if(!(flags&0x80800)&&!(this.renderBytes[0x4a1]&2)&&this.interpolations.size===0){
        this.time=add(sub(this.time,1),1);return;
      }
    }
    const script = this.bank.scripts[this.scriptId], offsets = this.bank.offsets[this.scriptId];
    if (this.pendingInterrupt !== 0) {
      let label = script.instructions.find(ins => ins.opcode === 5 && (ins.args[0] | 0) === this.pendingInterrupt);
      if (!label) label = script.instructions.find(ins => ins.opcode === 5 && ins.args[0] === 0xffffffff);
      this.pendingInterrupt = 0;
      if (label) { this.returnTime = this.time; this.returnPc = this.pc; this.time = label.time; this.pc = label.offset + label.size; this.visible = true; }
    }
    let budget = 100000;
    while (true) {
      if (--budget === 0) throw new Error(`ANM synchronous instruction budget exceeded: ${this.bank.data.name}:${this.scriptId}`);
      const index = offsets.get(this.pc), ins = script.instructions[index!];
      if (!ins) throw new Error(`ANM jump does not target an instruction: ${this.pc}`);
      if (this.time < ins.time) break;
      const flow = this.dispatch(ins);
      if (flow === 'stop') return;
      if (flow === 'wait') { this.waitInstruction=ins.opcode===3?ins:null;break; }
      if (flow === 'advance') this.pc += ins.size;
    }
    if (this.U(0x49c) & 0x80000) {
      for (let i = 0; i < 3; i++) if (this.F(0x44 + i * 4) !== 0) this.F(0x38 + i * 4, wrapAngle(add(this.F(0x38 + i * 4), this.F(0x44 + i * 4))));
      for (const i of [1, 0]) if (this.F(0x60 + i * 4) !== 0) this.F(0x50 + i * 4, add(this.F(0x50 + i * 4), this.F(0x60 + i * 4)));
      for (let i = 0; i < 2; i++) if (this.F(0x3a0 + i * 4) !== 0) { let value = add(this.F(0x78 + i * 4), this.F(0x3a0 + i * 4)); if (value < 2) { if (value < 0) value = add(value, 2); } else value = sub(value, 2); this.F(0x78 + i * 4, value); }
    }
    if (this.B(0x4a1) & 2) {
      // anm_adapter.cpp adds the stage camera's final translation once per VM
      // tick. An application without an animated stage camera has zero offset.
      const offset=this.bank.environment.cameraOffset?.();
      if(offset){this.x=add(this.x,offset.x);this.y=add(this.y,offset.y);this.z=add(this.z,offset.z);}
    }
    if (this.U(0x49c) & 0x800) throw new UnsupportedAnmError(this, 'corner snapshot motion');
    // The original advances these fixed fields in this order, independent of
    // the order of the instructions that initialized them.
    if(this.interpolations.size) for (const key of interpolationOrder) {
      const track = this.interpolations.get(key); if (!track) continue;
      if (!track.value.duration) continue;
      const returned = track.value.sample(1,false), values = track.rgb ? track.value.current : returned;
      for (let i = 0; i < track.count; i++) if (track.bytes) this.B(track.address + i, values[i]); else this.F(track.address + i * 4, values[i]);
      if (!track.value.duration) this.interpolations.delete(key);
    }
    this.time = add(this.time, 1);
  }
  update(): void {
    // Most bullets/shots are leaves. New children created by executeFrame have
    // already executed frame zero and must not receive another update here.
    if(this.children.length===0){
      this.executeFrame();
      if(this.children.length)this.children=this.children.filter(child=>child.alive);
      return;
    }
    const previous = this.children.slice(); this.executeFrame();
    for (const child of previous) if (child.alive) child.update();
    this.children = this.children.filter(child => child.alive);
  }
  inheritedRotation(): number { return this.transformParent && !(this.U(0x49c) & 0x1000) ? add(this.rotation, this.transformParent.inheritedRotation()) : this.rotation; }
  inheritedScale(selector: number=0): number { const own = selector===0?this.scaleX:selector===1?this.scaleY:this.scale2X; return mul(own,this.transformParent&&!(this.U(0x49c)&0x1000)?this.transformParent.inheritedScale(selector):1); }
  transformOffset(x: number,y: number,rotateOwn: boolean,scaleOwn: boolean): {x:number;y:number} {
    if(this.transformParent&&!(this.U(0x49c)&0x1000)){const p=this.transformParent.transformOffset(x,y,!!(this.U(0x49c)&0x20),!!(this.U(0x49c)&0x400000));x=p.x;y=p.y;}
    if(rotateOwn){const p=rotate(x,y,this.rotation);x=p.x;y=p.y;}
    if(scaleOwn){x=mul(x,this.scaleX);y=mul(y,this.scaleY);}return{x,y};
  }
  detachedPosition(): {x:number;y:number;z:number} {
    let x=add(add(this.x,this.F(0x2c)),this.F(0x484)),y=add(add(this.y,this.F(0x30)),this.F(0x488)),z=add(add(this.z,this.F(0x34)),this.F(0x48c));
    if(this.transformParent&&!(this.U(0x49c)&0x1000)){if(this.U(0x49c)&0x20){const p=rotate(x,y,this.transformParent.rotation);x=p.x;y=p.y;}const p=this.transformParent.detachedPosition();x=add(x,p.x);y=add(y,p.y);z=add(z,p.z);}return{x,y,z};
  }
  worldPosition(view: AnmView = identityView, output: {x?:number;y?:number;z?:number}|null = null): {x:number;y:number;z:number} {
    // DataView values already carry source float32 rounding. Reading once
    // avoids getter/helper chains without removing any arithmetic boundary.
    const memory=this.memory,values=this.renderFloats,flags=this.renderWords?this.renderWords[0x49c>>>2]:memory.getUint32(0x49c,true),mode=this.renderBytes?this.renderBytes[0x4a4]:memory.getUint8(0x4a4);
    let x=values?f32(f32(values[0x5bc>>>2]+values[0x2c>>>2])+values[0x484>>>2]):f32(f32(memory.getFloat32(0x5bc,true)+memory.getFloat32(0x2c,true))+memory.getFloat32(0x484,true));
    let y=values?f32(f32(values[0x5c0>>>2]+values[0x30>>>2])+values[0x488>>>2]):f32(f32(memory.getFloat32(0x5c0,true)+memory.getFloat32(0x30,true))+memory.getFloat32(0x488,true));
    let z=values?f32(f32(values[0x5c4>>>2]+values[0x34>>>2])+values[0x48c>>>2]):f32(f32(memory.getFloat32(0x5c4,true)+memory.getFloat32(0x34,true))+memory.getFloat32(0x48c,true));
    if (view.screenScale !== undefined && mode >= 1 && mode <= 4) { const scale = mode === 2 || mode === 4 ? f32(f32(view.screenScale)*.5) : f32(view.screenScale); x=f32(x*scale);y=f32(y*scale);z=f32(z*scale); }
    if (this.transformParent && !(flags & 0x1000)) {
      if (flags & 0x20) { const rotated = rotate(x, y, this.transformParent.rotation); x = rotated.x; y = rotated.y; }
      if (flags & 0x400000) { x=f32(x*this.transformParent.scaleX);y=f32(y*this.transformParent.scaleY); }
      const parent = this.transformParent.worldPosition(view); x=f32(x+parent.x);y=f32(y+parent.y);z=f32(z+parent.z);
    } else {
      const preset = this.B(0x4a3) & 3;
      if (preset && view.screenOffsets) { const offset = view.screenOffsets[preset === 1 ? 0 : 1]; x = add(x, offset.x); y = add(y, offset.y); }
    }
    if(output){output.x=x;output.y=y;output.z=z;return output as {x:number;y:number;z:number};}
    return { x, y, z };
  }
  draw(draw: DrawList, view: AnmView = identityView): void {
    if(!this.alive)return;
    if(this.children.length===0){this.drawSelf(draw,view);return;}
    if(draw.enqueueAnm){this.drawSelf(draw,view);for(const child of this.children)child.draw(draw,view);return;}
    const all:AnmInstance[] = [], collect = (vm: AnmInstance) => { if (!vm.alive) return; all.push(vm); for (const child of vm.children) collect(child); };
    collect(this); all.sort((a, b) => a.layer - b.layer || a.id - b.id);
    for (const vm of all) vm.drawSelf(draw, view);
  }
  drawSelf(draw: DrawList, view: AnmView = identityView): void {
    if (!this.alive || !this.visible || !((this.U(0x490) | this.U(0x494)) & 0xff000000)) return;
    if(draw.enqueueAnm){draw.enqueueAnm(this,view);return;}
    drawAnm(this, draw, view);
  }
  snapshot(): Record<string,unknown> { return { archive: this.bank.data.name, scriptId: this.scriptId, pc: this.pc, time: this.time, alive: this.alive, sprite: this.spriteIndex, position: this.worldPosition(), scale: [this.scaleX, this.scaleY], alpha: this.alpha, color: this.color, children: this.children.map(child => child.snapshot()) }; }
}

import { drawAnm, anmSpriteVertices } from './anm-render.js';

export type {AnmData,AnmEntry,AnmEnvironment,AnmCreateOptions,AnmView,AnmSprite,AnmInstruction,AnmScript,AnmTexture} from './anm.js';
