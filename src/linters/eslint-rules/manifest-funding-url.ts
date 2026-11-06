/**
 * @file
 *
 * ESLint rule: manifest-funding-url
 *
 * Reports an empty `fundingUrl` in a plugin's `manifest.json`: an empty string, an empty object, or an object
 * entry whose value is an empty string.
 *
 * `obsidianmd/validate-manifest` checks the rest of the manifest's structure - the required, unknown and
 * duplicate keys, each value's type, and that a `fundingUrl` object holds only strings - but accepts an empty
 * one, which names no place to donate.
 *
 * Runs on the `@eslint/json` `json/json` language; see `manifest-helpers.ts` for why the AST is Momoa
 * rather than ESTree.
 */

import type { Rule } from 'eslint';

import type { JsonObjectNode } from './manifest-helpers.ts';

import {
  findManifestMember,
  getManifestObject,
  getStringValue,
  JSON_NODE_TYPE_OBJECT,
  toReportNode
} from './manifest-helpers.ts';

/**
 * Message ID reported when `fundingUrl` is an empty string, an empty object, or an object with an empty value.
 */
export const MESSAGE_ID_EMPTY_FUNDING_URL = 'emptyFundingUrl';

/**
 * ESLint rule reporting an empty `fundingUrl` in a plugin's `manifest.json`.
 */
export const manifestFundingUrl: Rule.RuleModule = {
  create(context) {
    return {
      Document(node: unknown): void {
        const manifestObject = getManifestObject(node);
        if (!manifestObject) {
          return;
        }

        const member = findManifestMember(manifestObject, 'fundingUrl');
        if (!member) {
          return;
        }

        if (getStringValue(member.value) === '') {
          context.report({
            messageId: MESSAGE_ID_EMPTY_FUNDING_URL,
            node: toReportNode(member.value)
          });
          return;
        }

        if (member.value.type !== JSON_NODE_TYPE_OBJECT) {
          return;
        }

        const fundingObject = member.value as JsonObjectNode;
        if (fundingObject.members.length === 0) {
          context.report({
            messageId: MESSAGE_ID_EMPTY_FUNDING_URL,
            node: toReportNode(fundingObject)
          });
          return;
        }

        for (const fundingMember of fundingObject.members) {
          if (getStringValue(fundingMember.value) === '') {
            context.report({
              messageId: MESSAGE_ID_EMPTY_FUNDING_URL,
              node: toReportNode(fundingMember.value)
            });
          }
        }
      }
    };
  },
  meta: {
    docs: {
      description: 'Report an empty `fundingUrl` in a plugin\'s `manifest.json`'
    },
    messages: {
      [MESSAGE_ID_EMPTY_FUNDING_URL]: 'The `fundingUrl` property cannot be empty. Remove it instead when no donations are accepted.'
    },
    schema: [],
    type: 'problem'
  }
};
