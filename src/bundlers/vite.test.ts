import type { UserConfig } from 'vite';

import {
  describe,
  expect,
  it
} from 'vitest';

import type { ObsidianPluginBuildContext } from './obsidian-plugin-build.ts';

import { BuildMode } from './obsidian-plugin-build.ts';
import {
  getViteBuildMode,
  getViteConfigDefaults,
  obsidianPluginVite
} from './vite.ts';

type ExternalFunction = (source: string, importer: string | undefined, isResolved: boolean) => unknown;

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
describe('vite', () => {
  it('creates a plugin', () => {
    expect(obsidianPluginVite().name).toBe('obsidian-plugin');
  });

  it.each([
    [{}, 'production', BuildMode.Production],
    [{}, 'development', BuildMode.Development],
    [{ build: { watch: {} } }, 'production', BuildMode.Development]
  ] as [UserConfig, string, BuildMode][])('decides the build mode of %o in mode %s', (userConfig, mode, expected) => {
    expect(getViteBuildMode(userConfig, { mode })).toBe(expected);
  });

  it('fills in a production library build', () => {
    const config = getViteConfigDefaults({}, PRODUCTION_CONTEXT);
    const build = config.build ?? {};
    expect(build.lib).toMatchObject({ cssFileName: 'styles', entry: '/project/src/main.ts', formats: ['cjs'] });
    expect(build.lib === false ? undefined : build.lib?.fileName).toBeTypeOf('function');
    const fileName = build.lib === false ? undefined : build.lib?.fileName;
    expect(typeof fileName === 'function' ? fileName('cjs', 'main') : fileName).toBe('main.js');
    expect(build.outDir).toBe('/project/dist/build');
    expect(build.emptyOutDir).toBe(false);
    expect(build.minify).toBe(true);
    expect(build.sourcemap).toBe(false);
    expect(build.assetsInlineLimit).toBe(Number.MAX_SAFE_INTEGER);
    const output = build.rolldownOptions?.output;
    expect(output).toEqual({ codeSplitting: false, postBanner: expect.stringContaining('BY VITE') as unknown });
    expect((build.rolldownOptions?.external as ExternalFunction)('obsidian', undefined, false)).toBe(true);
  });

  it('keeps what the consumer set in a development build', () => {
    const lib = { entry: 'src/other.ts' };
    const config = getViteConfigDefaults({
      build: {
        assetsInlineLimit: 0,
        lib,
        minify: 'terser',
        rollupOptions: { external: ['my-external'], output: { banner: '/* mine */', inlineDynamicImports: false } },
        sourcemap: true
      }
    }, DEVELOPMENT_CONTEXT);
    const build = config.build ?? {};
    expect(build.lib).toBe(lib);
    expect(build.minify).toBe('terser');
    expect(build.sourcemap).toBe(true);
    expect(build.assetsInlineLimit).toBe(0);
    expect(build.rolldownOptions?.output).toEqual({});
    expect((build.rolldownOptions?.external as ExternalFunction)('my-external', undefined, false)).toBe(true);
  });

  it('defaults a development build to not minified with an inline source map, and leaves an output array alone', () => {
    const config = getViteConfigDefaults({ build: { rolldownOptions: { output: [{}] } } }, DEVELOPMENT_CONTEXT);
    const build = config.build ?? {};
    expect(build.minify).toBe(false);
    expect(build.sourcemap).toBe('inline');
    expect(build.rolldownOptions?.output).toBeUndefined();
  });
});
