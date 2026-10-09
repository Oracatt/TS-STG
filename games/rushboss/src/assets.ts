// SPDX-License-Identifier: GPL-3.0-only
import type {MeshVertex} from './ui-types.js';
import type {NativeHost} from '@ts-stg/thlib';
import type {AnmDrawList as DrawList} from '@ts-stg/thlib/touhou';

import type {RushManifest} from './ui-types.js';
// TouhouRushBoss application adapter; game assets are local data, not thlib.
export const SOURCE_SCALE = 1.5;
export const screenX =(x:number)=> (x + 320) * SOURCE_SCALE;
export const screenY =(y:number)=> (240 - y) * SOURCE_SCALE;

const COMMON_SOUNDS:Readonly<Record<string,string>> = Object.freeze({
  se_tan00: 'shot', se_tan01: 'shot', se_plst: 'shot', se_msl: 'shot',
  se_lazer00: 'shot', se_lazer01: 'shot', se_lazer02: 'shot', se_kira00: 'shot',
  laser: 'shot', kira: 'shot', shoot: 'shot',
  se_graze: 'graze', se_eat: 'pickup', se_powerup: 'pickup',
  se_cardget: 'pickup', se_extend: 'pickup', se_bonus: 'pickup', se_bonus2: 'pickup',
  se_damage00: 'hit', se_damage01: 'hit', se_pldead: 'hit', se_fault: 'hit',
  se_enep00: 'hit', se_enep01: 'hit', se_enep02: 'hit',
  se_nep00: 'bomb', se_bombtan: 'bomb', se_boon00: 'bomb', se_slash: 'bomb', se_cat00: 'bomb',
  se_select00: 'select', se_ok00: 'select', se_cancel00: 'select', se_pause: 'select', se_timeout: 'select',
  // Four charge stages have distinct timing/cues and no corresponding built-in
  // sound template. Keep those application-specific original sounds.
});

/** Sprite centres use source 640×480, centre origin, Y up. Text x/y denotes
 * its top-left corner in that same source coordinate system. rectPixels uses
 * original image pixels [left,top,width,height], never normalized UVs. */
