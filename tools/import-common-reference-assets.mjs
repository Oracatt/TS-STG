import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// This is an explicit, visually reviewed allowlist, NOT a whole-game asset copier.
// PNGs are copied byte-for-byte. An updated source must be reviewed before changing hashes.
const selected = [
  ['bullet', 0, 'bullet-small', 'bullet/bullet1.png', '159058cea0fda9b6b47fc7c16dec9a71e035fce869f4b749aa08d55d976167ea'],
  ['bullet', 1, 'bullet-medium', 'bullet/bullet2.png', '22418c3f7794428edae3ba14c64b6594c6cf4d46f701b96305cbbe0c9a9b9b1f'],
  ['bullet', 4, 'laser-straight', 'bullet/laser1.png', '0396724f956b4798bc5e04913f22c472057dd26c01d0bac885958cea3e9322bb'],
  ['bullet', 5, 'bullet-cancel', 'effect/etbreak.png', '5c73bb54aa21ba4c620fb9881287aa24ae8c9da2ab1ff7fed92ecf461ac7e520'],
  ['bullet', 6, 'bullet-large-orb', 'bullet/bullet4.png', 'bdad4ff96b7623107cf1743eb2de4a2b4f438489ab39ad1b524b6e8de8ba4817'],
  ['bullet', 7, 'bullet-note-lightning', 'bullet/bullet5.png', '9bdd755ecd00a93acfe71e4f1f3305dfe406a2e5fa279cddc5fb3ebd9d948541'],
  ['bullet', 8, 'laser-flowing', 'bullet/laser2.png', 'f402e0d3238348b56501a8e8715bc7587f947f830c7c3a29b8055841ed84f2f7'],
  ['bullet', 9, 'bullet-patterned-orb', 'bullet/bullet6.png', '3116df53f6edb472cc02c5c06d412f918492dddbce5106309d9112d03f05c016'],
  ['effect', 2, 'effect-base', 'effect/eff_base.png', '6d0378af509da4bb54cbc63d6c5418d509f77476cfdc0ef359c2ca1ba8d8c860'],
  ['effect', 3, 'effect-focus', 'effect/eff_sloweffect.png', '25f7e97c3f8ba5f7f013264032c5ee3f9e1d1bc5b5352d89f90e1aaf8209c616'],
  ['effect', 4, 'effect-death-ring', 'effect/eff_deadcircle.png', '20dfa3c55bab1ef3a0e5c0958834c77f3c3336d2ca01822b5989ac753e41e024'],
  ['effect', 5, 'effect-petals', 'effect/eff_maple.png', 'ff76a1736233fbf6787bf3f88c7fe8cd7d75749e5d73a8baf1b4bce8859b3d8d'],
  ['effect', 6, 'effect-magic-circle', 'effect/eff_magicsquare.png', '6fed7262887dd0cdacc7ef006a26418a6012f8ac5f5ce76d17ddadda9a8daa95'],
  ['effect', 7, 'effect-aura', 'effect/eff_aura.png', '0e20a8250827d053dcaada48232ff83e4e81b70110dc5b0eb514cf81c65e867b'],
  ['effect', 8, 'effect-trail', 'effect/efflinegoast.png', 'd828751e65c3331c0b5c450397407eb486aa257768f0a3a3cb380b6f2c280f1d'],
  ['effect', 9, 'effect-break-wave-wide', 'effect/eff_breakwave2.png', '71536289c889d5149f63a2bdc6bccbf0fbb44696e9c3fa56ecc9a61ad4371c0c'],
  ['effect', 10, 'effect-break-wave-round', 'effect/eff_breakwave3.png', 'd32b7f7e202e4d2993fafa00fdc0cc042a348c362b7faea34e48d04d6a13f618'],
  ['effect', 11, 'effect-splash', 'effect/eff_splash.png', 'd0d00cfa4bba7e1da725ac144df979efd32b98266059b538056c3d817ec88cdb'],
  ['effect', 12, 'effect-charge', 'effect/eff_charge.png', 'e5d5738af725fe5a09a2541b19ff8cad31c5ac93827b71c3af654e92f4477fb1'],
  ['pl00', 2, 'bomb-orb', 'player/pl00/pl00b.png', '3d72880333c457bdac592cef006781b3b6e11405eeaf07924ecb15019abdd290'],
  ['pl01', 2, 'bomb-beam', 'player/pl01/pl01b.png', 'd626f97f379ddfb0c91c8c90315b7c1bd51bf3b92369c398708ac1fc80b12b74'],
  ['pl01', 3, 'bomb-beam-shell', 'player/pl01/pl01b2.png', '6d0a6ace4bbec240ca2c2a158d8f21bdf7af169aab23e349f1820ca1d08dcda7'],
  ['pl01', 4, 'bomb-radiant-orb', 'player/pl01/pl01g.png', 'ba31b8172d0bcea70e13e7405a1ad89251691fd9f3efd6b983c7e77c78a8754b'],
];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const localName = (texture, index) => `${texture}.${String(index).padStart(3, '0')}`;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const palettes = {
  standard: ['gray', 'red', 'rose', 'purple', 'pink', 'blue', 'periwinkle', 'cyan', 'light-cyan', 'green', 'lime', 'mint', 'yellow', 'pale-yellow', 'orange', 'white'],
  medium: ['gray', 'red', 'purple', 'blue', 'cyan', 'green', 'yellow', 'white'],
};

