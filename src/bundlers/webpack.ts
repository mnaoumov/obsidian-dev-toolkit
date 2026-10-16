/**
 * @file
 *
 * Builds an Obsidian plugin with webpack: a webpack plugin that gives a build the same `main.js` +
 * `styles.css` + `manifest.json` layout the esbuild builder produces, deploys a watch build into the vault,
 * and fills in only the options the consumer's own `webpack.config` leaves unset.
 *
 * `webpack` is an optional peer dependency. This module only imports its types and reaches webpack's
 * classes through `compiler.webpack`, so a plugin built with esbuild installs nothing extra.
 */

import type {
  Compilation,
  Compiler,
  WebpackOptionsNormalized,
  WebpackPluginInstance
} from 'webpack';

import { ObsidianPluginRepoPaths } from '../obsidian-plugin-repo-paths.ts';
import {
  BuildMode,
  cleanObsidianPluginDistFolder,
  completeObsidianPluginDistFolder,
  getObsidianPluginBanner,
  getObsidianPluginDistFolder,
  getObsidianPluginEntryPoint,
  isCssFileName,
  isObsidianPluginExternal,
  mergeCssAssets,
  resolveObsidianPluginBuildContext
} from './obsidian-plugin-build.ts';
import { deployToObsidianPluginsFolder } from './obsidian-plugins-folder-deployment.ts';

/**
 * Options for {@link ObsidianPluginWebpackPlugin}.
 */
export interface ObsidianPluginWebpackPluginOptions {
  /**
   * The build mode. Defaults to {@link BuildMode.Development} when webpack watches (`webpack --watch`) or
   * its `mode` is `development`, and {@link BuildMode.Production} otherwise.
   */
  readonly mode?: BuildMode;

  /**
   * A folder for Obsidian configuration. Defaults to the `OBSIDIAN_CONFIG_FOLDER` environment variable.
   */
  readonly obsidianConfigFolder?: string;
}

/**
 * The callback webpack's function form of `externals` takes.
 */
type ExternalsCallback = (error?: Error | null, result?: string) => void;

/**
 * The argument webpack's function form of `externals` receives.
 */
interface ExternalsData {
  readonly request?: string;
}

const PLUGIN_NAME = 'ObsidianPluginWebpackPlugin';

/**
 * A webpack plugin that builds an Obsidian plugin.
 *
 * What it does, each only when the consumer's config has not said otherwise:
 *
 * - `entry` is `src/main.ts`, and `mode` follows the build mode.
 * - The output is one CommonJS (`commonjs2`) `main.js` in `dist/build` (`dist/dev` in development), with no
 *   async chunks, so a dynamic import cannot become a sibling file.
 * - `target` is `node`, which is what Obsidian's renderer runs, so Node builtins resolve, while the export
 *   conditions are the browser's (`browser`, `webpack`, the mode, `module`, `import`, `require`, and never `node`),
 *   so packages hand over their browser builds, as on mobile they must.
 * - `devtool` is an inline source map in development only.
 *
 * And always: Obsidian's own modules (`obsidian`, `electron`, CodeMirror, Lezer) and the Node builtins are
 * external beside the consumer's own `externals`, the generated-file banner heads `main.js`, license
 * comments a minimizer extracted into `main.js.LICENSE.txt` (which no Obsidian release ships) are put back
 * into `main.js`, the output folder is emptied before the first build, every emitted CSS file ends up in
 * `styles.css`, `manifest.json` (and in development `.hotreload`) is copied beside it, and a development
 * build is deployed into the vault named by `OBSIDIAN_CONFIG_FOLDER`.
 *
 * TypeScript and CSS stay the consumer's choice of loaders, as they would be without this plugin.
 */
export class ObsidianPluginWebpackPlugin implements WebpackPluginInstance {
  /**
   * Creates the plugin.
   *
   * @param options - The {@link ObsidianPluginWebpackPluginOptions}.
   */
  public constructor(private readonly options: ObsidianPluginWebpackPluginOptions = {}) {}

  /* v8 ignore start -- Webpack hooks; exercised by the bundler integration test against a real webpack build. */
  /**
   * Applies the plugin to a webpack compiler.
   *
   * @param compiler - The webpack compiler.
   */
  public apply(compiler: Compiler): void {
    const mode = this.options.mode ?? getWebpackBuildMode(compiler.options);
    applyWebpackOptionDefaults(compiler.options, mode);
    // Added at the report stage, after minification, which would otherwise strip it as an ordinary comment.
    new compiler.webpack.BannerPlugin({
      banner: getObsidianPluginBanner('webpack'),
      raw: true,
      stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
      test: /\.js$/u
    }).apply(compiler);

    const buildContextPromise = resolveObsidianPluginBuildContext({
      ...this.options,
      ...(compiler.options.output.path !== undefined && { distFolder: compiler.options.output.path }),
      mode
    });
    let isDistFolderCleaned = false;

    async function prepare(): Promise<void> {
      const buildContext = await buildContextPromise;
      if (isDistFolderCleaned) {
        return;
      }
      isDistFolderCleaned = true;
      await cleanObsidianPluginDistFolder(buildContext.distFolder);
    }
    compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, prepare);
    compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, prepare);

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: PLUGIN_NAME, stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
        () => {
          renameWebpackCssAssets(compilation, compiler);
          inlineExtractedLicenses(compilation, compiler);
        }
      );
    });

    compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async (compilation) => {
      if (compilation.getStats().hasErrors()) {
        return;
      }
      const buildContext = await buildContextPromise;
      await completeObsidianPluginDistFolder(buildContext);
      await deployToObsidianPluginsFolder(buildContext);
    });
  }
  /* v8 ignore stop */
}

