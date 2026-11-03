/**
 * @file
 * Shared parser-based prose ranges for the Markdown name rules.
 */

import type { MicromarkToken } from 'markdownlint';

/**
A column range of one line, 1-based, end exclusive.
 */
export interface MarkdownProseRange {
  /**
  The end column, exclusive.
   */
  readonly end: number;
  /**
  The first column.
   */
  readonly start: number;
}
/**
 * The token types whose whole subtree is skipped.
 */
const EXCLUDED_TOKEN_TYPES = new Set([
  'atxHeading',
  'blockQuote',
  'codeFenced',
  'codeIndented',
  'codeText',
  'definition',
  'htmlFlow',
  'image',
  'link',
  'setextHeading'
]);

/**
 * The prefix of the token types markdownlint appends for a shortcut, collapsed or full reference with no definition.
 * They repeat text the tree already holds, so reading them would report a name twice.
 */
const UNDEFINED_REFERENCE_TOKEN_TYPE_PREFIX = 'undefinedReference';

/**
 * Collects merged ranges of prose data, excluding headings, quotations, HTML, definitions and links.
 *
 * @param tokens - The Markdown parser's tokens.
 * @returns Prose ranges keyed by line number.
 */
export function getMarkdownProseRanges(tokens: readonly MicromarkToken[]): Map<number, MarkdownProseRange[]> {
  const ranges = new Map<number, MarkdownProseRange[]>();
  collectProseRanges(tokens, ranges);
  return new Map(Array.from(ranges, ([line, columns]) => [line, mergeRanges(columns)]));
}
/**
 * Collects the column ranges of the prose `data` tokens, line by line, skipping the excluded subtrees.
 *
 * @param tokens - The tokens to walk.
 * @param proseRangesByLine - The ranges collected so far, keyed by line number.
 */
function collectProseRanges(tokens: readonly MicromarkToken[], proseRangesByLine: Map<number, MarkdownProseRange[]>): void {
  for (const token of tokens) {
    if (EXCLUDED_TOKEN_TYPES.has(token.type) || token.type.startsWith(UNDEFINED_REFERENCE_TOKEN_TYPE_PREFIX)) {
      continue;
    }

    if (token.type === 'data') {
      const ranges = proseRangesByLine.get(token.startLine) ?? [];
      ranges.push({ end: token.endColumn, start: token.startColumn });
      proseRangesByLine.set(token.startLine, ranges);
      continue;
    }

    collectProseRanges(token.children, proseRangesByLine);
  }
}

/**
 * Merges ranges that touch or overlap, so a name micromark splits across adjacent `data` tokens is still inside one.
 *
 * @param ranges - The ranges of one line.
 * @returns The merged ranges.
 */
function mergeRanges(ranges: readonly MarkdownProseRange[]): MarkdownProseRange[] {
  const merged: MarkdownProseRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) {
      merged[merged.length - 1] = { end: Math.max(last.end, range.end), start: last.start };
    } else {
      merged.push(range);
    }
  }
  return merged;
}
