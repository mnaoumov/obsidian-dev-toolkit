import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import {
  afterAll,
  describe,
  it
} from 'vitest';

import {
  MESSAGE_ID,
  pluginNameAsCodeInUi
} from './plugin-name-as-code-in-ui.ts';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

const DATAVIEW_ERROR = { data: { name: 'Dataview' }, messageId: MESSAGE_ID };

ruleTester.run('plugin-name-as-code-in-ui', toRuleTesterModule(pluginNameAsCodeInUi), {
  invalid: [
    {
      code: 'new Notice(\'Dataview is not enabled\');',
      errors: [DATAVIEW_ERROR],
      name: 'a notice'
    },
    ...['setName', 'setDesc', 'setText', 'appendText', 'setTitle'].map((methodName) => ({
      code: `setting.${methodName}('Requires Dataview');`,
      errors: [DATAVIEW_ERROR],
      name: `the first argument of ${methodName}`
    })),
    {
      // eslint-disable-next-line no-template-curly-in-string -- The fixture is source code holding a template literal.
      code: 'containerEl.createEl(\'p\', { text: `Requires ${version} of Dataview` });',
      errors: [DATAVIEW_ERROR],
      name: 'a template literal in createEl text'
    },
    {
      code: 'createDiv({ \'text\': \'Dataview\' }); el.createSpan({ text: \'Templater\' });',
      errors: [DATAVIEW_ERROR, { data: { name: 'Templater' }, messageId: MESSAGE_ID }],
      name: 'createDiv and createSpan text, with a string-literal key'
    },
    {
      code: 'new Notice(\'Install \' + \'Dataview\' + suffix);',
      errors: [DATAVIEW_ERROR],
      name: 'a concatenation'
    },
    {
      code: 'new Notice(ok ? \'Dataview ready\' : \'Templater missing\');',
      errors: [DATAVIEW_ERROR, { data: { name: 'Templater' }, messageId: MESSAGE_ID }],
      name: 'both branches of a conditional'
    },
    {
      code: 'new Notice(\'My Plugin loaded\');',
      errors: [{ data: { name: 'My Plugin' }, messageId: MESSAGE_ID }],
      name: 'a name the project adds',
      options: [{ additionalPluginNames: ['My Plugin'] }]
    }
  ],
  valid: [
    {
      code: 'new Notice(\'Dataview is not enabled\');',
      name: 'a name the project excludes',
      options: [{ excludedPluginNames: ['Dataview'] }]
    },
    {
      code: 'this.addCommand({ id: \'x\', name: \'Open Dataview view\' });',
      name: 'a command name, which cannot hold markup'
    },
    {
      code: 'this.addRibbonIcon(\'dice\', \'Open Dataview\', () => {});',
      name: 'a ribbon tooltip, which cannot hold markup'
    },
    {
      code: 'document.title = \'Dataview\';',
      name: 'a window title, which cannot hold markup'
    },
    {
      code: 'setName(\'Dataview\');',
      name: 'a bare function call named like a UI method'
    },
    {
      code: 'setting[\'setName\'](\'Dataview\'); setting[name](\'Dataview\'); getFactory()(\'Dataview\'); class A { #setName(text: string): void { console.log(text); } f(): void { this.#setName(\'Dataview\'); } }',
      name: 'a computed or unnamed callee'
    },
    {
      code: 'new Notice(fragment); new Notice(...args); new Notice(); new window.Notice(\'Dataview\');',
      name: 'a notice without a literal, or another constructor'
    },
    {
      code: 'new Notice(\'Count: \' - 1); new Notice(count > 1); new Notice(42); new Notice(\'Saved\');',
      name: 'expressions that are not text, and text without a name'
    },
    {
      code: 'el.createEl(\'p\', { cls: \'Dataview\', [key]: \'Dataview\', ...rest }, \'Dataview\'); el.createDiv(\'Dataview\');',
      name: 'createEl properties other than a plain text key'
    },
    {
      code: 'el.createEl(\'p\', { 1: \'Dataview\' });',
      name: 'a numeric key'
    },
    {
      code: 'console.log(\'Dataview\');',
      name: 'a call that does not show UI'
    }
  ]
});
