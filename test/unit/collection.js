const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('ava');
const { RawSource } = require('@rspack/core').sources;
const { emitHook } = require('../../dist/hooks');
const { RspackManifestPlugin } = require('../..');

function collect(count, generate, emit = emitHook) {
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
  emit(
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

test('collection never passes accumulated files to helpers or copies them for maps', (t) => {
  const filename = require.resolve('../../dist/hooks');
  const hookRequire = createRequire(filename);
  const helpersPath = hookRequire.resolve('./helpers');
  const helpers = hookRequire(helpersPath);
  const calls = { reduceChunk: 0, reduceAssets: 0 };
  const observedHelpers = { ...helpers };
  for (const name of Object.keys(calls)) {
    observedHelpers[name] = (files, ...args) => {
      calls[name]++;
      t.is(files.length, 0, `${name} must receive an empty accumulator`);
      return helpers[name](files, ...args);
    };
  }
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require(request) {
      return hookRequire.resolve(request) === helpersPath
        ? observedHelpers
        : hookRequire(request);
    },
  });
  // Count copies in this hook's realm without patching the process's arrays.
  vm.runInContext(
    `globalThis.copiedEntries = 0;
     const concat = Array.prototype.concat;
     Array.prototype.concat = function (...items) {
       copiedEntries += this.length;
       return concat.apply(this, items);
     };`,
    context,
  );
  vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });

  const count = 3;
  const manifest = collect(count, undefined, module.exports.emitHook);
  t.deepEqual(manifest, collect(count));
  t.deepEqual(calls, { reduceChunk: count, reduceAssets: count * 2 + 3 });
  // Each two-file chunk may copy one local entry, never the global list.
  t.true(
    context.copiedEntries <= count,
    'auxiliary collection must not copy the accumulated files',
  );
});

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
