/**
 * @file
 *
 * ESLint rule: prefer-active-window
 *
 * Reports a member read off the bare global `window` (`window.getSelection()`, `window.innerWidth`,
 * `window['scrollY']`) and points it to `activeWindow`. In Obsidian the global `window` is always the MAIN window,
 * while code that runs for a popout window - a view, a modal, a command run from the popout - belongs to that popout,
 * which `activeWindow` names. `obsidianmd/prefer-active-doc` covers `document` only and leaves `window` alone, so a
 * plugin otherwise gets no hint that its selection, focus or size read comes from the wrong window.
 *
 * The rule is scope-aware: `window` is reported only when it resolves to the global. A parameter, local variable,
 * import or other binding named `window` in the file - such as the popout's own window that `workspace.on('window-open')`
 * hands its handler - is that binding, not the global, and is left alone.
 *
 * A few members stay on `window`, as `obsidianmd/prefer-window-timers` and `obsidianmd/prefer-active-doc` want: the
 * timers and animation frames (`setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `requestAnimationFrame`,
 * `cancelAnimationFrame`), whose callbacks resolve through their own closure; `open`; and the listener methods
 * (`addEventListener`, `removeEventListener`, `dispatchEvent`), since a listener a plugin registers for its lifetime
 * belongs on the main window, which outlives every popout. A computed access is checked by its key when that is a
 * static string, and reported otherwise.
 *
 * There is no autofix, because the rewrite changes which window the code reads: the report offers it as a suggestion,
 * to be applied where the code really runs for the active window. A read that must stay on the main window disables the
 * rule on the line with its reason.
 *
 * Re-implemented after the bare-`window` `no-restricted-syntax` selector of `obsidian-plugin-dev-kit`'s
 * `src/eslint/obsidian-plugin.ts` (v0.4.0, MIT), which reports a parameter named `window` as well; the scope check
 * and the listener exemption are this rule's own.
 */

import type { Rule } from 'eslint';
import type {
  Identifier,
  MemberExpression,
  PrivateIdentifier
} from 'estree';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';

/**
 * Message ID reported for a member read off the bare global `window`.
 */
export const MESSAGE_ID = 'preferActiveWindow';

/**
 * Message ID of the suggestion that rewrites `window` to `activeWindow`.
 */
export const SUGGESTION_MESSAGE_ID = 'useActiveWindow';

/**
 * The `window` members the rule leaves alone.
 */
export const WINDOW_MEMBER_EXCEPTIONS: ReadonlySet<string> = new Set([
  'addEventListener',
  'cancelAnimationFrame',
  'clearInterval',
  'clearTimeout',
  'dispatchEvent',
  'open',
  'removeEventListener',
  'requestAnimationFrame',
  'setInterval',
  'setTimeout'
]);

const ACTIVE_WINDOW_NAME = 'activeWindow';
const WINDOW_NAME = 'window';

type Scope = ReturnType<Rule.RuleContext['sourceCode']['getScope']>;

/**
 * ESLint rule preferring `activeWindow` over the bare global `window`.
 */
export const preferActiveWindow: Rule.RuleModule = {
  create(context) {
    return {
      MemberExpression(node: MemberExpression & Rule.NodeParentExtension): void {
        const windowIdentifier = node.object;
        if (windowIdentifier.type !== 'Identifier' || windowIdentifier.name !== WINDOW_NAME) {
          return;
        }

        const memberName = getMemberName(node);
        if (memberName !== null && WINDOW_MEMBER_EXCEPTIONS.has(memberName)) {
          return;
        }

        if (hasLocalBinding(context.sourceCode.getScope(node), WINDOW_NAME)) {
          return;
        }

        context.report({
          messageId: MESSAGE_ID,
          node,
          suggest: [
            {
              fix: (fixer): Rule.Fix => fixer.replaceText(windowIdentifier, ACTIVE_WINDOW_NAME),
              messageId: SUGGESTION_MESSAGE_ID
            }
          ]
        });
      }
    };
  },
  meta: {
    docs: {
      description: 'Prefer `activeWindow` over the bare global `window`, which is always the main window, never a popout'
    },
    hasSuggestions: true,
    messages: {
      [MESSAGE_ID]: 'A bare `window` is the main window, not the popout window the code may run in. Use `activeWindow` (the timers, `open` and the listener methods stay on `window`). If this read must stay on the main window, disable this rule on the line with the reason.',
      [SUGGESTION_MESSAGE_ID]: 'Replace `window` with `activeWindow`.'
    },
    schema: [],
    type: 'suggestion'
  }
};

/**
 * Reads the name of the member a member expression accesses.
 *
 * @param node - The member expression.
 * @returns The name for `window.x` and for a static string key, or `null` for any other computed key.
 */
function getMemberName(node: MemberExpression): null | string {
  if (!node.computed) {
    // A non-computed key is always a name: `window.x`, or a `#x` that cannot occur on `window`.
    return castTo<Identifier | PrivateIdentifier>(node.property).name;
  }

  const property = node.property;
  if (property.type === 'Literal' && typeof property.value === 'string') {
    return property.value;
  }

  if (property.type === 'TemplateLiteral' && property.expressions.length === 0) {
    return property.quasis.map((quasi) => quasi.value.cooked).join('');
  }

  return null;
}

/**
 * Tells whether a declaration in the file binds a value named `name` where `scope` can see it. A global from the
 * environment or the TypeScript lib has no definition in the file, and a type-only binding (an `interface Window`) is
 * not a value.
 *
 * @param scope - The scope the name is read in.
 * @param name - The name.
 * @returns Whether the name resolves to a binding of the file.
 */
function hasLocalBinding(scope: null | Scope, name: string): boolean {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable && variable.defs.length > 0 && isValueVariable(variable)) {
      return true;
    }
  }

  return false;
}

/**
 * Tells whether a scope variable is a value binding. `typescript-eslint`'s scope manager tells value and type bindings
 * apart; `eslint-scope` knows values only.
 *
 * @param variable - The variable.
 * @returns Whether it binds a value.
 */
function isValueVariable(variable: object): boolean {
  return !('isValueVariable' in variable) || variable.isValueVariable !== false;
}
