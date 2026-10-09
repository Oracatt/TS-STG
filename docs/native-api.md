# Native host API

The global `tsstg` object exposes platform services. Its TypeScript contract is `packages/thlib/src/native-host.ts`, emitted as `dist/native-host.d.ts`. Game rules and image processing are authored in portable TypeScript and run as compiled JavaScript.

`NativeHost` is exported as a type from `@ts-stg/thlib`. The native executable defaults to the consumer project's `main.js`. The engine SDK contains only the native host, thlib, common assets, API documentation and licenses; it contains no demo. Repository launchers explicitly choose a demo, and `-WithReferenceAssets` creates a separate private local demo bundle rather than a release artifact.

## Entry and files

The entry sets `globalThis.__tsstg_game` with synchronous `update(inputMask)` and `render()` methods and an optional `snapshot()`. The host advances at 60 updates per second; `render()` returns the command arrays described in [ARCHITECTURE.md](../ARCHITECTURE.md). `tsstg.width`/`height` describe the 960 × 720 logical canvas; `version`/`backend` identify the host. `quit()` requests exit and `log(text)` writes a diagnostic.

`readText(path)` reads UTF-8 under the project root. `writeText(path,text)` writes under that project's `userdata/` directory. Resource paths also resolve under the project root; canonical paths cannot escape it. The supported bare import is `@ts-stg/thlib`, using `packages/thlib/src` or `node_modules/@ts-stg/thlib/src`. Application modules use relative imports. A linked installed library can reside outside the project; only that selected library's module reads and internal relative imports receive access to its canonical source directory. Common asset files must be placed inside the consumer project and loaded through an explicitly supplied resource path.

CLI options are `--root path`, `--backend auto|quickjs|v8`, `--headless`, `--frames N`, `--input mask`, `--snapshot path`, `--screenshot path` and Windows `--frame-stream local-pipe`. The input override applies in graphical mode too. `--screenshot` saves the last rendered frame; headless mode cannot create a screenshot. Runtime failures exit nonzero with diagnostics, including stacks when available.

`--backend auto` selects V8 when compiled in, otherwise QuickJS-NG. Windows x64 builds include both by default; `build.ps1 -QuickJSOnly` or CMake `-DTSSTG_ENABLE_V8=OFF` builds QuickJS alone. Explicit `--backend v8` on that build fails with a diagnostic. V8 is embedded as a static library with its startup snapshot, without Node.js or browser globals. Both runtimes use the same native services, ESM resolver, drawing ABI and JS thlib. `tsstg.backend` reports `v8` or `quickjs`; the window title and profile include the runtime version. Floating-point transcendental functions can differ at the last binary64 bits across engines, so replay verification should use the same backend as recording.

`--profile path.json` records separate JS update, JS drawing, command decoding, CPU drawing submission, presentation wait, audio and profiler costs, with p50/p95 statistics. Graphical runs also record asynchronous GPU elapsed queries when available. `--profile-warmup N` skips the first N rendered frames (default 60). `--benchmark --frames N` disables frame pacing and performs exactly one fixed simulation update per rendered frame; use it for repeatable workloads, not normal play. Normal play keeps 60 Hz simulation and may perform multiple updates before a render when behind. Headless measurements contain no GPU work. See [performance measurements](performance.md).

## Textures and ownership

| Method | Behavior |
| --- | --- |
| `loadTexture(path, paddedWidth?, paddedHeight?)` | Decodes a project-relative image; optional canvas puts the original at top-left and pads with transparent RGBA. Both dimensions are required together. |
| `createTexture(width,height,pixels)` | Uploads tightly packed, top-left RGBA bytes from Uint8Array or Uint8ClampedArray. Subarray offsets are respected. |
| `createRenderTarget(width,height)` | Allocates an offscreen color/depth target; returned ID also works as a texture. |
| `readTexturePixels(id=0)` | Returns a new `{width,height,pixels:Uint8Array}` snapshot. ID0 reads the previous completed logical canvas. |
| `updateTexture(id,pixels)` | Replaces the full RGBA image; byte length must equal width × height × 4. |
| `updateTextureRegion(id,x,y,width,height,pixels)` | Updates an in-bounds top-left-origin subrectangle, with exactly width × height × 4 RGBA bytes. Render targets preserve the same orientation. No full texture readback is needed. |
| `unloadTexture(id)` | Releases a texture or render target, including target attachments. The ID becomes invalid. |

