/**
 * @file
 * Requires command, tool, package, framework, shell and service names in Markdown prose to be code spans.
 * Names match exactly, longest first. Parser ranges exclude code, headings, block quotes, HTML and links;
 * line masks also exclude quoted text, template tags, wikilinks, inline code elements and URLs.
 */

import type { Rule } from 'markdownlint';

import { escapeRegExp } from '@mnaoumov/typescript-lib/reg-exp';

import { getMarkdownProseRanges } from '../markdown-prose.ts';
import { TOOL_NAMES } from '../tool-names.ts';

/**
Options for the tool-name Markdown rule.
 */
export interface ToolNameRuleOptions {
  /**
  Extra exact spellings to require as code.
   */
  readonly additionalToolNames?: readonly string[];
  /**
  Spellings to skip, including names added by the project.
   */
  readonly excludedToolNames?: readonly string[];
}

/**
The rule's configuration key.
 */
export const TOOL_NAME_AS_CODE_RULE_NAME = 'tool-name-as-code';

/**
Non-prose spans that the Markdown parser can expose as data.
 */
const EXCLUDED_LINE_PATTERN = /<%[^\r\n]*?%>|"[^"]*"|“[^”]*”|\[\[[^\]]*\]\]|<code\b[^>]*>.*?<\/code>|\b[a-z][\w+.-]*:\/\/\S+/gi;

/**
A fixable rule requiring tool and service names in prose to be marked as code.
 */
export const toolNameAsCodeRule: Rule = {
  description: 'Tool or service name is not marked as code (wrap it in backticks)',
  function: (params, onError) => {
    const options = params.config as ToolNameRuleOptions;
    const excluded = new Set(options.excludedToolNames);
    const names = [...new Set([...TOOL_NAMES, ...options.additionalToolNames ?? []])].filter((name) => name !== '' && !excluded.has(name));
    if (names.length === 0) {
      return;
    }
    const alternatives = names.sort((a, b) => b.length - a.length).map((name) => escapeRegExp(name)).join('|');
    const pattern = new RegExp(String.raw`(?<![\w./@\\-])(?:${alternatives})(?![\w/@\\-]|\.\w)`, 'g');
    const prose = getMarkdownProseRanges(params.parsers.micromark.tokens);
    for (const [index, line] of params.lines.entries()) {
      const ranges = prose.get(index + 1);
      if (!ranges) {
        continue;
      }
      const masked = line.replaceAll(EXCLUDED_LINE_PATTERN, (text) => ' '.repeat(text.length));
      for (const match of masked.matchAll(pattern)) {
        const column = match.index + 1;
        const name = match[0];
        if (ranges.every((range) => !(range.start <= column && column + name.length <= range.end))) {
          continue;
        }
        onError({
          detail: `Wrap \`${name}\` in backticks`,
          fixInfo: { deleteCount: name.length, editColumn: column, insertText: `\`${name}\`` },
          lineNumber: index + 1,
          range: [column, name.length]
        });
      }
    }
  },
  names: [TOOL_NAME_AS_CODE_RULE_NAME],
  parser: 'micromark',
  tags: ['code']
};