/**
 * Decides the build mode of a webpack build from the consumer's config: development when webpack watches
 * or its `mode` is `development`, production otherwise.
 *
 * @param options - The normalized webpack options.
 * @returns The build mode.
 */
export function getWebpackBuildMode(options: Pick<WebpackOptionsNormalized, 'mode' | 'watch'>): BuildMode {
  return options.watch || options.mode === 'development' ? BuildMode.Development : BuildMode.Production;
}

/**
 * Tells webpack's function form of `externals` to leave Obsidian's modules and the Node builtins to
 * `require()`.
 *
 * @param data - The request webpack is resolving.
 * @param callback - The callback to answer through.
 */
export function obsidianPluginWebpackExternals(data: ExternalsData, callback: ExternalsCallback): void {
  if (data.request !== undefined && isObsidianPluginExternal(data.request)) {
    callback(null, `commonjs2 ${data.request}`);
    return;
  }
  callback();
}

/* v8 ignore start -- Part of the webpack hooks above. */
/**
 * Fills in the normalized webpack options the consumer left unset.
 *
 * Runs while the plugin is applied, which webpack does after normalizing the consumer's config and before
 * applying its own defaults, so an unset option still reads `undefined` here.
 *
 * @param options - The normalized webpack options, changed in place.
 * @param mode - The build mode.
 */
function applyWebpackOptionDefaults(options: WebpackOptionsNormalized, mode: BuildMode): void {
  const isProductionBuild = mode === BuildMode.Production;
  options.mode ??= isProductionBuild ? 'production' : 'development';
  options.target ??= 'node';
  options.devtool ??= !isProductionBuild && 'inline-source-map';

  if (typeof options.entry === 'object' && Object.keys(options.entry).length === 1 && options.entry['main']?.import === undefined) {
    options.entry = { main: { import: [getObsidianPluginEntryPoint()] } };
  }

  options.output.path ??= getObsidianPluginDistFolder(mode);
  options.output.filename ??= ObsidianPluginRepoPaths.MainJs;
  options.output.library ??= { type: 'commonjs2' };
  options.output.asyncChunks ??= false;

  // Listed in full rather than with `'...'`, which would bring in the `node` condition of `target: 'node'`: export
  // Maps are matched in the package's key order, not this one's, so a package listing `node` before `browser` (Vue,
  // `fflate`) would hand over its Node build, which does not load on mobile.
  options.resolve.conditionNames ??= ['browser', 'webpack', isProductionBuild ? 'production' : 'development', 'module', 'import', 'require'];

  const userExternals = options.externals;
  options.externals = [obsidianPluginWebpackExternals, ...(Array.isArray(userExternals) ? userExternals : [userExternals])];
}

/**
 * Puts license comments a minimizer extracted into a `<file>.LICENSE.txt` back into the file they came from.
 *
 * Webpack's default minimizer moves every bundled dependency's license comment into a
 * `main.js.LICENSE.txt` beside `main.js`, which no Obsidian release ships, so the installed plugin would
 * carry code without the notices it is licensed under. Done after minification rather than by replacing
 * the minimizer, so it holds whichever minimizer the consumer or webpack picked.
 *
 * @param compilation - The compilation.
 * @param compiler - The compiler, for webpack's `sources` classes.
 */
function inlineExtractedLicenses(compilation: Compilation, compiler: Compiler): void {
  const LICENSE_SUFFIX = '.LICENSE.txt';
  for (const licenseAsset of compilation.getAssets()) {
    if (!licenseAsset.name.endsWith(LICENSE_SUFFIX)) {
      continue;
    }
    const sourceFileName = licenseAsset.name.slice(0, -LICENSE_SUFFIX.length);
    const sourceAsset = compilation.getAsset(sourceFileName);
    if (!sourceAsset) {
      continue;
    }
    const licenseFileName = licenseAsset.name.split('/').at(-1) ?? licenseAsset.name;
    const reference = `/*! For license information please see ${licenseFileName} */`;
    const source = sourceAsset.source.source().toString();
    const licenses = licenseAsset.source.source().toString().trimEnd();
    const updatedSource = source.includes(reference) ? source.replace(reference, () => licenses) : `${licenses}\n${source}`;
    compilation.updateAsset(sourceFileName, new compiler.webpack.sources.RawSource(updatedSource));
    compilation.deleteAsset(licenseAsset.name);
  }
}

/**
 * Moves every CSS asset of a compilation into `styles.css`.
 *
 * @param compilation - The compilation.
 * @param compiler - The compiler, for webpack's `sources` classes.
 */
function renameWebpackCssAssets(compilation: Compilation, compiler: Compiler): void {
  const cssAssets = compilation.getAssets()
    .filter((asset) => isCssFileName(asset.name))
    .map((asset) => ({ fileName: asset.name, source: asset.source.source().toString() }));
  const { fileNamesToRemove, stylesCss } = mergeCssAssets(cssAssets);
  if (stylesCss === undefined) {
    return;
  }
  for (const fileName of fileNamesToRemove) {
    compilation.deleteAsset(fileName);
  }
  compilation.emitAsset(ObsidianPluginRepoPaths.StylesCss, new compiler.webpack.sources.RawSource(stylesCss));
}
/* v8 ignore stop */
