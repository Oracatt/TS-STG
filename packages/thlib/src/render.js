import { clamp } from './math.js';

export const rgba = (r, g, b, a = 255) => ((clamp(r, 0, 255) << 24) | (clamp(g, 0, 255) << 16) | (clamp(b, 0, 255) << 8) | clamp(a, 0, 255)) >>> 0;
export const withAlpha = (color, alpha) => ((color & 0xffffff00) | Math.round(clamp(alpha, 0, 1) * 255)) >>> 0;

/** The sole rendering boundary: serializable commands, no graphics/backend dependencies. */
export class DrawList {
  constructor() { this.commands = []; }
  reset() { this.commands.length = 0; return this; }
  push(command) { this.commands.push(command); return this; }
  clear(color = 0x000000ff) { return this.push(['clear', color >>> 0]); }
  circle(x, y, radius, color) { this.commands.push(['circle', x, y, radius, color >>> 0]); return this; }
  ring(x, y, inner, outer, color) { return this.push(['ring', x, y, inner, outer, color >>> 0]); }
  line(x1, y1, x2, y2, width, color) { this.commands.push(['line', x1, y1, x2, y2, width, color >>> 0]); return this; }
  lineStrip(vertices) { return this.push(['lineStrip', vertices]); }
  point(x, y, color) { return this.push(['point', x, y, color >>> 0]); }
  rect(x, y, width, height, color) { return this.push(['rect', x, y, width, height, color >>> 0]); }
  text(text, x, y, size, color = 0xffffffff, fontId) {
    const command = ['text', String(text), x, y, size, color >>> 0];
    if (fontId !== undefined) command.push(fontId);
    return this.push(command);
  }
  triangle(x1, y1, x2, y2, x3, y3, color) { return this.push(['triangle', x1, y1, x2, y2, x3, y3, color >>> 0]); }
  sprite(id, x, y, width, height, rotation = 0, color = 0xffffffff) { return this.push(['sprite', id, x, y, width, height, rotation, color >>> 0]); }
  spriteRegion(id, sx, sy, sw, sh, x, y, width, height, rotation = 0, color = 0xffffffff) { return this.push(['spriteRegion', id, sx, sy, sw, sh, x, y, width, height, rotation, color >>> 0]); }
  blend(mode = 'add') { return this.push(['blend', mode]); }
  blendEnd() { return this.push(['blendEnd']); }
  /** Generic GLSL scope; uniforms are [name,type,component-array]. */
  shaderBegin(id, uniforms = []) { return this.push(['shaderBegin', id, uniforms]); }
  shaderEnd() { return this.push(['shaderEnd']); }
  /** Discard fragments with final alpha below cutoff; zero disables testing. */
  alphaTest(cutoff = 0) { return this.push(['alphaTest', cutoff]); }
  mesh(textureId, vertices, indices) { return this.push(['mesh', textureId, vertices, indices]); }
  /** Local TL/TR/BL/BR corners, float32 translation/scale, UV rectangle and
   * per-corner colors. Pixel snapping rounds halves away from zero, then -0.5. */
  quad(textureId, corners, worldX, worldY, scale, offsetX, offsetY, u0, v0, u1, v1, color0, color1, color2, color3, pixelSnap = false) {
    return this.push(['quad', textureId, corners, worldX, worldY, scale, offsetX, offsetY, u0, v0, u1, v1, color0 >>> 0, color1 >>> 0, color2 >>> 0, color3 >>> 0, !!pixelSnap]);
  }
  /** One independently styled quad. Immutable state is [alpha cutoff, six
   * blend factors, filter, U wrap, V wrap]. Restores blend and disables alpha
   * testing after drawing, exactly like the corresponding command sequence. */
  statefulQuad(textureId, corners, worldX, worldY, scale, offsetX, offsetY, u0, v0, u1, v1, color0, color1, color2, color3, pixelSnap, state) {
    return this.push(['statefulQuad', textureId, corners, worldX, worldY, scale, offsetX, offsetY, u0, v0, u1, v1, color0 >>> 0, color1 >>> 0, color2 >>> 0, color3 >>> 0, !!pixelSnap, state]);
  }
  mesh3d(textureId, vertices, indices, mvp) { return this.push(['mesh3d', textureId, vertices, indices, mvp]); }
  targetBegin(id, clearColor = 0) { return this.push(['targetBegin', id, clearColor >>> 0]); }
  targetEnd() { return this.push(['targetEnd']); }
  blendFactors(src, dst, op = 'add', srcAlpha = 'one', dstAlpha = 'zero', alphaOp = 'add') { return this.push(['blendFactors', src, dst, op, srcAlpha, dstAlpha, alphaOp]); }
  sampler(textureId, filter = 'bilinear', wrapU = 'wrap', wrapV = 'wrap') { return this.push(['sampler', textureId, filter, wrapU, wrapV]); }
  scissor(x, y, width, height) { return this.push(['scissor', x, y, width, height]); }
  scissorEnd() { return this.push(['scissorEnd']); }
  toJSON() { return this.commands; }
}
