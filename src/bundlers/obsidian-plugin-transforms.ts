/**
 * @file
 *
 * The source transforms every bundler adapter shares, so a feature compiles the same way whichever bundler runs it:
 * Solid's JSX, Svelte components and modules, stylesheets through PostCSS, Tailwind and CSS modules, and WebAssembly
 * modules as bytes. The esbuild, rollup and vite adapters call them in-process; the webpack adapter through the
 * loader it ships, and the parcel adapter through the transformers it generates.
 *
 * Erasable TypeScript only (no enums, no parameter properties), so a webpack loader or a parcel worker can load this
 * module straight from source when the toolkit runs from source.
 */

import type { TransformOptions as BabelTransformOptions } from '@babel/core';
import type {
  AcceptedPlugin,
  ProcessOptions
} from 'postcss';

import { extractDefaultExportInterop } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { transform as esbuildTransform } from 'esbuild';
import process from 'node:process';
import postcss from 'postcss';
import postcssLoadConfig_ from 'postcss-load-config';
import postcssModules_ from 'postcss-modules';

import type { ObsidianPluginStylesOptions } from './obsidian-plugin-features.ts';

import {
  importOptionalPeer,
  isCssModuleFile
} from './obsidian-plugin-features.ts';

const postcssLoadConfig = extractDefaultExportInterop(postcssLoadConfig_);
const postcssModules = extractDefaultExportInterop(postcssModules_);

/**
 * Parameters for {@link loadPostcssConfig}.
 */
export interface LoadPostcssConfigParams {
  /**
   * Whether this is a production build.
   */
  readonly isProductionBuild: boolean;

  /**
   * The folder the project's PostCSS configuration and packages are found from. Defaults to the project root.
   */
  readonly projectFolder?: string | undefined;

  /**
   * The stylesheet options.
   */
  readonly styles: ObsidianPluginStylesOptions;
}

/**
 * What {@link loadPostcssConfig} loaded.
 */
export interface PostcssConfig {
  /**
   * The files the configuration came from, for a watch build to watch.
   */
  readonly dependencies: readonly string[];

  /**
   * The process options of the project's configuration (a custom parser or syntax, say).
   */
  readonly options: ProcessOptions;

  /**
   * The plugins, in the order they run.
   */
  readonly plugins: readonly AcceptedPlugin[];
}

/**
 * A source map, as the transforms hand it over: the decoded JSON of a version 3 source map.
 */
export interface SourceMapLike {
  /**
   * The encoded mappings.
   */
  readonly mappings: string;

  /**
   * The original sources.
   */
  readonly sources: readonly string[];

  /**
   * The source map version.
   */
  readonly version: number;
}

/**
 * Parameters for {@link transformCss}.
 */
export interface TransformCssParams {
  /**
   * The stylesheet's path.
   */
  readonly filePath: string;

  /**
   * Whether `*.module.css` files are scoped here. A bundler that scopes CSS modules itself passes `false`.
   */
  readonly isCssModuleScoped: boolean;

  /**
   * Whether this is a production build.
   */
  readonly isProductionBuild: boolean;

  /**
   * The folder the project's PostCSS configuration and packages are found from. Defaults to the project root.
   */
  readonly projectFolder?: string | undefined;

  /**
   * The stylesheet's contents.
   */
  readonly source: string;

  /**
   * The stylesheet options.
   */
  readonly styles: ObsidianPluginStylesOptions;
}

/**
 * The CSS {@link transformCss} produced.
 */
export interface TransformedCss {
  /**
   * The stylesheet.
   */
  readonly css: string;

  /**
   * The files besides the stylesheet that the result depends on, for a watch build to watch: a PostCSS configuration,
   * or a stylesheet a plugin inlined.
   */
  readonly dependencies: readonly string[];

  /**
   * The scoped class names by their original ones, for a CSS module; `undefined` for an ordinary stylesheet.
   */
  readonly moduleExports: Readonly<Record<string, string>> | undefined;
}

