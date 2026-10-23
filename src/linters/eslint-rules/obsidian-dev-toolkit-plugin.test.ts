import { genericInHouseEslintRules } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/in-house-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  OBSIDIAN_DEV_TOOLKIT_ESLINT_PLUGIN_NAME,
  obsidianDevToolkitPlugin
} from './obsidian-dev-toolkit-plugin.ts';

describe('obsidianDevToolkitPlugin', () => {
  it('should be registered under the package name', () => {
    expect(OBSIDIAN_DEV_TOOLKIT_ESLINT_PLUGIN_NAME).toBe('obsidian-dev-toolkit');
  });

  it('should carry the Obsidian rules alone', () => {
    expect(Object.keys(obsidianDevToolkitPlugin.rules ?? {}).sort()).toEqual([
      'manifest-description',
      'manifest-id',
      'manifest-name',
      'manifest-schema',
      'no-bare-code-element',
      'no-local-obsidian-internals',
      'no-over-cap-wait-in-eval-in-obsidian',
      'no-untrusted-input-events',
      'plugin-name-as-code',
      'plugin-name-as-code-in-ui',
      'require-component-suffix',
      'require-plugin-api-contract-schemas'
    ]);
  });

  it('should not carry any generic rule', () => {
    for (const ruleName of Object.keys(genericInHouseEslintRules)) {
      expect(obsidianDevToolkitPlugin.rules?.[ruleName]).toBeUndefined();
    }
  });
});
