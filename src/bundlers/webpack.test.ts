import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { BuildMode } from './obsidian-plugin-build.ts';
import {
  getWebpackBuildMode,
  getWebpackFeatureRules,
  obsidianPluginWebpackExternals,
  ObsidianPluginWebpackPlugin
} from './webpack.ts';

const RULE_PATHS = {
  cssLoaderPath: '/css-loader.js',
  loaderPath: '/obsidian-plugin-webpack-loader.mjs',
  miniCssExtractLoaderPath: '/mini-css-extract-loader.js'
};

describe('webpack', () => {
  it('adds no rule without features', () => {
    expect(getWebpackFeatureRules({ ...RULE_PATHS, features: { framework: 'react' }, isProductionBuild: true })).toEqual([]);
  });

  it('compiles Solid JSX before the TypeScript loader', () => {
    expect(getWebpackFeatureRules({ ...RULE_PATHS, features: { framework: 'solid' }, isProductionBuild: true })).toEqual([
      { enforce: 'pre', test: /\.[jt]sx$/iu, use: [{ loader: '/obsidian-plugin-webpack-loader.mjs', options: { isProductionBuild: true, kind: 'jsx' } }] }
    ]);
  });

  it('compiles Svelte components and modules', () => {
    const rules = getWebpackFeatureRules({ ...RULE_PATHS, features: { framework: 'svelte' }, isProductionBuild: false });
    expect(rules.map((rule) => [rule.enforce, (rule.test as RegExp).source])).toEqual([
      [undefined, String.raw`\.svelte$`],
      ['pre', String.raw`\.svelte\.[cm]?[jt]s$`]
    ]);
  });

  it('strips the types of a Vue component\'s script block after unplugin-vue', () => {
    const [rule] = getWebpackFeatureRules({ ...RULE_PATHS, features: { framework: 'vue' }, isProductionBuild: true });
    expect(rule?.enforce).toBe('post');
    const test = rule?.test as RegExp;
    expect(test.test(`/_virtual_/src/${encodeURIComponent('A.vue?vue&type=script&setup=true&lang.ts')}`)).toBe(true);
    expect(test.test('/src/a.ts')).toBe(false);
  });

  it('loads `.wasm` as JavaScript', () => {
    expect(getWebpackFeatureRules({ ...RULE_PATHS, features: { wasm: true }, isProductionBuild: true })).toEqual([
      { test: /\.wasm$/iu, type: 'javascript/auto', use: [{ loader: '/obsidian-plugin-webpack-loader.mjs', options: { isProductionBuild: true, kind: 'wasm' } }] }
    ]);
  });

  it('extracts plain CSS without PostCSS or scoping', () => {
    expect(getWebpackFeatureRules({ ...RULE_PATHS, features: { styles: {} }, isProductionBuild: true })).toEqual([
      {
        test: /\.p?css$/iu,
        use: ['/mini-css-extract-loader.js', { loader: '/css-loader.js', options: { importLoaders: 1, modules: false } }]
      }
    ]);
  });

  it('scopes CSS modules and runs PostCSS when asked', () => {
    const styles = { cssModules: true, postcss: true };
    expect(getWebpackFeatureRules({ ...RULE_PATHS, features: { styles }, isProductionBuild: false })).toEqual([
      {
        test: /\.p?css$/iu,
        use: [
          '/mini-css-extract-loader.js',
          { loader: '/css-loader.js', options: { importLoaders: 1, modules: { auto: true, namedExport: false } } },
          { loader: '/obsidian-plugin-webpack-loader.mjs', options: { isProductionBuild: false, kind: 'stylesheet', styles } }
        ]
      }
    ]);
  });

  it('creates a plugin', () => {
    expect(new ObsidianPluginWebpackPlugin()).toBeInstanceOf(ObsidianPluginWebpackPlugin);
  });

  it.each(
    [
      [{ watch: false }, BuildMode.Production],
      [{ mode: 'production', watch: true }, BuildMode.Development],
      [{ mode: 'development', watch: false }, BuildMode.Development]
    ] as const
  )('decides the build mode of %o', (options, expected) => {
    expect(getWebpackBuildMode(options)).toBe(expected);
  });

  it('leaves Obsidian\'s modules to require()', () => {
    const callback = vi.fn();
    obsidianPluginWebpackExternals({ request: '@codemirror/view' }, callback);
    expect(callback).toHaveBeenCalledWith(null, 'commonjs2 @codemirror/view');
  });

  it('bundles everything else', () => {
    const callback = vi.fn();
    obsidianPluginWebpackExternals({ request: 'fflate' }, callback);
    obsidianPluginWebpackExternals({}, callback);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1);
    expect(callback).toHaveBeenNthCalledWith(2);
  });
});