Creation dimensions are 1–4096. Pixel readback and updates use the same top-left orientation for textures, targets and canvas; GPU framebuffer orientation is handled by the host. New targets are transparent and default to bilinear filtering with clamped edges. Updates never resize resources. Readback is synchronous and copies data; keep expensive processing outside per-frame paths when possible.

Headless mode retains decoded/uploaded pixels and validates rendering commands. It does not rasterize commands: new targets and the logical canvas read as transparent zero RGBA until explicitly uploaded. This supports numerical tests but cannot establish image equivalence.

Each load/create allocates a resource owned by the caller. Release it explicitly or reuse it; no implicit path cache exists in native code. `Resources.release()/dispose()` owns its cache, and `AnmBank.dispose()` can use an injected unloadTexture adapter. Shared caches require their own reference counting. Native shutdown releases all remaining resources. Double release and stale IDs throw an exception.

## Audio and fonts

`loadSound(path)` returns a decoded sound ID. `playSound(id,volume=1,pan=0.5,loop=false)` sets gain/pan and starts it. Raylib pan0 is right, pan1 is left. `stopSound(id)` stops playback and cancels looping; `unloadSound(id)` releases the buffer. Looping sounds restart at a display-frame boundary, so this is not a sample-exact mixer.

`pauseSound(id)`/`resumeSound(id)` preserve the actual sound buffer's playback position. `isSoundPlaying(id)` reports active playback and returns false while paused or without an audio device. Paused looped sounds remain suspended until resumed; resume does not restart a stopped sound.

`loadMusic(path)` creates a stream. `playMusic(id,volume=1)`, `stopMusic(id)`, `seekMusic(id,seconds)` and `getMusicTime(id)` control it. `setMusicLoop(id,startSeconds,endSeconds)` preserves the intro then seeks to the configured loop interval. Bounds require finite `0 <= start < end` and, with an audio device, must fit the decoded stream. Loop seeking occurs per rendered frame; original DirectSound mixing and sample-exact loop timing are not claimed. `unloadMusic(id)` stops/releases the stream and clears its loop state. In headless mode music time is zero; the host verifies the file path and range ordering without opening a stream or checking its decoded duration.

`pauseMusic(id)`/`resumeMusic(id)` call the stream's real pause/resume operations. Pausing suspends both stream updates and loop-range seeking, preserving the cursor. These operations do not approximate pause by stopping and replaying.

`stopMusic(id)` clears queued PCM and rewinds the decoder even when the stream was already stopped or paused. Stopped streams are not refilled by the display loop. `seekMusic(id,seconds)` discards the old queued PCM, moves to the requested position, and preserves playing, paused or stopped state and gain. This allows a cached handle to restart with `stopMusic`, `seekMusic(id,0)`, then `playMusic`; unloading/reopening the file is unnecessary. These operations work around the pinned raylib 5.5 buffer reset behavior through its public API.

`setMusicVolume(id,volume)` changes stream gain without starting, resuming, stopping or seeking playback. Both arguments are required; `volume` must be a finite number in `[0,1]`, including silent `0`. Paused and stopped streams accept gain changes without changing their transport state. Headless/no-audio operation still validates the loaded music handle and arguments, then omits the device call. Fades and their timing belong to JS; the host supplies only immediate gain control.

`loadFont(path,size=32)` loads a font; the atlas grows as text encounters additional Unicode codepoints. `unloadFont(id)` releases its atlas. Font resources remain owned by their caller.