const notice = `# Common reference graphics — original resources, not MIT

These PNG files are unchanged original resources from Touhou Kinjoukyou
(Touhou 20), created by Team Shanghai Alice / ZUN. They are not original TS-STG
artwork and are not covered by TS-STG's MIT code license. The local user's
existing imported copy was the only input; this tool downloads nothing and
does not grant a license to publish or redistribute the original resources.

This local pack selects reusable visual motifs: standard bullets, beam strips,
bullet cancellation, particles, circles, flowers, and Bomb orb/beam textures.
"Common" describes suitability for reuse in STG games. It is not a claim that
each selected PNG is byte-identical to a file shipped by another Touhou game.
Every selected atlas was viewed in full. Whole images containing stone items,
mixed player weapon variants, portraits, character bodies, title artwork,
HUD text, or stage backgrounds are excluded. No pixels are cropped, keyed,
recolored, repacked, synthesized, or replaced. Source business files remain intact.

manifest.json records the original PNG SHA-256, source ANM archive SHA-256,
imported ANM metadata SHA-256, entry and sprite IDs, and original source names.
textures[].width/height are the original padded texture canvas dimensions;
contentWidth/contentHeight are the unchanged PNG dimensions. The texture loader
must preserve transparent padding, especially the 256x96 orb atlas loaded as
256x128 and the 96x256 beam shell loaded as 128x256.

Sprites use original pixel rectangles. Stable descriptive aliases and all
selected source rectangles are available. Clip timing follows the referenced
ANM sprite instructions at 60 ticks/second; clips contain only texture-frame
selection, not the full original ANM transforms, alpha/color, blending, UV
scroll, child spawning, bullet rules, or Bomb game logic. The caller supplies
those behaviors and the pack directory explicitly. Generic thlib has no
runtime dependency on the Touhou 20 demo or its asset paths.
`;

