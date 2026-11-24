import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import {
  afterAll,
  describe,
  it
} from 'vitest';

import {
  MESSAGE_ID,
  noSplitSentenceLocaleKeys
} from './no-split-sentence-locale-keys.ts';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-split-sentence-locale-keys', toRuleTesterModule(noSplitSentenceLocaleKeys), {
  invalid: [
    {
      code: 'export const en = { modal: { part1: \'Attachment \', part2: \' is used by several notes.\' } };',
      errors: [
        { data: { keyName: 'part1' }, messageId: MESSAGE_ID },
        { data: { keyName: 'part2' }, messageId: MESSAGE_ID }
      ],
      name: 'identifier keys in a nested group'
    },
    {
      code: 'export const fr = { \'part1\': \'File \', "part12": \'.\' };',
      errors: [
        { data: { keyName: 'part1' }, messageId: MESSAGE_ID },
        { data: { keyName: 'part12' }, messageId: MESSAGE_ID }
      ],
      name: 'string literal keys'
    }
  ],
  valid: [
    {
      code: 'export const en = { modal: { content: \'Attachment {{path}} is used by several notes.\' } };',
      name: 'one sentence with a placeholder'
    },
    {
      code: 'export const en = { part: \'x\', partA: \'x\', part1Title: \'x\', apart1: \'x\', Part1: \'x\', 1: \'x\' };',
      name: 'keys that only look alike'
    },
    {
      code: 'const key = \'part1\'; export const en = { [key]: \'x\', [\'part2\']: \'x\' };',
      name: 'computed keys'
    },
    {
      code: 'const { part1 } = parts; class Fragments { part1 = \'x\'; }',
      name: 'a destructuring pattern and a class field'
    }
  ]
});