Windows also provides `createTextLayout(text,options)`, `rasterizeTextLayout(layoutId,options)` and `destroyTextLayout(layoutId)`. This path uses the system DirectWrite font collection, actual shaping, wrapping and alignment, then DirectWrite glyph outlines with Direct2D geometry fill/stroke. It does not ship system fonts. Unavailable family names fail explicitly. Layout options are `fontFamily` (default Arial), `fontSize` (20), `locale` (en-us), `width` (300), `height` (50), `horizontalAlign` (left/center/right) and `verticalAlign` (top/center/bottom). Layouts use normal weight, style and stretch; text is limited to 16,384 UTF-8 bytes.

For bitmap font compatibility, Windows provides `hasSystemFont(family)`, `encodeText(text,codePage)` and `rasterizeBitmapText(text,options)`. Encoding returns Windows code-page bytes without a terminator, using the platform's default replacement for unmappable characters. Rasterization performs the same code-page round trip before GDI `GetTextExtentPoint32W` and `TextOutW`; `extentWidth`/`extentHeight` are natural GDI metrics even when explicit character spacing is used. It returns `{width,height,pixels,extentWidth,extentHeight}` and does not allocate a texture.

Bitmap rasterization rejects unavailable font names by default. `allowFontSubstitution:true` explicitly enables GDI's normal font mapper, for applications reproducing that fallback behavior. `hasSystemFont` always reports whether the requested family itself is installed.

Bitmap options are integer `width`/`height` (300/50, range 1–4096), `x`/`y` (0), `fontFamily` (Arial), positive GDI font cell `fontSize` (20), `fontWeight` (400), `charSet` (1), `quality` (0), `pitchAndFamily` (0), `codePage` (65001), `spacing` (0), RGBA `fill` (white) and `background` (opaque black). Nonzero spacing draws each UTF-16 unit with that exact advance; no extra padding or hidden coordinate offsets are added. An optional full-size `pixels` byte array initializes the surface instead of its background. The returned RGBA retains raw GDI alpha writes: drawn glyphs normally have zero alpha and untouched pixels retain the caller's alpha. The caller owns outline generation, alpha inversion, crop, texture upload and any source-specific typography. The implementation uses a top-down 32-bit `BITMAPV4HEADER`/`BI_BITFIELDS` surface, with one internal padding row excluded from the returned logical dimensions. These APIs work in headless Windows runs; other platforms report that the GDI service is unavailable.

Raster options are the target `width`/`height` (default 960/720, 1–4096), `layoutX`/`layoutY`, `scale`, `rotation` in radians, `x`/`y`, RGBA `fill`/`outline` and `strokeWidth`. The glyph-run baseline is translated by the layout offset, scaled, rotated, then translated by x/y. The transformed outline is stroked in output pixels, so scaling glyphs does not enlarge the stroke width. The full target is rasterized before cropping, preserving the pixel grid and clipping. The result `{texture,x,y,width,height}` gives the independent cropped texture and its position in that target. Empty/offscreen text returns texture0 and zero dimensions. Each nonzero texture must be released with `unloadTexture`; destroying the layout does not release its raster textures. Cache raster textures for repeated transforms instead of rerasterizing unchanged text every frame.

Raster pixels default to straight RGBA. Set `premultiplied:true` to retain Direct2D premultiplied RGB for an explicit `one/oneMinusSrcAlpha` source-over compositor. Both forms preserve alpha. Layout and CPU rasterization also work headlessly, and their generated textures support pixel readback; ordinary headless command drawing still does not rasterize a scene. Other operating systems currently reject this API with an explicit Windows requirement.

## Drawing details

Colors are unsigned RGBA integers; rotations are radians. `mesh` has `[x,y,u,v,color]` vertices and triangle indices. Texture ID0 is white for untextured per-vertex geometry. Meshes allow 65,536 vertices and 393,216 indices. `lineStrip` uses one-pixel segments with interpolated endpoint colors; `point` draws one pixel.

