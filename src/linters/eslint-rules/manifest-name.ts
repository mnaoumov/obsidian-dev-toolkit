/**
 * @file
 *
 * ESLint rule: manifest-name
 *
 * Enforces the character set of a plugin's `manifest.json` `name`: Basic Latin only, with hyphens, plus signs
 * and parentheses the sole permitted punctuation.
 *
 * `obsidianmd/validate-manifest` checks the name's words - `Obsidian`, its fragments `obsi` and `sidian`, a
 * leading `ob`, and `Plugin` - but not its characters.
 *
 * Runs on the `@eslint/json` `json/json` language; see `manifest-helpers.ts` for why the AST is Momoa
 * rather than ESTree.
 */

import type { Rule } from 'eslint';

import {
  findManifestMember,
  getManifestObject,
  getStringValue,
  toReportNode
} from './manifest-helpers.ts';

/**
 * Message ID reported when the name holds a character outside Basic Latin, or punctuation the rule rejects.
 */
export const MESSAGE_ID_INVALID_CHARACTERS = 'nameInvalidCharacters';

/**
 * The only characters a plugin name may hold: Basic Latin letters and digits, spaces, and the three
 * permitted punctuation marks.
 */
const ALLOWED_NAME_CHARACTERS = /^[A-Za-z0-9 \-+()]+$/;

/**
 * ESLint rule enforcing the character set of a plugin's `manifest.json` `name`.
 */
export const manifestName: Rule.RuleModule = {
  create(context) {
    return {
      Document(node: unknown): void {
        const manifestObject = getManifestObject(node);
        if (!manifestObject) {
          return;
        }

        const member = findManifestMember(manifestObject, 'name');
        if (!member) {
          return;
        }

        const name = getStringValue(member.value);
        if (name === null || ALLOWED_NAME_CHARACTERS.test(name)) {
          return;
        }

        context.report({
          messageId: MESSAGE_ID_INVALID_CHARACTERS,
          node: toReportNode(member.value)
        });
      }
    };
  },
  meta: {
    docs: {
      description: 'Enforce the character set of a plugin\'s `manifest.json` `name`'
    },
    messages: {
      [MESSAGE_ID_INVALID_CHARACTERS]: 'The `name` must use Basic Latin only, with hyphens, plus signs and parentheses the only permitted punctuation.'
    },
    schema: [],
    type: 'problem'
  }
};
