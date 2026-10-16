/**
 * @file
 *
 * Builds an Obsidian plugin with vite: a vite plugin that turns `vite build` into a library build of
 * `src/main.ts` with the same `main.js` + `styles.css` + `manifest.json` layout the esbuild builder
 * produces, deploys a `vite build --watch` build into the vault, and fills in only the options the
 * consumer's own `vite.config` leaves unset.
 *
 * `vite` is an optional peer dependency and this module only imports its types, so a plugin built with
 * esbuild installs nothing extra.
 */

import type {
  ConfigEnv,
  Plugin,
  PluginOption,
  UserConfig
} from 'vite';

import type {
  ObsidianPluginBuildContext,
  ObsidianPluginDeploymentOptions
} from './obsidian-plugin-build.ts';
import type { ObsidianPluginFeatureOptions } from './obsidian-plugin-features.ts';
import type { PostcssConfig } from './obsidian-plugin-transforms.ts';
import type {
  AssetEmitter,
  BundleOutputLike
} from './rollup-compatible.ts';

import {
  BuildMode,
  cleanObsidianPluginDistFolder,
  completeObsidianPluginDistFolder,
  getObsidianPluginBanner,
  resolveObsidianPluginBuildContext
} from './obsidian-plugin-build.ts';
import {
  getFrameworkDefines,
  getJsxImportSource,
  isPostcssNeeded
} from './obsidian-plugin-features.ts';
import { loadPostcssConfig } from './obsidian-plugin-transforms.ts';
import { deployToObsidianPluginsFolder } from './obsidian-plugins-folder-deployment.ts';
import {
  createRollupCompatibleFeaturePlugin,
  createUnpluginVuePlugin
} from './rollup-compatible-features.ts';
import {
  combineExternal,
  renameCssAssets
} from './rollup-compatible.ts';

/**
 * Parameters for {@link getViteFeatureConfig}.
 */
export interface GetViteFeatureConfigParams {
  /**
   * The build features.
   */
  readonly features: ObsidianPluginFeatureOptions;

  /**
   * Whether this is a production build.
   */
  readonly isProductionBuild: boolean;

  /**
   * The PostCSS plugins of the `styles` option, or `undefined` when it needs none.
   */
  readonly postcssConfig: PostcssConfig | undefined;

  /**
   * The consumer's vite config.
   */
  readonly userConfig: UserConfig;
}

/**
 * Options for {@link obsidianPluginVite}.
 */
export interface ObsidianPluginViteOptions extends ObsidianPluginDeploymentOptions, ObsidianPluginFeatureOptions {
  /**
   * The build mode. Defaults to {@link BuildMode.Development} for `vite build --watch` (or
   * `--mode development`) and {@link BuildMode.Production} otherwise.
   */
  readonly mode?: BuildMode;
}

/**
 * The state one {@link obsidianPluginVite} instance keeps across the hooks of a build, and across the
 * rebuilds of a watch.
 */
interface ObsidianPluginViteState {
  buildContext: ObsidianPluginBuildContext | undefined;
  isDistFolderCleaned: boolean;
}

/**
 * Decides the build mode of a vite build from the consumer's config: development for a watch build or for
 * `--mode development`, production otherwise.
 *
 * @param userConfig - The consumer's vite config.
 * @param env - The vite config environment.
 * @returns The build mode.
 */
export function getViteBuildMode(userConfig: UserConfig, env: Pick<ConfigEnv, 'mode'>): BuildMode {
  return userConfig.build?.watch || env.mode === 'development' ? BuildMode.Development : BuildMode.Production;
}

/**
 * Builds the part of the vite config the plugin contributes: only the options the consumer left unset.
 *
 * @param userConfig - The consumer's vite config.
 * @param buildContext - The build context.
 * @returns The config vite merges into the consumer's.
 */
