import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import {
  afterAll,
  describe,
  it
} from 'vitest';

import {
  MESSAGE_ID,
  preferComponentEx
} from './prefer-component-ex.ts';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

const IMPORT = 'import { ComponentEx } from \'@mnaoumov/obsidian-lib/components/component-ex\';';

ruleTester.run('prefer-component-ex', toRuleTesterModule(preferComponentEx), {
  invalid: [
    {
      code: 'import { Component } from \'obsidian\';\nexport class FooComponent extends Component {}',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'the only specifier: the import is replaced',
      output: `${IMPORT}\nexport class FooComponent extends ComponentEx {}`
    },
    {
      code: 'import {\n  Component,\n  Plugin\n} from \'obsidian\';\nexport class FooComponent extends Component {}',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'the first of several specifiers',
      output: `import {\n  Plugin\n} from 'obsidian';\n${IMPORT}\nexport class FooComponent extends ComponentEx {}`
    },
    {
      code: 'import {\n  App,\n  Component\n} from \'obsidian\';\nexport class FooComponent extends Component {}',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'the last of several specifiers',
      output: `import {\n  App\n} from 'obsidian';\n${IMPORT}\nexport class FooComponent extends ComponentEx {}`
    },
    {
      code: 'import { Component } from \'obsidian\';\nexport class FooComponent extends Component {}\nexport function isComponent(value: unknown): value is Component { return value instanceof Component; }',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'Component is still used elsewhere: the import stays',
      output: `import { Component } from 'obsidian';\n${IMPORT}\nexport class FooComponent extends ComponentEx {}\nexport function isComponent(value: unknown): value is Component { return value instanceof Component; }`
    },
    {
      code: `import { Component } from 'obsidian';\n${IMPORT}\nexport class FooComponent extends Component {}\nexport class BarComponent extends ComponentEx {}`,
      errors: [{ messageId: MESSAGE_ID }],
      name: 'ComponentEx is already imported',
      output: `${IMPORT}\nexport class FooComponent extends ComponentEx {}\nexport class BarComponent extends ComponentEx {}`
    },
    {
      code: 'import { ComponentEx as Ex } from \'@mnaoumov/obsidian-lib\';\nimport { Component as Base } from \'obsidian\';\nexport class FooComponent extends Base {}',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'aliased imports on both sides',
      output: 'import { ComponentEx as Ex } from \'@mnaoumov/obsidian-lib\';\nexport class FooComponent extends Ex {}'
    },
    {
      code: 'import * as lib from \'@mnaoumov/obsidian-lib\';\nimport { type ComponentEx as Ex, PluginBase } from \'@mnaoumov/obsidian-lib/components\';\nimport { \'Component\' as Base } from \'obsidian\';\nexport class FooComponent extends Base {}\nexport const used = [lib, PluginBase] as const;\nexport type Used = Ex;',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'a string-named import, and obsidian-lib imports that bind no ComponentEx value',
      output: `import * as lib from '@mnaoumov/obsidian-lib';\nimport { type ComponentEx as Ex, PluginBase } from '@mnaoumov/obsidian-lib/components';\n${IMPORT}\nexport class FooComponent extends ComponentEx {}\nexport const used = [lib, PluginBase] as const;\nexport type Used = Ex;`
    },
    {
      code: `${IMPORT}\nexport class FooComponent extends Component {}\nimport { Component } from 'obsidian';`,
      errors: [{ messageId: MESSAGE_ID }],
      name: 'the obsidian import is the last thing in the file',
      output: `${IMPORT}\nexport class FooComponent extends ComponentEx {}\n`
    },
    {
      code: 'import { Component } from \'obsidian\';\nexport const FooComponent = class FooComponent extends Component {};',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'a class expression',
      output: `${IMPORT}\nexport const FooComponent = class FooComponent extends ComponentEx {};`
    },
    {
      code: 'import { Component } from \'obsidian\';\nexport class FooComponent extends Component {\n  static {\n    void 0;\n  }\n\n  public onClick(): void {}\n}',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'a static block and an unrelated method still fix',
      output: `${IMPORT}\nexport class FooComponent extends ComponentEx {\n  static {\n    void 0;\n  }\n\n  public onClick(): void {}\n}`
    },
    {
      code: 'import { Component } from \'obsidian\';\nexport class FooComponent extends Component {}\nexport class BarComponent extends Component {}',
      errors: [{ messageId: MESSAGE_ID }, { messageId: MESSAGE_ID }],
      name: 'two classes in one file are fixed over two passes',
      output: [
        `import { Component } from 'obsidian';\n${IMPORT}\nexport class FooComponent extends ComponentEx {}\nexport class BarComponent extends Component {}`,
        `${IMPORT}\nexport class FooComponent extends ComponentEx {}\nexport class BarComponent extends ComponentEx {}`
      ]
    },
    {
      code: 'import { Component } from \'obsidian\';\nexport class FooComponent extends Component {\n  public override load(): void {}\n}',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'a member ComponentEx defines: no fix',
      output: null
    },
    {
      code: 'import { Component } from \'obsidian\';\nexport class FooComponent extends Component {\n  private readonly childrenSet = new Set();\n}',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'a property ComponentEx defines: no fix',
      output: null
    },
    {
      code: 'import { Component } from \'obsidian\';\nexport class FooComponent extends Component {\n  public [Symbol.dispose](): void {}\n}',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'Symbol.dispose: no fix',
      output: null
    },
    {
      code: 'import { Component } from \'obsidian\';\nimport { ComponentEx } from \'./my-component-ex.ts\';\nexport class FooComponent extends Component {}\nexport const other = ComponentEx;',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'the name ComponentEx is taken by something else: no fix',
      output: null
    },
    {
      code: 'import * as obsidian from \'obsidian\';\nexport class FooComponent extends obsidian.Component {}',
      errors: [{ messageId: MESSAGE_ID }],
      name: 'a namespace import: reported without a fix',
      output: null
    }
  ],
  valid: [
    {
      code: `${IMPORT}\nexport class FooComponent extends ComponentEx {}`,
      name: 'already ComponentEx'
    },
    {
      code: 'import { Plugin } from \'obsidian\';\nexport class FooPlugin extends Plugin {}',
      name: 'another Obsidian class'
    },
    {
      code: 'import { Component } from \'./component.ts\';\nexport class FooComponent extends Component {}',
      name: 'a Component from another module'
    },
    {
      code: 'import type { Component } from \'obsidian\';\nexport class FooComponent extends (globalThis as unknown as { Component: typeof Component }).Component {}',
      name: 'a type-only import'
    },
    {
      code: 'import { Component } from \'obsidian\';\nfunction make(Component: new () => object): object { return new (class FooComponent extends Component {})(); }\nexport const made = make(Component);',
      name: 'a shadowing parameter'
    },
    {
      code: 'import * as obsidian from \'obsidian\';\nexport class FooPlugin extends obsidian.Plugin {}',
      name: 'another member of a namespace import'
    },
    {
      code: 'import * as other from \'./other.ts\';\nexport class FooComponent extends other.Component {}',
      name: 'a namespace import of another module'
    },
    {
      code: 'export class Foo {}',
      name: 'no superclass'
    },
    {
      code: 'import { Component } from \'obsidian\';\nconst factory = (): typeof Component => Component;\nexport class BarComponent extends factory() {}',
      name: 'a call expression superclass'
    }
  ]
});
