import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import dedent from 'dedent';
import {
  afterAll,
  describe,
  it,
  vi
} from 'vitest';

import {
  MESSAGE_ID,
  noLocalObsidianInternals
} from './no-local-obsidian-internals.ts';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const TYPE_CHECK_TIMEOUT_IN_MILLISECONDS = 60_000;

vi.setConfig({ testTimeout: TYPE_CHECK_TIMEOUT_IN_MILLISECONDS });

const ruleTester = new RuleTester();

const typedRuleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts'],
        defaultProject: 'tsconfig.eslint-test.json'
      }
    }
  }
});

typedRuleTester.run('no-local-obsidian-internals (type-aware)', toRuleTesterModule(noLocalObsidianInternals), {
  invalid: [
    {
      code: 'type MyEventName = string; declare module \'obsidian\' { interface Workspace { on(name: MyEventName, callback: () => void): void; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event overload whose name is an alias of string'
    },
    {
      code: 'type MyEventName = \'a\' | 42; declare module \'obsidian\' { interface Workspace { on(name: MyEventName, callback: () => void): void; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event overload whose name is an alias of a union with a non-string member'
    }
  ],
  valid: [
    {
      code: 'type MyEventName = \'a\' | \'b\'; declare module \'obsidian\' { interface Workspace { on(name: MyEventName, callback: () => void): void; } }',
      name: 'an event overload whose name is an alias of a string-literal union'
    },
    {
      code: 'const MY_EVENT = \'a\'; declare module \'obsidian\' { interface Workspace { trigger(name: typeof MY_EVENT): void; } }',
      name: 'an event overload whose name is the type of a string constant'
    }
  ]
});

ruleTester.run('no-local-obsidian-internals', toRuleTesterModule(noLocalObsidianInternals), {
  invalid: [
    {
      code: 'declare module \'obsidian\' { interface MetadataCache { updateRelatedLinks(names: string[]): void; } }',
      errors: [{ data: { name: 'updateRelatedLinks' }, messageId: MESSAGE_ID }],
      name: 'an internal method added to an Obsidian class'
    },
    {
      code: 'declare module \'obsidian\' { interface View { backlink?: unknown; outgoingLink?: unknown; } }',
      errors: [{ data: { name: 'backlink' }, messageId: MESSAGE_ID }, { data: { name: 'outgoingLink' }, messageId: MESSAGE_ID }],
      name: 'each internal property reported on its own'
    },
    {
      code: 'declare module \'obsidian\' { export interface App { \'plugins\': unknown; } }',
      errors: [{ data: { name: 'plugins' }, messageId: MESSAGE_ID }],
      name: 'an exported interface, with a string-literal key'
    },
    {
      code: 'declare module \'obsidian\' { interface App extends Internals {} }',
      errors: [{ data: { name: 'extends Internals' }, messageId: MESSAGE_ID }],
      name: 'an extends clause, which bolts members on'
    },
    {
      code: 'declare module \'obsidian\' { interface App extends internals.App {} }',
      errors: [{ data: { name: 'extends' }, messageId: MESSAGE_ID }],
      name: 'an extends clause naming a qualified type'
    },
    {
      code: 'declare module \'obsidian\' { interface App { [key: string]: unknown; } }',
      errors: [{ data: { name: 'TSIndexSignature' }, messageId: MESSAGE_ID }],
      name: 'an index signature'
    },
    {
      code: 'declare module \'obsidian\' { interface App { [Symbol.iterator](): void; } }',
      errors: [{ data: { name: 'TSMethodSignature' }, messageId: MESSAGE_ID }],
      name: 'a computed method key'
    },
    {
      code: 'declare module \'obsidian\' { class InternalView {} function internalHelper(): void; type InternalShape = string; enum InternalKind { A } namespace Inner {} }',
      errors: [
        { data: { name: 'InternalView' }, messageId: MESSAGE_ID },
        { data: { name: 'internalHelper' }, messageId: MESSAGE_ID },
        { data: { name: 'InternalShape' }, messageId: MESSAGE_ID },
        { data: { name: 'InternalKind' }, messageId: MESSAGE_ID },
        { data: { name: 'Inner' }, messageId: MESSAGE_ID }
      ],
      name: 'a declaration that is not an interface, reported whole'
    },
    {
      code: 'declare module \'obsidian\' { namespace Outer.Inner {} }',
      errors: [{ data: { name: 'TSModuleDeclaration' }, messageId: MESSAGE_ID }],
      name: 'a namespace with a dotted name'
    },
    {
      code: 'declare module \'obsidian\' { const internalValue: string; }',
      errors: [{ data: { name: 'VariableDeclaration' }, messageId: MESSAGE_ID }],
      name: 'a variable declaration'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace { on(name: string, callback: () => void): EventRef; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event overload whose name is a plain string, which is not a custom event'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace { on(name: \'a\' | string, callback: () => void): EventRef; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event overload whose union admits any string'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace { on(name: MyEventName, callback: () => void): EventRef; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event overload whose name is an alias, linted without type information'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace { on(name: 42, callback: () => void): EventRef; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event overload whose name is a number literal'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace { on(...args: [\'a\']): EventRef; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event overload whose first parameter is a rest parameter'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace { on(name): EventRef; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event overload whose first parameter is untyped'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace { on(): EventRef; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event overload with no parameter'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace { on: (name: \'a\') => EventRef; } }',
      errors: [{ data: { name: 'on' }, messageId: MESSAGE_ID }],
      name: 'an event property rather than a method overload'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace { on(name: \'my-event\', callback: () => void): EventRef; getInternal(): void; } }',
      errors: [{ data: { name: 'getInternal' }, messageId: MESSAGE_ID }],
      name: 'an internal member beside an exempt custom-event overload'
    }
  ],
  valid: [
    {
      code: 'declare module \'obsidian\' { interface Workspace { on(name: \'my-event\', callback: () => void): EventRef; } }',
      name: 'a custom-event `on` overload'
    },
    {
      code: dedent`
        declare module 'obsidian' {
          interface Workspace {
            off(name: 'a' | 'b', callback: () => void): void;
            trigger(name: 'a'): void;
            tryTrigger(name: 'a', args: unknown[]): void;
            'on'(name: 'a'): EventRef;
          }
        }
      `,
      name: 'every custom-event method, with a union of string literals'
    },
    {
      code: 'declare module \'obsidian\' { interface Workspace {} }',
      name: 'an empty augmentation, which adds nothing'
    },
    {
      code: 'declare module \'obsidian-typings\' { interface PluginsPluginsRecord { templater: unknown; } }',
      name: 'the obsidian-typings extension point for third-party plugin types'
    },
    {
      code: 'declare module \'@obsidian-typings/implementations\' { interface App { internal: unknown; } }',
      name: 'any other module'
    },
    {
      code: 'declare module \'obsidian\';',
      name: 'a shorthand ambient module, which has no body'
    },
    {
      code: 'declare namespace obsidian { const internalValue: string; }',
      name: 'a namespace whose name is an identifier rather than a module string'
    },
    {
      code: 'interface MetadataCache { updateRelatedLinks(names: string[]): void; }',
      name: 'a local interface outside any augmentation'
    }
  ]
});
