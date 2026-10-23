import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import {
  afterAll,
  describe,
  it
} from 'vitest';

import {
  MESSAGE_ID,
  noBareCodeElement
} from './no-bare-code-element.ts';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

const ERROR = { messageId: MESSAGE_ID };

ruleTester.run('no-bare-code-element', toRuleTesterModule(noBareCodeElement), {
  invalid: [
    {
      code: 'fragment.createEl(\'code\', { text: pluginName });',
      errors: [ERROR],
      name: 'a method call with a single-quoted tag'
    },
    {
      code: 'el.createEl("code", { text: \'path/to/file.md\' });',
      errors: [ERROR],
      name: 'a double-quoted tag, with text that is not a plugin name'
    },
    {
      code: 'createEl(\'code\');',
      errors: [ERROR],
      name: 'a bare function call without options'
    },
    {
      code: 'const codeEl = strong.createEl(`code`, { cls: \'x\' }, (code) => { code.setText(value); });',
      errors: [ERROR],
      name: 'a template literal tag, with a callback'
    }
  ],
  valid: [
    {
      code: 'appendCodeBlock(fragment, pluginName); createFragmentWithCodeBlocks(message);',
      name: 'the helpers this rule points to'
    },
    {
      code: 'el.createEl(\'pre\'); el.createEl(\'strong\', { text: \'code\' }); el.createEl(\'codes\');',
      name: 'another tag'
    },
    {
      // eslint-disable-next-line no-template-curly-in-string -- The fixture is source code holding a template literal.
      code: 'el.createEl(tag); el.createEl(`${tag}`); el.createEl(42); el.createEl(...args); el.createEl();',
      name: 'a tag that is not a static string'
    },
    {
      code: 'el.createDiv(\'code\'); el.createSpan(\'code\'); document.createElement(\'code\');',
      name: 'another factory'
    },
    {
      code: 'el[\'createEl\'](\'code\'); el[name](\'code\'); getFactory()(\'code\');',
      name: 'a computed or unnamed callee'
    }
  ]
});
