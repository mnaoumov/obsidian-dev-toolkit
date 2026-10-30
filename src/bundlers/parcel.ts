/**
 * @file
 *
 * Builds an Obsidian plugin with parcel: `build()` and `dev()`, the same two entry points the esbuild
 * builder has, producing the same `main.js` + `styles.css` + `manifest.json` layout.
 *
 * Parcel takes no `external` list and no output file name, only plugins named in a `.parcelrc`. So the
 * build writes a `.parcelrc` of its own into `.parcel-cache`, beside a resolver that leaves
 * Obsidian's modules external and resolves packages with the browser's export conditions, a namer that names
 * the stylesheet `styles.css`, a transformer that keeps dynamic imports inside `main.js`, and an optimizer that
 * lets the minifier rename the bundle's top-level bindings, and extends the
 * consumer's own `.parcelrc` when there is one (or `@parcel/config-default` when there is none), so every
 * transformer the consumer configured still applies.
 *
 * `@parcel/core`, `@parcel/plugin` and `@parcel/config-default` are optional peer dependencies, loaded
 * only when a parcel build runs, so a plugin built with esbuild installs nothing extra.
 */

import type {
  BuildEvent,
  InitialParcelOptions,
  TargetDescriptor
} from '@parcel/types';

import { CliTaskResult } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { npmRunOptional } from '@mnaoumov/typescript-dev-toolkit/npm-run';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import {
  extname,
  join,
  relative,
  toPosixPath
} from '@mnaoumov/typescript-lib/path';
import { existsSync } from 'node:fs';
import {
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises';

import type {
  ObsidianPluginBuildContext,
  ObsidianPluginDeploymentOptions
} from './obsidian-plugin-build.ts';
import type { ObsidianPluginFeatureOptions } from './obsidian-plugin-features.ts';

import { ObsidianPluginRepoPaths } from '../obsidian-plugin-repo-paths.ts';
import {
  BuildMode,
  cleanObsidianPluginDistFolder,
  completeObsidianPluginDistFolder,
  getObsidianPluginBanner,
  OBSIDIAN_PLUGIN_EXTERNALS,
  resolveFromRoot,
  resolveObsidianPluginBuildContext
} from './obsidian-plugin-build.ts';
import {
  getFrameworkDefines,
  getJsxImportSource,
  isPostcssNeeded
} from './obsidian-plugin-features.ts';
import { deployToObsidianPluginsFolder } from './obsidian-plugins-folder-deployment.ts';

/**
 * Options for {@link buildObsidianPluginWithParcel}.
 */
export interface BuildObsidianPluginWithParcelParams extends BuildOptions {
  /**
   * A build mode, either `Development` or `Production`.
   */
  readonly mode: BuildMode;
}

/**
 * Options for {@link build} and {@link dev}.
 */
export interface BuildOptions extends ObsidianPluginDeploymentOptions, ObsidianPluginFeatureOptions {
  /**
   * Customizes the options handed to parcel's `Parcel` class.
   */
  readonly customizeParcelOptions?: (options: InitialParcelOptions) => InitialParcelOptions;
}

/**
 * Parameters for {@link getParcelConfigFiles}.
 */
export interface GetParcelConfigFilesParams {
  /**
   * The consumer's own `.parcelrc`, relative to the generated configuration's folder, or `undefined` when the project
   * has none.
   */
  readonly consumerParcelrcPath: string | undefined;

  /**
   * The build features.
   */
  readonly features?: ObsidianPluginFeatureOptions;
}

/**
 * Parameters for {@link getParcelOptions}.
 */
export interface GetParcelOptionsParams {
  /**
   * The build context.
   */
  readonly buildContext: ObsidianPluginBuildContext;

  /**
   * Parcel's cache folder. Named explicitly because parcel otherwise takes the folder of the nearest
   * lockfile for the project root, which in a workspace is not the plugin's.
   */
  readonly cacheFolder: string;

  /**
   * The generated `.parcelrc`.
   */
  readonly configPath: string;
}

/**
 * The files of the generated parcel configuration, by file name.
 */
export type ParcelConfigFiles = Readonly<Record<string, string>>;

// Inside parcel's own cache folder: parcel refuses relative plugins in a config under `node_modules` (it
// takes such a config for a published package), and it never watches its cache folder, so regenerating
// these files on every build cannot trigger a rebuild.
const PARCEL_CACHE_FOLDER = '.parcel-cache';
const GENERATED_PARCEL_CONFIG_FOLDER = `${PARCEL_CACHE_FOLDER}/obsidian-dev-toolkit`;
const PARCELRC = '.parcelrc';

/**
 * One diagnostic of a {@link ParcelErrorLike}.
 */
interface ParcelErrorDiagnostic {
  readonly message: string;
}

/**
 * What parcel throws when a build fails: an error carrying its diagnostics.
 */
interface ParcelErrorLike {
  readonly diagnostics?: readonly ParcelErrorDiagnostic[];
}
const RESOLVER_FILE_NAME = 'obsidian-plugin-resolver.cjs';
const NAMER_FILE_NAME = 'obsidian-plugin-namer.cjs';
const INLINE_IMPORTS_FILE_NAME = 'obsidian-plugin-inline-imports.cjs';
const OPTIMIZER_FILE_NAME = 'obsidian-plugin-optimizer.cjs';
const PRE_MINIFY_FILE_NAME = 'obsidian-plugin-pre-minify.cjs';
const FEATURES_FILE_NAME = 'obsidian-plugin-features.cjs';
const JSON_INDENT = 2;

/* v8 ignore start -- Runs a real parcel build; exercised by the bundler integration test. */
/**
 * Builds the Obsidian plugin in production mode using parcel.
 *
 * @param options - Optional build options.
 * @returns A {@link Promise} that resolves when the build is complete.
 */
export async function build(options?: BuildOptions): Promise<void> {
  const result = await buildObsidianPluginWithParcel({ ...options, mode: BuildMode.Production });
  result.throwOnFailure();
}

/**
 * Builds the Obsidian plugin with parcel, once for a production build, or watching for a development one.
 *
 * Runs the project's `build:compile` script first when it has one, as the esbuild builder does, since
 * parcel strips TypeScript types without checking them.
 *
 * @param params - The {@link BuildObsidianPluginWithParcelParams}.
 * @returns A {@link Promise} that resolves to a {@link CliTaskResult} indicating the success or failure of the build.
 */
export async function buildObsidianPluginWithParcel(params: BuildObsidianPluginWithParcelParams): Promise<CliTaskResult> {
  await npmRunOptional('build:compile');
  const buildContext = await resolveObsidianPluginBuildContext(params);
  await cleanObsidianPluginDistFolder(buildContext.distFolder);
  await completeObsidianPluginDistFolder(buildContext);

  const configFolder = resolveFromRoot(GENERATED_PARCEL_CONFIG_FOLDER);
  const consumerParcelrcPath = resolveFromRoot(PARCELRC);
  await mkdir(configFolder, { recursive: true });
  const configFiles = getParcelConfigFiles({
    consumerParcelrcPath: existsSync(consumerParcelrcPath) ? toPosixPath(relative(configFolder, consumerParcelrcPath)) : undefined,
    features: params
  });
  for (const [fileName, contents] of Object.entries(configFiles)) {
    const filePath = join(configFolder, fileName);
    // Rewritten only when it changed: parcel invalidates its cache on a config file's modification time.
    if (!existsSync(filePath) || await readFile(filePath, 'utf-8') !== contents) {
      await writeFile(filePath, contents, 'utf-8');
    }
  }

  const { Parcel } = await import('@parcel/core');
  const parcelOptions = getParcelOptions({ buildContext, cacheFolder: resolveFromRoot(PARCEL_CACHE_FOLDER), configPath: join(configFolder, PARCELRC) });
  const bundler = new Parcel(params.customizeParcelOptions?.(parcelOptions) ?? parcelOptions);

  if (buildContext.isProductionBuild) {
    try {
      const { buildTime, bundleGraph } = await bundler.run();
      console.warn(`Built ${String(bundleGraph.getBundles().length)} bundle(s) with parcel in ${String(buildTime)} ms.`);
      return CliTaskResult.Success();
    } catch (error) {
      console.error(formatParcelError(error));
      return CliTaskResult.Failure();
    }
  }

  await bundler.watch((error, $event) => {
    if (error) {
      console.error(formatParcelError(error));
      return;
    }
    handleWatchEvent($event, buildContext);
  });
  return CliTaskResult.DoNotExit();
}

/**
 * Builds the Obsidian plugin in development mode using parcel, watching for changes and deploying every
 * successful rebuild into the vault.
 *
 * @param options - Optional build options.
 * @returns A {@link Promise} that resolves to a {@link CliTaskResult} indicating the build result.
 */
// eslint-disable-next-line typescript-dev-toolkit/params-options-name-match -- Intentionally shares BuildOptions with build().
export async function dev(options?: BuildOptions): Promise<CliTaskResult> {
  return await buildObsidianPluginWithParcel({ ...options, mode: BuildMode.Development });
}
/* v8 ignore stop */

/**
 * Generates the files of the parcel configuration the build runs with.
 *
 * The build features add pipelines that run the toolkit's shared transforms, through one generated transformer that
 * loads them from the toolkit: Solid's `.jsx` / `.tsx`, Svelte's `.svelte` / `.svelte.ts` / `.svelte.js`, `.wasm`,
 * and with `styles.postcss` or `styles.tailwind` every stylesheet, in place of parcel's own PostCSS step. React and
 * Preact JSX is compiled here too, since parcel reads the JSX runtime from a tsconfig without following its `extends`,
 * and with any framework every script has the framework's compile-time constants replaced. Parcel compiles Vue with
 * `@parcel/transformer-vue` and scopes `*.module.css` itself, so those need no pipeline here.
 *
 * @param params - The {@link GetParcelConfigFilesParams}.
 * @returns The files, by file name.
 */
export function getParcelConfigFiles(params: GetParcelConfigFilesParams): ParcelConfigFiles {
  const { consumerParcelrcPath = '@parcel/config-default', features = {} } = params;
  const featureTransformer = `./${FEATURES_FILE_NAME}`;
  const transformers: Record<string, string[]> = {};
  if (features.framework === 'svelte') {
    transformers['*.svelte'] = [featureTransformer];
    transformers['*.svelte.{js,ts}'] = [featureTransformer, `./${INLINE_IMPORTS_FILE_NAME}`, '...'];
  }
  if (features.framework === 'solid' || getJsxImportSource(features.framework) !== undefined) {
    transformers['*.{jsx,tsx}'] = [featureTransformer];
  }
  if (features.wasm) {
    transformers['*.wasm'] = [featureTransformer];
  }
  if (isPostcssNeeded(features.styles)) {
    transformers['*.{css,pcss}'] = [featureTransformer, '@parcel/transformer-css'];
  }
  const defines = getFrameworkDefines({ framework: features.framework, isProductionBuild: true });
  transformers['*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'] = [
    ...Object.keys(defines).length > 0 ? [featureTransformer] : [],
    `./${INLINE_IMPORTS_FILE_NAME}`,
    '...'
  ];

  const parcelrc = {
    extends: consumerParcelrcPath,
    namers: [`./${NAMER_FILE_NAME}`, '...'],
    optimizers: {
      '*.js': [`./${PRE_MINIFY_FILE_NAME}`, '...', `./${OPTIMIZER_FILE_NAME}`]
    },
    resolvers: [`./${RESOLVER_FILE_NAME}`, '...'],
    transformers
  };

  return {
    [FEATURES_FILE_NAME]: `/*
 * Generated by @mnaoumov/obsidian-dev-toolkit. Runs the toolkit's shared transforms for the build features, loaded
 * from the toolkit itself, so parcel compiles each feature the way every other bundler adapter does.
 */
const { Transformer } = require('@parcel/plugin');

const FEATURES_MODULE_URL = ${JSON.stringify(getSiblingModuleUrl('obsidian-plugin-features'))};
const TRANSFORMS_MODULE_URL = ${JSON.stringify(getSiblingModuleUrl('obsidian-plugin-transforms'))};
const FRAMEWORK = ${JSON.stringify(features.framework ?? null)};
const STYLES = ${JSON.stringify(features.styles ?? {})};

module.exports = new Transformer({
  async transform({ asset, options }) {
    const { getFeatureFileKind, getFrameworkDefines, getJsxImportSource, replaceDefines } = await import(FEATURES_MODULE_URL);
    const transforms = await import(TRANSFORMS_MODULE_URL);
    const filePath = asset.filePath;
    const isProductionBuild = options.mode === 'production';
    const defines = getFrameworkDefines({ framework: FRAMEWORK ?? undefined, isProductionBuild });
    switch (getFeatureFileKind(filePath)) {
      case 'jsx': {
        const code = await asset.getCode();
        const jsxImportSource = getJsxImportSource(FRAMEWORK ?? undefined);
        const result = FRAMEWORK === 'solid'
          ? await transforms.transformSolid({ code, filePath, isProductionBuild })
          : await transforms.transformJsx({ code, filePath, isProductionBuild, jsxImportSource });
        asset.setCode(replaceDefines(result.code, defines));
        asset.type = 'js';
        break;
      }
      case 'stylesheet': {
        const result = await transforms.transformCss({ filePath, isCssModuleScoped: false, isProductionBuild, source: await asset.getCode(), styles: STYLES });
        asset.setCode(result.css);
        for (const dependency of result.dependencies) {
          asset.invalidateOnFileChange(dependency);
        }
        break;
      }
      case 'svelte': {
        const result = await transforms.transformSvelte({ code: await asset.getCode(), filePath, isProductionBuild });
        asset.setCode(replaceDefines(result.code, defines));
        asset.type = 'js';
        break;
      }
      case 'wasm':
        asset.setCode(transforms.getWasmModuleCode(await asset.getBuffer()));
        asset.type = 'js';
        break;
      default: {
        // A framework's runtime reads process.env.NODE_ENV, which parcel leaves alone in an electron-renderer library.
        const code = await asset.getCode();
        const replaced = replaceDefines(code, defines);
        if (replaced !== code) {
          asset.setCode(replaced);
        }
        break;
      }
    }
    return [asset];
  }
});
`,
    // `String.raw`, so the regular expression below reaches the file with its backslashes intact.
    [INLINE_IMPORTS_FILE_NAME]: String.raw`/*
 * Generated by @mnaoumov/obsidian-dev-toolkit. Keeps every dynamic import() inside main.js.
 *
 * Obsidian loads a plugin's main.js and nothing beside it, and parcel makes every import() a bundle of its
 * own with no option to inline one. This rewrites import('<literal>') into a require() inside an async
 * arrow, before parcel's own JavaScript transformer runs: the module still evaluates only when that code
 * runs, and the promise still rejects when evaluation throws. Only a plain string specifier is rewritten,
 * since a computed one cannot be bundled by any bundler.
 */
const { Transformer } = require('@parcel/plugin');

const DYNAMIC_IMPORT = /\bimport\(\s*(["'])([^"'\x60\n\\]+)\1\s*\)/gu;

module.exports = new Transformer({
  async transform({ asset }) {
    const source = await asset.getCode();
    if (source.includes('import(')) {
      asset.setCode(source.replace(DYNAMIC_IMPORT, (_match, quote, specifier) => '(async () => require(' + quote + specifier + quote + '))()'));
    }
    return [asset];
  }
});
`,
    [NAMER_FILE_NAME]: `/* Generated by @mnaoumov/obsidian-dev-toolkit. Obsidian loads a plugin's stylesheet from styles.css and nothing else. */
const { Namer } = require('@parcel/plugin');

module.exports = new Namer({
  name({ bundle }) {
    return bundle.type === 'css' ? '${ObsidianPluginRepoPaths.StylesCss}' : null;
  }
});
`,
    [OPTIMIZER_FILE_NAME]: `/*
 * Generated by @mnaoumov/obsidian-dev-toolkit. Runs after parcel's own optimizers, on the JavaScript bundle.
 *
 * Obsidian evaluates main.js as the body of function (require, module, exports), with a module object that
 * has no require of its own, and parcel's runtime reaches every external module through module.require.
 * Without the first line below, the very first require('obsidian') throws "Cannot find module". The banner
 * goes in here too, after minification, which would otherwise strip it as an ordinary comment.
 */
const { Optimizer } = require('@parcel/plugin');

const PREAMBLE = ${JSON.stringify(`${getObsidianPluginBanner('parcel')}if (typeof module === 'object' && typeof module.require !== 'function') { module.require = require; }\n`)};
const PREAMBLE_LINE_COUNT = ${String(getObsidianPluginBanner('parcel').split('\n').length)};

async function readContents(contents) {
  if (typeof contents === 'string') {
    return contents;
  }
  if (Buffer.isBuffer(contents)) {
    return contents.toString('utf-8');
  }
  const chunks = [];
  for await (const chunk of contents) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

module.exports = new Optimizer({
  async optimize({ contents, map }) {
    const code = await readContents(contents);
    if (map) {
      map.offsetLines(1, PREAMBLE_LINE_COUNT);
    }
    return { contents: PREAMBLE + code, map };
  }
});
`,
    [PARCELRC]: `${JSON.stringify(parcelrc, null, JSON_INDENT)}\n`,
    // `String.raw`, so the line breaks below reach the file as escapes.
    [PRE_MINIFY_FILE_NAME]: String.raw`/*
 * Generated by @mnaoumov/obsidian-dev-toolkit. Runs before parcel's own optimizers, on the JavaScript bundle.
 *
 * A scope-hoisted library bundle require()s every bundle it references, the stylesheet included, and Obsidian
 * loads styles.css itself, beside main.js, where a require() cannot reach it. The line is blanked rather than
 * removed, so a source map still lines up.
 *
 * A scope-hoisted CommonJS bundle also declares every module's bindings at its top level, under long names such
 * as $c5899aeb4caadf27$var$taskIdCounter, and parcel minifies it as a script, where the minifier may not rename
 * a top-level binding, since in a script it is a global. Obsidian evaluates main.js as the body of a function, so
 * wrapping the bundle in an arrow function changes nothing at runtime (an arrow keeps this and arguments) and
 * lets the minifier rename all of them: Solid's fixture build is 70 KB without this and 10 KB with it.
 */
const { Optimizer } = require('@parcel/plugin');

const STYLESHEET_REQUIRE = ${JSON.stringify(`require("./${ObsidianPluginRepoPaths.StylesCss}");\n`)};

async function readContents(contents) {
  if (typeof contents === 'string') {
    return contents;
  }
  if (Buffer.isBuffer(contents)) {
    return contents.toString('utf-8');
  }
  const chunks = [];
  for await (const chunk of contents) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

module.exports = new Optimizer({
  async optimize({ bundle, contents, map }) {
    const code = (await readContents(contents)).replace(STYLESHEET_REQUIRE, '\n');
    if (!bundle.env.shouldOptimize) {
      return { contents: code, map };
    }
    if (map) {
      map.offsetLines(1, 1);
    }
    return { contents: '(() => {\n' + code + '\n})();\n', map };
  }
});
`,
    [RESOLVER_FILE_NAME]: `/*
 * Generated by @mnaoumov/obsidian-dev-toolkit. Leaves the modules Obsidian supplies at runtime to require(), and
 * resolves everything else the way @parcel/resolver-default does, with the browser's export conditions.
 *
 * Parcel resolves an electron-renderer target with the node and electron conditions beside browser, and an exports
 * map is matched in the package's own key order, so a package listing node first (Vue, Svelte, Solid, fflate) would
 * hand over its Node build: several times the code, and one that may not load on mobile. The Node builtins need no
 * node condition to stay external, since they are in the externals below.
 */
const { Resolver } = require('@parcel/plugin');
const { dirname } = require('node:path');

const EXTERNALS = new Set(${JSON.stringify(OBSIDIAN_PLUGIN_EXTERNALS)});

function getBrowserEnvironment(env) {
  return {
    context: env.context,
    id: env.id + ':obsidian-dev-toolkit-browser-conditions',
    includeNodeModules: env.includeNodeModules,
    isBrowser: () => true,
    isElectron: () => false,
    isLibrary: env.isLibrary,
    isNode: () => false,
    isWorker: () => env.isWorker(),
    isWorklet: () => env.isWorklet()
  };
}

function getPackageName(specifier) {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

// @parcel/node-resolver-core is what @parcel/resolver-default runs, reached through the packages that install it.
function loadNodeResolver() {
  let folder = __dirname;
  for (const packageName of ['@parcel/config-default', '@parcel/resolver-default']) {
    folder = dirname(require.resolve(packageName + '/package.json', { paths: [folder] }));
  }
  return require(require.resolve('@parcel/node-resolver-core', { paths: [folder] })).default;
}

module.exports = new Resolver({
  async loadConfig({ config, logger, options }) {
    const packageConfig = await config.getConfig([], { packageKey: '@parcel/resolver-default' });
    const NodeResolver = loadNodeResolver();
    return new NodeResolver({
      fs: options.inputFS,
      logger,
      mode: options.mode,
      packageExports: packageConfig?.contents?.packageExports ?? false,
      packageManager: options.packageManager,
      projectRoot: options.projectRoot,
      shouldAutoInstall: options.shouldAutoInstall
    });
  },
  resolve({ config: nodeResolver, dependency, specifier }) {
    const isExternal = specifier.startsWith('node:') || EXTERNALS.has(specifier) || EXTERNALS.has(getPackageName(specifier));
    if (isExternal) {
      return { isExcluded: true };
    }
    return nodeResolver.resolve({
      env: getBrowserEnvironment(dependency.env),
      filename: specifier,
      loc: dependency.loc,
      packageConditions: dependency.packageConditions,
      parent: dependency.resolveFrom,
      range: dependency.range,
      sourcePath: dependency.sourcePath,
      specifierType: dependency.specifierType
    });
  }
});
`
  };
}

/**
 * Builds the options handed to parcel's `Parcel` class.
 *
 * The one target is `electron-renderer`, where Obsidian runs a plugin, and CommonJS. Parcel counts that
 * context as both a browser and a node one: node keeps `process`, `Buffer` and `process.env` as Obsidian's
 * renderer has them, rather than polyfilled or inlined from the build machine, and browser takes a package's
 * `browser` field. Its export conditions would include `node` too, which the generated resolver drops.
 * `includeNodeModules` bundles the dependencies, which a node-flavoured context would otherwise leave as
 * `require()` calls nothing installs beside a plugin, and `isLibrary` keeps the entry's default export, which
 * is how Obsidian finds the plugin class.
 *
 * `shouldScopeHoist` is set explicitly because parcel reads it only from `defaultTargetOptions` for a target
 * passed in the options, never from `isLibrary` as it does for one in `package.json`. Without it the bundle
 * is not tree-shaken at all: Svelte's fixture build was 224 KB with parcel against 25 KB with vite.
 *
 * @param params - The {@link GetParcelOptionsParams}.
 * @returns The parcel options.
 */
export function getParcelOptions(params: GetParcelOptionsParams): InitialParcelOptions {
  const { buildContext, cacheFolder, configPath } = params;
  const target: TargetDescriptor = {
    context: 'electron-renderer',
    // eslint-disable-next-line unicorn/name-replacements -- `distDir` is the name parcel's API reads.
    distDir: buildContext.distFolder,
    includeNodeModules: true,
    isLibrary: true,
    optimize: buildContext.isProductionBuild,
    outputFormat: 'commonjs',
    sourceMap: !buildContext.isProductionBuild && { inline: true }
  };

  return {
    // eslint-disable-next-line unicorn/name-replacements -- `cacheDir` is the name parcel's API reads.
    cacheDir: cacheFolder,
    config: configPath,
    defaultTargetOptions: {
      // eslint-disable-next-line unicorn/name-replacements -- `distDir` is the name parcel's API reads.
      distDir: buildContext.distFolder,
      shouldOptimize: buildContext.isProductionBuild,
      shouldScopeHoist: true,
      sourceMaps: !buildContext.isProductionBuild
    },
    entries: buildContext.entryPoint,
    mode: buildContext.isProductionBuild ? 'production' : 'development',
    targets: { obsidianPlugin: target }
  };
}
/* v8 ignore start -- Part of the parcel build above. */
function formatParcelError(error: unknown): string {
  const diagnostics = (error as ParcelErrorLike | undefined)?.diagnostics;
  if (diagnostics && diagnostics.length > 0) {
    return diagnostics.map((diagnostic) => diagnostic.message).join('\n');
  }
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

/**
 * Builds the URL of a module of this folder, in the same form as this one (`.ts` from source, `.mjs` or `.cjs` once
 * built), which the generated transformer imports.
 *
 * @param baseName - The module's file name without its extension.
 * @returns The module's `file:` URL.
 */
function getSiblingModuleUrl(baseName: string): string {
  return new URL(`${baseName}${extname(new URL(import.meta.url).pathname)}`, import.meta.url).href;
}

function handleWatchEvent($event: BuildEvent | undefined, buildContext: ObsidianPluginBuildContext): void {
  if ($event?.type === 'buildFailure') {
    console.error($event.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    return;
  }
  if ($event?.type !== 'buildSuccess') {
    return;
  }

  console.warn(`Rebuilt with parcel in ${String($event.buildTime)} ms.`);
  invokeAsyncSafely(() => deployToObsidianPluginsFolder(buildContext));
}
/* v8 ignore stop */