/** Build an explicit portable data pack from already-imported local originals. */
export function buildCommonReferencePack(source = join(root, 'games/touhou20/assets')) {
  source = resolve(source);
  const imported = readJson(join(source, 'manifest.json'));
  const banks = new Map(), copies = [], lookup = new Map();
  const manifest = {
    format: 'ts-stg-sprite-pack-v1', version: 1, name: 'common-reference', ticksPerSecond: 60,
    license: 'Original-resource; not MIT', notice: 'NOTICE.md',
    provenance: {
      work: 'Touhou Kinjoukyou (Touhou 20)', creator: 'Team Shanghai Alice / ZUN',
      input: 'Previously imported local originals; no network downloads',
      selection: 'Whole reviewed atlases with reusable visual motifs; no assertion of byte-identical reuse in other titles',
      pixels: 'All PNG files copied byte-for-byte without modification',
      clipScope: 'Texture frame selection only; ANM transformations, blend, UV scroll and game logic are not included',
    },
    textures: {}, sprites: {}, clips: {},
    excluded: [
      { archive: 'bullet.anm', entries: [2, 3], reason: 'Mixed standard items/bullets and title-specific stone item icons; no whole-atlas inclusion' },
      { archive: 'effect.anm', entries: [0], reason: 'Renderer state-switch placeholder, not a standalone drawable sprite atlas' },
      { archive: 'effect.anm', entries: [1], reason: 'Spell/bonus/life interface text and borders' },
      { archive: 'pl00.anm', entries: [0, 1], reason: 'Character body atlas and mixed player weapon variants; no whole-atlas inclusion' },
      { archive: 'pl01.anm', entries: [0, 1], reason: 'Character body atlas and mixed player weapon variants; no whole-atlas inclusion' },
      { scope: 'All other archives and entries', reason: 'Not selected: includes portraits/cut-ins, title, HUD, stage backgrounds and title-specific content' },
    ],
  };
  for (const [archive, index, id, expectedName, expectedHash] of selected) {
    if (!banks.has(archive)) {
      const bytes = readFileSync(join(source, 'anm', `${archive}.json`));
      const bank = JSON.parse(bytes.toString('utf8'));
      check(bank.format === 'th20-anm-v8', `Unsupported imported format: ${archive}`);
      banks.set(archive, { bank, sha256: sha256(bytes) });
    }
    const { bank, sha256: metadataHash } = banks.get(archive), entry = bank.entries[index];
    check(entry?.index === index && entry.name === expectedName, `Reviewed atlas identity changed: ${archive}/${index}`);
    const input = join(source, 'textures', archive, `entry-${index}.png`), bytes = readFileSync(input);
    check(sha256(bytes) === expectedHash && entry.texture.sha256 === expectedHash, `Reviewed PNG changed: ${archive}/${index}; review the complete atlas before updating the allowlist`);
    check(bytes.subarray(0, 8).equals(pngSignature), `Not a PNG: ${input}`);
    const contentWidth = bytes.readUInt32BE(16), contentHeight = bytes.readUInt32BE(20);
    check(contentWidth === entry.texture.width && contentHeight === entry.texture.height, `PNG dimensions disagree with source metadata: ${input}`);
    check(entry.width >= contentWidth && entry.height >= contentHeight, `Invalid padded texture canvas: ${input}`);
    const file = `textures/${id}.png`;
    manifest.textures[id] = { file, width: entry.width, height: entry.height, contentWidth, contentHeight,
      sha256: expectedHash, padding: { left: 0, top: 0, right: entry.width - contentWidth, bottom: entry.height - contentHeight },
      source: { archive: `${archive}.anm`, archiveSha256: imported.archives[archive].sourceSha256,
        entry: index, name: entry.name, metadataSha256: metadataHash, pngSha256: expectedHash } };
    copies.push({ input, file, sha256: expectedHash });
    const sprites = bank.sprites.filter(sprite => sprite.entry === index);
    check(sprites.length === entry.spriteCount, `Incomplete sprite table: ${archive}/${index}`);
    for (const sprite of sprites) {
      const key = localName(id, sprite.index - entry.spriteBase);
      check([sprite.x, sprite.y, sprite.width, sprite.height].every(Number.isFinite) && sprite.width > 0 && sprite.height > 0 && sprite.x >= 0 && sprite.y >= 0 && sprite.x + sprite.width <= entry.width && sprite.y + sprite.height <= entry.height,
        `Sprite outside padded texture: ${archive}/${sprite.index}`);
      manifest.sprites[key] = { texture: id, x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height,
        source: { archive: `${archive}.anm`, entry: index, sprite: sprite.index, storedId: sprite.storedId } };
      lookup.set(`${archive}/${sprite.index}`, key);
    }
  }
  const alias = (name, archive, index) => {
    const key = lookup.get(`${archive}/${index}`); check(key, `Alias uses excluded sprite: ${name}`);
    manifest.sprites[name] = { ...manifest.sprites[key], aliasOf: key };
  };
  const colors = (shape, base, palette = palettes.standard, reviewedRect) => {
    if (reviewedRect) {
      const first = banks.get('bullet').bank.sprites[base];
      check([first.x, first.y, first.width, first.height].every((value, i) => value === reviewedRect[i]), `Reviewed semantic row changed: ${shape}`);
    }
    palette.forEach((color, i) => alias(`${shape}.${color}`, 'bullet', base + i));
  };
  // Sprite IDs are NOT ordered by atlas row. In particular small star=288,
  // capsule=240, glow=256; medium heart=408, oval=392 and ring=436.
  // These origins were rechecked against full PNGs and style_data's sprite IDs.
  for (const [shape, base, rect] of [
    ['pellet', 0, [0, 240, 8, 8]], ['orb', 64, [0, 48, 16, 16]], ['ring', 96, [0, 32, 16, 16]],
    ['rice', 128, [0, 65, 16, 14]], ['kunai', 160, [0, 81, 16, 14]], ['needle', 176, [0, 97, 16, 14]],
    ['amulet', 208, [1, 112, 14, 16]], ['star', 288, [1, 161, 14, 14]], ['capsule', 240, [1, 129, 14, 14]],
    ['oval-ring', 272, [1, 144, 14, 16]], ['glow', 256, [1, 177, 14, 14]],
  ]) colors(`bullet.${shape}`, base, palettes.standard, rect);
  for (const [shape, base, rect] of [
    ['orb-medium', 368, [0, 33, 32, 30]], ['heart-ring', 408, [1, 65, 30, 30]], ['knife', 400, [1, 97, 30, 30]],
    ['oval', 392, [1, 129, 30, 30]], ['star-large', 416, [1, 1, 30, 30]], ['ring-medium', 436, [1, 161, 30, 30]],
    ['orb-large', 548, [1, 1, 62, 62]], ['lightning', 568, [1, 65, 30, 30]], ['diamond', 576, [1, 97, 30, 30]],
    ['droplet', 584, [1, 129, 30, 30]], ['orb-patterned', 596, [1, 1, 30, 30]],
  ]) colors(`bullet.${shape}`, base, palettes.medium, rect);
  colors('laser.straight', 524);
  for (const [name, archive, index] of [
    ['bomb.orb', 'pl00', 73], ['bomb.beam', 'pl01', 86], ['bomb.beam-shell', 'pl01', 87], ['bomb.radiant-orb', 'pl01', 88],
    ['effect.focus.red', 'effect', 23], ['effect.focus.green', 'effect', 24], ['effect.death-ring.orange', 'effect', 25],
    ['effect.death-ring.blue', 'effect', 27], ['effect.death-ring.yellow', 'effect', 26], ['effect.death-ring.green', 'effect', 28],
    ['effect.petal.pink', 'effect', 29], ['effect.petal.white', 'effect', 30], ['effect.leaf.maple', 'effect', 31], ['effect.flower.blue', 'effect', 32],
    ['effect.magic-circle', 'effect', 33], ['effect.aura.butterfly', 'effect', 34], ['effect.aura.smoke', 'effect', 35],
    ['effect.trail', 'effect', 40], ['effect.charge', 'effect', 74], ['effect.particle', 'effect', 7],
  ]) alias(name, archive, index);
  // Each clip is checked against the original bytecode sprite-change timeline.
  const clip = (name, archive, scriptIndex, start, end, frameDuration, loop, expected, remap = 0) => {
    const script = banks.get(archive).bank.scripts[scriptIndex];
    const changes = script.instructions.filter(instruction => instruction.opcode === 300 && instruction.time >= (start === 0 ? -1 : start) && instruction.time < end);
    check(changes.length === expected.length && changes.every((instruction, i) => instruction.mask === 0 && instruction.args[0] === expected[i]), `Source clip changed: ${name}`);
    const frames = [];
    for (let time = start; time < end; time += frameDuration) {
      let instruction = changes[0];
      for (const candidate of changes) if (Math.max(start, candidate.time) <= time) instruction = candidate;
      const sprite = lookup.get(`${archive}/${instruction.args[0] + remap}`);
      check(sprite, `Clip uses excluded sprite: ${name}`); frames.push(sprite);
    }
    check(changes.every(instruction => (Math.max(start, instruction.time) - start) % frameDuration === 0) && (end - start) % frameDuration === 0, `Nonuniform clip quantum: ${name}`);
    manifest.clips[name] = { frames, frameDuration, loop,
      source: { archive: `${archive}.anm`, script: scriptIndex, fromTime: start, untilTime: end,
        spriteRemap: remap, instructionOffsets: changes.map(instruction => instruction.offset), scope: 'texture frames only' } };
  };
  const range = (base, count) => Array.from({ length: count }, (_, i) => base + i);
  clip('bullet.cancel', 'bullet', 162, 0, 16, 2, false, range(540, 8));
  clip('laser.flowing', 'bullet', 327, 0, 8, 2, true, range(592, 4));
  clip('effect.break-wave-wide', 'effect', 136, 0, 24, 2, false, range(41, 12));
  clip('effect.break-wave-round', 'effect', 143, 0, 26, 2, false, range(53, 12));
  clip('effect.splash', 'effect', 148, 0, 18, 2, false, range(65, 9));
  ['red', 'blue', 'green', 'purple'].forEach((color, i) => {
    [0, 1, 2].forEach(frame => alias(`bullet.note.${color}.${frame}`, 'bullet', 556 + i * 3 + frame));
    clip(`bullet.note.${color}`, 'bullet', 320, 48, 80, 8, true, [556, 557, 558, 557], i * 3);
  });
  manifest.counts = { textures: copies.length, sourceSprites: lookup.size,
    namedSprites: Object.keys(manifest.sprites).length, clips: Object.keys(manifest.clips).length,
    pngBytes: copies.reduce((sum, copy) => sum + readFileSync(copy.input).length, 0) };
  return { manifest, copies, notice };
}

