/**
 * @file
 *
 * Bundles a browser worker into readable source embedded in the plugin's JavaScript module.
 */

import { build } from 'esbuild';
import {
  dirname,
  resolve
} from 'node:path';

/**
 * The module exporting a worker's source and the files its watch build depends on.
 */
export interface InlineWorkerModule {
  /**
   * JavaScript exporting the bundled worker source as a string.
   */
  readonly code: string;

  /**
   * Absolute paths of every bundled input.
   */
  readonly dependencies: readonly string[];
}

/**
 * Bundles a worker and its imports for a Blob-backed browser Worker, without emitting a sibling file.
 * Node builtins and Obsidian imports are unavailable in workers and fail resolution.
 *
 * @param filePath - The absolute path of the worker entry point.
 * @returns The module and its watched inputs.
 */
export async function bundleInlineWorker(filePath: string): Promise<InlineWorkerModule> {
  const absWorkingDirectory = dirname(filePath);
  const result = await build({
    // eslint-disable-next-line unicorn/name-replacements -- `absWorkingDir` is esbuild's option name.
    absWorkingDir: absWorkingDirectory,
    bundle: true,
    entryPoints: [filePath],
    format: 'iife',
    loader: { '.wasm': 'binary' },
    metafile: true,
    platform: 'browser',
    target: 'es2018',
    write: false
  });
  const [output] = result.outputFiles;
  if (!output) {
    throw new Error('Worker build produced no JavaScript');
  }
  return {
    code: `export default ${JSON.stringify(output.text)};\n`,
    dependencies: Object.keys(result.metafile.inputs).map((input) => resolve(absWorkingDirectory, input))
  };
}
