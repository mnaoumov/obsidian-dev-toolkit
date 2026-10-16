/**
 * @file
 *
 * What the {@link ObsidianPluginFeatureOptions} add to the esbuild build: the JSX runtime, the framework's
 * compile-time constants, the `.wasm` loader, the Solid and Vue plugins, and the stylesheet options of the Sass plugin
 * that loads every stylesheet.
 */

import type {
  BuildOptions,
  Plugin
} from 'esbuild';
import type { SassPluginOptions } from 'esbuild-sass-plugin';

import { readFile } from 'node:fs/promises';

import type { ObsidianPluginFeatureOptions } from '../obsidian-plugin-features.ts';

import {
  getFrameworkDefines,
  getJsxImportSource,
  importOptionalPeer,
  isPostcssNeeded
} from '../obsidian-plugin-features.ts';
import {
  appendInlineSourceMap,
  transformCss,
  transformSolid
} from '../obsidian-plugin-transforms.ts';

/**
 * The esbuild options of {@link getEsbuildFeatureBuildOptions}.
 */
export type EsbuildFeatureBuildOptions = Pick<BuildOptions, 'define' | 'jsx' | 'jsxImportSource' | 'loader'>;

/**
 * Parameters for {@link getEsbuildFeatureBuildOptions}.
 */
export interface GetEsbuildFeatureBuildOptionsParams {
  /**
   * The build features.
   */
  readonly features: ObsidianPluginFeatureOptions;

  /**
   * Whether this is a production build.
   */
  readonly isProductionBuild: boolean;
}

/**
 * Parameters for {@link getEsbuildFeaturePlugins}.
 */
export type GetEsbuildFeaturePluginsParams = GetEsbuildFeatureBuildOptionsParams;

/**
 * Parameters for {@link getSassPluginOptionsList}.
 */
export type GetSassPluginOptionsListParams = GetEsbuildFeatureBuildOptionsParams;

interface UnpluginVueEsbuildModule {
  readonly default: (options?: object) => Plugin;
}

// Esbuild's filters are Go regular expressions, which take no `u` flag.
const CSS_MODULE_FILTER = /\.module\.(?:css|s[ac]ss)$/i;
const SOLID_FILTER = /\.[jt]sx$/i;

/**
 * Builds the esbuild options the features set: the automatic JSX runtime for React and Preact, the framework's
 * compile-time constants, and the `binary` loader for `.wasm`.
 *
 * @param params - The {@link GetEsbuildFeatureBuildOptionsParams}.
 * @returns The options, to merge under the consumer's own.
 */
export function getEsbuildFeatureBuildOptions(params: GetEsbuildFeatureBuildOptionsParams): EsbuildFeatureBuildOptions {
  const { features, isProductionBuild } = params;
  const defines = getFrameworkDefines({ framework: features.framework, isProductionBuild });
  const jsxImportSource = getJsxImportSource(features.framework);
  return {
    ...(Object.keys(defines).length > 0 && { define: defines }),
    ...(jsxImportSource !== undefined && { jsx: 'automatic', jsxImportSource }),
    ...(features.wasm && { loader: { '.wasm': 'binary' } })
  };
}

/**
 * Creates the esbuild plugins the framework needs: `unplugin-vue` for Vue, and the shared Solid transform for Solid.
 *
 * @param params - The {@link GetEsbuildFeaturePluginsParams}.
 * @returns A {@link Promise} that resolves to the plugins, empty when the framework needs none.
 */
export async function getEsbuildFeaturePlugins(params: GetEsbuildFeaturePluginsParams): Promise<Plugin[]> {
  const { features, isProductionBuild } = params;
  switch (features.framework) {
    case 'solid': {
      return [solidEsbuildPlugin(isProductionBuild)];
    }
    case 'vue': {
      const unpluginVue = await importOptionalPeer<UnpluginVueEsbuildModule>({
        feature: 'framework: \'vue\'',
        packageName: 'unplugin-vue',
        specifier: 'unplugin-vue/esbuild'
      });
      return [unpluginVue.default({ isProduction: isProductionBuild })];
    }
    default: {
      return [];
    }
  }
}

/**
 * Builds the option sets of the Sass plugin that loads every stylesheet: one for ordinary stylesheets, and with CSS
 * modules on, one before it that loads `*.module.css` with esbuild's own `local-css` loader. Each runs the stylesheet
 * through PostCSS and Tailwind when the options ask for it.
 *
 * @param params - The {@link GetSassPluginOptionsListParams}.
 * @returns The option sets, in the order their plugins must be registered.
 */
export function getSassPluginOptionsList(params: GetSassPluginOptionsListParams): SassPluginOptions[] {
  const { features, isProductionBuild } = params;
  const styles = features.styles ?? {};
  const baseOptions: SassPluginOptions = {
    sourceMap: !isProductionBuild,
    ...(isPostcssNeeded(styles) && {
      async transform(css: string, _resolveDirectory: string, filePath: string): Promise<string> {
        const result = await transformCss({ filePath, isCssModuleScoped: false, isProductionBuild, source: css, styles });
        return result.css;
      }
    })
  };

  return styles.cssModules ? [{ ...baseOptions, filter: CSS_MODULE_FILTER, type: 'local-css' }, baseOptions] : [baseOptions];
}

/* v8 ignore start -- An esbuild plugin; exercised by the bundler integration test against a real esbuild build. */
function solidEsbuildPlugin(isProductionBuild: boolean): Plugin {
  return {
    name: 'obsidian-plugin-solid',
    setup(build): void {
      build.onLoad({ filter: SOLID_FILTER }, async ({ path }) => {
        const code = await readFile(path, 'utf-8');
        return {
          contents: appendInlineSourceMap(await transformSolid({ code, filePath: path, isProductionBuild })),
          loader: 'js'
        };
      });
    }
  };
}
/* v8 ignore stop */