/** Verify the result can be relocated and contains exactly the selected payload. */
export function writeCommonReferencePack({ source, out = join(root, 'packages/thlib/assets/reference-common'), checkOnly = false } = {}) {
  const pack = buildCommonReferencePack(source), destination = resolve(out), expected = new Set(['manifest.json', 'NOTICE.md', ...pack.copies.map(copy => copy.file)]);
  // Refuse to silently retain unrelated/original assets in a supposedly filtered pack.
  const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [relative(destination, join(path, entry.name)).split(sep).join('/')]);
  if (existsSync(destination)) for (const file of walk(destination)) check(expected.has(file), `Unexpected file in selected pack: ${file}; inspect it manually`);
  if (!checkOnly) {
    mkdirSync(join(destination, 'textures'), { recursive: true });
    for (const copy of pack.copies) copyFileSync(copy.input, join(destination, copy.file));
    writeFileSync(join(destination, 'NOTICE.md'), pack.notice, 'utf8');
    writeFileSync(join(destination, 'manifest.json'), JSON.stringify(pack.manifest, null, 2) + '\n', 'utf8');
  }
  check(readFileSync(join(destination, 'NOTICE.md'), 'utf8') === pack.notice, 'Pack provenance notice differs');
  check(readFileSync(join(destination, 'manifest.json'), 'utf8') === JSON.stringify(pack.manifest, null, 2) + '\n', 'Pack manifest differs from the reviewed source');
  for (const copy of pack.copies) {
    check(!isAbsolute(copy.file) && !copy.file.includes('..'), 'Pack texture path is not portable');
    check(sha256(readFileSync(join(destination, copy.file))) === copy.sha256, `Copied PNG differs: ${copy.file}`);
  }
  return { ...pack.manifest.counts, out: destination, checkOnly };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  for (let i = 2; i < process.argv.length; i++) {
    const argument = process.argv[i];
    if (argument === '--check') options.checkOnly = true;
    else if (argument === '--source' || argument === '--out') {
      check(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `Missing path after ${argument}`);
      options[argument.slice(2)] = resolve(process.argv[++i]);
    } else fail(`Unknown argument: ${argument}. Usage: node tools/import-common-reference-assets.mjs [--source imported-assets] [--out common-pack] [--check]`);
  }
  console.log(JSON.stringify(writeCommonReferencePack(options), null, 2));
}
