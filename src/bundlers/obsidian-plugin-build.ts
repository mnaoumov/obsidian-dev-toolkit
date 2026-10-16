/**
 * @file
 *
 * The bundler-independent half of building an Obsidian plugin: which modules stay external, where the
 * output goes, what the output folder holds besides the bundle, and how a development build reaches the
 * vault. Every bundler adapter in this folder (esbuild, rollup, vite, webpack, parcel) is a thin layer over
 * it, so all of them produce the same `main.js` + `styles.css` + `manifest.json` layout.
 */

import { readPackageJson } from '@mnaoumov/typescript-dev-toolkit/npm';
import { resolvePathFromRoot } from '@mnaoumov/typescript-dev-toolkit/root';
import {
  basename,
  join
} from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { existsSync } from 'node:fs';
import {
  cp,
  mkdir,
  rm,
  writeFile
} from 'node:fs/promises';
import { builtinModules } from 'node:module';
import process, { loadEnvFile } from 'node:process';

import { ObsidianPluginRepoPaths } from '../obsidian-plugin-repo-paths.ts';

/**
 * Enumeration representing the build modes.
 */
export enum BuildMode {
  /**
  Development mode for building the plugin
   */
  Development,
  /**
  Production mode for building the plugin
   */
  Production
}

/**
 * The modules Obsidian supplies at runtime. A plugin must never bundle its own copy of them: a second copy
 * of the API breaks `instanceof` against the running one, and a second CodeMirror breaks every extension.
 *
 * `esbuild` and `eslint` are here because a plugin that imports one of the toolkit's build-time modules
 * would otherwise drag either into `main.js`.
 */
export const OBSIDIAN_PLUGIN_RUNTIME_MODULES: readonly string[] = [
  'obsidian',
  'electron',
  '@codemirror/autocomplete',
  '@codemirror/collab',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
  'esbuild',
  'eslint'
];

/**
 * The module ids an Obsidian plugin bundle leaves to `require()` at runtime: the
 * {@link OBSIDIAN_PLUGIN_RUNTIME_MODULES} and the Node builtins. Every `node:`-prefixed id is external too,
 * which a bundler takes as a pattern (esbuild's `node:*`) or through {@link isObsidianPluginExternal}.
 */
export const OBSIDIAN_PLUGIN_EXTERNALS: readonly string[] = [
  ...OBSIDIAN_PLUGIN_RUNTIME_MODULES,
  ...builtinModules
];

const NODE_PREFIX = 'node:';
const STYLES_CSS_FILE_NAME: string = ObsidianPluginRepoPaths.StylesCss;

const OBSIDIAN_PLUGIN_EXTERNALS_SET = new Set(OBSIDIAN_PLUGIN_EXTERNALS);

/**
 * A CSS file a bundler emitted, as {@link mergeCssAssets} sees it.
 */
export interface CssAsset {
  /**
   * The file name relative to the output folder.
   */
  readonly fileName: string;

  /**
   * The file's contents.
   */
  readonly source: string;
}

/**
 * What {@link mergeCssAssets} decided.
 */
export interface MergeCssAssetsResult {
  /**
   * The file names to drop from the output, because their contents moved into `styles.css`. Includes
   * `styles.css` itself when the bundler already emitted one, so it is always written afresh.
   */
  readonly fileNamesToRemove: readonly string[];

  /**
   * The contents of `styles.css`, or `undefined` when there is nothing to do: the bundle has no CSS at all,
   * or its one CSS file already is `styles.css`.
   */
  readonly stylesCss: string | undefined;
}

/**
 * Where a plugin build writes its output and what it builds.
 */
export interface ObsidianPluginBuildContext {
  /**
   * The absolute path of the folder the build writes `main.js`, `styles.css` and `manifest.json` into.
   */
  readonly distFolder: string;

  /**
   * The absolute path of the plugin's entry point, `src/main.ts`.
   */
  readonly entryPoint: string;

  /**
   * Whether this is a production build.
   */
  readonly isProductionBuild: boolean;

  /**
   * The absolute path of the emitted `main.js`.
   */
  readonly mainJsPath: string;

  /**
   * The Obsidian configuration folder a development build is deployed into, or an empty string when none
   * is configured.
   */
  readonly obsidianConfigFolder: string;

  /**
   * The plugin's folder name inside `<vault>/.obsidian/plugins`, which is the package name.
   */
  readonly pluginName: string;

