/**
 * @file
 *
 * The build features of the rollup and vite adapters: one plugin, typed by the shape both bundlers accept, that runs
 * the shared transforms (Solid, Svelte, stylesheets, WebAssembly) and replaces the framework's compile-time constants,
 * plus the `unplugin-vue` plugin for Vue.
 */

import { readFile } from 'node:fs/promises';

import type { ObsidianPluginFeatureOptions } from './obsidian-plugin-features.ts';
import type { SourceMapLike } from './obsidian-plugin-transforms.ts';

import { ObsidianPluginRepoPaths } from '../obsidian-plugin-repo-paths.ts';
import {
  getFeatureFileKind,
  getFrameworkDefines,
  importOptionalPeer,
  replaceDefines
} from './obsidian-plugin-features.ts';
import {
  getCssModuleCode,
  getWasmModuleCode,
  transformCss,
  transformSolid,
  transformSvelte
} from './obsidian-plugin-transforms.ts';

/**
 * Parameters for {@link createRollupCompatibleFeaturePlugin}.
 */
export interface CreateRollupCompatibleFeaturePluginParams {
  /**
   * The build features.
   */
  readonly features: ObsidianPluginFeatureOptions;

  /**
   * Tells whether the build is a production one. Called from the hooks, after the adapter resolved its build mode.
   */
  readonly isProductionBuild: () => boolean;

  /**
   * Whether this plugin compiles stylesheets. Vite compiles them itself.
   */
  readonly shouldCompileStylesheets: boolean;

  /**
   * Whether this plugin replaces the framework's compile-time constants in the code. Vite does it through its own
   * `define`.
   */
  readonly shouldReplaceDefines: boolean;
}

/**
 * Parameters for {@link createUnpluginVuePlugin}.
 */
export interface CreateUnpluginVuePluginParams {
  /**
   * The bundler, which names the `unplugin-vue` entry.
   */
  readonly bundler: 'rollup' | 'vite';

  /**
   * The build features.
   */
  readonly features: ObsidianPluginFeatureOptions;
}

/**
 * The part of a rollup or rolldown plugin context the feature plugin uses.
 */
export interface FeaturePluginContext {
  /**
   * Adds a file to watch in a watch build.
   *
   * @param id - The file's path.
   */
  addWatchFile: (id: string) => void;

  /**
   * Emits an asset into the bundle.
   *
   * @param emittedFile - The asset to emit.
   * @returns The reference id of the emitted file.
   */
  emitFile: (emittedFile: EmittedAsset) => string;
}

/**
 * The plugin {@link createRollupCompatibleFeaturePlugin} creates, in the shape rollup and vite both accept.
 */
export interface RollupCompatibleFeaturePlugin {
  /**
   * Loads a `.wasm` module as its bytes.
   */
  readonly load: FeaturePluginHook<(this: FeaturePluginContext, id: string) => Promise<null | string>>;

  /**
   * The plugin's name.
   */
  readonly name: string;

  /**
   * Compiles a module the features transform, then replaces the compile-time constants.
   */
  readonly transform: FeaturePluginHook<(this: FeaturePluginContext, code: string, id: string) => Promise<null | TransformResultLike>>;
}

/**
 * The asset the feature plugin emits for a stylesheet.
 */
interface EmittedAsset {
  readonly name: string;
  readonly source: string;
  readonly type: 'asset';
}

/**
 * A plugin hook with its order.
 *
 * @typeParam Handler - The hook's handler.
 */
interface FeaturePluginHook<Handler> {
  readonly handler: Handler;
  readonly order: 'pre';
}

/**
 * A transform hook's result.
 */
interface TransformResultLike {
  readonly code: string;
  readonly map?: SourceMapLike | undefined;
}

interface UnpluginVueModule {
  readonly default: (options?: object) => unknown;
}

