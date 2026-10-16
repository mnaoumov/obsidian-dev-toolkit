/**
 * @file
 *
 * The webpack loader the webpack adapter adds for the build features: it runs one of the shared transforms (Solid,
 * Svelte, a stylesheet's PostCSS and Tailwind, a WebAssembly module's bytes) on the module it is given. The adapter
 * names it by path in the rules it adds, so a project never names it.
 *
 * Erasable TypeScript only (no enums, no parameter properties), so webpack can load it straight from source when the
 * toolkit runs from source.
 */

import type { LoaderContext } from 'webpack';

import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { transform as esbuildTransform } from 'esbuild';

import type {
  FeatureFileKind,
  ObsidianPluginStylesOptions
} from './obsidian-plugin-features.ts';
import type { SourceMapLike } from './obsidian-plugin-transforms.ts';

import {
  getWasmModuleCode,
  transformCss,
  transformSolid,
  transformSvelte
} from './obsidian-plugin-transforms.ts';

/**
 * Which transform the loader runs: one of the shared transforms, or `typescript`, which strips the types of a Vue
 * component's `<script lang="ts">` block after `unplugin-vue` extracted it.
 */
export type ObsidianPluginWebpackLoaderKind = 'typescript' | FeatureFileKind;

/**
 * The options the webpack adapter gives the loader.
 */
export interface ObsidianPluginWebpackLoaderOptions {
  /**
   * Whether this is a production build.
   */
  readonly isProductionBuild: boolean;

  /**
   * Which transform the loader runs.
   */
  readonly kind: ObsidianPluginWebpackLoaderKind;

  /**
   * The stylesheet options, for a `stylesheet` loader.
   */
  readonly styles?: ObsidianPluginStylesOptions;
}

interface LoaderResult {
  readonly code: string;
  readonly map?: SourceMapLike | undefined;
}

/**
 * Tells webpack to hand the loader the module's bytes, which a WebAssembly module needs.
 */
// eslint-disable-next-line unicorn/consistent-boolean-name -- `raw` is the name webpack reads.
export const raw = true;

/**
 * Runs the shared transform the loader's options name on one module.
 *
 * @param this - The webpack loader context.
 * @param source - The module's bytes.
 */
// eslint-disable-next-line import-x/no-default-export -- Webpack takes a loader from its module's default export.
export default function obsidianPluginWebpackLoader(this: LoaderContext<ObsidianPluginWebpackLoaderOptions>, source: Buffer): void {
  const callback = this.async();
  invokeAsyncSafely(async () => {
    let result: LoaderResult;
    try {
      result = await transformModule(this, source);
    } catch (error) {
      callback(error as Error);
      return;
    }
    callback(null, result.code, result.map && JSON.stringify(result.map));
  });
}

async function transformModule(context: LoaderContext<ObsidianPluginWebpackLoaderOptions>, source: Buffer): Promise<LoaderResult> {
  const { isProductionBuild, kind, styles } = context.getOptions();
  const filePath = context.resourcePath;
  const code = source.toString('utf-8');
  switch (kind) {
    case 'jsx': {
      return await transformSolid({ code, filePath, isProductionBuild });
    }
    case 'stylesheet': {
      const result = await transformCss({ filePath, isCssModuleScoped: false, isProductionBuild, source: code, styles: styles ?? {} });
      for (const dependency of result.dependencies) {
        context.addDependency(dependency);
      }
      return { code: result.css };
    }
    case 'svelte': {
      return await transformSvelte({ code, filePath, isProductionBuild });
    }
    case 'typescript': {
      const result = await esbuildTransform(code, { loader: 'ts', sourcefile: filePath, sourcemap: 'external' });
      return { code: result.code, map: JSON.parse(result.map) as SourceMapLike };
    }
    case 'wasm': {
      return { code: getWasmModuleCode(source) };
    }
    default: {
      throw new Error(`Unknown loader kind: ${String(kind)}`);
    }
  }
}
