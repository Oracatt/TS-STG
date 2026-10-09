// Test-only alias matching the embedded host. It is not part of thlib.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@ts-stg/thlib') return {
    url: new URL('../packages/thlib/dist/index.js', import.meta.url).href, shortCircuit: true
  };
  if (specifier === '@ts-stg/thlib/touhou') return {
    url: new URL('../packages/thlib/dist/touhou/index.js', import.meta.url).href, shortCircuit: true
  };
  if (/^@ts-stg\/thlib\/touhou\/[a-z0-9-]+$/.test(specifier)) return {
    url: new URL(`../packages/thlib/dist/touhou/${specifier.split('/').at(-1)}.js`, import.meta.url).href, shortCircuit: true
  };
  return nextResolve(specifier, context);
}
