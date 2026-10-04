import {verifyLaserVectors} from './laser-compare.js';
const result=verifyLaserVectors(JSON.parse(tsstg.readText('tests/fixtures/th20-laser-vectors.json')));
console.log('Original source laser curve kernels',JSON.stringify(result));
globalThis.__tsstg_game={update(){},render(){return[];},snapshot(){return result;}};
