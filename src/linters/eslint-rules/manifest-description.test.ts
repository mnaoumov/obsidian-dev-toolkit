import { RuleTester } from 'eslint';
import {
  describe,
  it
} from 'vitest';

import {
  manifestDescription,
  MESSAGE_ID_MISSING_PERIOD,
  MESSAGE_ID_NOT_CAPITALIZED,
  MESSAGE_ID_SELF_REFERENCE
} from './manifest-description.ts';
import { jsonPlugin } from './manifest-helpers.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  language: 'json/json',
  plugins: { json: jsonPlugin }
});

ruleTester.run('manifest-description', manifestDescription, {
  invalid: [
    {
      code: '{ "description": "Plugin for renaming notes." }',
      errors: [{ messageId: MESSAGE_ID_SELF_REFERENCE }],
      name: 'opens with `plugin`, which upstream does not catch'
    },
    {
      code: '{ "description": "Renames notes, this is a plugin." }',
      errors: [{ messageId: MESSAGE_ID_SELF_REFERENCE }],
      name: '`this is a plugin` with nothing after it, which upstream does not catch'
    },
    {
      code: '{ "description": "renames notes keeping the previous title." }',
      errors: [{ messageId: MESSAGE_ID_NOT_CAPITALIZED }],
      name: 'does not start with a capital letter'
    },
    {
      code: '{ "description": "Renames notes keeping the previous title!" }',
      errors: [{ messageId: MESSAGE_ID_MISSING_PERIOD }],
      name: 'ends with an exclamation mark'
    },
    {
      code: '{ "description": "Renames notes keeping the previous title? " }',
      errors: [{ messageId: MESSAGE_ID_MISSING_PERIOD }],
      name: 'ends with a question mark and a space'
    }
  ],
  valid: [
    {
      code: '{ "description": "Renames notes keeping the previous title in existing links." }',
      name: 'an action verb, a period, and no self-reference'
    },
    {
      code: '{ "description": "This plugin ensures the consistency of attachments and links." }',
      name: '`this plugin`, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "description": "A plugin that renames notes." }',
      name: '`a plugin that`, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "description": "The plugin renames notes." }',
      name: '`the plugin`, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "description": "Renames notes keeping the previous title" }',
      name: 'no ending punctuation, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "description": "Enhances the Obsidian debugging experience." }',
      name: 'the word Obsidian, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "description": "Enhances Note composer core plugin." }',
      name: 'names another plugin, which is not self-reference'
    },
    {
      code: '{ "description": "Notifies you about new app releases — not plugin updates — even when auto-update is off." }',
      name: 'mentions plugin updates, which is not self-reference'
    },
    {
      code: '{ "id": "no-description-here" }',
      name: 'no description at all, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "description": 1 }',
      name: 'a non-string description, whose type obsidianmd/validate-manifest reports instead'
    },
    {
      code: '[]',
      name: 'a top-level value that is not an object'
    }
  ]
});
