/**
 * @file
 *
 * Builds an Obsidian plugin with rollup: a rollup plugin that gives a build the same `main.js` +
 * `styles.css` + `manifest.json` layout the esbuild builder produces, deploys a watch build into the vault,
 * and fills in only the options the consumer's own `rollup.config` leaves unset.
 *
 * `rollup` is an optional peer dependency and this module only imports its types, so a plugin built with
 * esbuild installs nothing extra.
 */

import type {
  InputOptions,
  NormalizedOutputOptions,
  OutputOptions,
  Plugin
} from 'rollup';

import { dirname } from '@mnaoumov/typescript-lib/path';

import type { ObsidianPluginBuildContext } from './obsidian-plugin-build.ts';

import {
  BuildMode,
  cleanObsidianPluginDistFolder,
  completeObsidianPluginDistFolder,
  getObsidianPluginBanner,
  resolveObsidianPluginBuildContext
} from './obsidian-plugin-build.ts';
import { deployToObsidianPluginsFolder } from './obsidian-plugins-folder-deployment.ts';
import {
  combineExternal,
  renameCssAssets
} from './rollup-compatible.ts';

/**
 * Parameters for {@link applyRollupInputDefaults}.
 */
export interface ApplyRollupInputDefaultsParams {
  /**
   * The build context.
   */
  readonly buildContext: ObsidianPluginBuildContext;

  /**
   * The consumer's input options.
   */
  readonly inputOptions: InputOptions;
}

/**
 * Parameters for {@link applyRollupOutputDefaults}.
 */
export interface ApplyRollupOutputDefaultsParams {
  /**
   * The build context.
   */
  readonly buildContext: ObsidianPluginBuildContext;

  /**
   * The consumer's output options.
   */
  readonly outputOptions: OutputOptions;
}

/**
 * Options for {@link obsidianPluginRollup}.
 */
export interface ObsidianPluginRollupOptions {
  /**
   * The build mode. Defaults to {@link BuildMode.Development} in watch mode (`rollup --watch`) and
   * {@link BuildMode.Production} otherwise.
   */
  readonly mode?: BuildMode;

  /**
   * A folder for Obsidian configuration. Defaults to the `OBSIDIAN_CONFIG_FOLDER` environment variable.
   */
  readonly obsidianConfigFolder?: string;
}

/**
 * The state one {@link obsidianPluginRollup} instance keeps across the hooks of a build, and across the
 * rebuilds of a watch.
 */
interface ObsidianPluginRollupState {
  buildContext: ObsidianPluginBuildContext | undefined;
  isDistFolderCleaned: boolean;
}

/**
 * Fills in the rollup input options the consumer left unset.
 *
 * @param params - The {@link ApplyRollupInputDefaultsParams}.
 * @returns The input options with the plugin's defaults applied.
 */
export function applyRollupInputDefaults(params: ApplyRollupInputDefaultsParams): InputOptions {
  const { buildContext, inputOptions } = params;
  return {
    ...inputOptions,
    external: combineExternal(inputOptions.external),
    input: inputOptions.input ?? buildContext.entryPoint
  };
}

/**
 * Fills in the rollup output options the consumer left unset.
 *
 * @param params - The {@link ApplyRollupOutputDefaultsParams}.
 * @returns The output options with the plugin's defaults applied.
 */
export function applyRollupOutputDefaults(params: ApplyRollupOutputDefaultsParams): OutputOptions {
  const { buildContext, outputOptions } = params;
  const hasOutputLocation = outputOptions.file !== undefined || outputOptions.dir !== undefined;
  return {
    ...outputOptions,
    banner: outputOptions.banner ?? getObsidianPluginBanner('rollup'),
    format: outputOptions.format ?? 'cjs',
    ...(!hasOutputLocation && { file: buildContext.mainJsPath }),
    // An Obsidian plugin is one file: the manifest names `main.js` and nothing loads a second chunk.
    inlineDynamicImports: outputOptions.inlineDynamicImports ?? true,
    sourcemap: outputOptions.sourcemap ?? (!buildContext.isProductionBuild && 'inline')
  };
}

/**
 * Creates a rollup plugin that builds an Obsidian plugin.
 *
 * What it does, each only when the consumer's config has not said otherwise:
 *
 * - `input` is `src/main.ts`.
 * - The output is one CommonJS `main.js` in `dist/build` (`dist/dev` in watch mode), with dynamic imports
 *   inlined, the generated-file banner, and an inline source map in development.
 *
 * And always: Obsidian's own modules (`obsidian`, `electron`, CodeMirror, Lezer) and the Node builtins are
 * external beside the consumer's own `external`, the output folder is emptied before the first write,
 * every emitted CSS file ends up in `styles.css`, `manifest.json` (and in development `.hotreload`) is
 * copied beside it, and a development build is deployed into the vault named by `OBSIDIAN_CONFIG_FOLDER`.
 *
 * TypeScript, CSS and minification stay the consumer's choice of rollup plugins, as they would be without
 * this one.
 *
 * @param options - The {@link ObsidianPluginRollupOptions}.
 * @returns The rollup plugin.
 */
export function obsidianPluginRollup(options: ObsidianPluginRollupOptions = {}): Plugin {
  const state: ObsidianPluginRollupState = {
    buildContext: undefined,
    isDistFolderCleaned: false
  };

  /* v8 ignore start -- Rollup hooks; exercised by the bundler integration test against a real rollup build. */
  function getBuildContext(): ObsidianPluginBuildContext {
    if (!state.buildContext) {
      throw new Error('The obsidian-plugin rollup plugin has not resolved its build context: its `options` hook did not run.');
    }
    return state.buildContext;
  }

  return {
    generateBundle: {
      handler(_outputOptions, bundle): void {
        renameCssAssets(this, bundle);
      },
      order: 'post'
    },
    name: 'obsidian-plugin',
    async options(inputOptions): Promise<InputOptions> {
      const mode = options.mode ?? (this.meta.watchMode ? BuildMode.Development : BuildMode.Production);
      state.buildContext = await resolveObsidianPluginBuildContext({ ...options, mode });
      return applyRollupInputDefaults({ buildContext: state.buildContext, inputOptions });
    },
    outputOptions(outputOptions): OutputOptions {
      return applyRollupOutputDefaults({ buildContext: getBuildContext(), outputOptions });
    },
    async renderStart(outputOptions): Promise<void> {
      if (state.isDistFolderCleaned) {
        return;
      }
      state.isDistFolderCleaned = true;
      await cleanObsidianPluginDistFolder(getOutputFolder(outputOptions));
    },
    async writeBundle(outputOptions): Promise<void> {
      const buildContext = { ...getBuildContext(), distFolder: getOutputFolder(outputOptions) };
      await completeObsidianPluginDistFolder(buildContext);
      await deployToObsidianPluginsFolder(buildContext);
    }
  };
  /* v8 ignore stop */
}

/* v8 ignore start -- Part of the rollup hooks above. */
function getOutputFolder(outputOptions: NormalizedOutputOptions): string {
  return outputOptions.dir ?? dirname(outputOptions.file ?? '');
}
/* v8 ignore stop */
