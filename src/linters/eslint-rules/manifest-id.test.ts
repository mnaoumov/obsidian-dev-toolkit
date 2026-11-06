import { RuleTester } from 'eslint';
import {
  describe,
  it
} from 'vitest';

import { jsonPlugin } from './manifest-helpers.ts';
import {
  manifestId,
  MESSAGE_ID_INVALID_CHARACTERS
} from './manifest-id.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  language: 'json/json',
  plugins: { json: jsonPlugin }
});

ruleTester.run('manifest-id', manifestId, {
  invalid: [
    {
      code: '{ "id": "Advanced_Exclude" }',
      errors: [{ messageId: MESSAGE_ID_INVALID_CHARACTERS }],
      name: 'uppercase letters and underscores'
    }
  ],
  valid: [
    {
      code: '{ "id": "advanced-note-composer" }',
      name: 'lowercase letters and hyphens'
    },
    {
      code: '{ "id": "obsidian-custom-attachment-location" }',
      name: 'contains obsidian, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "id": "smart-rename-plugin" }',
      name: 'ends with plugin, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "name": "No Id Here" }',
      name: 'no id at all, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "id": 1 }',
      name: 'a non-string id, whose type obsidianmd/validate-manifest reports instead'
    },
    {
      code: '[]',
      name: 'a top-level value that is not an object'
    }
  ]
});
