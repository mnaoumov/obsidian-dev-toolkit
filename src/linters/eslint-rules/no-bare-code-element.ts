/**
 * @file
 *
 * ESLint rule: no-bare-code-element
 *
 * Reports a `<code>` element built with `createEl('code', ...)`. In Obsidian's app UI - a notice, a setting's name or
 * description, a modal, a view - a bare `<code>` gets only a monospace font and no inline-code chip, so it does not
 * read as code. Obsidian draws the chip only inside rendered markdown, which is what `appendCodeBlock()` from
 * `@mnaoumov/obsidian-lib`'s `html-element.ts` builds: `<strong class="markdown-rendered code"><code>`. A translated
 * message with a code value in it goes through `createFragmentWithCodeBlocks()` with `asCodeBlock()`, which calls
 * `appendCodeBlock()` for each value.
 *
 * The element is matched by its tag alone, whatever its text: a plugin name, a file path and a setting value all need
 * the chip. The tag is read when it is a string literal, or a template literal without substitutions, passed as the
 * first argument of a function or method named `createEl`.
 *
 * There is no autofix: `appendCodeBlock()` appends to a parent and returns nothing, so a call whose result is kept, or
 * which passes a callback or other options, has to be rewritten by hand. A module that builds the element as its
 * implementation - `appendCodeBlock()` itself, or a highlighter filling a `<pre><code>` - disables the rule on that
 * line with its reason. Tests are not linted by it: a fixture may build any element.
 */

import type { Rule } from 'eslint';
import type {
  CallExpression,
  Expression,
  SpreadElement
} from 'estree';

/**
 * Message ID reported for a bare `<code>` element.
 */
export const MESSAGE_ID = 'noBareCodeElement';

/**
 * ESLint rule requiring a `<code>` element in UI to be built with `appendCodeBlock()`.
 */
export const noBareCodeElement: Rule.RuleModule = {
  create(context) {
    return {
      CallExpression(node: CallExpression): void {
        if (getCalleeName(node) === 'createEl' && isCodeTag(node.arguments[0])) {
          context.report({
            messageId: MESSAGE_ID,
            node
          });
        }
      }
    };
  },
  meta: {
    docs: {
      description: 'Require a `<code>` element in UI to be built with `appendCodeBlock()`, which gives it Obsidian\'s inline-code chip'
    },
    messages: {
      [MESSAGE_ID]: 'A bare `<code>` element gets no inline-code chip in Obsidian\'s UI, only a monospace font, so it does not read as code. Use `appendCodeBlock()` into a `DocumentFragment` or element, or `createFragmentWithCodeBlocks()` with `asCodeBlock()`, from `@mnaoumov/obsidian-lib`\'s `html-element.ts`.'
    },
    schema: [],
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
 * Tells whether a `createEl` tag argument is the static tag name `code`.
 *
 * @param argument - The first argument of the call.
 * @returns Whether it is `'code'` or `` `code` ``.
 */
function isCodeTag(argument: Expression | SpreadElement | undefined): boolean {
  switch (argument?.type) {
    case 'Literal': {
      return argument.value === 'code';
    }
    case 'TemplateLiteral': {
      return argument.expressions.length === 0 && argument.quasis.map((quasi) => quasi.value.cooked).join('') === 'code';
    }
    default: {
      return false;
    }
  }
}
