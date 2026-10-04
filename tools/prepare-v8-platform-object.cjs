#!/usr/bin/env node
'use strict';

// Rusty V8's platform factory owns libc++ objects internally. Its complete
// binding.obj also contains Rust inspector/serializer delegates. Extract only
// the two platform functions and their exact COFF relocation/unwind closure;
// no executable bytes are changed and no delegate stubs are introduced.
const fs = require('node:fs');
const crypto = require('node:crypto');
const [input, output, reportFile] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node tools/prepare-v8-platform-object.cjs binding.obj platform.obj [report.json]');
const bytes = fs.readFileSync(input);
const machine = bytes.readUInt16LE(0), count = bytes.readUInt16LE(2);
const tableOffset = bytes.readUInt32LE(8), symbolCount = bytes.readUInt32LE(12);
if (machine !== 0x8664 || bytes.readUInt16LE(16) !== 0) throw new Error('Expected ordinary AMD64 COFF object');
const stringsOffset = tableOffset + symbolCount * 18;
const stringsSize = bytes.readUInt32LE(stringsOffset);
if (stringsOffset + stringsSize > bytes.length) throw new Error('Invalid COFF string table');
const readString = offset => {
  const start = stringsOffset + offset;
  const end = bytes.indexOf(0, start);
  if (offset < 4 || end < start || end >= stringsOffset + stringsSize) throw new Error('Invalid COFF string reference');
  return bytes.toString('utf8', start, end);
};
const symbols = [], byIndex = new Map();
for (let index = 0; index < symbolCount;) {
  const offset = tableOffset + index * 18;
  const raw = bytes.subarray(offset, offset + 18);
  const name = raw.readUInt32LE(0) === 0 ? readString(raw.readUInt32LE(4)) : raw.subarray(0, 8).toString('utf8').replace(/\0.*$/, '');
  const symbol = { index, name, section: raw.readInt16LE(12), storage: raw[16], auxCount: raw[17], raw, aux: [] };
  for (let n = 0; n < symbol.auxCount; n++) symbol.aux.push(bytes.subarray(offset + (n + 1) * 18, offset + (n + 2) * 18));
  symbols.push(symbol); byIndex.set(index, symbol); index += 1 + symbol.auxCount;
}
const sections = [];
for (let index = 1; index <= count; index++) {
  const offset = 20 + (index - 1) * 40;
  const raw = bytes.subarray(offset, offset + 40);
  const nameBytes = raw.subarray(0, 8).toString('utf8').replace(/\0.*$/, '');
  const name = nameBytes.startsWith('/') ? readString(Number(nameBytes.slice(1))) : nameBytes;
  const size = raw.readUInt32LE(16), pointer = raw.readUInt32LE(20);
  const relocationPointer = raw.readUInt32LE(24), relocationCount = raw.readUInt16LE(32);
  if (relocationCount === 0xffff || raw.readUInt16LE(34)) throw new Error('Unsupported COFF overflow relocations/line records');
  const data = size ? bytes.subarray(pointer, pointer + size) : Buffer.alloc(0);
  const relocations = [];
  for (let n = 0; n < relocationCount; n++) {
    const reloc = bytes.subarray(relocationPointer + n * 10, relocationPointer + (n + 1) * 10);
    relocations.push({ raw: reloc, symbol: reloc.readUInt32LE(4) });
  }
  sections.push({ index, name, raw, data, relocations, parent: 0 });
}
for (const symbol of symbols) {
  if (symbol.storage !== 3 || symbol.section <= 0 || !symbol.auxCount || symbol.name !== sections[symbol.section - 1].name) continue;
  if (symbol.aux[0][14] === 5) sections[symbol.section - 1].parent = symbol.aux[0].readUInt16LE(12);
}
const platformExports = ['v8__Platform__NewDefaultPlatform', 'v8__Platform__DELETE'];
const keep = new Set();
for (const name of platformExports) {
  const symbol = symbols.find(row => row.name === name);
  if (!symbol || symbol.section <= 0) throw new Error(`Missing platform function: ${name}`);
  keep.add(symbol.section);
}
const referenced = new Set();
let expanded;
do {
  expanded = false;
  for (const section of sections) {
    if (section.name.startsWith('.debug')) continue;
    if (section.parent && keep.has(section.parent) && !keep.has(section.index)) { keep.add(section.index); expanded = true; }
    if (!keep.has(section.index)) continue;
    for (const reloc of section.relocations) {
      referenced.add(reloc.symbol);
      const symbol = byIndex.get(reloc.symbol);
      if (!symbol) throw new Error('Relocation references an auxiliary or missing symbol');
      if (symbol.section > 0 && !keep.has(symbol.section)) { keep.add(symbol.section); expanded = true; }
    }
  }
} while (expanded);
const selectedSections = sections.filter(row => keep.has(row.index));
if (selectedSections.some(row => row.name === '.CRT$XCU' || row.name.startsWith('.debug'))) throw new Error('Unexpected initializer/debug dependency');
const sectionMap = new Map(selectedSections.map((row, n) => [row.index, n + 1]));
const selectedSymbols = symbols.filter(row => keep.has(row.section) || referenced.has(row.index));
const symbolMap = new Map();
let newSymbolCount = 0;
for (const symbol of selectedSymbols) { symbolMap.set(symbol.index, newSymbolCount); newSymbolCount += 1 + symbol.auxCount; }
const symbolChunks = [];
for (const symbol of selectedSymbols) {
  const raw = Buffer.from(symbol.raw);
  if (symbol.section > 0) raw.writeInt16LE(sectionMap.get(symbol.section), 12);
  symbolChunks.push(raw);
  for (const original of symbol.aux) {
    const aux = Buffer.from(original);
    if (symbol.storage === 3 && symbol.section > 0 && symbol.name === sections[symbol.section - 1].name && aux[14] === 5) {
      const parent = sectionMap.get(aux.readUInt16LE(12));
      if (!parent) throw new Error('Missing associated COFF section');
      aux.writeUInt16LE(parent, 12);
    } else if (symbol.storage === 105) throw new Error('Unsupported weak external COFF dependency');
    symbolChunks.push(aux);
  }
}
const headers = [], payload = [];
let cursor = 20 + selectedSections.length * 40;
for (const section of selectedSections) {
  const raw = Buffer.from(section.raw);
  raw.writeUInt32LE(section.data.length ? cursor : 0, 20);
  if (section.data.length) { payload.push(section.data); cursor += section.data.length; }
  raw.writeUInt32LE(section.relocations.length ? cursor : 0, 24);
  raw.writeUInt32LE(0, 28); raw.writeUInt16LE(0, 34);
  for (const reloc of section.relocations) {
    const row = Buffer.from(reloc.raw), index = symbolMap.get(reloc.symbol);
    if (index === undefined) throw new Error('Missing retained relocation symbol');
    row.writeUInt32LE(index, 4); payload.push(row); cursor += 10;
  }
  headers.push(raw);
}
const header = Buffer.from(bytes.subarray(0, 20));
header.writeUInt16LE(selectedSections.length, 2); header.writeUInt32LE(cursor, 8); header.writeUInt32LE(newSymbolCount, 12);
const result = Buffer.concat([header, ...headers, ...payload, ...symbolChunks, bytes.subarray(stringsOffset, stringsOffset + stringsSize)]);
fs.writeFileSync(output, result);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const report = {
  inputSha256: hash(bytes), outputSha256: hash(result),
  exportedFunctions: platformExports, originalSections: count, retainedSections: selectedSections.length,
  retainedSymbols: selectedSymbols.length,
  externalSymbols: selectedSymbols.filter(row => row.section === 0 && row.storage === 2).map(row => row.name),
  executableBytesUnmodified: true,
  sections: selectedSections.map(row => ({originalIndex: row.index, name: row.name, size: row.data.length, relocations: row.relocations.length, sha256: hash(row.data)})),
};
if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({retainedSections: report.retainedSections, retainedSymbols: report.retainedSymbols, outputSha256: report.outputSha256}) + '\n');