  /**
   * How a development build is reloaded in Obsidian once it is deployed.
   */
  readonly reload: ObsidianPluginReload;
}

/**
 * Where a development build is deployed and how Obsidian picks it up. Every bundler adapter takes these.
 */
export interface ObsidianPluginDeploymentOptions {
  /**
   * A folder for Obsidian configuration. Defaults to the `OBSIDIAN_CONFIG_FOLDER` environment variable,
   * read from the process or from a `.env` file in the project root.
   */
  readonly obsidianConfigFolder?: string;

  /**
   * How a development build is reloaded in Obsidian once it is copied into the vault. Defaults to
   * `'hot-reload-plugin'`.
   */
  readonly reload?: ObsidianPluginReload;
}

/**
 * How a development build is reloaded in Obsidian once it is copied into the vault.
 *
 * - `'hot-reload-plugin'`: the build writes the `.hotreload` marker, and `npm run dev` opens the vault in an
 *   Obsidian instance it owns, with the HotReload plugin installed and enabled there.
 * - `'obsidian-cli'`: every rebuild runs `obsidian plugin:reload` against the Obsidian you already have open,
 *   through the Obsidian CLI (Settings → General → Command line interface). No HotReload, no second instance.
 * - `false`: the build is copied into the vault and nothing reloads it.
 */
export type ObsidianPluginReload = 'hot-reload-plugin' | 'obsidian-cli' | false;

/**
 * Options for {@link resolveObsidianPluginBuildContext}.
 */
export interface ResolveObsidianPluginBuildContextParams extends ObsidianPluginDeploymentOptions {
  /**
   * The output folder. Defaults to `dist/build` for a production build and `dist/dev` for a development
   * one.
   */
  readonly distFolder?: string;

  /**
   * The build mode.
   */
  readonly mode: BuildMode;
}

interface ObsidianPluginBuilderEnv {
  OBSIDIAN_CONFIG_FOLDER: string;
}

/**
 * Removes the output folder of a build and creates it empty again.
 *
 * @param distFolder - The output folder.
 * @returns A {@link Promise} that resolves once the folder exists and is empty.
 */
export async function cleanObsidianPluginDistFolder(distFolder: string): Promise<void> {
  if (existsSync(distFolder)) {
    await rm(distFolder, { recursive: true });
  }
  await mkdir(distFolder, { recursive: true });
}

/**
 * Puts the files a plugin folder needs besides the bundle into the output folder: `manifest.json`, and for
 * a development build reloaded by the HotReload plugin the empty `.hotreload` marker it watches for.
 *
 * @param context - The build context.
 * @returns A {@link Promise} that resolves once the files are written.
 */
export async function completeObsidianPluginDistFolder(context: ObsidianPluginBuildContext): Promise<void> {
  await mkdir(context.distFolder, { recursive: true });
  if (!context.isProductionBuild && context.reload === 'hot-reload-plugin') {
    await writeFile(join(context.distFolder, ObsidianPluginRepoPaths.HotReload), '', 'utf-8');
  }

  const manifestPath = resolvePathFromRoot({ path: ObsidianPluginRepoPaths.ManifestJson });
  if (manifestPath && existsSync(manifestPath)) {
    await cp(manifestPath, join(context.distFolder, ObsidianPluginRepoPaths.ManifestJson));
  }
}

/**
 * Builds the banner placed at the top of `main.js`.
 *
 * @param bundlerName - The bundler's name, as the banner states it.
 * @returns The banner, a block comment followed by a newline.
 */
export function getObsidianPluginBanner(bundlerName: string): string {
  return `/*
THIS IS A GENERATED/BUNDLED FILE BY ${bundlerName.toUpperCase()}
if you want to view the source, please visit the github repository of this plugin
*/
`;
}

/**
 * Resolves the default output folder of a build: `dist/build` for a production build, `dist/dev` for a
 * development one.
 *
 * @param mode - The build mode.
 * @returns The absolute path of the output folder.
 */
export function getObsidianPluginDistFolder(mode: BuildMode): string {
  return resolveFromRoot(mode === BuildMode.Production ? ObsidianPluginRepoPaths.DistBuild : ObsidianPluginRepoPaths.DistDev);
}

/**
 * Resolves the plugin's entry point, `src/main.ts`.
 *
 * @returns The absolute path of the entry point.
 */