`['mesh3d',textureId,vertices,indices,mvp]` accepts `[x,y,z,u,v,color]` vertices and a 16-number column-major OpenGL clip transform. JS owns all camera/world/projection calculations. The host sends 3D vertices through this matrix on the GPU, preserving clip W and perspective-correct UV interpolation; it draws both faces without depth testing, then restores the 2D matrices. UV orientation and size limits match `mesh`.

`['quad',id,corners,x,y,scale,offsetX,offsetY,u0,v0,u1,v1,color0,color1,color2,color3,pixelSnap]` is a compact, generic four-corner mesh. `corners` contains eight already-resolved local coordinates in top-left, top-right, bottom-left, bottom-right order. Colors are RGBA; `pixelSnap` is a boolean. Each output coordinate uses three distinct binary32 operations: `translated=f32(position+local)`, `scaled=f32(translated*scale)`, `result=f32(offset+scaled)`. Optional snapping rounds to the nearest integer with ties away from zero, converts to binary32, then subtracts 0.5 in binary32. The host uses the same indices `[0,1,2,1,3,2]`, texture orientation and drawing state as `mesh`; it does not interpret animation, rotation, parent transforms or gameplay data. Inputs and results use the mesh coordinate limit of ±10,000,000. `DrawList.quad(...)` exposes this command. The ANM renderer retains its ordinary `mesh` fallback for custom drawing adapters without `quad`.

`blendFactors` accepts `zero`, `one`, `srcColor`, `oneMinusSrcColor`, `srcAlpha`, `oneMinusSrcAlpha`, `dstAlpha`, `oneMinusDstAlpha`, `dstColor`, `oneMinusDstColor`; equations are `add`, `subtract`, `reverseSubtract`, `min`, `max`. Color and alpha factors/equations are independent. Close with `blendEnd`.

`['statefulQuad',id,corners,x,y,scale,offsetX,offsetY,u0,v0,u1,v1,color0,color1,color2,color3,pixelSnap,state]` draws the same quad with a scoped drawing state. `state` is a reusable ten-element array `[cutoff,src,dst,operation,srcAlpha,dstAlpha,alphaOperation,filter,wrapU,wrapV]`, using the names and ranges of `alphaTest`, `blendFactors` and `sampler`. Its exact expansion is `alphaTest(cutoff)`, `blendFactors(...)`, `sampler(id,...)` when id is nonzero, `quad(...)`, `blendEnd()`, `alphaTest(0)`. Texture sampler state persists; blend returns to alpha and fragment cutoff returns to zero. It cannot be placed inside an open blend scope. Geometry, target orientation, bounds and self-sampling validation match `quad`. `DrawList.statefulQuad(...)` exposes the command; adapters that only support `quad` continue to use the expanded commands. This reduces command-array allocation and script/native decoding without changing draw order or merging overlapping sprites. The native quad uses fixed-size geometry storage rather than allocating a mesh vertex/index vector per sprite.

`['alphaTest',cutoff]` discards fragments whose final texture × vertex alpha is less than `cutoff`, before blending. Values must be finite and between 0 and 1; 0 disables it. This drawing state persists until the next `alphaTest` command and starts disabled each frame. `DrawList.alphaTest(cutoff)` exposes the same primitive. The source ANM adapter uses 1/255 for normal blend modes and disables it for replace mode; this preserves valid black pixels and does not rewrite texture bytes.

The logical canvas is presented to the window as opaque RGB, like a backbuffer presentation. Its stored alpha is not used for a second blend against the window clear color. Canvas screenshots likewise have opaque output alpha. Offscreen targets and `readTexturePixels` retain their actual RGBA data, including independently blended alpha, for subsequent composition and pixel processing.

`sampler` filter is `point`, `bilinear` or `anisotropic4x`; each address mode is `clamp`, `wrap` or `mirror`. Anisotropic filtering uses linear minification/magnification and up to four samples, subject to the graphics device's support. Changing back to point/bilinear resets anisotropy. Offscreen targets cannot nest or cross open scissor/blend scopes. A texture cannot sample itself while it is the active target. All commands are validated in headless mode too.

