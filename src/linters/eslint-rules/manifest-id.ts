/**
 * @file
 *
 * ESLint rule: manifest-id
 *
 * Enforces the character set of a plugin's `manifest.json` `id`: lowercase letters, digits and hyphens only.
 *
 * `obsidianmd/validate-manifest` checks the rest of the id - no `obsidian`, no trailing `plugin` - under its
 * `checkId` option, which the shared config turns on, but not its characters. A published id can never be
 * changed, so a violation in an already-listed plugin is permanent and the only remedy is turning this rule
 * off for that repo with the reason written beside it.
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
 * Message ID reported when the id holds characters other than lowercase letters, digits and hyphens.
 */
export const MESSAGE_ID_INVALID_CHARACTERS = 'idInvalidCharacters';

/**
 * The only characters a plugin id may hold.
 */
const ALLOWED_ID_CHARACTERS = /^[a-z0-9-]+$/;

/**
 * ESLint rule enforcing the character set of a plugin's `manifest.json` `id`.
 */
export const manifestId: Rule.RuleModule = {
  create(context) {
    return {
      Document(node: unknown): void {
        const manifestObject = getManifestObject(node);
        if (!manifestObject) {
          return;
        }

        const member = findManifestMember(manifestObject, 'id');
        if (!member) {
          return;
        }

        const id = getStringValue(member.value);
        if (id === null || ALLOWED_ID_CHARACTERS.test(id)) {
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
      description: 'Enforce the character set of a plugin\'s `manifest.json` `id`'
    },
    messages: {
      [MESSAGE_ID_INVALID_CHARACTERS]: 'The `id` must contain only lowercase letters, digits and hyphens.'
    },
    schema: [],
    type: 'problem'
  }
};
