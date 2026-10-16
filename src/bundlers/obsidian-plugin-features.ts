/**
 * @file
 *
 * The build features every bundler adapter offers beside the plain plugin build: a UI framework, the stylesheet
 * pipeline and WebAssembly. Every adapter takes the same {@link ObsidianPluginFeatureOptions}, so a project that
 * switches bundler keeps its options and its installed packages.
 *
 * Each feature's packages are optional peer dependencies of the toolkit, imported from the PROJECT's own
 * `node_modules` only when the feature is on, through {@link importOptionalPeer}.
 *
 * Erasable TypeScript only (no enums, no parameter properties): `obsidian-plugin-transforms.ts` imports this module,
 * and a webpack loader or a parcel worker loads that one straight from source when the toolkit runs from source.
 */

import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import { join } from '@mnaoumov/typescript-lib/path';
import { escapeRegExp } from '@mnaoumov/typescript-lib/reg-exp';
import { createRequire } from 'node:module';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Which shared transform a module goes through, as {@link getFeatureFileKind} tells it.
 */
export type FeatureFileKind = 'jsx' | 'stylesheet' | 'svelte' | 'wasm';

/**
 * Parameters for {@link getFrameworkDefines}.
 */
export interface GetFrameworkDefinesParams {
  /**
   * The UI framework, if any.
   */
  readonly framework: ObsidianPluginFramework | undefined;

  /**
   * Whether this is a production build.
   */
  readonly isProductionBuild: boolean;
}

/**
 * Parameters for {@link importOptionalPeer}.
 */
export interface ImportOptionalPeerParams {
  /**
   * The option that needs the package, as the error message names it, e.g. `framework: 'solid'`.
   */
  readonly feature: string;

  /**
   * The package to install when it is missing.
   */
  readonly packageName: string;

  /**
   * The folder whose `node_modules` the package is resolved from. Defaults to the project root.
   */
  readonly projectFolder?: string;

  /**
   * The module to import. Defaults to {@link packageName}.
   */
  readonly specifier?: string;
}

/**
 * The build features beside the plain plugin build. Every option is off unless set.
 */
export interface ObsidianPluginFeatureOptions {
  /**
   * The UI framework whose components the build compiles.
   */
  readonly framework?: ObsidianPluginFramework;

  /**
   * The stylesheet pipeline.
   */
  readonly styles?: ObsidianPluginStylesOptions;

  /**
   * Whether `import bytes from './module.wasm'` imports the module's bytes as a `Uint8Array`, inlined into `main.js`.
   */
  readonly wasm?: boolean;
}

/**
 * A UI framework the bundler adapters compile.
 *
 * - `react` and `preact` compile JSX with the automatic runtime from `react` / `preact`.
 * - `solid` compiles JSX with `babel-preset-solid`.
 * - `svelte` compiles `.svelte` components and `.svelte.ts` / `.svelte.js` modules with the project's `svelte`.
 * - `vue` compiles single-file components with `unplugin-vue` (on parcel, with `@parcel/transformer-vue`).
 */
export type ObsidianPluginFramework = 'preact' | 'react' | 'solid' | 'svelte' | 'vue';

/**
 * The stylesheet pipeline of {@link ObsidianPluginFeatureOptions}.
 */
export interface ObsidianPluginStylesOptions {
  /**
   * Whether a `*.module.css` file is a CSS module: its class names are scoped, and importing it gives the scoped
   * names by their original ones.
   */
  readonly cssModules?: boolean;

  /**
   * Whether every stylesheet goes through the project's PostCSS configuration (`postcss.config.*`, `.postcssrc*`, or
   * `postcss` in `package.json`).
   */
  readonly postcss?: boolean;

  /**
   * Whether every stylesheet goes through Tailwind CSS 4 (`@tailwindcss/postcss`), so `@import "tailwindcss";`
   * expands to the utilities the sources use.
   */
  readonly tailwind?: boolean;
}

/**
 * Parameters for {@link requireOptionalPeer}: the same as {@link ImportOptionalPeerParams}.
 */
export type RequireOptionalPeerParams = ImportOptionalPeerParams;

/**
 * Parameters for {@link resolveOptionalPeer}: the same as {@link ImportOptionalPeerParams}.
 */
export type ResolveOptionalPeerParams = ImportOptionalPeerParams;

const CSS_MODULE_FILE_PATTERN = /\.module\.(?:css|pcss|s[ac]ss)$/iu;
const JSX_SOURCE_FILE_PATTERN = /\.[jt]sx$/iu;
const STYLESHEET_FILE_PATTERN = /\.p?css$/iu;
const SVELTE_FILE_PATTERN = /\.svelte(?:\.[cm]?[jt]s)?$/iu;
const WASM_FILE_PATTERN = /\.wasm$/iu;
const VIRTUAL_MODULE_PREFIX = '\0';

/**
 * Tells which shared transform a module of a rollup-family build goes through, by its id.
 *
 * A virtual module (an id starting with `\0`) goes through none. A query is part of the match for a stylesheet, so a
 * Vue component's `?vue&type=style&lang.css` block counts as one, and is cut off for the rest.
 *
 * @param id - The module id.
 * @returns The kind of file, or `undefined` for a module no feature transforms.
 */
export function getFeatureFileKind(id: string): FeatureFileKind | undefined {
  if (id.startsWith(VIRTUAL_MODULE_PREFIX)) {
    return undefined;
  }
  if (STYLESHEET_FILE_PATTERN.test(id)) {
    return 'stylesheet';
  }
  const [filePath = ''] = id.split('?', 1);
  if (SVELTE_FILE_PATTERN.test(filePath)) {
    return 'svelte';
  }
  if (JSX_SOURCE_FILE_PATTERN.test(filePath)) {
    return 'jsx';
  }
  return WASM_FILE_PATTERN.test(filePath) ? 'wasm' : undefined;
}

