import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseTh20Sht } from '../games/touhou20/src/shot-data.js';
const root = path.resolve(process.argv[2] ?? 'D:/AIWorkspace/Touhou20Reconstruction');
const output = path.resolve(process.argv[3] ?? 'games/touhou20/assets/shots');
await mkdir(output, { recursive: true });
for (const name of ['pl00', 'pl01']) {
  const source = await readFile(path.join(root, 'assets/raw', `${name}.sht`));
  const parsed = parseTh20Sht(source);
  parsed.source = { file: `${name}.sht`, sha256: crypto.createHash('sha256').update(source).digest('hex') };
  await writeFile(path.join(output, `${name}.json`), JSON.stringify(parsed));
  console.log(`${name}: ${parsed.patterns.length} patterns, ${parsed.patterns.reduce((sum, p) => sum + p.length, 0)} exact SHT rows`);
}
