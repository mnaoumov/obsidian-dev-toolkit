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

const PRODUCTION_CONTEXT: ObsidianPluginBuildContext = {
  distFolder: '/project/dist/build',
  entryPoint: '/project/src/main.ts',
  isProductionBuild: true,
  mainJsPath: '/project/dist/build/main.js',
  obsidianConfigFolder: '',
  pluginName: 'my-plugin'
};

const DEVELOPMENT_CONTEXT: ObsidianPluginBuildContext = {
  ...PRODUCTION_CONTEXT,
  distFolder: '/project/dist/dev',
  isProductionBuild: false,
  mainJsPath: '/project/dist/dev/main.js'
};
describe('parcel', () => {
  it('extends parcel\'s default config when the project has none', () => {
    const files = getParcelConfigFiles(undefined);
    expect(JSON.parse(files['.parcelrc'] ?? '')).toEqual({
      extends: '@parcel/config-default',
      namers: ['./obsidian-plugin-namer.cjs', '...'],
      optimizers: { '*.js': ['...', './obsidian-plugin-optimizer.cjs'] },
      resolvers: ['./obsidian-plugin-resolver.cjs', '...'],
      transformers: { '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}': ['./obsidian-plugin-inline-imports.cjs', '...'] }
    });
  });

  it('extends the project\'s own .parcelrc', () => {
    const files = getParcelConfigFiles('../../.parcelrc');
    expect(JSON.parse(files['.parcelrc'] ?? '')).toMatchObject({ extends: '../../.parcelrc' });
  });

  it('generates the plugins it names', () => {
    const files = getParcelConfigFiles(undefined);
    expect(files['obsidian-plugin-resolver.cjs']).toContain('"obsidian"');
    expect(files['obsidian-plugin-namer.cjs']).toContain('styles.css');
    expect(files['obsidian-plugin-optimizer.cjs']).toContain('module.require = require');
    expect(files['obsidian-plugin-inline-imports.cjs']).toContain(String.raw`/\bimport\(`);
  });

  it('targets Obsidian\'s renderer with CommonJS', () => {
    expect(getParcelOptions({ buildContext: PRODUCTION_CONTEXT, cacheFolder: '/project/.parcel-cache', configPath: '/config/.parcelrc' })).toEqual({
      // eslint-disable-next-line unicorn/name-replacements -- cacheDir is the name parcel's API reads.
      cacheDir: '/project/.parcel-cache',
      config: '/config/.parcelrc',
      // eslint-disable-next-line unicorn/name-replacements -- distDir is the name parcel's API reads.
      defaultTargetOptions: { distDir: '/project/dist/build', shouldOptimize: true, sourceMaps: false },
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
