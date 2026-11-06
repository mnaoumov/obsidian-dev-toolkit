import { RuleTester } from 'eslint';
import {
  describe,
  it
} from 'vitest';

import { jsonPlugin } from './manifest-helpers.ts';
import {
  manifestName,
  MESSAGE_ID_INVALID_CHARACTERS
} from './manifest-name.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  language: 'json/json',
  plugins: { json: jsonPlugin }
});

ruleTester.run('manifest-name', manifestName, {
  invalid: [
    {
      code: '{ "name": "Snowman ☃" }',
      errors: [{ messageId: MESSAGE_ID_INVALID_CHARACTERS }],
      name: 'holds a character outside Basic Latin'
    },
    {
      code: '{ "name": "Backlink: Full Path" }',
      errors: [{ messageId: MESSAGE_ID_INVALID_CHARACTERS }],
      name: 'holds punctuation the rule does not permit'
    }
  ],
  valid: [
    {
      code: '{ "name": "Advanced Note Composer" }',
      name: 'Basic Latin words'
    },
    {
      code: '{ "name": "Fix Tab Size (Extended) + More - Now" }',
      name: 'the three permitted punctuation marks'
    },
    {
      code: '{ "name": "Obsidian Tools" }',
      name: 'contains Obsidian, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "name": "Sample Plugin Extended" }',
      name: 'contains Plugin, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "id": "no-name-here" }',
      name: 'no name at all, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "name": 1 }',
      name: 'a non-string name, whose type obsidianmd/validate-manifest reports instead'
    },
    {
      code: '[]',
      name: 'a top-level value that is not an object'
    }
  ]
});
