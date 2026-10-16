import { join } from 'node:path';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  getEsbuildFeatureBuildOptions,
  getEsbuildFeaturePlugins,
  getSassPluginOptionsList
} from './feature-options.ts';

interface SassTransformOptions {
  readonly transform: (this: unknown, css: string, resolveDirectory: string, filePath: string) => Promise<string>;
}

describe('esbuild feature options', () => {
  it('sets nothing without features', () => {
    expect(getEsbuildFeatureBuildOptions({ features: {}, isProductionBuild: true })).toEqual({});
  });

  it('sets the automatic JSX runtime and NODE_ENV for React', () => {
    expect(getEsbuildFeatureBuildOptions({ features: { framework: 'react' }, isProductionBuild: true })).toEqual({
      define: { 'process.env.NODE_ENV': '"production"' },
      jsx: 'automatic',
      jsxImportSource: 'react'
    });
  });

  it('sets only the defines for a framework without the automatic runtime', () => {
    expect(getEsbuildFeatureBuildOptions({ features: { framework: 'solid' }, isProductionBuild: false })).toEqual({
      define: { 'process.env.NODE_ENV': '"development"' }
    });
  });

  it('loads `.wasm` as binary', () => {
    expect(getEsbuildFeatureBuildOptions({ features: { wasm: true }, isProductionBuild: true })).toEqual({ loader: { '.wasm': 'binary' } });
  });

  it('adds no plugin for a framework esbuild compiles itself', async () => {
    expect(await getEsbuildFeaturePlugins({ features: {}, isProductionBuild: true })).toEqual([]);
    expect(await getEsbuildFeaturePlugins({ features: { framework: 'react' }, isProductionBuild: true })).toEqual([]);
  });

  it('adds the Solid plugin for Solid', async () => {
    const plugins = await getEsbuildFeaturePlugins({ features: { framework: 'solid' }, isProductionBuild: true });
    expect(plugins.map((plugin) => plugin.name)).toEqual(['obsidian-plugin-solid']);
  });

  it('adds unplugin-vue for Vue', async () => {
    const plugins = await getEsbuildFeaturePlugins({ features: { framework: 'vue' }, isProductionBuild: false });
    expect(plugins.map((plugin) => plugin.name)).toEqual(['unplugin-vue']);
  });

  it('keeps one Sass plugin with no stylesheet options', () => {
    expect(getSassPluginOptionsList({ features: {}, isProductionBuild: false })).toEqual([{ sourceMap: true }]);
  });

  it('loads CSS modules with esbuild\'s own local-css loader ahead of the ordinary stylesheets', () => {
    const [moduleOptions, baseOptions] = getSassPluginOptionsList({ features: { styles: { cssModules: true } }, isProductionBuild: true });
    expect(moduleOptions).toMatchObject({ sourceMap: false, type: 'local-css' });
    expect(moduleOptions?.filter?.test('/src/card.module.css')).toBe(true);
    expect(moduleOptions?.filter?.test('/src/card.css')).toBe(false);
    expect(baseOptions).toEqual({ sourceMap: false });
  });

  it('runs every stylesheet through PostCSS with postcss or tailwind on', async () => {
    const [options] = getSassPluginOptionsList({ features: { styles: { tailwind: true } }, isProductionBuild: true });
    const css = await (options as SassTransformOptions).transform.call(options, '@import "tailwindcss/theme.css";', import.meta.dirname, join(import.meta.dirname, 'main.css'));
    expect(css).toContain('tailwindcss');
  });
});
