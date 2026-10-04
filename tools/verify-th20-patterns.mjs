// Compile the supplied reconstruction's shot_trajectory function verbatim in a
// test-only harness. No original executable or machine code is linked or run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { th20ShotTrajectory, Th20Random } from '../games/touhou20/src/bullet-patterns.js';

const reference = path.resolve(process.argv[2] ?? 'D:/AIWorkspace/Touhou20Reconstruction');
const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'build/th20-pattern-oracle');
fs.mkdirSync(directory, { recursive: true });
const sourcePath = path.join(reference, 'source_reconstruction/bullet_system/shot_pattern.cpp');
const source = fs.readFileSync(sourcePath, 'utf8');
const math = fs.readFileSync(path.join(reference, 'source_reconstruction/ecl_vm/math.cpp'), 'utf8');
function extract(text, signature) {
  const start = text.indexOf(signature);
  if (start < 0) throw new Error(`Missing source function ${signature}`);
  let cursor = text.indexOf('{', start), depth = 1, end = cursor + 1;
  for (; depth && end < text.length; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; }
  if (depth) throw new Error('Unbalanced source function');
  return text.slice(start, end);
}
const nativeHeader = path.join(reference, 'native_recovered/native_core.hpp').replaceAll('\\', '/');
const cpp = String.raw`#include <iostream>
#include <iomanip>
#include <cmath>
#include <cstring>
#include "${nativeHeader}"
namespace oracle {
namespace n=th20::recovered;
float sub(float a,float b){return _mm_cvtss_f32(_mm_sub_ss(_mm_set_ss(a),_mm_set_ss(b)));}
float div(float a,float b){return _mm_cvtss_f32(_mm_div_ss(_mm_set_ss(a),_mm_set_ss(b)));}
constexpr float pi=3.1415927410125732f;
namespace m {
${['float sine(', 'float cosine(', 'float square_root(', 'float arctangent('].map(s => extract(math, s)).join('\n')}
}
namespace state {
// Test adapter for runtime_state/state.cpp and ecl_vm/vm.cpp, including the
// original next() modulus and signed_unit() denominator (not unit()*2-1).
struct Random {std::uint32_t state=1,last=1,modulus=0x7fffffffu;};
Random random_streams[1];
std::uint32_t next(Random& r){r.last=n::lcg_next(r.state);return r.last%r.modulus;}
float unit(Random& r){return div(static_cast<float>(static_cast<double>(next(r))),sub(static_cast<float>(static_cast<double>(r.modulus)),1));}
float signed_unit(Random& r){const float value=static_cast<float>(static_cast<double>(next(r))),limit=static_cast<float>(static_cast<double>(r.modulus));return sub(div(value,sub(div(limit,2),1)),1);}
}
struct ShotParameters {std::int32_t count,rows;float speed,speed_step,angle,angle_step;};
struct ShotTrajectory {float angle,speed,initial_speed;};
${extract(source, 'ShotTrajectory shot_trajectory(')}
std::uint32_t bits(float v){std::uint32_t u;std::memcpy(&u,&v,4);return u;}
}
int main(){using namespace oracle;int pattern;ShotParameters p;std::uint32_t column,row,seed;float player;
while(std::cin>>pattern>>p.count>>p.rows>>column>>row>>p.speed>>p.speed_step>>p.angle>>p.angle_step>>player>>seed){
auto& rng=state::random_streams[0];rng.state=seed%0x7fffffffu;if(!rng.state)rng.state=1;rng.last=seed;
const auto result=shot_trajectory(p,static_cast<std::uint16_t>(pattern),column,row,player);
std::cout<<bits(result.angle)<<' '<<bits(result.speed)<<' '<<bits(result.initial_speed)<<' '<<rng.state<<'\n';}}
`;
fs.writeFileSync(path.join(directory, 'oracle.cpp'), cpp);
fs.writeFileSync(path.join(directory, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20)\nproject(th20_pattern_oracle LANGUAGES CXX)\nadd_executable(oracle oracle.cpp)\ntarget_compile_features(oracle PRIVATE cxx_std_17)\ntarget_compile_options(oracle PRIVATE /fp:strict)\n');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: directory, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command}: ${result.error ?? result.stderr}\n${result.stdout}`);
  return result.stdout;
}
run('cmake', ['-S', '.', '-B', 'compiled', '-G', 'Visual Studio 16 2019', '-A', 'x64']);
run('cmake', ['--build', 'compiled', '--config', 'Release']);
const vectors = [];
for (let pattern = 0; pattern < 13; pattern++) for (const count of [1, 2, 3, 8, 17, 32]) for (const rows of [1, 2, 3, 8]) {
  for (let sample = 0; sample < 5; sample++) {
    const column = Math.floor((count - 1) * sample / 4), row = Math.floor((rows - 1) * sample / 4);
    const p = { count, rows, speed: Math.fround(1.3 + sample * 1.17), speedStep: Math.fround(sample * .375 - .8), angle: Math.fround((sample - 2) * 1.7), angleStep: Math.fround((sample - 1) * .217) };
    const playerAngle = Math.fround((sample - 2) * .875), seed = [0, 1, 1234567, 0x7fffffff, 0xffffffff][sample];
    vectors.push({ pattern, column, row, parameters: p, playerAngle, seed });
  }
}
const input = vectors.map(v => [v.pattern,v.parameters.count,v.parameters.rows,v.column,v.row,v.parameters.speed,v.parameters.speedStep,v.parameters.angle,v.parameters.angleStep,v.playerAngle,v.seed].join(' ')).join('\n');
const output = run(path.join(directory, 'compiled/Release/oracle.exe'), [], { input }).trim().split(/\r?\n/);
if (output.length !== vectors.length) throw new Error(`Oracle returned ${output.length}/${vectors.length} vectors`);
const bits = v => new Uint32Array(new Float32Array([v]).buffer)[0];
const failures = [];
vectors.forEach((v,i) => {
  const rng = new Th20Random(v.seed), result = th20ShotTrajectory(v.parameters,v.pattern,v.column,v.row,v.playerAngle,rng);
  const actual = [bits(result.angle),bits(result.speed),bits(result.initialSpeed),rng.state];
  v.expected = output[i].split(' ').map(Number);
  if (actual.some((n,j) => n !== v.expected[j])) failures.push({ input:v,actual });
});
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const evidence = { description:'Float32 bit comparison against verbatim local reconstruction shot_trajectory; RNG adapter described in harness. This is numeric function evidence, not whole-game/pixel equivalence.', sourceSha256:hash(sourcePath), nativeCoreSha256:hash(nativeHeader), vectors:vectors.length, failures:failures.length };
fs.mkdirSync(path.join(root, 'reports/th20'), { recursive:true });
fs.writeFileSync(path.join(root, 'reports/th20/shot-patterns.json'), JSON.stringify({ ...evidence, failures }, null, 2));
if (failures.length) throw new Error(`${failures.length} mismatches; see reports/th20/shot-patterns.json`);
fs.mkdirSync(path.join(root, 'tests/fixtures/th20'), { recursive:true });
fs.writeFileSync(path.join(root, 'tests/fixtures/th20/shot-patterns.json'), JSON.stringify({ evidence, vectors }));
console.log(JSON.stringify(evidence));
