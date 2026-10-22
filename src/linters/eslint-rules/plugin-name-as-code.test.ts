import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import {
  afterAll,
  describe,
  it
} from 'vitest';

import {
  MESSAGE_ID,
  pluginNameAsCode
} from './plugin-name-as-code.ts';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('plugin-name-as-code', toRuleTesterModule(pluginNameAsCode), {
  invalid: [
    {
      code: '// Reads Dataview pages.',
      errors: [{ column: 10, data: { name: 'Dataview' }, endColumn: 18, messageId: MESSAGE_ID }],
      name: 'a line comment',
      output: '// Reads `Dataview` pages.'
    },
    {
      code: '/* Templater and Dataview */',
      errors: [{ data: { name: 'Templater' }, messageId: MESSAGE_ID }, { data: { name: 'Dataview' }, messageId: MESSAGE_ID }],
      name: 'two names in a block comment',
      output: '/* `Templater` and `Dataview` */'
    },
    {
      code: 'const a = 1;\n/**\n * Works with Advanced Note Composer.\n */\nexport function f(): number { return a; }',
      errors: [{ column: 15, data: { name: 'Advanced Note Composer' }, line: 3, messageId: MESSAGE_ID }],
      name: 'a JSDoc comment, on its own line',
      output: 'const a = 1;\n/**\n * Works with `Advanced Note Composer`.\n */\nexport function f(): number { return a; }'
    },
    {
      code: '// Supports My Plugin.',
      errors: [{ data: { name: 'My Plugin' }, messageId: MESSAGE_ID }],
      name: 'a name the project adds',
      options: [{ additionalPluginNames: ['My Plugin'] }],
      output: '// Supports `My Plugin`.'
    }
  ],
  valid: [
    {
      code: '// Reads `Dataview` pages.',
      name: 'a name in a code span'
    },
    {
      code: '// Reads ``Dataview`` pages.',
      name: 'a name in a double-backtick code span'
    },
    {
      code: '/** See {@link Dataview} and {@linkcode Dataview | the API}. */',
      name: 'a name in a link tag'
    },
    {
      code: '// See https://github.com/blacksmithgu/Dataview for details.',
      name: 'a name in a URL'
    },
    {
      code: '// reads the dataview cache of obsidian-dataview',
      name: 'a lowercase identifier or a package name'
    },
    {
      code: 'const label = \'Dataview\';',
      name: 'a name outside a comment'
    },
    {
      code: '// Supports My Plugin.',
      name: 'a name nobody lists'
    },
    {
      code: '// Reads Dataview pages.',
      name: 'a name the project excludes',
      options: [{ excludedPluginNames: ['Dataview'] }]
    }
  ]
});
