/**
 * @file
 *
 * Checks of the Obsidian layer's rule settings in the resolved `ESLint` configuration.
 */

import { ESLint } from 'eslint';
import {
  describe,
  expect,
  it
} from 'vitest';

import { defineEslintConfigs } from './eslint-config.ts';

// Resolving the full type-aware configuration can take longer on a one-core bulk worker.
const CONFIG_TIMEOUT_IN_MILLISECONDS = 60_000;

describe('defineEslintConfigs', () => {
  it.each(['src/main.ts', 'src/main.test.ts', 'scripts/build.ts'])('names registerDisposable in no-direct-dispose-call reports for %s', async (filePath) => {
    const eslint = new ESLint({ overrideConfig: defineEslintConfigs(), overrideConfigFile: true });
    const config: unknown = await eslint.calculateConfigForFile(filePath);
    expect(config).toHaveProperty(['rules', 'typescript-dev-toolkit/no-direct-dispose-call'], [2, { registerHelperName: 'registerDisposable' }]);
  }, CONFIG_TIMEOUT_IN_MILLISECONDS);
});
