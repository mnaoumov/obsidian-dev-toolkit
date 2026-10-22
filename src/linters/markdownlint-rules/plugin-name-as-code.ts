/**
 * @file
 *
 * markdownlint rule: `plugin-name-as-code`.
 *
 * Reports an Obsidian plugin's display name written as plain text in markdown, and fixes it by wrapping the name in
 * backticks. The names come from `plugin-names.ts`: the shared list, the project's own `manifest.json` `name`, and
 * the rule's `additionalPluginNames` option, less its `excludedPluginNames` option.
 *
 * Only prose is read: the `data` tokens micromark leaves in paragraphs, lists, tables and emphasis. Everything else is
 * left alone because a code span there would be wrong or would change something:
 *
 * - code spans, fenced and indented code and math are not `data` tokens, so they are never reached;
 * - an HTML block, whose content markdownlint parses again as markdown;
 * - a link or image label and target, a reference definition and an autolink: a code span inside a link label
 *   renders inconsistently across GitHub, Obsidian and terminals;
 * - a heading, whose anchor would change;
 * - a block quote, which quotes somebody else's words;
 * - an Obsidian `[[wikilink]]` and an inline `<code>` element, which micromark reads as plain text, and a bare URL.
 *
 * An inline quotation is NOT skipped, on purpose. A double-quoted span in prose cannot be told apart from our own
 * quoted text: a step, a button label or a scare quote such as "install `CodeScript Toolkit`" is ours and must be
 * marked, while somebody else's words quoted inline must stay as they wrote them. Our own kind is the commoner one, so
 * skipping every quoted span would exempt our own prose to spare the rare real quotation. A real quotation inline
 * carries `<!-- markdownlint-disable-line plugin-name-as-code -- quotes the reporter -->` instead, which names the
 * exception and its reason where it is.
 *
 * Not attempted: a multi-word name broken across two lines of one paragraph.
 */

import type {
  MicromarkToken,
  Rule
} from 'markdownlint';

import process from 'node:process';

import type { PluginNameRuleOptions } from '../plugin-names.ts';

import {
  findPluginNameMatches,
  getPluginNames
} from '../plugin-names.ts';

/**
 * The rule's name, as it is spelled in a `markdownlint-cli2` configuration.
 */
export const PLUGIN_NAME_AS_CODE_RULE_NAME = 'plugin-name-as-code';

/**
 * The token types whose whole subtree is skipped.
 */
const EXCLUDED_TOKEN_TYPES = new Set([
  'atxHeading',
  'blockQuote',
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
 * The line spans micromark reads as plain text whose plugin names are not prose: an Obsidian wikilink, an inline
 * `<code>` element, a URL.
 */
const EXCLUDED_LINE_PATTERNS: readonly RegExp[] = [
  /\[\[[^\]]*\]\]/g,
  /<code\b[^>]*>[\s\S]*?<\/code>/gi,
  /\b[a-z][\w+.-]*:\/\/\S+/gi
];

/**
 * A column range of one line, 1-based, end exclusive.
 */
interface ColumnRange {
  readonly end: number;
  readonly start: number;
}

/**
 * A markdownlint rule requiring a plugin name in markdown to be marked as code.
 */
export const pluginNameAsCodeRule: Rule = {
  description: 'Plugin name is not marked as code (wrap it in backticks)',
  function: (params, onError) => {
    // The markdownlint engine hands an enabled rule its configuration object, or an empty one when the rule is merely `true`.
    const options = params.config as PluginNameRuleOptions;
    const pluginNames = getPluginNames({
      additionalPluginNames: options.additionalPluginNames,
      cwd: process.cwd(),
      excludedPluginNames: options.excludedPluginNames
    });
    const proseRangesByLine = new Map<number, ColumnRange[]>();
    collectProseRanges(params.parsers.micromark.tokens, proseRangesByLine);

    for (const [index, line] of params.lines.entries()) {
      const lineNumber = index + 1;
      const ranges = proseRangesByLine.get(lineNumber);
      if (!ranges) {
        continue;
      }

      const mergedRanges = mergeRanges(ranges);
      for (const match of findPluginNameMatches(line, pluginNames, EXCLUDED_LINE_PATTERNS)) {
        const column = match.index + 1;
        const isInProse = mergedRanges.some((range) => range.start <= column && column + match.name.length <= range.end);
        if (!isInProse) {
          continue;
        }

        onError({
          detail: `Wrap \`${match.name}\` in backticks`,
          fixInfo: {
            deleteCount: match.name.length,
            editColumn: column,
            insertText: `\`${match.name}\``
          },
          lineNumber,
          range: [column, match.name.length]
        });
      }
    }
  },
  names: [PLUGIN_NAME_AS_CODE_RULE_NAME],
  parser: 'micromark',
  tags: ['code']
};

/**
 * Collects the column ranges of the prose `data` tokens, line by line, skipping the excluded subtrees.
 *
 * @param tokens - The tokens to walk.
 * @param proseRangesByLine - The ranges collected so far, keyed by line number.
 */
function collectProseRanges(tokens: readonly MicromarkToken[], proseRangesByLine: Map<number, ColumnRange[]>): void {
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
function mergeRanges(ranges: readonly ColumnRange[]): ColumnRange[] {
  const merged: ColumnRange[] = [];
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
