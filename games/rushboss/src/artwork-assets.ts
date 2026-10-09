// SPDX-License-Identifier: GPL-3.0-only
import type {NativeHost} from '@ts-stg/thlib';

import type {RushManifest} from './ui-types.js';

// Private RushBoss images. Shared players, bullets, effects and UI are loaded
// independently by thlib; this loader never substitutes their resource banks.
const stageNames = ['src_grassland', 'src_leaf', 'src_sunlight', 'src_river_ground', 'src_water',
  'src_cloud_1', 'src_cloud_2', 'src_forest1', 'src_snow', 'src_snow_ground', 'src_tree1', 'src_tree2'];
const bossNames = ['src_sunnymilk', 'src_monstone', 'src_artia'];
const isArtwork =(name:string)=> name === 'src_dummy' || stageNames.includes(name) || bossNames.includes(name) ||
  /^src_(?:sunnymilk|monstone|artia)_cdbg[12]$/.test(name) ||
  /^src_(?:sunnyface_|artiaface_)/.test(name) || name === 'src_sunny_ct' || name === 'src_monstone_ct';

export function createRushArtworkAssets(host:NativeHost, {basePath = 'games/rushboss/assets'} = {}) {
  const manifest:RushManifest = JSON.parse(host.readText(`${basePath}/manifest.json`));
  const handles = new Map<string,number>(), used = new Set<string>();
  let disposed = false;
  const descriptor =(name:string)=> {
    if (!isArtwork(name)) throw new RangeError(`Not a private RushBoss artwork resource: ${name}`);
    const file = manifest.textures[name], entry = manifest.files[file];
    if (!entry || !(entry.width > 0 && entry.height > 0)) throw new RangeError(`Missing RushBoss artwork: ${name}`);
    return {file, entry};
  };
  return {
    host, manifest,
    texture(name:string) {
      if (disposed) throw new Error('RushBoss artwork assets are disposed');
      const {file} = descriptor(name); used.add(name);
      if (!handles.has(file)) handles.set(file, host.loadTexture(`${basePath}/${file}`));
      return handles.get(file)!;
    },
    size(name:string) {const {entry} = descriptor(name); return {width: entry.width, height: entry.height};},
    snapshot() {return {source: manifest.source, textures: handles.size, names: [...used].sort(),
      files: [...handles.keys()].sort().map(file => ({file, sha256: manifest.files[file].sha256}))};},
    dispose() {
      if (disposed) return; disposed = true;
      for (const id of handles.values()) host.unloadTexture?.(id);
      handles.clear();
    },
  };
}
