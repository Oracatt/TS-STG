# Common reference graphics — original resources, not MIT

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
