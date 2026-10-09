import type { DrawCommand, ShaderUniform } from './core-types.js';
import { clamp } from './math.js';

export const rgba = (r: number, g: number, b: number, a: number = 255): number => ((clamp(r, 0, 255) << 24) | (clamp(g, 0, 255) << 16) | (clamp(b, 0, 255) << 8) | clamp(a, 0, 255)) >>> 0;
export const withAlpha = (color: number, alpha: number): number => ((color & 0xffffff00) | Math.round(clamp(alpha, 0, 1) * 255)) >>> 0;

/** The sole rendering boundary: serializable commands, no graphics/backend dependencies. */
export class DrawList {

  declare commands: DrawCommand[];

  constructor() { this.commands = []; }
  reset(): this { this.commands.length = 0; return this; }
  push(command: DrawCommand): this { this.commands.push(command); return this; }
  clear(color: number = 0x000000ff): this { return this.push(['clear', color >>> 0]); }
  circle(x: number, y: number, radius: number, color: number): this { this.commands.push(['circle', x, y, radius, color >>> 0]); return this; }
  ring(x: number, y: number, inner: number, outer: number, color: number): this { return this.push(['ring', x, y, inner, outer, color >>> 0]); }
  line(x1: number, y1: number, x2: number, y2: number, width: number, color: number): this { this.commands.push(['line', x1, y1, x2, y2, width, color >>> 0]); return this; }
  lineStrip(vertices: Array<[number, number, number]>): this { return this.push(['lineStrip', vertices]); }
  point(x: number, y: number, color: number): this { return this.push(['point', x, y, color >>> 0]); }
  rect(x: number, y: number, width: number, height: number, color: number): this { return this.push(['rect', x, y, width, height, color >>> 0]); }
  text(text: unknown, x: number, y: number, size: number, color: number = 0xffffffff, fontId?: number): this {
    const command: DrawCommand = ['text', String(text), x, y, size, color >>> 0];
    if (fontId !== undefined) command.push(fontId);
    return this.push(command);
  }
  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number): this { return this.push(['triangle', x1, y1, x2, y2, x3, y3, color >>> 0]); }
  sprite(id: number, x: number, y: number, width: number, height: number, rotation: number = 0, color: number = 0xffffffff): this { return this.push(['sprite', id, x, y, width, height, rotation, color >>> 0]); }
  spriteRegion(id: number, sx: number, sy: number, sw: number, sh: number, x: number, y: number, width: number, height: number, rotation: number = 0, color: number = 0xffffffff): this { return this.push(['spriteRegion', id, sx, sy, sw, sh, x, y, width, height, rotation, color >>> 0]); }
  blend(mode: 'alpha' | 'add' | 'multiply' = 'add'): this { return this.push(['blend', mode]); }
  blendEnd(): this { return this.push(['blendEnd']); }
  /** Generic GLSL scope; uniforms are [name,type,component-array]. */
  shaderBegin(id: number, uniforms: readonly ShaderUniform[] = []): this { return this.push(['shaderBegin', id, uniforms]); }
  shaderEnd(): this { return this.push(['shaderEnd']); }
  /** Discard fragments with final alpha below cutoff; zero disables testing. */
  alphaTest(cutoff: number = 0): this { return this.push(['alphaTest', cutoff]); }
  mesh(textureId: number, vertices: Array<[number, number, number, number, number]>, indices: number[]): this { return this.push(['mesh', textureId, vertices, indices]); }
  /** Local TL/TR/BL/BR corners, float32 translation/scale, UV rectangle and
   * per-corner colors. Pixel snapping rounds halves away from zero, then -0.5. */
  quad(textureId: number, corners: readonly number[], worldX: number, worldY: number, scale: number, offsetX: number, offsetY: number, u0: number, v0: number, u1: number, v1: number, color0: number, color1: number, color2: number, color3: number, pixelSnap: boolean = false): this {
    return this.push(['quad', textureId, corners, worldX, worldY, scale, offsetX, offsetY, u0, v0, u1, v1, color0 >>> 0, color1 >>> 0, color2 >>> 0, color3 >>> 0, !!pixelSnap]);
  }
  /** One independently styled quad. Immutable state is [alpha cutoff, six
   * blend factors, filter, U wrap, V wrap]. Restores blend and disables alpha
   * testing after drawing, exactly like the corresponding command sequence. */
  statefulQuad(textureId: number, corners: readonly number[], worldX: number, worldY: number, scale: number, offsetX: number, offsetY: number, u0: number, v0: number, u1: number, v1: number, color0: number, color1: number, color2: number, color3: number, pixelSnap: boolean, state: readonly [number,string,string,string,string,string,string,'point'|'bilinear'|'anisotropic4x','clamp'|'wrap'|'mirror','clamp'|'wrap'|'mirror']): this {
    return this.push(['statefulQuad', textureId, corners, worldX, worldY, scale, offsetX, offsetY, u0, v0, u1, v1, color0 >>> 0, color1 >>> 0, color2 >>> 0, color3 >>> 0, !!pixelSnap, state]);
  }
  mesh3d(textureId: number, vertices: Array<[number, number, number, number, number, number]>, indices: number[], mvp: number[]): this { return this.push(['mesh3d', textureId, vertices, indices, mvp]); }
  targetBegin(id: number, clearColor: number = 0): this { return this.push(['targetBegin', id, clearColor >>> 0]); }
  targetEnd(): this { return this.push(['targetEnd']); }
  blendFactors(src: string, dst: string, op: string = 'add', srcAlpha: string = 'one', dstAlpha: string = 'zero', alphaOp: string = 'add'): this { return this.push(['blendFactors', src, dst, op, srcAlpha, dstAlpha, alphaOp]); }
  sampler(textureId: number, filter: 'point' | 'bilinear' | 'anisotropic4x' = 'bilinear', wrapU: 'clamp' | 'wrap' | 'mirror' = 'wrap', wrapV: 'clamp' | 'wrap' | 'mirror' = 'wrap'): this { return this.push(['sampler', textureId, filter, wrapU, wrapV]); }
  scissor(x: number, y: number, width: number, height: number): this { return this.push(['scissor', x, y, width, height]); }
  scissorEnd(): this { return this.push(['scissorEnd']); }
  toJSON(): DrawCommand[] { return this.commands; }
}
