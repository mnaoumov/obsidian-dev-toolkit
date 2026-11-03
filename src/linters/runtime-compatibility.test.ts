/**
 * @file
 *
 * Runtime compatibility checks against real JavaScript snippets.
 */

import {
  ESLint,
  Linter
} from 'eslint';
import {
  describe,
  expect,
  it
} from 'vitest';

import { defineEslintConfigs } from './eslint-config.ts';
import { getRuntimeCompatibilityConfig } from './runtime-compatibility.ts';

// Resolving the full type-aware configuration can take longer on a one-core bulk worker.
const CONFIG_TIMEOUT_IN_MILLISECONDS = 60_000;

describe('runtime compatibility', () => {
  it('checks shipped source and exempts tests and development scripts', async () => {
    const eslint = new ESLint({ overrideConfig: defineEslintConfigs(), overrideConfigFile: true });
    const sourceConfig: unknown = await eslint.calculateConfigForFile('src/main.ts');
    const testConfig: unknown = await eslint.calculateConfigForFile('src/main.test.ts');
    const scriptConfig: unknown = await eslint.calculateConfigForFile('scripts/build.ts');
    expect(sourceConfig).toHaveProperty(['rules', 'es-x/no-promise-withresolvers'], [2]);
    expect(sourceConfig).toHaveProperty(['rules', 'n/no-unsupported-features/es-builtins', '0'], 0);
    expect(testConfig).not.toHaveProperty(['rules', 'es-x/no-promise-withresolvers']);
    expect(scriptConfig).not.toHaveProperty(['rules', 'es-x/no-promise-withresolvers']);
  }, CONFIG_TIMEOUT_IN_MILLISECONDS);
  it.each([
    ['Array.fromAsync([])', 'es-x/no-array-fromasync'],
    ['Promise.withResolvers()', 'es-x/no-promise-withresolvers'],
    ['new Set().union(new Set())', 'es-x/no-set-prototype-union'],
    ['Iterator.from([]).map(x => x)', 'es-x/no-iterator'],
    ['[].findLast(x => x)', 'es-x/no-array-prototype-findlast-findlastindex'],
    ['new Uint8Array().findLastIndex(x => x)', 'es-x/no-array-prototype-findlast-findlastindex']
  ])('reports unavailable builtins in %s', (code, ruleId) => {
    expect(new Linter().verify(code, getRuntimeCompatibilityConfig()).map((message) => message.ruleId)).toContain(ruleId);
  });

  it('leaves supported features and Obsidian polyfills to the API rule', () => {
    expect(new Linter().verify('[].findLastIndex(x => x); Object.hasOwn({}, "x");', getRuntimeCompatibilityConfig())).toEqual([]);
  });

  it('uses the selected floor', () => {
    expect(new Linter().verify('[].toSorted()', getRuntimeCompatibilityConfig('es2023'))).toEqual([]);
    expect(new Linter().verify('[].toSorted()', getRuntimeCompatibilityConfig()).map((message) => message.ruleId)).toContain('es-x/no-array-prototype-tosorted');
  });

  it('leaves syntax lowering to the bundler', () => {
    expect(new Linter().verify('using resource = acquire(); class Example { field = 1_000; } let value = 0; value ||= 1;', getRuntimeCompatibilityConfig('es2020'))).toEqual([]);
  });
});
