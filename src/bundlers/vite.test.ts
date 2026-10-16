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
  getViteFeatureConfig,
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
const POSTCSS_PLUGIN = { postcssPlugin: 'marker' };

describe('vite', () => {
  it('contributes nothing without features', () => {
    expect(getViteFeatureConfig({ features: {}, isProductionBuild: true, postcssConfig: undefined, userConfig: {} })).toEqual({});
  });

  it('defines the framework\'s constants and sets the automatic JSX runtime for React', () => {
    expect(getViteFeatureConfig({ features: { framework: 'react' }, isProductionBuild: true, postcssConfig: undefined, userConfig: {} })).toEqual({
      define: { 'process.env.NODE_ENV': '"production"' },
      oxc: { jsx: { development: false, importSource: 'react', runtime: 'automatic' } }
    });
  });

  it('keeps the consumer\'s own defines and JSX settings', () => {
    const userConfig: UserConfig = { define: { 'process.env.NODE_ENV': '"test"' }, oxc: { jsx: 'preserve' } };
    expect(getViteFeatureConfig({ features: { framework: 'preact' }, isProductionBuild: false, postcssConfig: undefined, userConfig })).toEqual({});
    expect(getViteFeatureConfig({ features: { framework: 'preact' }, isProductionBuild: false, postcssConfig: undefined, userConfig: { oxc: false } }))
      .toEqual({ define: { 'process.env.NODE_ENV': '"development"' } });
  });

  it('sets the PostCSS plugins unless the consumer set css.postcss', () => {
    const postcssConfig = { dependencies: [], options: {}, plugins: [POSTCSS_PLUGIN] };
    expect(getViteFeatureConfig({ features: { styles: { postcss: true } }, isProductionBuild: true, postcssConfig, userConfig: {} })).toEqual({
      css: { postcss: { plugins: [POSTCSS_PLUGIN] } }
    });
    expect(getViteFeatureConfig({ features: { styles: { postcss: true } }, isProductionBuild: true, postcssConfig, userConfig: { css: { postcss: {} } } }))
      .toEqual({});
    expect(getViteFeatureConfig({ features: {}, isProductionBuild: true, postcssConfig: { ...postcssConfig, plugins: [] }, userConfig: {} })).toEqual({});
  });

  it('creates the plugin, the feature plugin and a placeholder for the Vue plugin', async () => {
    const [plugin, featurePlugin, vuePlugin] = obsidianPluginVite();
    expect(plugin).toMatchObject({ name: 'obsidian-plugin' });
    expect(featurePlugin).toMatchObject({ apply: 'build', name: 'obsidian-plugin-features' });
    expect(await vuePlugin).toBeNull();
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
