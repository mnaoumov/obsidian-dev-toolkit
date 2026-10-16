import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import {
  afterAll,
  describe,
  it
} from 'vitest';

import {
  MESSAGE_ID,
  requirePluginApiContractSchemas
} from './require-plugin-api-contract-schemas.ts';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

const MISSING_BOTH = '`input` and `output`';

ruleTester.run('require-plugin-api-contract-schemas', toRuleTesterModule(requirePluginApiContractSchemas), {
  invalid: [
    {
      code: 'const contract: PluginApiContract = { foo: {} };',
      errors: [{ data: { method: 'foo', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'an empty entry in a variable typed PluginApiContract'
    },
    {
      code: 'const contract: PluginApiContract<MyApi> = { foo: { input: a }, bar: { output: b } };',
      errors: [
        { data: { method: 'foo', missing: '`output`' }, messageId: MESSAGE_ID },
        { data: { method: 'bar', missing: '`input`' }, messageId: MESSAGE_ID }
      ],
      name: 'entries each lacking one schema'
    },
    {
      code: 'const contract: lib.TypedPluginApiContract<MyApi> = { \'foo\': { input: a } };',
      errors: [{ data: { method: 'foo', missing: '`output`' }, messageId: MESSAGE_ID }],
      name: 'a contract type reached through a namespace, with a string key'
    },
    {
      code: 'export const MY_API_CONTRACT = { foo: {} };',
      errors: [{ data: { method: 'foo', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'a variable named *_API_CONTRACT'
    },
    {
      code: 'const MY_API_CONTRACT_V2 = { foo: {} } as const;',
      errors: [{ data: { method: 'foo', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'a versioned *_API_CONTRACT_V<n> variable, with as const'
    },
    {
      code: 'publishPluginApi({ api, apiVersion: \'1.0.0\', contract: { foo: {} }, plugin: this });',
      errors: [{ data: { method: 'foo', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'an inline contract property'
    },
    {
      code: 'const shared = { input: a }; watchPluginApi({ contract: { foo: shared, bar: shared } });',
      errors: [
        { data: { method: 'foo', missing: '`output`' }, messageId: MESSAGE_ID },
        { data: { method: 'bar', missing: '`output`' }, messageId: MESSAGE_ID }
      ],
      name: 'an entry shared through a constant, reported per entry'
    },
    {
      code: 'const c = { foo: {} }; findPluginApi({ contract: c });',
      errors: [{ data: { method: 'foo', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'a contract property naming a constant'
    },
    {
      code: 'const X_API_CONTRACT = { foo: {} }; findPluginApi({ contract: X_API_CONTRACT });',
      errors: [{ data: { method: 'foo', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'one contract reached two ways, reported once'
    },
    {
      code: 'const c = { foo: {} } satisfies PluginApiContract;',
      errors: [{ data: { method: 'foo', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'satisfies PluginApiContract'
    },
    {
      code: 'const c = { foo: {} as Entry } as PluginApiContract;',
      errors: [{ data: { method: 'foo', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'as PluginApiContract, with a cast entry'
    },
    {
      code: 'const c: PluginApiContract = { [key]: {}, foo: { input: a, output: b, [other]: c } };',
      errors: [{ data: { method: '[computed]', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'a computed entry key, and a computed member beside both schemas'
    },
    {
      code: 'const c: PluginApiContract = { 1: { input: a } };',
      errors: [{ data: { method: '[computed]', missing: '`output`' }, messageId: MESSAGE_ID }],
      name: 'a numeric entry key'
    },
    {
      code: 'const c: PluginApiContract = { foo: entry! }; const entry = {};',
      errors: [{ data: { method: 'foo', missing: MISSING_BOTH }, messageId: MESSAGE_ID }],
      name: 'a non-null asserted entry'
    }
  ],
  valid: [
    {
      code: 'const contract: PluginApiContract<MyApi> = { foo: { input: a, output: b }, \'bar\': { \'input\': a, \'output\': b } };',
      name: 'every entry with both schemas'
    },
    {
      code: 'const c: PluginApiContract = { ...base, foo: { ...shared }, bar: makeEntry(), baz: imported };',
      name: 'a spread, a call and an import, which cannot be read statically'
    },
    {
      code: 'let entry = {}; const c: PluginApiContract = { foo: entry };',
      name: 'an entry naming a let, which may change'
    },
    {
      code: 'function f(entry) { const c: PluginApiContract = { foo: entry }; }',
      name: 'an entry naming a parameter'
    },
    {
      code: 'const c: PluginApiContract = { foo: A }; const A = B; const B = A;',
      name: 'a cycle of constants'
    },
    {
      code: 'const c: PluginApiContract = makeContract();',
      name: 'a contract built by a call'
    },
    {
      code: 'const settings: Settings = { foo: {} }; const options = { foo: {} } satisfies Options; const x = { foo: {} } as unknown;',
      name: 'an object literal that is not a contract'
    },
    {
      code: 'const API_CONTRACT_NAME = \'x\'; let contract; const [MY_API_CONTRACT] = list; const { a } = { a: {} };',
      name: 'declarators that hold no contract'
    },
    {
      code: 'const c: Array<PluginApiContract> = [{ foo: {} }]; const d: string = \'\';',
      name: 'a contract type that is not the declared type itself'
    },
    {
      code: 'class C { contract = { foo: {} }; } const o = { [\'contract\']: { foo: {} } }; const p = { [contract]: { foo: {} } };',
      name: 'a class field and computed contract keys'
    },
    {
      code: 'const { contract = { foo: {} } } = options;',
      name: 'a contract property in a destructuring pattern'
    }
  ]
});
