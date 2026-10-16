/**
 * @file
 *
 * ESLint rule: plugin-name-as-code-in-ui
 *
 * Reports an Obsidian plugin's display name inside a string that is shown in UI as plain text. In UI the name is
 * built as a `<code>` element instead: `appendCodeBlock()` into a `DocumentFragment`, or `createFragmentWithCodeBlocks()`
 * with `asCodeBlock()`, from `@mnaoumov/obsidian-lib`'s `html-element.ts`, and the fragment is what is passed on.
 *
 * Detection is best effort, by call shape, without type information. A string literal or template literal (or a
 * `+` concatenation or `? :` branch made of them) is read when it is:
 *
 * - the first argument of `new Notice(...)`;
 * - the first argument of `setName`, `setDesc`, `setText`, `appendText` or `setTitle` called on anything;
 * - the `text` property of an options object passed to `createEl`, `createDiv` or `createSpan`.
 *
 * There is no autofix: splitting a string around the name and building a fragment is a rewrite of the call, and
 * often of a translation key, which needs judgement. A command name, a ribbon tooltip and a window title cannot hold
 * markup, so the calls that set them (`addCommand`, `addRibbonIcon`, `document.title`) are not read at all.
 */

import type { Rule } from 'eslint';
import type {
  CallExpression,
  Expression,
  NewExpression,
  Node,
  SpreadElement
} from 'estree';

import type { PluginNameRuleOptions } from '../plugin-names.ts';

import {
  findPluginNameMatches,
  getPluginNames
} from '../plugin-names.ts';
import { PLUGIN_NAME_RULE_SCHEMA } from './plugin-name-as-code.ts';

/**
 * Message ID reported for a plugin name inside a UI string.
 */
export const MESSAGE_ID = 'pluginNameAsCodeInUi';

/**
 * The methods whose first argument is shown in UI and may be a `DocumentFragment`.
 */
const UI_TEXT_METHOD_NAMES = new Set(['appendText', 'setDesc', 'setName', 'setText', 'setTitle']);

/**
 * The element factories whose options object carries UI text in `text`.
 */
const ELEMENT_FACTORY_NAMES = new Set(['createDiv', 'createEl', 'createSpan']);

/**
 * ESLint rule requiring a plugin name shown in UI to be built as a `<code>` element.
 */
export const pluginNameAsCodeInUi: Rule.RuleModule = {
  create(context) {
    const options = context.options[0] as PluginNameRuleOptions | undefined;
    const pluginNames = getPluginNames({ additionalPluginNames: options?.additionalPluginNames, cwd: context.cwd });

    return {
      CallExpression(node: CallExpression): void {
        const calleeName = getCalleeName(node);
        if (calleeName === null) {
          return;
        }

        if (UI_TEXT_METHOD_NAMES.has(calleeName) && node.callee.type === 'MemberExpression') {
          inspectArgument(node.arguments[0]);
          return;
        }

        if (!ELEMENT_FACTORY_NAMES.has(calleeName)) {
          return;
        }

        for (const argument of node.arguments) {
          if (argument.type !== 'ObjectExpression') {
            continue;
          }
          for (const property of argument.properties) {
            if (property.type === 'Property' && !property.computed && getKeyName(property.key) === 'text') {
              inspectExpression(property.value);
            }
          }
        }
      },
      NewExpression(node: NewExpression): void {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Notice') {
          inspectArgument(node.arguments[0]);
        }
      }
    };

    function inspectArgument(argument: Expression | SpreadElement | undefined): void {
      if (argument && argument.type !== 'SpreadElement') {
        inspectExpression(argument);
      }
    }

    function inspectExpression(node: Node): void {
      switch (node.type) {
        case 'BinaryExpression': {
          if (node.operator === '+') {
            inspectExpression(node.left);
            inspectExpression(node.right);
          }
          break;
        }
        case 'ConditionalExpression': {
          inspectExpression(node.consequent);
          inspectExpression(node.alternate);
          break;
        }
        case 'Literal': {
          if (typeof node.value === 'string') {
            reportText(node, node.value);
          }
          break;
        }
        case 'TemplateLiteral': {
          for (const templateElement of node.quasis) {
            reportText(templateElement, templateElement.value.raw);
          }
          break;
        }
        default: {
          break;
        }
      }
    }

    function reportText(node: Node, text: string): void {
      for (const match of findPluginNameMatches(text, pluginNames)) {
        context.report({
          data: { name: match.name },
          messageId: MESSAGE_ID,
          node
        });
      }
    }
  },
  meta: {
    docs: {
      description: 'Require a plugin name shown in UI to be built as a `<code>` element'
    },
    messages: {
      [MESSAGE_ID]: 'The plugin name `{{ name }}` is shown in UI as plain text. Build it as a `<code>` element instead: `appendCodeBlock()` into a `DocumentFragment`, or `createFragmentWithCodeBlocks()` with `asCodeBlock()`, from `@mnaoumov/obsidian-lib`\'s `html-element.ts`.'
    },
    schema: PLUGIN_NAME_RULE_SCHEMA,
    type: 'suggestion'
  }
};

/**
 * Reads the name a call is made by: the function's name, or the method's for a member call.
 *
 * @param node - The call.
 * @returns The name, or `null` for a computed or otherwise unnamed callee.
 */
function getCalleeName(node: CallExpression): null | string {
  if (node.callee.type === 'Identifier') {
    return node.callee.name;
  }

  return node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property.type === 'Identifier'
    ? node.callee.property.name
    : null;
}

/**
 * Reads the name of an object property key written as an identifier or a string literal.
 *
 * @param key - The key.
 * @returns The name, or `null` for any other key.
 */
function getKeyName(key: Node): null | string {
  if (key.type === 'Identifier') {
    return key.name;
  }

  return key.type === 'Literal' && typeof key.value === 'string' ? key.value : null;
}
