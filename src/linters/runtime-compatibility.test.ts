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

import type { ObsidianRuntimeFloor } from '../obsidian-runtime.ts';

import { defineEslintConfigs } from './eslint-config.ts';
import {
  getRuntimeCompatibilityConfig,
  getRuntimeDependentRuleOverrides,
  RUNTIME_DEPENDENT_RULES
} from './runtime-compatibility.ts';

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

  describe('rules whose advice the floor forbids', () => {
    const FLOORS: readonly ObsidianRuntimeFloor[] = ['es2020', 'es2021', 'es2022', 'es2023', 'es2024'];

    it.each(Object.entries(RUNTIME_DEPENDENT_RULES))('%s gives way exactly where es-x forbids its advice', (ruleId, rule) => {
      for (const floor of FLOORS) {
        const isForbidden = new Linter().verify(rule.api, getRuntimeCompatibilityConfig(floor)).some((message) => (message.ruleId ?? '').startsWith('es-x/'));
        expect(isForbidden, `${rule.api} at ${floor}`).toBe(floor < rule.edition);
        expect(getRuntimeDependentRuleOverrides(floor)[ruleId] !== undefined, `${ruleId} override at ${floor}`).toBe(isForbidden);
      }
    });

    it('defaults to the default floor', () => {
      expect(getRuntimeDependentRuleOverrides()).toEqual(getRuntimeDependentRuleOverrides('es2022'));
      expect(getRuntimeDependentRuleOverrides()).toHaveProperty(['unicorn/prefer-group-by'], 'off');
      expect(getRuntimeDependentRuleOverrides('es2024')).not.toHaveProperty(['unicorn/prefer-group-by']);
    });

    it('applies to shipped source in the shared configuration only', async () => {
      const eslint = new ESLint({ overrideConfig: defineEslintConfigs(), overrideConfigFile: true });
      const sourceConfig: unknown = await eslint.calculateConfigForFile('src/main.ts');
      const testConfig: unknown = await eslint.calculateConfigForFile('src/main.test.ts');
      for (const ruleId of Object.keys(RUNTIME_DEPENDENT_RULES)) {
        // Each listed rule is one the shared configuration enables, so the list cannot go stale unnoticed.
        expect(testConfig, ruleId).toHaveProperty(['rules', ruleId, '0'], 2);
      }
      expect(sourceConfig).toHaveProperty(['rules', 'unicorn/prefer-group-by', '0'], 0);
      expect(sourceConfig).toHaveProperty(['rules', 'unicorn/no-array-splice', '0'], 0);
      expect(sourceConfig).toHaveProperty(['rules', 'unicorn/prefer-array-find'], [2, { checkFromLast: false }]);

      const es2024Eslint = new ESLint({ overrideConfig: defineEslintConfigs({ runtimeFloor: 'es2024' }), overrideConfigFile: true });
      const es2024SourceConfig: unknown = await es2024Eslint.calculateConfigForFile('src/main.ts');
      expect(es2024SourceConfig).toHaveProperty(['rules', 'unicorn/prefer-group-by', '0'], 2);
      expect(es2024SourceConfig).toHaveProperty(['rules', 'unicorn/prefer-promise-try', '0'], 0);
    }, CONFIG_TIMEOUT_IN_MILLISECONDS);
  });
});
