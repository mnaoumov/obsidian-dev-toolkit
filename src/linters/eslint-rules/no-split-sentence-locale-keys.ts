/**
 * @file
 *
 * ESLint rule: no-split-sentence-locale-keys
 *
 * Reports a `part<N>` property key (`part1`, `part2`...) in a plugin's translations. Such keys are how a sentence gets
 * split around an inline value: `part1` + a `<code>` path + `part2`. A translator then sees fragments, never the
 * sentence, and cannot move the value to where their language needs it, so the stitched sentence reads wrong in most
 * locales.
 *
 * The fix is one key holding the whole sentence, with the value as a named `{{placeholder}}`. A plain-text value goes
 * through ordinary interpolation; a DOM node (a `<code>` path, a link, a button) is placed at its placeholder by
 * `tFragment()` from `@mnaoumov/obsidian-lib`'s `i18n/t-fragment.ts`.
 *
 * The rule reads syntax only: a non-computed object-literal property key, an identifier or a string literal, matching
 * `/^part\d+$/u`. A destructuring pattern reads keys rather than defining them, so it is left alone.
 * It does not decide which files are translations; the shared config enables it on the `i18n/locales/` files only.
 */

import type { Rule } from 'eslint';
import type {
  Expression,
  PrivateIdentifier,
  Property
} from 'estree';

/**
 * Message ID reported for a `part<N>` key.
 */
export const MESSAGE_ID = 'noSplitSentenceLocaleKeys';

const SPLIT_SENTENCE_KEY_PATTERN = /^part\d+$/u;

/**
 * ESLint rule forbidding `part<N>` keys, which split one translated sentence into fragments.
 */
export const noSplitSentenceLocaleKeys: Rule.RuleModule = {
  create(context) {
    return {
      Property(node: Property & Rule.NodeParentExtension): void {
        if (node.computed || node.parent.type === 'ObjectPattern') {
          return;
        }

        const keyName = getKeyName(node.key);
        if (keyName !== null && SPLIT_SENTENCE_KEY_PATTERN.test(keyName)) {
          context.report({
            data: { keyName },
            messageId: MESSAGE_ID,
            node: node.key
          });
        }
      }
    };
  },
  meta: {
    docs: {
      description: 'Forbid `part<N>` translation keys, which split one sentence into fragments around an inline value'
    },
    messages: {
      [MESSAGE_ID]: 'The translation key `{{keyName}}` splits a sentence into fragments, which a translator cannot reorder. Write the whole sentence as one string with a named interpolation placeholder for the inline value, and render a DOM node there with `tFragment()` from `@mnaoumov/obsidian-lib`.'
    },
    schema: [],
    type: 'suggestion'
  }
};

/**
 * Reads a property key's name.
 *
 * @param key - The key.
 * @returns The identifier's name or the string literal's value, or `null` for any other key.
 */
function getKeyName(key: Expression | PrivateIdentifier): null | string {
  if (key.type === 'Identifier') {
    return key.name;
  }

  return key.type === 'Literal' && typeof key.value === 'string' ? key.value : null;
}