/**
 * A JavaScript module a transform produced.
 */
export interface TransformedModule {
  /**
   * The JavaScript code.
   */
  readonly code: string;

  /**
   * Its source map, or `undefined` when there is none.
   */
  readonly map: SourceMapLike | undefined;
}

/**
 * Parameters for {@link transformJsx}.
 */
export interface TransformJsxParams extends TransformModuleParams {
  /**
   * The package that supplies the automatic JSX runtime: `react` or `preact`.
   */
  readonly jsxImportSource: string;
}

/**
 * Parameters of a transform that compiles one module.
 */
export interface TransformModuleParams {
  /**
   * The source code.
   */
  readonly code: string;

  /**
   * The source file's path.
   */
  readonly filePath: string;

  /**
   * Whether this is a production build.
   */
  readonly isProductionBuild: boolean;

  /**
   * The folder the framework's packages are resolved from. Defaults to the project root.
   */
  readonly projectFolder?: string;
}

/**
 * Parameters for {@link transformSolid}.
 */
export type TransformSolidParams = TransformModuleParams;

/**
 * Parameters for {@link transformSvelte}.
 */
export type TransformSvelteParams = TransformModuleParams;

interface BabelCoreLike {
  transformAsync: (code: string, options: BabelTransformOptions) => Promise<BabelResultLike | null>;
}

interface BabelResultLike {
  readonly code?: null | string;
  readonly map?: null | SourceMapLike;
}

interface PostcssDependencyMessage {
  readonly file?: string;
  readonly type: string;
}

interface SvelteCompileOptionsLike extends SvelteModuleCompileOptionsLike {
  readonly css: 'injected';
}

interface SvelteCompileResultLike {
  readonly js: TransformedModule;
}

interface SvelteCompilerLike {
  compile: (source: string, options: SvelteCompileOptionsLike) => SvelteCompileResultLike;
  compileModule: (source: string, options: SvelteModuleCompileOptionsLike) => SvelteCompileResultLike;
}

interface SvelteModuleCompileOptionsLike {
  readonly dev: boolean;
  readonly filename: string;
  readonly generate: 'client';
}

interface TailwindPostcssModule {
  readonly default: (options?: TailwindPostcssOptions) => AcceptedPlugin;
}

interface TailwindPostcssOptions {
  readonly base?: string;
  readonly optimize?: boolean;
}

const SVELTE_MODULE_PATTERN = /\.svelte\.[cm]?[jt]s$/iu;
const TYPESCRIPT_MODULE_PATTERN = /\.[cm]?ts$/iu;
const TAILWIND_POSTCSS_PLUGIN_NAME = '@tailwindcss/postcss';

/**
 * Appends a source map to a module's code as an inline `sourceMappingURL` comment, which is how a bundler that
 * reads a loaded file's own source map takes it.
 *
 * @param module - The module.
 * @returns The code, with the source map inlined when there is one.
 */
export function appendInlineSourceMap(module: TransformedModule): string {
  if (!module.map) {
    return module.code;
  }
  const base64 = Buffer.from(JSON.stringify(module.map), 'utf-8').toString('base64');
  return `${module.code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64}\n`;
}

/**
 * Builds the JavaScript module a CSS module's import resolves to: its scoped class names, by their original ones, as
 * the default export.
 *
 * @param moduleExports - The scoped class names.
 * @returns The module's code.
 */
export function getCssModuleCode(moduleExports: Readonly<Record<string, string>>): string {
  return `export default ${JSON.stringify(moduleExports)};\n`;
}

/**
 * Builds the JavaScript module a `.wasm` import resolves to: the WebAssembly module's bytes as a `Uint8Array`
 * default export, inlined as base64, because an Obsidian release ships `main.js` and nothing beside it.
 *
 * @param bytes - The WebAssembly module's bytes.
 * @returns The module's code.
 */
