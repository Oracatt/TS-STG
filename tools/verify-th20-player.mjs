import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { verifyTh20GameplayVectors } from '../tests/fixtures/th20-gameplay-vectors.js';
const root = path.resolve(import.meta.dirname, '..'), reference = path.resolve(process.argv[2] ?? 'D:/AIWorkspace/Touhou20Reconstruction');
function run(command, args) { const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); if (r.error || r.status) throw new Error(`${command}: ${r.error ?? r.stderr}\n${r.stdout}`); return r.stdout; }
run('cmake', ['--build', 'build', '--config', 'Release', '--target', 'ts-stg-th20-player-oracle']);
const data = run(path.join(root, 'build/Release/ts-stg-th20-player-oracle.exe'), []);
fs.writeFileSync(path.join(root, 'tests/fixtures/th20-player-vectors.json'), data);
const vectors = JSON.parse(data), sht = [0, 1].map(i => JSON.parse(fs.readFileSync(path.join(root, `games/touhou20/assets/shots/pl0${i}.json`))));
const node = verifyTh20GameplayVectors(vectors, sht);
const output = run(path.join(root, 'build/Release/ts-stg.exe'), ['tests/fixtures/th20-gameplay-vectors.js', '--root', root, '--headless', '--frames', '1']);
const quickjs = output.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line)).find(value => value.runtime === 'QuickJS');
if (!quickjs || quickjs.comparisons !== node.comparisons || quickjs.failures) throw new Error(`QuickJS verification missing or divergent: ${output}`);
const files = [
  'source_reconstruction/player_entity/movement.cpp', 'source_reconstruction/player_entity/frame_helpers.cpp',
  'source_reconstruction/player_entity/option_frame.cpp', 'source_reconstruction/player_entity/firing.cpp',
  'source_reconstruction/player_entity/shot_callbacks.cpp', 'source_reconstruction/player_entity/shot_hit.cpp',
  'source_reconstruction/player_entity/frame.cpp', 'source_reconstruction/player_entity/frame_adapter.cpp',
  'source_reconstruction/player_entity/events.cpp', 'source_reconstruction/player_entity/collision.cpp',
  'source_reconstruction/bomb_system/reimu.cpp', 'source_reconstruction/bomb_system/marisa.cpp',
  'source_reconstruction/bomb_system/state.cpp', 'source_reconstruction/ecl_vm/math.cpp', 'native_recovered/native_core.hpp',
  'source_reconstruction/item_system/spawn.cpp', 'source_reconstruction/item_system/frame.cpp',
  'source_reconstruction/item_system/rewards.cpp', 'source_reconstruction/item_system/environment.cpp',
  'source_reconstruction/damage_regions/score.cpp', 'source_reconstruction/gameplay/player_state.cpp',
  'source_reconstruction/card_system/start.cpp', 'source_reconstruction/card_system/update.cpp',
  'source_reconstruction/card_system/finish.cpp', 'source_reconstruction/card_system/timing.cpp',
  'source_reconstruction/card_system/encoding.cpp', 'source_reconstruction/card_system/draw.cpp',
  'source_reconstruction/effect_system/short_line.cpp', 'source_reconstruction/effect_system/effect.cpp',
  'source_reconstruction/pause_system/transitions.cpp', 'source_reconstruction/pause_system/menu.cpp',
  'source_reconstruction/pause_system/resume.cpp', 'source_reconstruction/pause_system/ranking.cpp',
  'source_reconstruction/pause_system/draw_ranking.cpp', 'source_reconstruction/pause_system/draw_entries.cpp',
  'source_reconstruction/gameplay/enemy_damage.cpp', 'source_reconstruction/gameplay/enemy_damage_helpers.cpp',
  'source_reconstruction/damage_regions/damage.cpp',
  'source_reconstruction/gameplay/enemy_spawn.cpp', 'source_reconstruction/gameplay/enemy_defeat.cpp',
  'source_reconstruction/gameplay/enemy_update.cpp', 'source_reconstruction/gameplay/player_state.hpp',
  'source_reconstruction/hud_system/update.cpp', 'source_reconstruction/hud_system/draw.cpp',
  'source_reconstruction/hud_system/enable.cpp', 'source_reconstruction/gameplay/enemy_frame.cpp',
];
const sources = files.map(file => { const bytes = fs.readFileSync(path.join(reference, file)); return { file,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'), lines: bytes.toString('utf8').split(/\r?\n/).length }; });
const sourceLocations = [
  ['source_reconstruction/player_entity/movement.cpp','update_movement'],
  ['source_reconstruction/player_entity/option_frame.cpp','smooth_step'],
  ['source_reconstruction/player_entity/option_frame.cpp','update_option'],
  ['source_reconstruction/item_system/spawn.cpp','if(type==15)'],
  ['source_reconstruction/pause_system/resume.cpp','void continue_game'],
  ['source_reconstruction/gameplay/enemy_damage_helpers.cpp','apply_enemy_damage'],
  ['source_reconstruction/gameplay/enemy_damage.cpp','int update_enemy_damage'],
  ['source_reconstruction/gameplay/enemy_damage.cpp','if(!(primary&0x22u)'],
  ['source_reconstruction/gameplay/enemy_damage.cpp','auto& cooldown='],
  ['source_reconstruction/gameplay/enemy_spawn.cpp','int apply_enemy_spawn'],
  ['source_reconstruction/gameplay/enemy_spawn.cpp','state.fields_250[0]='],
  ['source_reconstruction/gameplay/enemy_defeat.cpp','int defeat_enemy'],
  ['source_reconstruction/hud_system/update.cpp','void timer_display'],
  ['source_reconstruction/hud_system/update.cpp','void boss_panels'],
  ['source_reconstruction/hud_system/update.cpp','void boss_pointer'],
  ['source_reconstruction/gameplay/enemy_frame.cpp','void store_boss_time'],
].map(([file,expression])=>({file,expression,line:fs.readFileSync(path.join(reference,file),'utf8').split(/\r?\n/).findIndex(line=>line.includes(expression))+1}));
const evidence = {
  description: 'Independent standalone C++ SSE arithmetic/state harness transcribed from the listed recovered source; selected fields compared with the JS ports in Node/V8 and embedded QuickJS. No original EXE was executed. This does not establish whole-game, every-shot-callback, or pixel equivalence.',
  oracle: 'native/tests/th20_player_oracle.cpp', oracleSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'native/tests/th20_player_oracle.cpp'))).digest('hex'),
  vectors: Object.fromEntries(Object.entries(vectors).map(([key, value]) => [key, value.length])), node, quickjs, sources, sourceLocations,
  boundaries: ['SHT runtime profiles 0–14 are the original normal weapon profiles; other callbacks reject explicitly.',
    'Visual tests exercise imported ANM resources; they do not compare captured original pixels.',
    'Normal SHT cap/per-target damage arithmetic is compared. Damage-region lifetime and custom weapon group/target rules, and Japanese dynamic spell-name rasterization, remain explicit context adapters.',
    'Boss HUD comparison covers timer integers, health-ring/marker float32 geometry, proximity and pointer state; original-font visual smoke tests are not pixel-equivalence evidence.',
    'Stone item types 9–13, stone weapon variants, original stage/Boss characters and attack scripts are excluded.',
    'Option focus dispatch follows original 4ff630/4ff760 roles, correcting the opposite booleans in the local entry_adapter.cpp reconstruction.'],
};
fs.mkdirSync(path.join(root, 'reports/th20'), { recursive: true }); fs.writeFileSync(path.join(root, 'reports/th20/player-items-spell.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ vectors: evidence.vectors, node, quickjs }));