/**
 * Builds the compile-time constants a framework's runtime reads, which Obsidian's renderer does not define.
 *
 * `process.env.NODE_ENV` picks a runtime's production build (React, Preact's devtools, Vue, Solid), and without it a
 * production plugin would bundle and run the development one. Vue also reads its three feature flags.
 *
 * @param params - The {@link GetFrameworkDefinesParams}.
 * @returns The constants, by expression, each value a JavaScript literal. Empty when there is no framework.
 */
export function getFrameworkDefines(params: GetFrameworkDefinesParams): Record<string, string> {
  const { framework, isProductionBuild } = params;
  if (framework === undefined) {
    return {};
  }

  const defines: Record<string, string> = {
    'process.env.NODE_ENV': JSON.stringify(isProductionBuild ? 'production' : 'development')
  };
  if (framework === 'vue') {
    defines['__VUE_OPTIONS_API__'] = 'true';
    defines['__VUE_PROD_DEVTOOLS__'] = 'false';
    defines['__VUE_PROD_HYDRATION_MISMATCH_DETAILS__'] = 'false';
  }
  return defines;
}

/**
 * Tells which package supplies the automatic JSX runtime of a framework.
 *
 * @param framework - The UI framework, if any.
 * @returns `react` or `preact`, or `undefined` for a framework that does not compile JSX with the automatic runtime.
 */
export function getJsxImportSource(framework: ObsidianPluginFramework | undefined): 'preact' | 'react' | undefined {
  return framework === 'preact' || framework === 'react' ? framework : undefined;
}

/**
 * Imports an optional peer dependency from the project's own `node_modules`.
 *
 * Resolved from the project rather than from the toolkit, so a package manager that does not hoist still finds what
 * the project installed.
 *
 * @typeParam Module - The module's type.
 * @param params - The {@link ImportOptionalPeerParams}.
 * @returns A {@link Promise} that resolves to the module namespace.
 * @throws If the project does not have the package, naming the option that needs it and the command that installs it.
 */
export async function importOptionalPeer<Module>(params: ImportOptionalPeerParams): Promise<Module> {
  // eslint-disable-next-line no-unsanitized/method -- The path is what Node resolved the package name to, from the project's own `node_modules`.
  return await import(pathToFileURL(resolveOptionalPeer(params)).href) as Module;
}

/**
 * Tells whether a stylesheet is a CSS module by its file name.
 *
 * @param filePath - The stylesheet's path.
 * @returns `true` for `*.module.css` (and `.module.pcss`, `.module.scss`, `.module.sass`).
 */
export function isCssModuleFile(filePath: string): boolean {
  return CSS_MODULE_FILE_PATTERN.test(filePath);
}

/**
 * Tells whether a stylesheet goes through PostCSS at all.
 *
 * @param styles - The stylesheet options, if any.
 * @returns `true` when the project's PostCSS configuration or Tailwind applies.
 */
export function isPostcssNeeded(styles: ObsidianPluginStylesOptions | undefined): boolean {
  return Boolean(styles?.postcss) || Boolean(styles?.tailwind);
}

/**
 * Replaces each compile-time constant in a module's code with its value, as a bundler's `define` does: only where
 * the whole expression stands on its own, so `process.env.NODE_ENV` is replaced and `a.process.env.NODE_ENV` or
 * `process.env.NODE_ENV_X` are not.
 *
 * @param code - The module's code.
 * @param defines - The constants, by expression, each value a JavaScript literal.
 * @returns The code with the constants replaced.
 */
export function replaceDefines(code: string, defines: Readonly<Record<string, string>>): string {
  let result = code;
  for (const [expression, value] of Object.entries(defines)) {
    if (!result.includes(expression)) {
      continue;
    }
    result = result.replace(new RegExp(String.raw`(?<![\w$.])${escapeRegExp(expression)}(?![\w$])`, 'gu'), () => value);
  }
  return result;
}

/**
 * Loads an optional peer dependency from the project's own `node_modules` synchronously, for a bundler whose plugins
 * are applied synchronously (webpack). Loads an ES module too, through `require`.
 *
 * @param params - The {@link RequireOptionalPeerParams}.
 * @returns The module, for the caller to type.
 * @throws If the project does not have the package, naming the option that needs it and the command that installs it.
 */
export function requireOptionalPeer(params: RequireOptionalPeerParams): unknown {
  return createProjectRequire(params.projectFolder)(resolveOptionalPeer(params));
}

/**
 * Resolves an optional peer dependency from the project's own `node_modules`.
 *
 * @param params - The {@link ResolveOptionalPeerParams}.
 * @returns The absolute path of the module.
 * @throws If the project does not have the package, naming the option that needs it and the command that installs it.
 */
export function resolveOptionalPeer(params: ResolveOptionalPeerParams): string {
  const { feature, packageName } = params;
  try {
    return createProjectRequire(params.projectFolder).resolve(params.specifier ?? packageName);
  } catch (error) {
    throw new Error(
      `The \`${feature}\` build option needs \`${packageName}\`, which this project does not have. Install it with: npm install --save-dev ${packageName}`,
      { cause: error }
    );
  }
}

function createProjectRequire(projectFolder: string | undefined): NodeJS.Require {
  return createRequire(join(projectFolder ?? getRootFolder() ?? process.cwd(), 'package.json'));
}
