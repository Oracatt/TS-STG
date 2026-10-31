# Static 3D models

The host loads a self-contained glTF 2.0 binary (`.glb`) once and keeps its mesh
buffers and embedded textures resident until `unloadModel`. Scripts own scenes,
cameras, placement and animation. There are no stage or gameplay rules in the loader.

```ts
const model = host.loadModel('assets/environment.glb');
const bounds = host.modelInfo(model); // meshes, vertices, triangles, minimum/maximum
draw.modelSceneBegin(viewProjection, {
  eye: [0, 10, 0], lightDirection: [-0.4, 0.8, -0.3],
  ambient: [0.35, 0.4, 0.45], sunlight: [0.65, 0.6, 0.5],
  fogColor: [0.2, 0.25, 0.3], fogStart: 80, fogEnd: 200,
});
draw.model3d(model, modelToWorld); // optional RGBA tint
draw.modelSceneEnd();
// Ordinary 2D bullets and UI can follow immediately.
host.unloadModel(model); // when the scene is no longer used
```

Both matrices are 16 column-major numbers. Model transforms must be invertible
affine matrices. Lighting and fog use world coordinates; lightDirection points
toward the light. Colors are RGB intensities (0–4); exposure defaults to 1.
The script supplies its own view-projection matrix, including any viewport mapping.

Scenes clear depth only, use depth testing/writes, and restore the previous depth,
blend, culling and projection state. The enclosing scissor and render target remain
effective, including high-DPI targets. Scene scopes cannot nest or contain 2D/state
commands. Start with custom shaders, blend overrides and alpha testing disabled.
The command decoder rejects unclosed scopes before any frame is rendered.

Supported: static triangle primitives, node transforms, positions, normals (flat
normals generated if absent), TEXCOORD_0, vertex colors, embedded PNG/JPEG base
color textures, material base color factors, emissive factors, unlit materials and
OPAQUE/MASK alpha modes. Lighting is diffuse directional plus ambient, with smooth
distance fog. Metallic/roughness/normal maps and environment reflections are not
evaluated. Transparent BLEND, animation, skins, morph targets, external resources,
compressed geometry and required glTF extensions are rejected. Export ordinary,
uncompressed GLB with baked base-color textures for this static renderer.

Limits per resource: 64 MiB, 200,000 triangles, 2,048 nodes, 256 source meshes,
32 embedded images, and 4,096 × 4,096 pixels per image. Use several small reusable
resources rather than loading an entire world. Unknown and released handles fail
explicitly. Failed loads release their intermediate resources. Headless execution
validates the same files, bounds and commands without creating GPU resources.

Validation: `native/tests/models.js` exercises bounds, resource lifetime, malformed
accessors and resource containment. Run it graphically with `--input 1 --frames 4`
to verify depth occlusion, render-target composition, scissor and the following 2D
HUD. `models-invalid.js` exercises invalid scope, matrix, lighting and handle cases
on both V8 and QuickJS.
