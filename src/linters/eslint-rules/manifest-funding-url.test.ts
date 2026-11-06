import { RuleTester } from 'eslint';
import {
  describe,
  it
} from 'vitest';

import {
  manifestFundingUrl,
  MESSAGE_ID_EMPTY_FUNDING_URL
} from './manifest-funding-url.ts';
import { jsonPlugin } from './manifest-helpers.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  language: 'json/json',
  plugins: { json: jsonPlugin }
});

ruleTester.run('manifest-funding-url', manifestFundingUrl, {
  invalid: [
    {
      code: '{ "fundingUrl": "" }',
      errors: [{ messageId: MESSAGE_ID_EMPTY_FUNDING_URL }],
      name: 'an empty fundingUrl string'
    },
    {
      code: '{ "fundingUrl": {} }',
      errors: [{ messageId: MESSAGE_ID_EMPTY_FUNDING_URL }],
      name: 'an empty fundingUrl object'
    },
    {
      code: '{ "fundingUrl": { "Buy Me a Coffee": "", "Ko-fi": "https://ko-fi.com/x", "PayPal": "" } }',
      errors: [
        { messageId: MESSAGE_ID_EMPTY_FUNDING_URL },
        { messageId: MESSAGE_ID_EMPTY_FUNDING_URL }
      ],
      name: 'empty strings inside a fundingUrl object'
    }
  ],
  valid: [
    {
      code: '{ "fundingUrl": "https://www.buymeacoffee.com/mnaoumov" }',
      name: 'a fundingUrl string'
    },
    {
      code: '{ "fundingUrl": { "Buy Me a Coffee": "https://www.buymeacoffee.com/mnaoumov" } }',
      name: 'a fundingUrl object of string values'
    },
    {
      code: '{ "fundingUrl": { "Buy Me a Coffee": 1 } }',
      name: 'a non-string value inside a fundingUrl object, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "fundingUrl": 1 }',
      name: 'a fundingUrl of the wrong type, which obsidianmd/validate-manifest reports instead'
    },
    {
      code: '{ "id": "no-funding-url" }',
      name: 'no fundingUrl at all'
    },
    {
      code: '[]',
      name: 'a top-level value that is not an object'
    }
  ]
});