export function getWasmModuleCode(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  return `const binary = atob(${JSON.stringify(base64)});
const bytes = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) {
  bytes[i] = binary.charCodeAt(i);
}
export default bytes;
`;
}

/**
 * Loads the PostCSS plugins a stylesheet goes through, without the CSS-module scoping: the project's PostCSS
 * configuration when `postcss` is on, and Tailwind ahead of it when `tailwind` is on and the configuration does not
 * already run it.
 *
 * @param params - The {@link LoadPostcssConfigParams}.
 * @returns A {@link Promise} that resolves to the {@link PostcssConfig}; its `plugins` is empty when neither applies.
 * @throws If `postcss` is on and the project has no PostCSS configuration.
 */
export async function loadPostcssConfig(params: LoadPostcssConfigParams): Promise<PostcssConfig> {
  const { isProductionBuild, projectFolder, styles } = params;
  const plugins: AcceptedPlugin[] = [];
  const dependencies: string[] = [];
  let options: ProcessOptions = {};

  if (styles.postcss) {
    let config: postcssLoadConfig_.Result;
    try {
      config = await postcssLoadConfig({ cwd: projectFolder ?? process.cwd(), env: isProductionBuild ? 'production' : 'development' }, projectFolder);
    } catch (error) {
      throw new Error('The `styles.postcss` build option needs a PostCSS configuration (`postcss.config.mjs`, `.postcssrc.json`, ...) in the project.', {
        cause: error
      });
    }
    plugins.push(...config.plugins as AcceptedPlugin[]);
    options = config.options;
    dependencies.push(config.file);
  }

  if (styles.tailwind && plugins.every((plugin) => !isTailwindPlugin(plugin))) {
    const { default: tailwind } = await importOptionalPeer<TailwindPostcssModule>({
      feature: 'styles.tailwind',
      packageName: TAILWIND_POSTCSS_PLUGIN_NAME,
      ...(projectFolder !== undefined && { projectFolder })
    });
    plugins.unshift(tailwind({ ...(projectFolder !== undefined && { base: projectFolder }), optimize: isProductionBuild }));
  }

  return { dependencies, options, plugins };
}

/**
 * Runs a stylesheet through the pipeline its options ask for: the project's PostCSS configuration, Tailwind, and the
 * CSS-module scoping of a `*.module.css` file.
 *
 * @param params - The {@link TransformCssParams}.
 * @returns A {@link Promise} that resolves to the {@link TransformedCss}.
 * @throws If `postcss` is on and the project has no PostCSS configuration.
 */
export async function transformCss(params: TransformCssParams): Promise<TransformedCss> {
  const { filePath, isCssModuleScoped, source, styles } = params;
  const postcssConfig = await loadPostcssConfig(params);
  const plugins = [...postcssConfig.plugins];
  const dependencies = [...postcssConfig.dependencies];

  let moduleExports: Record<string, string> | undefined;
  if (styles.cssModules && isCssModuleScoped && isCssModuleFile(filePath)) {
    plugins.push(postcssModules({
      getJSON(_cssFileName, json): void {
        moduleExports = json;
      }
    }));
  }

  if (plugins.length === 0) {
    return { css: source, dependencies, moduleExports };
  }

  const result = await postcss(plugins).process(source, { ...postcssConfig.options, from: filePath, map: false });
  for (const message of result.messages as PostcssDependencyMessage[]) {
    if (message.type === 'dependency' && message.file !== undefined) {
      dependencies.push(message.file);
    }
  }
  return { css: result.css, dependencies, moduleExports };
}

/**
 * Compiles a React or Preact JSX or TSX module with the automatic JSX runtime, for a bundler that does not take the
 * runtime from the project's tsconfig (parcel does not follow its `extends`).
 *
 * @param params - The {@link TransformJsxParams}.
 * @returns A {@link Promise} that resolves to the compiled module.
 */