export function getViteConfigDefaults(userConfig: UserConfig, buildContext: ObsidianPluginBuildContext): UserConfig {
  const build = userConfig.build ?? {};
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- A consumer's config may still use the deprecated alias, and vite still honors it.
  const rolldownOptions = build.rolldownOptions ?? build.rollupOptions ?? {};
  const output = Array.isArray(rolldownOptions.output) ? undefined : rolldownOptions.output ?? {};

  return {
    build: {
      // An Obsidian release ships `main.js` and `styles.css` and nothing else, so any asset emitted beside
      // the bundle is a file the installed plugin looks for and does not find.
      assetsInlineLimit: build.assetsInlineLimit ?? Number.MAX_SAFE_INTEGER,
      // eslint-disable-next-line unicorn/name-replacements -- `emptyOutDir` is the name vite's config reads.
      emptyOutDir: false,
      lib: build.lib ?? {
        cssFileName: 'styles',
        entry: buildContext.entryPoint,
        fileName: (): string => 'main.js',
        formats: ['cjs']
      },
      minify: build.minify ?? buildContext.isProductionBuild,
      // eslint-disable-next-line unicorn/name-replacements -- `outDir` is the name vite's config reads.
      outDir: buildContext.distFolder,
      rolldownOptions: {
        external: combineExternal(rolldownOptions.external),
        ...(output !== undefined && {
          output: {
            // `postBanner` rather than `banner`: it is added after minification, which strips an ordinary comment.
            ...(output.banner === undefined && output.postBanner === undefined && { postBanner: getObsidianPluginBanner('vite') }),
            // An Obsidian plugin is one file: the manifest names `main.js` and nothing loads a second chunk.
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- A consumer's config may still set the deprecated option, which then wins.
            ...(output.codeSplitting === undefined && output.inlineDynamicImports === undefined && { codeSplitting: false })
          }
        })
      },
      sourcemap: build.sourcemap ?? (!buildContext.isProductionBuild && 'inline')
    }
  };
}

/**
 * Builds the part of the vite config the build features contribute, each only where the consumer's config left it
 * unset: the framework's compile-time constants (`define`), the automatic JSX runtime for React and Preact
 * (`oxc.jsx`), and the PostCSS plugins of the `styles` option (`css.postcss`).
 *
 * @param params - The {@link GetViteFeatureConfigParams}.
 * @returns The config vite merges into the consumer's.
 */
export function getViteFeatureConfig(params: GetViteFeatureConfigParams): UserConfig {
  const { features, isProductionBuild, postcssConfig, userConfig } = params;
  const config: UserConfig = {};

  const userDefine = userConfig.define ?? {};
  const define = Object.fromEntries(
    Object.entries(getFrameworkDefines({ framework: features.framework, isProductionBuild })).filter(([expression]) => !Object.hasOwn(userDefine, expression))
  );
  if (Object.keys(define).length > 0) {
    config.define = define;
  }

  const jsxImportSource = getJsxImportSource(features.framework);
  if (jsxImportSource !== undefined && userConfig.oxc !== false && userConfig.oxc?.jsx === undefined) {
    config.oxc = { jsx: { development: !isProductionBuild, importSource: jsxImportSource, runtime: 'automatic' } };
  }

  if (postcssConfig && postcssConfig.plugins.length > 0 && userConfig.css?.postcss === undefined) {
    config.css = { postcss: { plugins: [...postcssConfig.plugins] } };
  }
  return config;
}

