import type { DrawList } from './core.js';
export interface SpritePackTexture {
  /** Plain path below basePath; absolute paths, traversal and URI syntax are rejected. */
  file: string;
  /** Loaded/padded texture canvas dimensions, in pixels. */
  width: number; height: number;
  [metadata: string]: unknown;
}
export interface SpritePackSprite {
  texture: string; x: number; y: number; width: number; height: number;
  [metadata: string]: unknown;
}
export interface SpritePackClip {
  /** Sprite names may reference different textures. */
  frames: readonly string[];
  /** Uniform integer duration per frame; defaults to 6. */
  frameDuration?: number;
  /** Defaults to true. */
  loop?: boolean;
  [metadata: string]: unknown;
}
export interface SpritePackManifest {
  format: 'ts-stg-sprite-pack-v1';
  textures: Record<string, SpritePackTexture>;
  sprites: Record<string, SpritePackSprite>;
  clips?: Record<string, SpritePackClip>;
  [metadata: string]: unknown;
}
export interface SpriteAtlasHost {
  loadTexture(path: string, paddedWidth: number, paddedHeight: number): number;
  unloadTexture(handle: number): void;
}
export interface SpriteDrawing {
  width?: number; height?: number; scale?: number; scaleX?: number; scaleY?: number;
  rotation?: number; color?: number;
}
export interface SpriteClipOptions {
  frameDuration?: number; loop?: boolean; onComplete?: (clip: SpriteClip) => void;
}
export interface NormalizedSpritePackClip extends SpritePackClip {
  readonly frames: readonly string[]; readonly frameDuration: number; readonly loop: boolean;
}
export interface NormalizedSpritePackManifest extends SpritePackManifest {
  readonly textures: Readonly<Record<string, Readonly<SpritePackTexture>>>;
  readonly sprites: Readonly<Record<string, Readonly<SpritePackSprite>>>;
  readonly clips: Readonly<Record<string, Readonly<NormalizedSpritePackClip>>>;
}
export class SpriteAtlas {
  constructor(manifest: SpritePackManifest, host: SpriteAtlasHost, options?: { basePath?: string });
  readonly manifest: Readonly<NormalizedSpritePackManifest>;
  readonly host: SpriteAtlasHost; readonly basePath: string; readonly handles: Map<string, number>;
  readonly disposed: boolean;
  getSprite(name: string): Readonly<SpritePackSprite>;
  getClip(name: string): Readonly<NormalizedSpritePackClip>;
  texture(name: string): number; loadAll(): this; releaseTexture(name: string): boolean; dispose(): void;
  drawNamed<T extends Pick<DrawList, 'spriteRegion'>>(name: string, draw: T, x: number, y: number, options?: SpriteDrawing): T;
  clip(name: string, options?: SpriteClipOptions): SpriteClip;
}
export class SpriteClip {
  constructor(atlas: SpriteAtlas, name: string, options?: SpriteClipOptions);
  readonly atlas: SpriteAtlas; readonly name: string; readonly frames: readonly string[];
  frameDuration: number; loop: boolean; onComplete?: (clip: SpriteClip) => void;
  index: number; elapsed: number; finished: boolean; readonly spriteName: string;
  reset(): this; update(frames?: number): this;
  draw<T extends Pick<DrawList, 'spriteRegion'>>(draw: T, x: number, y: number, options?: SpriteDrawing): T;
  snapshot(): { name: string; index: number; elapsed: number; finished: boolean };
}
