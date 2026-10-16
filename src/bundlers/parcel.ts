/**
 * @file
 *
 * Builds an Obsidian plugin with parcel: `build()` and `dev()`, the same two entry points the esbuild
 * builder has, producing the same `main.js` + `styles.css` + `manifest.json` layout.
 *
 * Parcel takes no `external` list and no output file name, only plugins named in a `.parcelrc`. So the
 * build writes a `.parcelrc` of its own into `.parcel-cache`, beside a resolver that leaves
 * Obsidian's modules external, a namer that names the stylesheet `styles.css` and a transformer that keeps
 * dynamic imports inside `main.js`, and extends the
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

import type { ObsidianPluginBuildContext } from './obsidian-plugin-build.ts';

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
export interface BuildOptions {
  /**
   * Customizes the options handed to parcel's `Parcel` class.
   */
  readonly customizeParcelOptions?: (options: InitialParcelOptions) => InitialParcelOptions;

  /**
   * A folder for Obsidian configuration. Defaults to the `OBSIDIAN_CONFIG_FOLDER` environment variable.
   */
  readonly obsidianConfigFolder?: string;
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
  const configFiles = getParcelConfigFiles(existsSync(consumerParcelrcPath) ? toPosixPath(relative(configFolder, consumerParcelrcPath)) : undefined);
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

  await bundler.watch((error, event) => {
    if (error) {
      console.error(formatParcelError(error));
      return;
    }
    handleWatchEvent(event, buildContext);
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
 * @param consumerParcelrcPath - The consumer's own `.parcelrc`, relative to the generated configuration's
 * folder, or `undefined` when the project has none.
 * @returns The files, by file name.
 */
export function getParcelConfigFiles(consumerParcelrcPath: string | undefined): ParcelConfigFiles {
  const parcelrc = {
    extends: consumerParcelrcPath ?? '@parcel/config-default',
    namers: [`./${NAMER_FILE_NAME}`, '...'],
    optimizers: {
      '*.js': ['...', `./${OPTIMIZER_FILE_NAME}`]
    },
    resolvers: [`./${RESOLVER_FILE_NAME}`, '...'],
    transformers: {
      '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}': [`./${INLINE_IMPORTS_FILE_NAME}`, '...']
    }
  };

  return {
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
    [RESOLVER_FILE_NAME]: `/* Generated by @mnaoumov/obsidian-dev-toolkit. Leaves the modules Obsidian supplies at runtime to require(). */
const { Resolver } = require('@parcel/plugin');

const EXTERNALS = new Set(${JSON.stringify(OBSIDIAN_PLUGIN_EXTERNALS)});

function getPackageName(specifier) {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

module.exports = new Resolver({
  resolve({ specifier }) {
    const isExternal = specifier.startsWith('node:') || EXTERNALS.has(specifier) || EXTERNALS.has(getPackageName(specifier));
    return isExternal ? { isExcluded: true } : null;
  }
});
`
  };
}

/**
 * Builds the options handed to parcel's `Parcel` class.
 *
 * The one target is `electron-renderer`, where Obsidian runs a plugin, and CommonJS. Parcel counts that
 * context as both a browser and a node one, and each half matters: node keeps the builtins external, and
 * browser resolves the `browser` export condition. `includeNodeModules` bundles the dependencies, which a
 * node-flavoured context would otherwise leave as `require()` calls nothing installs beside a plugin, and
 * `isLibrary` keeps the entry's default export, which is how Obsidian finds the plugin class.
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

function handleWatchEvent(event: BuildEvent | undefined, buildContext: ObsidianPluginBuildContext): void {
  if (event?.type === 'buildFailure') {
    console.error(event.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    return;
  }
  if (event?.type !== 'buildSuccess') {
    return;
  }

  console.warn(`Rebuilt with parcel in ${String(event.buildTime)} ms.`);
  invokeAsyncSafely(() => deployToObsidianPluginsFolder(buildContext));
}
/* v8 ignore stop */
