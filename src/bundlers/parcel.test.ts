import dedent from 'dedent';
import { runInNewContext } from 'node:vm';
import {
  describe,
  expect,
  it
} from 'vitest';

import type { ObsidianPluginBuildContext } from './obsidian-plugin-build.ts';

import {
  getParcelConfigFiles,
  getParcelOptions
} from './parcel.ts';

interface FakeAsset {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- The stand-in's setCode() rewrites it.
  code: string;
  readonly getCode: () => Promise<string>;
  readonly getDependencies: () => readonly FakeDependency[];
  readonly meta: FakeMeta;
  readonly setCode: (code: string) => void;
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- The stand-in's setCode() counts its calls.
  setCodeCallCount: number;
}

interface FakeDependency {
  readonly meta: FakeMeta;
  readonly specifierType: string;
}

interface FakeMeta {
  readonly id?: string | undefined;
  readonly placeholder?: string;
}

interface ParcelrcLike {
  readonly transformers: object;
}

interface TransformerOptions {
  readonly transform: TransformFunction;
}

type TransformFunction = (params: TransformParams) => Promise<unknown>;

interface TransformParams {
  readonly asset: FakeAsset;
}

const PRODUCTION_CONTEXT: ObsidianPluginBuildContext = {
  distFolder: '/project/dist/build',
  entryPoint: '/project/src/main.ts',
  isProductionBuild: true,
  lineLimit: 1000,
  mainJsPath: '/project/dist/build/main.js',
  obsidianConfigFolder: '',
  pluginName: 'my-plugin',
  reload: 'hot-reload-plugin',
  shouldCheckMobileLoad: true
};

