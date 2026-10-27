/**
 * @file
 *
 * The pieces the rollup and vite adapters share. Vite 8 builds with rolldown, whose plugin API is
 * rollup's but whose types are its own, so these are typed by the shape both accept rather than by either
 * package's declarations.
 */

import { ObsidianPluginRepoPaths } from '../obsidian-plugin-repo-paths.ts';
import {
  isCssFileName,
  isObsidianPluginExternal,
  mergeCssAssets
} from './obsidian-plugin-build.ts';

/**
 * The part of a rollup or rolldown plugin context {@link renameCssAssets} uses.
 */
export interface AssetEmitter {
  /**
   * Emits an asset into the bundle.
   *
   * @param emittedFile - The asset to emit.
   * @returns The reference id of the emitted file.
   */
  readonly emitFile: (emittedFile: EmittedCssAsset) => string;
}

/**
 * An emitted file of a rollup or rolldown bundle, as {@link renameCssAssets} reads it.
 */
export interface BundleOutputLike {
  /**
   * The file name relative to the output folder.
   */
  readonly fileName: string;

  /**
   * An asset's contents.
   */
  readonly source?: string | Uint8Array;

  /**
   * Whether the file is an asset or a chunk.
   */
  readonly type: 'asset' | 'chunk';
}

/**
 * The function {@link combineExternal} returns, which every bundler of the rollup family accepts.
 */
export type CombinedExternalFunction = (source: string, importer: string | undefined, isResolved: boolean) => boolean;

/**
 * The `styles.css` asset {@link renameCssAssets} emits.
 */
export interface EmittedCssAsset {
  /**
   * The file name relative to the output folder.
   */
  readonly fileName: string;

  /**
   * The file's contents.
   */
  readonly source: string;

  /**
   * The kind of emitted file.
   */
  readonly type: 'asset';
}

/**
 * The function form of {@link ExternalLike}. Its result is read for truthiness, as rollup and rolldown read it.
 */
export type ExternalFunction = (source: string, importer: string | undefined, isResolved: boolean) => unknown;

/**
 * The `external` option of rollup and of rolldown, in the shape both accept.
 */
export type ExternalLike = ExternalFunction | ExternalPattern | readonly ExternalPattern[];

/**
 * One entry of the array form of {@link ExternalLike}.
 */
export type ExternalPattern = RegExp | string;

/**
 * Puts Obsidian's modules and the Node builtins beside whatever the consumer's own `external` option names.
 *
 * @param external - The consumer's `external` option.
 * @returns A function form of `external` that keeps both.
 */
export function combineExternal(external: ExternalLike | undefined): CombinedExternalFunction {
  return (source, importer, isResolved): boolean => isObsidianPluginExternal(source) || isMatchingExternal(external, source, importer, isResolved);
}

/**
 * Moves every CSS asset of a bundle into one `styles.css`, the only stylesheet Obsidian loads.
 *
 * @param assetEmitter - The plugin context to emit `styles.css` through.
 * @param bundle - The bundle about to be written.
 */
export function renameCssAssets(assetEmitter: AssetEmitter, bundle: Record<string, BundleOutputLike>): void {
  const cssAssets = Object.values(bundle)
    .filter((output) => output.type === 'asset' && isCssFileName(output.fileName))
    .map((asset) => ({
      fileName: asset.fileName,
      source: typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)
    }));
  const { fileNamesToRemove, stylesCss } = mergeCssAssets(cssAssets);
  if (stylesCss === undefined) {
    return;
  }
  for (const fileName of fileNamesToRemove) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Removing an entry from the bundle is how a rollup plugin drops an output.
    delete bundle[fileName];
  }
  assetEmitter.emitFile({ fileName: ObsidianPluginRepoPaths.StylesCss, source: stylesCss, type: 'asset' });
}

function isMatchingExternal(external: ExternalLike | undefined, source: string, importer: string | undefined, isResolved: boolean): boolean {
  if (external === undefined) {
    return false;
  }
  if (typeof external === 'function') {
    return Boolean(external(source, importer, isResolved));
  }
  const patterns: readonly ExternalPattern[] = typeof external === 'string' || external instanceof RegExp ? [external] : external;
  return patterns.some((pattern) => typeof pattern === 'string' ? pattern === source : pattern.test(source));
}