/**
 * Creates the plugin that runs the shared transforms in a rollup or vite build.
 *
 * - `framework: 'solid'` compiles `.jsx` / `.tsx` with `babel-preset-solid`, before the project's TypeScript plugin.
 * - `framework: 'svelte'` compiles `.svelte` components and `.svelte.ts` / `.svelte.js` modules.
 * - `styles`, where {@link CreateRollupCompatibleFeaturePluginParams.shouldCompileStylesheets} says so, runs every
 *   stylesheet through PostCSS, Tailwind and CSS-module scoping and emits it as an asset, which ends up in
 *   `styles.css`.
 * - `wasm` loads a `.wasm` module as its bytes.
 * - A framework's compile-time constants are replaced where
 *   {@link CreateRollupCompatibleFeaturePluginParams.shouldReplaceDefines} says so.
 *
 * @param params - The {@link CreateRollupCompatibleFeaturePluginParams}.
 * @returns The plugin.
 */
export function createRollupCompatibleFeaturePlugin(params: CreateRollupCompatibleFeaturePluginParams): RollupCompatibleFeaturePlugin {
  const { features, isProductionBuild, shouldCompileStylesheets, shouldReplaceDefines } = params;

  async function transformFeatureFile(context: FeaturePluginContext, code: string, id: string): Promise<null | TransformResultLike> {
    const [filePath = id] = id.split('?', 1);
    switch (getFeatureFileKind(id)) {
      case 'jsx': {
        return features.framework === 'solid' ? await transformSolid({ code, filePath, isProductionBuild: isProductionBuild() }) : null;
      }
      case 'stylesheet': {
        if (!shouldCompileStylesheets || !features.styles) {
          return null;
        }
        const result = await transformCss({
          filePath,
          isCssModuleScoped: true,
          isProductionBuild: isProductionBuild(),
          source: code,
          styles: features.styles
        });
        for (const dependency of result.dependencies) {
          context.addWatchFile(dependency);
        }
        context.emitFile({ name: ObsidianPluginRepoPaths.StylesCss, source: result.css, type: 'asset' });
        return { code: result.moduleExports ? getCssModuleCode(result.moduleExports) : 'export default undefined;\n' };
      }
      case 'svelte': {
        return features.framework === 'svelte' ? await transformSvelte({ code, filePath, isProductionBuild: isProductionBuild() }) : null;
      }
      default: {
        return null;
      }
    }
  }

  return {
    load: {
      async handler(id): Promise<null | string> {
        return !features.wasm || getFeatureFileKind(id) !== 'wasm' ? null : getWasmModuleCode(await readFile(id));
      },
      order: 'pre'
    },
    name: 'obsidian-plugin-features',
    transform: {
      async handler(code, id): Promise<null | TransformResultLike> {
        const transformed = await transformFeatureFile(this, code, id);
        if (!shouldReplaceDefines) {
          return transformed;
        }
        const defines = getFrameworkDefines({ framework: features.framework, isProductionBuild: isProductionBuild() });
        const source = transformed?.code ?? code;
        const replaced = replaceDefines(source, defines);
        return replaced === source ? transformed : { code: replaced, map: transformed?.map };
      },
      order: 'pre'
    }
  };
}

/**
 * Creates the `unplugin-vue` plugin of one bundler when the framework is Vue.
 *
 * @param params - The {@link CreateUnpluginVuePluginParams}.
 * @returns A {@link Promise} that resolves to the plugin, or `null` when the framework is not Vue.
 */
export async function createUnpluginVuePlugin(params: CreateUnpluginVuePluginParams): Promise<unknown> {
  const { bundler, features } = params;
  if (features.framework !== 'vue') {
    return null;
  }
  const unpluginVue = await importOptionalPeer<UnpluginVueModule>({
    feature: 'framework: \'vue\'',
    packageName: 'unplugin-vue',
    specifier: `unplugin-vue/${bundler}`
  });
  return unpluginVue.default();
}
