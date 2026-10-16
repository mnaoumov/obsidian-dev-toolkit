/**
 * @file
 *
 * Shared jest configuration for Obsidian plugins: {@link defineObsidianPluginJestConfig}, the jest counterpart of
 * `defineObsidianPluginVitestConfig`'s `unit-tests` project.
 *
 * It is the generic `defineJestConfig` from `@mnaoumov/typescript-dev-toolkit` plus what a plugin's unit tests need on
 * top: the `jsdom` environment, `obsidian` resolved onto `obsidian-test-mocks` (the `obsidian` npm package carries
 * types only), the two per-test setup files, and the integration tests left to their own runner. A plugin runs it with
 * `test` / `testCoverage` / `testWatch` from `@mnaoumov/typescript-dev-toolkit/test-runners/auto`, which picks jest
 * whenever a jest configuration file exists.
 */

import type { DefineJestConfigOptions } from '@mnaoumov/typescript-dev-toolkit/test-runners/jest-config';
import type { Config } from 'jest';

import {
  DEFAULT_JEST_TEST_PATH_IGNORE_PATTERNS,
  defineJestConfig
} from '@mnaoumov/typescript-dev-toolkit/test-runners/jest-config';

/**
 * Resolves `obsidian` onto the mocks, as the vitest configuration's `obsidian` alias does.
 */
export const OBSIDIAN_JEST_MODULE_NAME_MAPPER: Readonly<Record<string, string>> = {
  '^obsidian$': 'obsidian-test-mocks/obsidian'
};

/**
 * The per-test setup files, in the order the vitest configuration loads them: the mocks' globals and mocked `app`
 * first, then this package's reset of the shared state before each test.
 *
 * They go in `setupFilesAfterEnv`, not `setupFiles`, because this package's setup registers `beforeEach` and
 * `afterEach` hooks, which exist only once the test framework is installed.
 */
export const OBSIDIAN_JEST_SETUP_FILES_AFTER_ENV: readonly string[] = [
  'obsidian-test-mocks/jest-setup',
  '@mnaoumov/obsidian-dev-toolkit/jest-setup'
];

/**
 * The integration tests, which run in a real Obsidian through `obsidian-integration-testing` and never under jest.
 */
export const OBSIDIAN_JEST_INTEGRATION_TEST_PATH_IGNORE_PATTERN = String.raw`\.integration\.test\.ts$`;

/**
 * Options for {@link defineObsidianPluginJestConfig}: the same ones `defineJestConfig` takes.
 */
export type DefineObsidianPluginJestConfigOptions = DefineJestConfigOptions;

/**
 * Defines an Obsidian plugin's jest configuration.
 *
 * On top of `defineJestConfig`'s defaults: the `jsdom` environment (the mocks' setup writes to `Document.prototype`,
 * `Element.prototype` and `window`), `obsidian` mapped onto `obsidian-test-mocks/obsidian`, the
 * {@link OBSIDIAN_JEST_SETUP_FILES_AFTER_ENV} setup files and `*.integration.test.ts` left out. Every jest option in
 * `options` replaces its default, except `moduleNameMapper`, whose entries are added to the `obsidian` one, and
 * `setupFilesAfterEnv` and `testPathIgnorePatterns`, whose entries are appended to this function's own.
 *
 * The `jsdom` environment needs `jest-environment-jsdom` installed beside `jest` and `ts-jest`.
 *
 * @param options - The configuration options, the same `defineJestConfig` takes.
 * @returns The jest configuration.
 */
export function defineObsidianPluginJestConfig(options: DefineObsidianPluginJestConfigOptions = {}): Config {
  const { moduleNameMapper, setupFilesAfterEnv = [], testPathIgnorePatterns = [], ...overrides } = options;

  return defineJestConfig({
    testEnvironment: 'jsdom',
    ...overrides,
    moduleNameMapper: {
      ...OBSIDIAN_JEST_MODULE_NAME_MAPPER,
      ...moduleNameMapper
    },
    setupFilesAfterEnv: [...OBSIDIAN_JEST_SETUP_FILES_AFTER_ENV, ...setupFilesAfterEnv],
    testPathIgnorePatterns: [
      ...DEFAULT_JEST_TEST_PATH_IGNORE_PATTERNS,
      OBSIDIAN_JEST_INTEGRATION_TEST_PATH_IGNORE_PATTERN,
      ...testPathIgnorePatterns
    ]
  });
}
