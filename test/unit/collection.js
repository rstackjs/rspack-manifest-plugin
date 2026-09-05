const { join } = require('node:path');
const test = require('ava');
const { RawSource } = require('@rspack/core').sources;
const { emitHook } = require('../../dist/hooks');
const { RspackManifestPlugin } = require('../..');

function collect(count, generate) {
  let output;
  const chunks = Array.from({ length: count }, (_, index) => ({
    name: index === 0 ? undefined : 'shared',
    files: new Set([`chunk-${index}.js`, `chunk-${index}.css`]),
    auxiliaryFiles: new Set([`chunk-${index}.js.map`]),
    isOnlyInitial: () => index === 0,
  }));
  const outputPath = join(__dirname, '../output/collection');
  const manifestFileName = join(outputPath, 'manifest.json');
  const compilation = {
    chunks: new Set(chunks),
    entrypoints: new Map(),
    getStats: () => ({
      toJson: () => ({
        publicPath: '/assets/',
        assets: [
          ...chunks.flatMap((chunk, index) =>
            [...chunk.files].map((name) => ({
              name,
              chunks: [index],
              info: {},
            })),
          ),
          { name: 'image.png', info: {} },
          { name: 'update.hot-update.js', info: {} },
          { name: 'manifest.json', info: {} },
        ],
      }),
    }),
    emitAsset: (_, source) => {
      output = JSON.parse(source.source());
    },
  };
  emitHook(
    {
      compiler: {
        options: { output: { path: outputPath } },
        webpack: { sources: { RawSource } },
      },
      emitCountMap: new Map([[manifestFileName, 1]]),
      manifestAssetId: 'manifest.json',
      manifestFileName,
      moduleAssets: {},
      options: new RspackManifestPlugin({
        generate,
        seed: { seeded: 'keep.js' },
      }).options,
    },
    compilation,
  );
  return output;
}

test('collection keeps chunk, asset and auxiliary ordering for callbacks', (t) => {
  const manifest = collect(3, (seed, files) => ({
    ...seed,
    files: files.map(({ name, path }) => ({ name, path })),
  }));
  t.deepEqual(manifest, {
    seeded: 'keep.js',
    files: [
      { name: 'chunk-0.js', path: '/assets/chunk-0.js' },
      { name: 'chunk-0.css', path: '/assets/chunk-0.css' },
      { name: 'shared.js', path: '/assets/chunk-1.js' },
      { name: 'shared.css', path: '/assets/chunk-1.css' },
      { name: 'shared.js', path: '/assets/chunk-2.js' },
      { name: 'shared.css', path: '/assets/chunk-2.css' },
      { name: 'image.png', path: '/assets/image.png' },
      { name: 'chunk-0.js.map', path: '/assets/chunk-0.js.map' },
      { name: 'chunk-1.js.map', path: '/assets/chunk-1.js.map' },
      { name: 'chunk-2.js.map', path: '/assets/chunk-2.js.map' },
    ],
  });
});

test('large collections keep duplicate keys and every auxiliary map', (t) => {
  const count = 10000;
  const manifest = collect(count);
  t.is(manifest['shared.js'], `/assets/chunk-${count - 1}.js`);
  t.is(manifest['shared.css'], `/assets/chunk-${count - 1}.css`);
  t.is(Object.keys(manifest).length, count + 6);
  for (let index = 0; index < count; index++) {
    t.is(manifest[`chunk-${index}.js.map`], `/assets/chunk-${index}.js.map`);
  }
});
