/**
 * @file
 *
 * Keeps the lines of a production `main.js` short.
 *
 * A minifier puts a whole bundle on a handful of lines, and the community directory's release scanner warns that a
 * `main.js` over 50 KB whose average line is over 20 000 characters is "unusually packed", as deliberate packing to
 * obstruct review would be. `esbuild` breaks its output at a line limit itself; the minifier each other adapter runs
 * (`oxc` in `vite`, `swc` in `parcel`, `terser` in `webpack`) has no such option, so their output has its lines broken
 * here after it is written.
 */

import type { Token } from 'acorn';

import { parse } from 'acorn';
import { existsSync } from 'node:fs';
import {
  readFile,
  writeFile
} from 'node:fs/promises';

/**
 * The line length a production `main.js` is broken at by default. It costs one byte per line it adds.
 */
export const DEFAULT_OBSIDIAN_PLUGIN_LINE_LIMIT = 1000;

/**
 * The part of the build context {@link limitMainJsLineLength} reads.
 */
export interface LimitMainJsLineLengthParams {
  /**
   * Whether this is a production build. A development build is left alone.
   */
  readonly isProductionBuild: boolean;

  /**
   * The line length to break at, or `false` to leave the file alone.
   */
  readonly lineLimit: false | number;

  /**
   * The absolute path of the written `main.js`.
   */
  readonly mainJsPath: string;
}

const BREAKABLE_PUNCTUATORS = new Set([',', ';']);
const SOURCE_MAP_REFERENCE = /^\/\/[#@] sourceMappingURL=/mu;

/**
 * Breaks the lines of a bundle that are longer than a line limit.
 *
 * A line is broken after the first `,` or `;` token past the limit, and nothing else changes. A line terminator after
 * either of them never changes what the code means: automatic semicolon insertion only acts where the next token could
 * not continue, which in code that parses without the line break it can, and none of the productions that forbid a
 * line terminator (after `return`, `throw`, `break`, `continue` and `yield`, before a postfix `++` / `--` and before
 * `=>`) has one of them on its left. The tokens come from a full parse, so a `,` or `;` inside a string, a template or
 * a regular expression is never taken for one.
 *
 * A bundle that references a source map is returned unchanged, since a line break would put the map out of step, and
 * so is one that does not parse, with a warning.
 *
 * @param code - The bundle.
 * @param lineLimit - The line length to break at.
 * @returns The bundle with its long lines broken, or `code` itself when nothing needed to change.
 */
export function limitLineLength(code: string, lineLimit: number = DEFAULT_OBSIDIAN_PLUGIN_LINE_LIMIT): string {
  if (!hasLineLongerThan(code, lineLimit) || SOURCE_MAP_REFERENCE.test(code)) {
    return code;
  }

  const breakOffsets = getBreakOffsets(code, lineLimit);
  if (breakOffsets === undefined || breakOffsets.length === 0) {
    return code;
  }

  const parts: string[] = [];
  let previousOffset = 0;
  for (const offset of breakOffsets) {
    parts.push(code.slice(previousOffset, offset), '\n');
    previousOffset = offset;
  }
  parts.push(code.slice(previousOffset));
  return parts.join('');
}

/**
 * Breaks the long lines of the `main.js` a production build wrote, through {@link limitLineLength}.
 *
 * @param params - The {@link LimitMainJsLineLengthParams}, which a build context satisfies.
 * @returns A {@link Promise} that resolves once the file is rewritten, or found not to need it.
 */
export async function limitMainJsLineLength(params: LimitMainJsLineLengthParams): Promise<void> {
  const { isProductionBuild, lineLimit, mainJsPath } = params;
  if (!isProductionBuild || lineLimit === false || !existsSync(mainJsPath)) {
    return;
  }
  const code = await readFile(mainJsPath, 'utf-8');
  const limitedCode = limitLineLength(code, lineLimit);
  if (limitedCode !== code) {
    await writeFile(mainJsPath, limitedCode, 'utf-8');
  }
}

function getBreakOffsets(code: string, lineLimit: number): number[] | undefined {
  const tokens = tokenize(code);
  if (tokens === undefined) {
    return undefined;
  }

  const breakOffsets: number[] = [];
  let lineStart = 0;
  // Walked forward once beside the tokens, so a bundle on one line costs linear time.
  let nextLineFeed = code.indexOf('\n');
  for (const token of tokens) {
    if (!BREAKABLE_PUNCTUATORS.has(token.type.label)) {
      continue;
    }
    while (nextLineFeed !== -1 && nextLineFeed < token.end) {
      lineStart = Math.max(lineStart, nextLineFeed + 1);
      nextLineFeed = code.indexOf('\n', nextLineFeed + 1);
    }
    if (token.end - lineStart < lineLimit || nextLineFeed === token.end) {
      continue;
    }
    breakOffsets.push(token.end);
    lineStart = token.end;
  }
  return breakOffsets;
}

function hasLineLongerThan(code: string, lineLimit: number): boolean {
  let lineStart = 0;
  while (lineStart < code.length) {
    const lineFeed = code.indexOf('\n', lineStart);
    const lineEnd = lineFeed === -1 ? code.length : lineFeed;
    if (lineEnd - lineStart > lineLimit) {
      return true;
    }
    lineStart = lineEnd + 1;
  }
  return false;
}

function tokenize(code: string): Token[] | undefined {
  const tokens: Token[] = [];
  try {
    parse(code, {
      allowHashBang: true,
      allowReturnOutsideFunction: true,
      ecmaVersion: 'latest',
      onToken: tokens,
      sourceType: 'script'
    });
    return tokens;
  } catch (error) {
    console.warn(`Could not parse the bundle to break its long lines, so they are left as they are: ${String(error)}`);
    return undefined;
  }
}