## Programmable shaders

`createShader(fragmentSource, vertexSource=null)` creates a caller-owned GLSL 330 program. A null/omitted vertex source uses the host's vertex stage, including its `mvp`, `fragTexCoord` and `fragColor`. Release with `unloadShader(id)`; stale IDs are rejected. Each source is limited to 1 MiB. Graphics mode compiles/links the program and rejects errors. Headless mode validates resource ownership and command structure but does not compile GLSL or establish pixel correctness.

`DrawList.shaderBegin(id, uniforms)` / `shaderEnd()` provide non-nested scopes. Uniform entries are `[name,type,components]`; types are `float`, `vec2/3/4`, `int`, `ivec2/3/4`, and column-major `mat4`. Component counts must match; values are finite and within ±10,000,000, and integer uniforms require integers. Names must be unique in a scope and resolve to an active shader uniform during graphical execution. The host still manages `texture0`/`mvp` when drawing ordinary primitives. Render-target textures retain the documented bottom-up GPU coordinates; application shaders that work in top-down source coordinates must convert before their calculation and back when sampling.

Shaders own fragment output. Implicit alpha testing must be zero when entering and throughout a custom shader scope, including any `statefulQuad`. The host rejects conflicting nonzero cutoffs rather than silently ignoring them. Blend, sampler, scissor and render-target commands remain independently available. Shader scopes must close in the same render list; ordinary drawing after `shaderEnd()` returns to the host's normal shader path. No STG-specific formula is compiled into the native host.

## Verification

CTest includes media, pixel roundtrip/subview/padding, 64 repeated create/release cycles, stale resource rejection, module roots, script errors and selected source numerical differentials. `native/tests/pixel-capture-graphics.js` additionally checks actual GPU target/canvas orientation; `native/tests/pixels.js` runs both graphically and headlessly. These tests use authored tiny assets and require no original game data.

`native/tests/mesh3d-graphics.js` distinguishes perspective-correct from affine UV sampling using framebuffer pixels and verifies 2D drawing after the projected mesh.

## Windows local frame stream

`--frame-stream '\\.\pipe\name'` presents the actual GPU-rendered logical canvas through a local Windows named pipe while keeping the native graphics window hidden. The receiver must listen before starting the engine. Only the literal `\\.\pipe\` prefix and a single nonempty name are accepted; the complete UTF-8 argument is at most 256 bytes, and the name cannot contain bytes below `0x20`, `/`, `\` or `:`. Remote pipes are rejected. This option requires Windows graphical mode and cannot be combined with `--headless`.

Every two completed renders, the host sends a 16-byte header followed immediately by tightly packed pixels:

| Offset | Type | Value |
| --- | --- | --- |
| 0 | 4 ASCII bytes | `TSFR` |
| 4 | uint32 little-endian | Width, currently 960 |
| 8 | uint32 little-endian | Height, currently 720 |
| 12 | uint32 little-endian | Payload length, exactly width × height × 4 |
| 16 | RGBA bytes | Rows from top to bottom, pixels from left to right |

Pipe reads may split or combine headers and payloads; the receiver must buffer and parse the byte stream. Output alpha is 255, matching window presentation and `--screenshot`. This does not change stored render-target alpha or the `readTexturePixels` API.

Simulation retains its fixed 60 Hz clock; the normal display stream is approximately 30 Hz, not a separate simulation clock. GPU readback and pipe writes are synchronous, so the receiver must keep draining the pipe. Consumers can drop complete display frames when their UI is busy. These transport costs are additional to ordinary native play and should not be used to infer standalone game performance. A disconnected pipe ends the run normally; connection and other write errors report a failure.

The hidden window does not read desktop keyboard input. Its default input mask is zero, with the existing `--input` override still available. Interactive consumers supply their own input and control adapter; SpellCardEditor forwards focused-preview keys and ordered playback commands through its editor-only control file. The frame stream is an output platform service and introduces no editor protocol, game rules or Electron dependency into the native host or thlib.
