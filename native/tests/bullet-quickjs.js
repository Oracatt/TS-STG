import {verifyBulletVectors} from './bullet-compare.js';
const result=verifyBulletVectors(JSON.parse(tsstg.readText('tests/fixtures/th20-bullet-vectors.json')));
console.log('Original source bullet numerical kernels',JSON.stringify(result));
globalThis.__tsstg_game={update(){},render(){return[];},snapshot(){return result;}};
