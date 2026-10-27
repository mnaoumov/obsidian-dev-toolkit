/**
 * @file
 *
 * Adds DevTools ignore lists to development maps and compact production maps.
 */

import type {
  BuildOptions,
  Plugin
} from 'esbuild';

import {
  decode,
  encode
} from '@jridgewell/sourcemap-codec';
import { getMandatoryNamedGroup } from '@mnaoumov/typescript-lib/reg-exp';
import { existsSync } from 'node:fs';
import {
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';

/**
 * The bundled modules that sit between a caller and a native API.
 *
 * DevTools skips these wrapper frames when choosing a console message's source link.
 */
export const DEFAULT_IGNORE_LIST_SOURCES: readonly RegExp[] = [
  /(?:^|\/)node_modules\/@mnaoumov\/typescript-lib\/(?:.*\/)?debug\.(?:[cm]?js|ts)$/,
  /(?:^|\/)node_modules\/monkey-around\//,
  // The library's sources are its `.ts` files, because esbuild chains its inline source maps.
  /(?:^|\/)node_modules\/@mnaoumov\/obsidian-lib\/(?:.*\/)?monkey-around-component\.(?:[cm]?js|ts)$/
];

/**
 * Obsidian strips a plugin's inline source map unless debug mode is on or the file ends with this marker.
 */
const NO_SOURCE_MAP_MARKER = '\n/* nosourcemap */';

const INLINE_SOURCE_MAP_PREFIX = '//# sourceMappingURL=data:application/json;base64,';

const INLINE_SOURCE_MAP_REGEXP = /\n\/\/# sourceMappingURL=data:application\/json;base64,(?<SourceMapBase64>[^\n]+)/;

const EXTERNAL_SOURCE_MAP_REGEXP = /\n\/\/# sourceMappingURL=[^\n]+\.map\s*$/;

const SOURCE_MAP_VERSION = 3;

/**
 * A version 3 source map, as far as this plugin reads and writes it.
 */
export interface SourceMap {
  /**
  The source indices DevTools skips.
   */
  ignoreList?: number[];
  /**
  VLQ-encoded generated-to-original mappings.
   */
  mappings: string;
  /**
  Original symbol names referenced by the mappings.
   */
  names?: string[];
  /**
  Original source paths.
   */
  sources: string[];
  /**
  Original source text, when retained by a full map.
   */
  sourcesContent?: (null | string)[];
  /**
  The source-map format version.
   */
  version: number;
}

type MappingSegment = [number, number, number, number] | [number];

interface RewriteBundleParams {
  readonly content: string;
  readonly distPath: string;
  readonly external: boolean;
  readonly isSourceIgnored: (source: string) => boolean;
  readonly minimal: boolean;
}

/**
 * Returns a copy of a full source map with every source that `isSourceIgnored` accepts listed in `ignoreList`.
 *
 * @param sourceMap - The full source map.
 * @param isSourceIgnored - Tells whether a source is ignore-listed.
 * @returns The source map with its `ignoreList` set.
 */
export function addIgnoreList(sourceMap: SourceMap, isSourceIgnored: (source: string) => boolean): SourceMap {
  const ignoreList = [
    ...new Set([
      ...sourceMap.ignoreList ?? [],
      ...sourceMap.sources.flatMap((source, index) => isSourceIgnored(source) ? [index] : [])
    ])
  ];
  return { ...sourceMap, ignoreList };
}

/**
 * Builds a minimal source map that maps only the generated code coming from an ignore-listed source.
 *
 * Everything else stays unmapped, so DevTools keeps linking it to the generated script as it does with no source map at
 * all, and only the ignore-listed regions change: DevTools skips them when it picks a message's location. The map has
 * no `sourcesContent` and no names, and one segment per region boundary, so it adds little to a minified bundle.
 *
 * Measured in Chrome's own DevTools: a script whose map lists ONLY ignore-listed sources still links its unmapped frames
 * to itself, so the plugin's own messages keep pointing at the plugin.
 *
 * @param sourceMap - The full source map of the bundle.
 * @param getListedSourceName - Returns the name an ignore-listed source is listed under, or `null` for a source that is
 * not ignore-listed. Sources listed under a name other than their own are merged into one, and map to its start.
 * @returns The minimal source map, or `null` when no generated code comes from an ignore-listed source.
 */
export function createIgnoreListOnlySourceMap(sourceMap: SourceMap, getListedSourceName: (source: string) => null | string): null | SourceMap {
  const newSourceIndices = new Map<string, number>();
  const newSources: string[] = [];
  const UNMAPPED = -1;
  let previousTarget = UNMAPPED;

  const newLines = decode(sourceMap.mappings).map((segments) => {
    const newSegments: MappingSegment[] = [];
    for (const segment of segments) {
      const [generatedColumn, sourceIndex, sourceLine = 0, sourceColumn = 0] = segment;
      const source = sourceIndex === undefined ? undefined : sourceMap.sources[sourceIndex];
      const newSource = source === undefined ? null : getListedSourceName(source);
      let target = UNMAPPED;
      if (newSource !== null) {
        target = newSourceIndices.get(newSource) ?? newSources.length;
        if (target === newSources.length) {
          newSourceIndices.set(newSource, target);
          newSources.push(newSource);
        }
      }

      // A mapped region restarts on every line, as the spec has it; an unmapped one only needs its first segment.
      const isFirstOnLine = newSegments.length === 0;
      if (target === previousTarget && (!isFirstOnLine || target === UNMAPPED)) {
        continue;
      }

      if (target === UNMAPPED) {
        newSegments.push([generatedColumn]);
      } else if (newSource === source) {
        newSegments.push([generatedColumn, target, sourceLine, sourceColumn]);
      } else {
        newSegments.push([generatedColumn, target, 0, 0]);
      }
      previousTarget = target;
    }
    return newSegments;
  });

  if (newSources.length === 0) {
    return null;
  }

  return {
    ignoreList: newSources.map((_source, index) => index),
    mappings: encode(newLines),
    names: [],
    sources: newSources,
    version: SOURCE_MAP_VERSION
  };
}

/**
 * An esbuild plugin that gives the bundle an ignore-list source map.
 *
 * - A development build already carries a full inline source map; this adds its `ignoreList`.
 * - A production build carries none, so this makes esbuild write an external one, replaces it with the minimal map from
 *   {@link createIgnoreListOnlySourceMap} inlined into the bundle, and deletes the external files. The bundle then ends
 *   with Obsidian's `nosourcemap` marker, without which Obsidian strips the map whenever debug mode is off.
 *
 * It must come after the toolkit's own source-map fix, which rewrites the development map's sources, and before the
 * copy into the vault, which the toolkit already orders by placing custom plugins between the two.
 *
 * @param additionalSources - Patterns added to {@link DEFAULT_IGNORE_LIST_SOURCES}.
 * @returns The esbuild plugin.
 */
export function ignoreListSourceMapPlugin(additionalSources: readonly RegExp[] = []): Plugin {
  // Clone without stateful flags so repeated matches never mutate the consumer's regular expressions.
  const patterns = [...DEFAULT_IGNORE_LIST_SOURCES, ...additionalSources].map((pattern) => new RegExp(pattern.source, pattern.flags.replaceAll(/[gy]/g, '')));

  return {
    name: 'ignore-list-source-map',
    setup(build): void {
      const options: BuildOptions = build.initialOptions;
      const shouldWriteExternalSourceMaps = !options.sourcemap;
      if (shouldWriteExternalSourceMaps) {
        options.sourcemap = 'external';
        options.sourcesContent = false;
      }

      const distPath = options.outfile;
      if (!distPath) {
        throw new Error('The ignore-list source map plugin needs the esbuild outfile option.');
      }

      build.onEnd(async (result) => {
        if (result.errors.length > 0 || !existsSync(distPath)) {
          return;
        }

        const content = await readFile(distPath, 'utf-8');
        const newContent = await rewriteBundle({
          content,
          distPath,
          external: options.sourcemap !== 'inline',
          isSourceIgnored,
          minimal: shouldWriteExternalSourceMaps
        });
        if (newContent !== content) {
          await writeFile(distPath, newContent);
        }

        if (!shouldWriteExternalSourceMaps) {
          return;
        }

        // Remove only the temporary maps this build generated, preserving unrelated maps.
        await rm(`${distPath}.map`, { force: true });
        await rm(`${distPath.replace(/\.js$/, '')}.css.map`, { force: true });
      });
    }
  };

  function isSourceIgnored(source: string): boolean {
    return patterns.some((pattern) => pattern.test(source.replaceAll('\\', '/')));
  }
}

function parseSourceMap(json: string): SourceMap {
  return JSON.parse(json) as SourceMap;
}

async function rewriteBundle({ content, distPath, external, isSourceIgnored, minimal }: RewriteBundleParams): Promise<string> {
  const inlineMatch = INLINE_SOURCE_MAP_REGEXP.exec(content);
  if (inlineMatch) {
    const sourceMap = parseSourceMap(Buffer.from(getMandatoryNamedGroup(inlineMatch, 'SourceMapBase64'), 'base64').toString('utf-8'));
    const newSourceMap = addIgnoreList(sourceMap, isSourceIgnored);
    if (external && existsSync(`${distPath}.map`)) {
      await writeFile(`${distPath}.map`, JSON.stringify(newSourceMap));
    }
    const bundle = content.replace(inlineMatch[0], () => `\n${INLINE_SOURCE_MAP_PREFIX}${toBase64(newSourceMap)}`);
    return bundle.endsWith(NO_SOURCE_MAP_MARKER) ? bundle : `${bundle.trimEnd()}${NO_SOURCE_MAP_MARKER}`;
  }

  const mapPath = `${distPath}.map`;
  if (!existsSync(mapPath)) {
    return content;
  }

  const sourceMap = parseSourceMap(await readFile(mapPath, 'utf-8'));
  if (!minimal) {
    await writeFile(mapPath, JSON.stringify(addIgnoreList(sourceMap, isSourceIgnored)));
    return content;
  }
  const bundle = content.replace(EXTERNAL_SOURCE_MAP_REGEXP, '');
  const ignoredSources = new Set(sourceMap.ignoreList?.map((index) => sourceMap.sources[index]));
  const newSourceMap = createIgnoreListOnlySourceMap(sourceMap, (source) => isSourceIgnored(source) || ignoredSources.has(source) ? 'obsidian-dev-toolkit:ignored' : null);
  return newSourceMap ? `${bundle.trimEnd()}\n${INLINE_SOURCE_MAP_PREFIX}${toBase64(newSourceMap)}${NO_SOURCE_MAP_MARKER}` : bundle;
}

function toBase64(sourceMap: SourceMap): string {
  return Buffer.from(JSON.stringify(sourceMap)).toString('base64');
}