const DEVELOPMENT_CONTEXT: ObsidianPluginBuildContext = {
  ...PRODUCTION_CONTEXT,
  distFolder: '/project/dist/dev',
  isProductionBuild: false,
  mainJsPath: '/project/dist/dev/main.js'
};
describe('parcel', () => {
  it('extends parcel\'s default config when the project has none', () => {
    const files = getParcelConfigFiles({ consumerParcelrcPath: undefined });
    expect(JSON.parse(files['.parcelrc'] ?? '')).toEqual({
      extends: '@parcel/config-default',
      namers: ['./obsidian-plugin-namer.cjs', '...'],
      optimizers: { '*.js': ['./obsidian-plugin-pre-minify.cjs', '...', './obsidian-plugin-optimizer.cjs'] },
      resolvers: ['./obsidian-plugin-resolver.cjs', '...'],
      transformers: { '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}': ['./obsidian-plugin-inline-imports.cjs', '...', './obsidian-plugin-helper-imports.cjs'] }
    });
  });

  it('extends the project\'s own .parcelrc', () => {
    const files = getParcelConfigFiles({ consumerParcelrcPath: '../../.parcelrc' });
    expect(JSON.parse(files['.parcelrc'] ?? '')).toMatchObject({ extends: '../../.parcelrc' });
  });

  it('generates the plugins it names', () => {
    const files = getParcelConfigFiles({ consumerParcelrcPath: undefined });
    expect(files['obsidian-plugin-resolver.cjs']).toContain('"obsidian"');
    expect(files['obsidian-plugin-resolver.cjs']).toContain('isNode: () => false');
    expect(files['obsidian-plugin-pre-minify.cjs']).toContain(String.raw`'(() => {\n'`);
    expect(files['obsidian-plugin-pre-minify.cjs']).toContain(String.raw`"require(\"./styles.css\");\n"`);
    expect(files['obsidian-plugin-namer.cjs']).toContain('styles.css');
    expect(files['obsidian-plugin-optimizer.cjs']).toContain('module.require = require');
    expect(files['obsidian-plugin-inline-imports.cjs']).toContain(String.raw`/\bimport\(`);
  });

  it('generates a helper-imports transformer that drops the esm suffix from a placeholder dependency\'s marker', async () => {
    const transform = loadGeneratedTransform(getParcelConfigFiles({ consumerParcelrcPath: undefined })['obsidian-plugin-helper-imports.cjs'] ?? '');
    const helper = '@swc/helpers/cjs/_ts_decorate.cjs';
    const asset = createAsset(
      'abc',
      dedent`
        import "abc:@swc/helpers/cjs/_ts_decorate.cjs:esm";
        import "abc:lit:esm";
        import "abc:./other.cjs:esm";
      `,
      [
        { meta: { placeholder: helper }, specifierType: 'esm' },
        { meta: {}, specifierType: 'esm' },
        { meta: { placeholder: './other.cjs' }, specifierType: 'commonjs' }
      ]
    );
    await transform({ asset });
    expect(asset.code).toBe(dedent`
      import "abc:@swc/helpers/cjs/_ts_decorate.cjs";
      import "abc:lit:esm";
      import "abc:./other.cjs:esm";
    `);
    expect(asset.setCodeCallCount).toBe(1);
  });

  it('generates a helper-imports transformer that leaves an asset without a placeholder dependency untouched', async () => {
    const transform = loadGeneratedTransform(getParcelConfigFiles({ consumerParcelrcPath: undefined })['obsidian-plugin-helper-imports.cjs'] ?? '');
    const asset = createAsset('abc', 'import "abc:lit:esm";', [{ meta: {}, specifierType: 'esm' }]);
    await transform({ asset });
    const assetWithoutId = createAsset(undefined, 'import "abc:x:esm";', [{ meta: { placeholder: 'x' }, specifierType: 'esm' }]);
    await transform({ asset: assetWithoutId });
    expect(asset.setCodeCallCount + assetWithoutId.setCodeCallCount).toBe(0);
  });

  it('adds the feature pipelines in front of the generic one', () => {
    const files = getParcelConfigFiles({
      consumerParcelrcPath: undefined,
      features: { framework: 'svelte', styles: { tailwind: true }, wasm: true }
    });
    expect(JSON.parse(files['.parcelrc'] ?? '')).toMatchObject({
      transformers: {
        '*.{css,pcss}': ['./obsidian-plugin-features.cjs', '@parcel/transformer-css'],
        '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}': ['./obsidian-plugin-features.cjs', './obsidian-plugin-inline-imports.cjs', '...', './obsidian-plugin-helper-imports.cjs'],
        '*.svelte': ['./obsidian-plugin-features.cjs'],
        '*.svelte.{js,ts}': ['./obsidian-plugin-features.cjs', './obsidian-plugin-inline-imports.cjs', '...', './obsidian-plugin-helper-imports.cjs'],
        '*.wasm': ['./obsidian-plugin-features.cjs']
      }
    });
  });

  it.each(['react', 'preact', 'solid'] as const)('compiles %s JSX through the feature transformer', (framework) => {
    const files = getParcelConfigFiles({ consumerParcelrcPath: undefined, features: { framework } });
    expect(JSON.parse(files['.parcelrc'] ?? '')).toMatchObject({ transformers: { '*.{jsx,tsx}': ['./obsidian-plugin-features.cjs'] } });
  });

  it('leaves Vue and CSS modules to parcel itself', () => {
    const files = getParcelConfigFiles({ consumerParcelrcPath: undefined, features: { framework: 'vue', styles: { cssModules: true } } });
    expect(Object.keys((JSON.parse(files['.parcelrc'] ?? '') as ParcelrcLike).transformers)).toEqual(['*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}']);
  });

  it('generates a feature transformer that loads the toolkit\'s own transforms', () => {
    const files = getParcelConfigFiles({ consumerParcelrcPath: undefined, features: { framework: 'solid', styles: { postcss: true } } });
    const transformer = files['obsidian-plugin-features.cjs'] ?? '';
    expect(transformer).toMatch(/const TRANSFORMS_MODULE_URL = "file:\/\/.*\/obsidian-plugin-transforms\.ts";/u);
    expect(transformer).toMatch(/const FEATURES_MODULE_URL = "file:\/\/.*\/obsidian-plugin-features\.ts";/u);
    expect(transformer).toContain('const FRAMEWORK = "solid";');
    expect(transformer).toContain('const STYLES = {"postcss":true};');
  });

  it('targets Obsidian\'s renderer with CommonJS', () => {
    expect(getParcelOptions({ buildContext: PRODUCTION_CONTEXT, cacheFolder: '/project/.parcel-cache', configPath: '/config/.parcelrc' })).toEqual({
      // eslint-disable-next-line unicorn/name-replacements -- cacheDir is the name parcel's API reads.
      cacheDir: '/project/.parcel-cache',
      config: '/config/.parcelrc',
      // eslint-disable-next-line unicorn/name-replacements -- distDir is the name parcel's API reads.
      defaultTargetOptions: { distDir: '/project/dist/build', shouldOptimize: true, shouldScopeHoist: true, sourceMaps: false },
      entries: '/project/src/main.ts',
      mode: 'production',
      targets: {
        obsidianPlugin: {
          context: 'electron-renderer',
          // eslint-disable-next-line unicorn/name-replacements -- distDir is the name parcel's API reads.
          distDir: '/project/dist/build',
          includeNodeModules: true,
          isLibrary: true,
          optimize: true,
          outputFormat: 'commonjs',
          sourceMap: false
        }
      }
    });
  });

  it('puts source maps inline in development', () => {
    const options = getParcelOptions({ buildContext: DEVELOPMENT_CONTEXT, cacheFolder: '/project/.parcel-cache', configPath: '/config/.parcelrc' });
    expect(options.mode).toBe('development');
    expect(options.targets).toMatchObject({ obsidianPlugin: { optimize: false, sourceMap: { inline: true } } });
  });
});

function createAsset(id: string | undefined, code: string, dependencies: readonly FakeDependency[]): FakeAsset {
  const asset: FakeAsset = {
    code,
    getCode: () => Promise.resolve(asset.code),
    getDependencies: () => dependencies,
    meta: { id },
    setCode: (newCode: string): void => {
      asset.code = newCode;
      asset.setCodeCallCount++;
    },
    setCodeCallCount: 0
  };
  return asset;
}

/**
 * Evaluates a generated transformer module with a stand-in `@parcel/plugin`, whose `Transformer` hands back the options
 * it was given, and returns the module's `transform` function.
 *
 * @param source - The generated module's source.
 * @returns Its `transform` function.
 */
function loadGeneratedTransform(source: string): TransformFunction {
  class Transformer {
    public readonly transform: TransformFunction;

    public constructor(options: TransformerOptions) {
      this.transform = options.transform;
    }
  }
  const $module = { exports: undefined as unknown };
  runInNewContext(source, { module: $module, require: (id: string) => (id === '@parcel/plugin' ? { Transformer } : undefined) });
  return ($module.exports as Transformer).transform;
}