/**
 * Creates a vite plugin that builds an Obsidian plugin.
 *
 * What it does, each only when the consumer's config has not said otherwise:
 *
 * - `build.lib` builds `src/main.ts` as one CommonJS `main.js`, with its CSS in `styles.css`.
 * - `build.outDir` is `dist/build` (`dist/dev` in development).
 * - `build.minify` is on in production only, and `build.sourcemap` is inline in development only.
 * - Every asset is inlined, because an Obsidian release ships `main.js` and `styles.css` and nothing else.
 * - Dynamic imports are inlined into `main.js`, and the generated-file banner heads it.
 *
 * And always: Obsidian's own modules (`obsidian`, `electron`, CodeMirror, Lezer) and the Node builtins are
 * external beside the consumer's own `external`, the output folder is emptied once before the first write
 * (`build.emptyOutDir` is turned off, since this plugin does it), every emitted CSS file ends up in
 * `styles.css`, `manifest.json` (and in development `.hotreload`) is copied beside it, and a development
 * build is deployed into the vault named by `OBSIDIAN_CONFIG_FOLDER`.
 *
 * The build features ({@link ObsidianPluginFeatureOptions}):
 *
 * - `framework: 'react' | 'preact'` sets `oxc.jsx` to the automatic runtime (unless set).
 * - `framework: 'solid' | 'svelte'` compiles the components with the toolkit's shared transforms, and `'vue'` adds
 *   `unplugin-vue`.
 * - Any framework defines `process.env.NODE_ENV` (and Vue's feature flags), which a library build leaves alone.
 * - `styles.postcss` and `styles.tailwind` set `css.postcss` (unless set); vite scopes `*.module.css` itself, so
 *   `styles.cssModules` changes nothing here.
 * - `wasm` imports a `.wasm` module as its bytes.
 *
 * @param options - The {@link ObsidianPluginViteOptions}.
 * @returns The vite plugins, which vite takes as one entry of its `plugins`.
 */
export function obsidianPluginVite(options: ObsidianPluginViteOptions = {}): PluginOption[] {
  const state: ObsidianPluginViteState = {
    buildContext: undefined,
    isDistFolderCleaned: false
  };

  /* v8 ignore start -- Vite hooks; exercised by the bundler integration test against a real vite build. */
  function getBuildContext(): ObsidianPluginBuildContext {
    if (!state.buildContext) {
      throw new Error('The obsidian-plugin vite plugin has not resolved its build context: its `config` hook did not run.');
    }
    return state.buildContext;
  }

  const featurePlugin = createRollupCompatibleFeaturePlugin({
    features: options,
    isProductionBuild: () => getBuildContext().isProductionBuild,
    shouldCompileStylesheets: false,
    shouldReplaceDefines: false
  });

  const plugin = {
    apply: 'build',
    async config(userConfig: UserConfig, env: ConfigEnv): Promise<UserConfig> {
      state.buildContext = await resolveObsidianPluginBuildContext({
        ...options,
        ...(userConfig.build?.outDir !== undefined && { distFolder: userConfig.build.outDir }),
        mode: options.mode ?? getViteBuildMode(userConfig, env)
      });
      const { isProductionBuild } = state.buildContext;
      const postcssConfig = isPostcssNeeded(options.styles)
        ? await loadPostcssConfig({ isProductionBuild, styles: options.styles ?? {} })
        : undefined;
      const featureConfig = getViteFeatureConfig({ features: options, isProductionBuild, postcssConfig, userConfig });
      const config = getViteConfigDefaults(userConfig, state.buildContext);
      return { ...featureConfig, ...config };
    },
    generateBundle: {
      handler(this: AssetEmitter, _outputOptions: unknown, bundle: Record<string, BundleOutputLike>): void {
        renameCssAssets(this, bundle);
      },
      order: 'post'
    },
    name: 'obsidian-plugin',
    async renderStart(): Promise<void> {
      if (state.isDistFolderCleaned) {
        return;
      }
      state.isDistFolderCleaned = true;
      await cleanObsidianPluginDistFolder(getBuildContext().distFolder);
    },
    async writeBundle(): Promise<void> {
      await completeObsidianPluginDistFolder(getBuildContext());
      await deployToObsidianPluginsFolder(getBuildContext());
    }
  } as Plugin;
  return [plugin, { ...featurePlugin, apply: 'build' } as Plugin, createUnpluginVuePlugin({ bundler: 'vite', features: options }) as Promise<null | Plugin>];
  /* v8 ignore stop */
}
