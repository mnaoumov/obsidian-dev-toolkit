/**
 * @file
 *
 * ESLint rule: plugin-name-as-code
 *
 * Reports an Obsidian plugin's display name written as plain text in a code comment, and autofixes it by wrapping
 * the name in backticks. TSDoc renders a name in backticks as code, so a doc comment reads the same as the README.
 *
 * Every comment is read: `//`, `/* *\/` and JSDoc / TSDoc. A name already inside a code span, an inline `@link` tag
 * (whose target is an identifier) or a URL is left alone. The names come from `plugin-names.ts`: the shared list,
 * the project's own `manifest.json` `name`, and the rule's `additionalPluginNames` option.
 *
 * Not attempted: a multi-word name broken across two comment lines, which a reader cannot tell from two unrelated
 * words without understanding the prose.
 */

import type { Rule } from 'eslint';

import type { PluginNameRuleOptions } from '../plugin-names.ts';

import {
  findPluginNameMatches,
  getPluginNames
} from '../plugin-names.ts';

/**
 * Message ID reported for a plugin name written as plain text in a comment.
 */
export const MESSAGE_ID = 'pluginNameAsCode';

/**
 * The comment spans whose plugin names are already marked or are not prose: a code span, an inline `@link` tag, a URL.
 */
const EXCLUDED_COMMENT_PATTERNS: readonly RegExp[] = [
  /(?<ticks>`+)[\s\S]*?\k<ticks>/g,
  /\{@link\w*[^}]*\}/g,
  /\b[a-z][\w+.-]*:\/\/\S+/gi
];

/**
 * The length of the opening delimiter of a `//` or `/*` comment, which `comment.value` leaves out.
 */
const COMMENT_OPENING_LENGTH = 2;

/**
 * The JSON schema of the options the plugin-name rules take.
 */
export const PLUGIN_NAME_RULE_SCHEMA: Rule.RuleMetaData['schema'] = [
  {
    additionalProperties: false,
    properties: {
      additionalPluginNames: {
        items: { type: 'string' },
        type: 'array'
      }
    },
    type: 'object'
  }
];

/**
 * ESLint rule requiring a plugin name in a comment to be marked as code.
 */
export const pluginNameAsCode: Rule.RuleModule = {
  create(context) {
    const options = context.options[0] as PluginNameRuleOptions | undefined;
    const pluginNames = getPluginNames({ additionalPluginNames: options?.additionalPluginNames, cwd: context.cwd });
    const sourceCode = context.sourceCode;

    return {
      Program(): void {
        for (const comment of sourceCode.getAllComments()) {
          const [valueStart] = sourceCode.getRange(comment);
          for (const match of findPluginNameMatches(comment.value, pluginNames, EXCLUDED_COMMENT_PATTERNS)) {
            const start = valueStart + COMMENT_OPENING_LENGTH + match.index;
            const end = start + match.name.length;
            context.report({
              data: { name: match.name },
              fix: (fixer) => fixer.replaceTextRange([start, end], `\`${match.name}\``),
              loc: {
                end: sourceCode.getLocFromIndex(end),
                start: sourceCode.getLocFromIndex(start)
              },
              messageId: MESSAGE_ID
            });
          }
        }
      }
    };
  },
  meta: {
    docs: {
      description: 'Require a plugin name in a comment to be marked as code with backticks'
    },
    fixable: 'code',
    messages: {
      [MESSAGE_ID]: 'Mark the plugin name `{{ name }}` as code: wrap it in backticks.'
    },
    schema: PLUGIN_NAME_RULE_SCHEMA,
    type: 'suggestion'
  }
};