export async function transformJsx(params: TransformJsxParams): Promise<TransformedModule> {
  const { code, filePath, jsxImportSource } = params;
  const result = await esbuildTransform(code, {
    jsx: 'automatic',
    jsxImportSource,
    loader: /\.tsx$/iu.test(filePath) ? 'tsx' : 'jsx',
    sourcefile: filePath,
    sourcemap: 'external'
  });
  return { code: result.code, map: JSON.parse(result.map) as SourceMapLike };
}

/**
 * Compiles a Solid JSX or TSX module: esbuild strips the TypeScript and keeps the JSX, then `babel-preset-solid`
 * compiles the JSX into DOM expressions.
 *
 * @param params - The {@link TransformModuleParams}.
 * @returns A {@link Promise} that resolves to the compiled module.
 * @throws If Babel produced no code.
 */
export async function transformSolid(params: TransformSolidParams): Promise<TransformedModule> {
  const { code, filePath } = params;
  const feature = 'framework: \'solid\'';
  const projectFolderOption = params.projectFolder === undefined ? {} : { projectFolder: params.projectFolder };
  const babel = extractDefaultExportInterop(await importOptionalPeer<BabelCoreLike>({ feature, packageName: '@babel/core', ...projectFolderOption }));
  const solidPreset = extractDefaultExportInterop(await importOptionalPeer<object>({ feature, packageName: 'babel-preset-solid', ...projectFolderOption }));

  const stripped = await esbuildTransform(code, {
    jsx: 'preserve',
    loader: /\.tsx$/iu.test(filePath) ? 'tsx' : 'jsx',
    sourcefile: filePath,
    sourcemap: 'external'
  });

  const result = await babel.transformAsync(stripped.code, {
    babelrc: false,
    configFile: false,
    filename: filePath,
    inputSourceMap: JSON.parse(stripped.map) as BabelTransformOptions['inputSourceMap'],
    presets: [[solidPreset, { generate: 'dom', hydratable: false }]],
    sourceMaps: true
  });
  /* v8 ignore start -- Babel returns no code only when a plugin drops the file, which the Solid preset never does. */
  if (!result?.code) {
    throw new Error(`Babel produced no code for ${filePath}`);
  }
  /* v8 ignore stop */
  // With `sourceMaps` on, Babel always returns a source map.
  return { code: result.code, map: ensureNonNullable(result.map, `Babel produced no source map for ${filePath}`) };
}

/**
 * Compiles a Svelte component (`.svelte`), with its styles injected by the component itself, or a Svelte module
 * (`.svelte.ts`, `.svelte.js`), whose TypeScript esbuild strips first.
 *
 * @param params - The {@link TransformModuleParams}.
 * @returns A {@link Promise} that resolves to the compiled module.
 */
export async function transformSvelte(params: TransformSvelteParams): Promise<TransformedModule> {
  const { code, filePath, isProductionBuild } = params;
  const compiler = extractDefaultExportInterop(
    await importOptionalPeer<SvelteCompilerLike>({
      feature: 'framework: \'svelte\'',
      packageName: 'svelte',
      specifier: 'svelte/compiler',
      ...(params.projectFolder !== undefined && { projectFolder: params.projectFolder })
    })
  );
  const moduleOptions: SvelteModuleCompileOptionsLike = { dev: !isProductionBuild, filename: filePath, generate: 'client' };

  if (SVELTE_MODULE_PATTERN.test(filePath)) {
    let javaScript = code;
    if (TYPESCRIPT_MODULE_PATTERN.test(filePath)) {
      const stripped = await esbuildTransform(code, { loader: 'ts', sourcefile: filePath });
      javaScript = stripped.code;
    }
    return compiler.compileModule(javaScript, moduleOptions).js;
  }

  return compiler.compile(code, { ...moduleOptions, css: 'injected' }).js;
}

function isTailwindPlugin(plugin: AcceptedPlugin): boolean {
  return typeof plugin === 'object' && 'postcssPlugin' in plugin && plugin.postcssPlugin === TAILWIND_POSTCSS_PLUGIN_NAME;
}