export function getObsidianPluginEntryPoint(): string {
  return resolveFromRoot(join(ObsidianPluginRepoPaths.Src, ObsidianPluginRepoPaths.MainTs));
}

/**
 * Tells whether a file name is a CSS file.
 *
 * @param fileName - The file name.
 * @returns `true` for a `.css` file.
 */
export function isCssFileName(fileName: string): boolean {
  return basename(fileName).toLowerCase().endsWith('.css');
}

/**
 * Tells whether a module id is one an Obsidian plugin bundle must leave external: one of
 * {@link OBSIDIAN_PLUGIN_EXTERNALS}, a subpath of one (`@codemirror/view/dist/index.js`, `fs/promises`),
 * or any `node:`-prefixed id.
 *
 * @param moduleId - The module id as written in the importing file.
 * @returns `true` when the bundle must leave the module to `require()` at runtime.
 */
export function isObsidianPluginExternal(moduleId: string): boolean {
  if (moduleId.startsWith(NODE_PREFIX) || OBSIDIAN_PLUGIN_EXTERNALS_SET.has(moduleId)) {
    return true;
  }

  const SCOPED_PACKAGE_SEGMENT_COUNT = 2;
  const packageName = moduleId.split('/').slice(0, moduleId.startsWith('@') ? SCOPED_PACKAGE_SEGMENT_COUNT : 1).join('/');
  return packageName !== moduleId && OBSIDIAN_PLUGIN_EXTERNALS_SET.has(packageName);
}

/**
 * Decides how the CSS a bundler emitted becomes the one `styles.css` Obsidian loads.
 *
 * Obsidian reads a plugin's stylesheet from `styles.css` and nothing else, while a bundler names the CSS
 * after the entry (`main.css`), after the package, or with a content hash. A lone CSS file is renamed; when
 * there are several, they are concatenated in the order given.
 *
 * @param cssAssets - The CSS files the bundler emitted, in output order.
 * @returns What to write as `styles.css` and which emitted files to drop.
 */
export function mergeCssAssets(cssAssets: readonly CssAsset[]): MergeCssAssetsResult {
  const [firstCssAsset] = cssAssets;
  if (firstCssAsset === undefined || (cssAssets.length === 1 && firstCssAsset.fileName === STYLES_CSS_FILE_NAME)) {
    return { fileNamesToRemove: [], stylesCss: undefined };
  }

  return {
    fileNamesToRemove: cssAssets.map((asset) => asset.fileName),
    stylesCss: cssAssets.map((asset) => asset.source).join('\n')
  };
}

/**
 * Resolves a path against the project root.
 *
 * @param path - The path, relative to the project root or absolute.
 * @returns The absolute path.
 */
export function resolveFromRoot(path: string): string {
  return ensureNonNullable(resolvePathFromRoot({ path }), `Could not resolve '${path}' against the project root`);
}

/**
 * Resolves where a plugin build writes its output, which entry point it builds and which vault a
 * development build is deployed into.
 *
 * Loads the project's `.env` file first, so `OBSIDIAN_CONFIG_FOLDER` can live there.
 *
 * @param params - The {@link ResolveObsidianPluginBuildContextParams}.
 * @returns A {@link Promise} that resolves to the {@link ObsidianPluginBuildContext}.
 */
export async function resolveObsidianPluginBuildContext(params: ResolveObsidianPluginBuildContextParams): Promise<ObsidianPluginBuildContext> {
  const envPath = resolvePathFromRoot({ path: '.env' });
  if (envPath && existsSync(envPath)) {
    loadEnvFile(envPath);
  }
  const obsidianPluginBuilderEnv = process.env as Partial<ObsidianPluginBuilderEnv>;

  const isProductionBuild = params.mode === BuildMode.Production;
  const distFolder = params.distFolder === undefined ? getObsidianPluginDistFolder(params.mode) : resolveFromRoot(params.distFolder);
  const packageJson = await readPackageJson();

  return {
    distFolder,
    entryPoint: getObsidianPluginEntryPoint(),
    isProductionBuild,
    mainJsPath: join(distFolder, ObsidianPluginRepoPaths.MainJs),
    obsidianConfigFolder: params.obsidianConfigFolder ?? obsidianPluginBuilderEnv.OBSIDIAN_CONFIG_FOLDER ?? '',
    pluginName: packageJson.name ?? '(unknown)',
    reload: params.reload ?? 'hot-reload-plugin'
  };
}
