# Asynchronous resource loading

`AssetLoader` decorates a `NativeHost`. Pass `loader.host` to every resource
consumer, then declare texture/model/sound/music paths in `loader.preload()`.
Call the batch's `update()` once per **presentation** frame. It maintains two
CPU jobs and commits at most one texture or model image/mesh per call. PNG/GLB
decoding and file reads run on the native worker; graphics/audio objects are
created on the owning thread. Music bytes remain resident for the stream's
lifetime. Both V8 and QuickJS expose the same interface.

`batch.done` includes failure/cancellation; check `batch.error` before entering
the scene. A terminal native poll consumes its ticket. Cancel queued work on
redirection/disposal. Existing synchronous APIs remain available, but cache
hits acquire the preloaded handle without reading or decoding it again.
`synchronousMisses` helps verify that gameplay never needs an unlisted file.
Dynamic render targets and mutable text surfaces retain their normal ownership.

System text can also avoid blocking the first visible frame:
`host.loadTextTextureAsync(text, layoutOptions, rasterOptions)` returns a ticket
for `pollResourceLoad` / `cancelResourceLoad`. Shaping, font discovery and RGBA
rasterization run on the same bounded CPU worker. A ready result contains
`text: {texture, x, y, width, height}` as well as `handle`; the latter is the
same ordinary texture handle. An empty/clipped string returns texture 0 and
zero bounds. Unload nonzero handles through `unloadTexture`. COM and drawing
objects never leave their worker thread. Options, alignment, stroke and pixel
results match the synchronous text APIs. Include pending text in your readiness
gate; drawing a loading indicator must not itself request a system font.

Normal load/unload calls retain/release a handle; cached handles remain pinned
until `retainOnly(nextManifest)` or `dispose()`. Release outgoing scene owners
before trimming. Do not dispose the loader while consumers still use it.
Use one active batch per loader. Padding dimensions are part of the cache key;
skins that replace atlas files must resolve the physical path and dimensions
before preloading.

`TouhouApplication.prepareScene(mode, selection)` accepts a preparation with
`ready`, optional `error`, `update()`, and optional `cancel()`. An unfinished
preparation holds the covered transition and retains the outgoing scene. It
does not call scene update, the post-frame clock, or onAfterUpdate. It also
supports initial launch/retry without a transition. Callers may draw their own
loading indicator using `application.loading`, handle errors, and redirect to
another scene. Loading progress is deliberately absent from scene snapshots.

For an internal stage handoff, begin preparation during the outgoing clear
screen. If it is still pending, gate **before** consuming the input of the
handoff frame. Keep the original continuation/checkpoint order. Pump preparation
outside replay acceleration loops; stop acceleration immediately upon reaching
the gate. Never record waiting input, advance RNGs, or add wall-clock waits to
stage clocks. Test the same recording with different loading delays, with and
without fast forward.

Reference: [Touhou20 reconstructed gameplay loader](https://github.com/Oracatt/Touhou20/blob/011aa029d1dac51578107bc98a0006bd750e453c/source_reconstruction/gameplay/loading.cpp),
[activation](https://github.com/Oracatt/Touhou20/blob/011aa029d1dac51578107bc98a0006bd750e453c/source_reconstruction/gameplay/activation.cpp).
That implementation separates worker preparation from activation of replay and
entity callbacks. This API applies the same separation without importing title
content or the reconstruction's concrete owners.
