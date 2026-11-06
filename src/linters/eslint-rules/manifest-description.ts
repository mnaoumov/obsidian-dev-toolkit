/**
 * @file
 *
 * ESLint rule: manifest-description
 *
 * Enforces the house style of a plugin's `manifest.json` `description` beyond what
 * `obsidianmd/validate-manifest` checks.
 *
 * Upstream checks the word `obsidian`, self-reference, the 10-250 length, ending punctuation (`.`, `!` or `?`),
 * and a description that equals or opens with the name. This rule adds only what it leaves out, so no problem
 * is reported twice:
 *
 * - **A capital letter first.**
 * - **A period, not `!` or `?`.** A description with no ending punctuation at all is upstream's to report.
 * - **The self-reference upstream's pattern misses**: a description opening with `Plugin` (`Plugin for renaming
 *   notes.`), or `this is a plugin` with nothing after it. A phrase upstream already reports is skipped here.
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
 * Message ID reported when the description ends with `!` or `?` rather than a period.
 */
export const MESSAGE_ID_MISSING_PERIOD = 'descriptionMissingPeriod';

/**
 * Message ID reported when the description does not start with a capital letter.
 */
export const MESSAGE_ID_NOT_CAPITALIZED = 'descriptionNotCapitalized';

/**
 * Message ID reported when the description refers to itself in a way upstream does not catch.
 */
export const MESSAGE_ID_SELF_REFERENCE = 'descriptionSelfReference';

/**
 * The self-reference pattern of `obsidianmd/validate-manifest` 0.5.1 (`DESCRIPTION_SELF_REFERENCE`), which the
 * package does not export. A description it matches is upstream's to report.
 */
const UPSTREAM_SELF_REFERENCE = /\b(?:this\s+(?:obsidian\s+)?(?:plugin|tool|extension|add-?on|mod)\b|an?\s+(?:obsidian\s+)?plugin\s+(?:that|for|to|which)\b|the\s+plugin\s+\w)/i;

/**
 * The phrasings the directory calls out as self-reference. A bare `plugin` is deliberately not among them:
 * naming another plugin, or plugins in general, is not referring to oneself.
 */
const SELF_REFERENCE_PATTERNS = [
  /\bthis plugin\b/i,
  /\bthis is a plugin\b/i,
  /\ba plugin (?:that|which)\b/i,
  /^the plugin\b/i,
  /^plugin\b/i
];

/**
 * ESLint rule enforcing the house style of a plugin's `manifest.json` `description`.
 */
export const manifestDescription: Rule.RuleModule = {
  create(context) {
    return {
      Document(node: unknown): void {
        const manifestObject = getManifestObject(node);
        if (!manifestObject) {
          return;
        }

        const member = findManifestMember(manifestObject, 'description');
        if (!member) {
          return;
        }

        const description = getStringValue(member.value);
        if (description === null) {
          return;
        }

        const reportNode = toReportNode(member.value);

        if (!UPSTREAM_SELF_REFERENCE.test(description) && SELF_REFERENCE_PATTERNS.some((pattern) => pattern.test(description))) {
          context.report({
            messageId: MESSAGE_ID_SELF_REFERENCE,
            node: reportNode
          });
        }

        if (!/^[A-Z]/.test(description)) {
          context.report({
            messageId: MESSAGE_ID_NOT_CAPITALIZED,
            node: reportNode
          });
        }

        if (/[!?]$/.test(description.trim())) {
          context.report({
            messageId: MESSAGE_ID_MISSING_PERIOD,
            node: reportNode
          });
        }
      }
    };
  },
  meta: {
    docs: {
      description: 'Enforce the house style of a plugin\'s `manifest.json` `description` beyond `obsidianmd/validate-manifest`'
    },
    messages: {
      [MESSAGE_ID_MISSING_PERIOD]: 'The `description` must end with a period, not `!` or `?`.',
      [MESSAGE_ID_NOT_CAPITALIZED]: 'The `description` must start with a capital letter.',
      [MESSAGE_ID_SELF_REFERENCE]: 'The `description` must not refer to itself, e.g. `Plugin for ...`. Describe what it does instead.'
    },
    schema: [],
    type: 'problem'
  }
};