export function createRushAssets(host:NativeHost, { basePath = 'games/rushboss/assets', commonBasePath = 'packages/thlib/assets' } = {}) {
  const manifest:RushManifest = JSON.parse(host.readText(`${basePath}/manifest.json`));
  const common:{sounds:Record<string,{file:string}>} = JSON.parse(host.readText(`${commonBasePath}/manifest.json`));
  const commonAudio:{files:{name:string;path:string}[]} = JSON.parse(host.readText(`${commonBasePath}/touhou-common/audio/manifest.json`));
  const originalSounds = new Map((commonAudio.files??[]).map(item=>[item.name.replace(/\.wav$/i,''),item.path]));
  const textures = new Map<string,number>(), sounds = new Map<string,number>(), musics = new Map<string,number>(), fonts = new Map<string,number>();
  const fileName =(name:string)=> {
    const relative = manifest.textures[name] ?? name;
    if (!manifest.files[relative]) throw new Error(`Unknown RushBoss resource: ${name}`);
    return relative;
  };
  const texture =(name:string)=> {
    const relative = fileName(name);
    if (!textures.has(relative)) textures.set(relative, host.loadTexture(`${basePath}/${relative}`));
    return textures.get(relative)!;
  };
  const font = (kind = 'text') => {
    if (!fonts.has(kind)) fonts.set(kind, host.loadFont(`${basePath}/${manifest.fonts[kind]}`, 32));
    return fonts.get(kind)!;
  };
  const region = (draw:DrawList, name:string, rectPixels:[number,number,number,number], x:number, y:number, width:number, height:number, angle = 0, color = 0xffffffff) => {
    if(width===0||height===0)return draw;
    const [left, top, sourceWidth, sourceHeight] = rectPixels;
    if(width<0||height<0){
      // Negative source scale mirrors UVs. Native sprite dimensions stay positive.
      const item=manifest.files[fileName(name)],hw=Math.abs(width)*SOURCE_SCALE/2,hh=Math.abs(height)*SOURCE_SCALE/2;
      const cx=screenX(x),cy=screenY(y),c=Math.cos(-angle),s=Math.sin(-angle);
      const u0=(left+(width<0?sourceWidth:0))/item.width,u1=(left+(width<0?0:sourceWidth))/item.width;
      const v0=(top+(height<0?sourceHeight:0))/item.height,v1=(top+(height<0?0:sourceHeight))/item.height;
      const vertex=(dx:number,dy:number,u:number,v:number):MeshVertex=>[cx+dx*c-dy*s,cy+dx*s+dy*c,u,v,color];
      draw.mesh(texture(name),[vertex(-hw,-hh,u0,v0),vertex(hw,-hh,u1,v0),vertex(-hw,hh,u0,v1),vertex(hw,hh,u1,v1)],[0,1,2,1,3,2]);
      return draw;
    }
    draw.spriteRegion(texture(name), left, top, sourceWidth, sourceHeight, screenX(x), screenY(y), width * SOURCE_SCALE, height * SOURCE_SCALE, -angle, color);
    return draw;
  };
  const sprite = (draw:DrawList, name:string, x:number, y:number, width:number, height:number, angle = 0, color = 0xffffffff) => {
    if(width===0||height===0)return draw;
    if(width<0||height<0){const item=manifest.files[fileName(name)];return region(draw,name,[0,0,item.width,item.height],x,y,width,height,angle,color);}
    draw.sprite(texture(name), screenX(x), screenY(y), width * SOURCE_SCALE, height * SOURCE_SCALE, -angle, color);
    return draw;
  };
  const sound = (key:string) => {
    if(originalSounds.has(key)){
      const cacheKey=`common:${key}`;
      if(!sounds.has(cacheKey))sounds.set(cacheKey,host.loadSound(`${commonBasePath}/touhou-common/${originalSounds.get(key)}`));
      return sounds.get(cacheKey)!;
    }
    const commonKey = COMMON_SOUNDS[key] ?? (common.sounds[key] ? key : null);
    const descriptor = commonKey ? common.sounds[commonKey] : manifest.sounds[key];
    if (!descriptor) throw new Error(`Unknown RushBoss sound: ${key}`);
    const cacheKey = commonKey ? `common:${commonKey}` : key;
    if (!sounds.has(cacheKey)) sounds.set(cacheKey, host.loadSound(`${commonKey ? commonBasePath : basePath}/${descriptor.file}`));
    return sounds.get(cacheKey)!;
  };
  const music = (key:string) => {
    const descriptor = manifest.music[key];
    if (!descriptor) throw new Error(`Unknown RushBoss music: ${key}`);
    if (!musics.has(key)) {
      const id = host.loadMusic(`${basePath}/${descriptor.file}`);
      // Original DynamicAudioInstance counts interleaved channel samples;
      // conversion to seconds divides by sampleRate * channels.
      host.setMusicLoop(id, descriptor.loopBegin / (descriptor.sampleRate * descriptor.channels), descriptor.loopEnd / (descriptor.sampleRate * descriptor.channels));
      musics.set(key, id);
    }
    return musics.get(key)!;
  };
  return {
    manifest, texture, region, sprite, font, sound, music,
    size(name:string) { const item = manifest.files[fileName(name)]; return { width: item.width, height: item.height }; },
    text(draw:DrawList, text:string, x:number, y:number, size:number, color = 0xffffffff, kind = 'text') { draw.text(text, screenX(x), screenY(y), size * SOURCE_SCALE, color, font(kind)); return draw; },
    playSound(key:string, volume = 1) { host.playSound(sound(key), volume * (manifest.sounds[key]?.volume ?? 1)); },
    snapshot() { return { textures: textures.size, sounds: sounds.size, music: musics.size, fonts: fonts.size, commonSounds: [...sounds.keys()].filter((key) => key.startsWith('common:')) }; },
    dispose() {
      for (const id of textures.values()) host.unloadTexture(id);
      for (const id of sounds.values()) host.unloadSound(id);
      for (const id of musics.values()) host.unloadMusic(id);
      for (const id of fonts.values()) host.unloadFont(id);
      textures.clear(); sounds.clear(); musics.clear(); fonts.clear();
    },
  };
}

export type RushAssets=ReturnType<typeof createRushAssets>;
