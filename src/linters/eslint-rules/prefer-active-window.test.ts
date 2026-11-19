import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { Linter } from 'eslint';
import {
  afterAll,
  describe,
  expect,
  it
} from 'vitest';

import {
  MESSAGE_ID,
  preferActiveWindow,
  SUGGESTION_MESSAGE_ID
} from './prefer-active-window.ts';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

interface ExpectedError {
  readonly messageId: typeof MESSAGE_ID;
  readonly suggestions: readonly ExpectedSuggestion[];
}

interface ExpectedSuggestion {
  readonly messageId: typeof SUGGESTION_MESSAGE_ID;
  readonly output: string;
}

/**
 * Builds the expected error for one report whose suggestion yields `output`.
 *
 * @param output - The code after the suggestion is applied.
 * @returns The expected error.
 */
function errorWithSuggestion(output: string): ExpectedError {
  return {
    messageId: MESSAGE_ID,
    suggestions: [{ messageId: SUGGESTION_MESSAGE_ID, output }]
  };
}

ruleTester.run('prefer-active-window', toRuleTesterModule(preferActiveWindow), {
  invalid: [
    {
      code: 'const selection = window.getSelection();',
      errors: [errorWithSuggestion('const selection = activeWindow.getSelection();')],
      name: 'a method call on the global window'
    },
    {
      code: 'const width = window.innerWidth;',
      errors: [errorWithSuggestion('const width = activeWindow.innerWidth;')],
      name: 'a property read'
    },
    {
      code: 'const y = window[\'scrollY\'];',
      errors: [errorWithSuggestion('const y = activeWindow[\'scrollY\'];')],
      name: 'a computed access with a static string key'
    },
    {
      code: 'const value = window[key];',
      errors: [errorWithSuggestion('const value = activeWindow[key];')],
      name: 'a computed access with a dynamic key'
    },
    {
      code: 'const value = window?.devicePixelRatio;',
      errors: [errorWithSuggestion('const value = activeWindow?.devicePixelRatio;')],
      name: 'an optional member access'
    },
    {
      code: 'function onClick(): void { window.focus(); }',
      errors: [errorWithSuggestion('function onClick(): void { activeWindow.focus(); }')],
      name: 'inside a function with no binding named window'
    },
    {
      code: 'interface Window { custom: string } const custom = window.custom;',
      errors: [errorWithSuggestion('interface Window { custom: string } const custom = activeWindow.custom;')],
      name: 'a type-only Window declaration does not shadow the global'
    },
    {
      code: 'function a(window: Window): void { window.focus(); } window.blur();',
      errors: [errorWithSuggestion('function a(window: Window): void { window.focus(); } activeWindow.blur();')],
      name: 'a parameter shadows the global only inside its own function'
    }
  ],
  valid: [
    {
      code: 'window.setTimeout(fn, 1); window.clearTimeout(id); window.setInterval(fn, 1); window.clearInterval(id);',
      name: 'the timers'
    },
    {
      code: 'window.requestAnimationFrame(fn); window.cancelAnimationFrame(id);',
      name: 'the animation frames'
    },
    {
      code: 'window.open(url);',
      name: 'open'
    },
    {
      code: 'window.addEventListener(\'resize\', fn); window.removeEventListener(\'resize\', fn); window.dispatchEvent(event);',
      name: 'the listener methods'
    },
    {
      code: 'window[\'setTimeout\'](fn, 1); window[`open`](url);',
      name: 'an exempt member through a static computed key'
    },
    {
      code: 'activeWindow.getSelection(); activeWindow.innerWidth;',
      name: 'activeWindow itself'
    },
    {
      code: 'this.registerEvent(this.app.workspace.on(\'window-open\', (_workspaceWindow, window) => { window.focus(); }));',
      name: 'a handler parameter named window'
    },
    {
      code: 'const window = getPopoutWindow(); window.focus();',
      name: 'a local variable named window'
    },
    {
      code: 'import { window } from \'./fake-window.ts\'; window.focus();',
      name: 'an import named window'
    },
    {
      code: 'function outer(window: Window): void { const inner = (): void => { window.focus(); }; inner(); }',
      name: 'a binding in an enclosing function'
    },
    {
      code: 'const win = window; foo(window); popout.window.focus(); obj.window;',
      name: 'window not used as the object of a member access, or not the global identifier'
    }
  ]
});

describe('prefer-active-window under the default parser', () => {
  /**
   * Lints JavaScript with ESLint's own parser and scope manager, which knows no type bindings.
   *
   * @param code - The code.
   * @returns The rule's message IDs.
   */
  function lintWithEspree(code: string): string[] {
    const linter = new Linter();
    return linter.verify(code, {
      plugins: { test: { rules: { 'prefer-active-window': preferActiveWindow } } },
      rules: { 'test/prefer-active-window': 'error' }
    }).map((message) => message.messageId ?? message.message);
  }

  it('should report the global window', () => {
    expect(lintWithEspree('window.focus();')).toEqual([MESSAGE_ID]);
  });

  it('should leave a local window alone', () => {
    expect(lintWithEspree('function f(window) { window.focus(); }')).toEqual([]);
  });
});
