/**
 * @file
 *
 * End-to-end tests with `obsidian-test`: it bundles the plugin together with the test files, installs it into a
 * temporary vault, launches the installed Obsidian and runs the tests inside it with `node:test`.
 *
 * {@link testEndToEndWithObsidianTest} is the `test:e2e` script.
 */

import { execFromRoot } from '@mnaoumov/typescript-dev-toolkit/root';

import {
  assertProjectPackagesInstalled,
  DEFAULT_END_TO_END_SPECS
} from './e2e-runner-support.ts';

/**
 * Options for {@link testEndToEndWithObsidianTest}.
 */
export interface TestEndToEndWithObsidianTestOptions {
  /**
   * The command that launches Obsidian. Defaults to `obsidian-test`'s own, `obsidian`; point it at the executable
   * when `obsidian` is not on `PATH`.
   */
  readonly obsidianCommand?: string;

  /**
   * Whether `obsidian-test` may replay its cached results when the plugin, the tests and Obsidian are unchanged.
   * Defaults to `true`; `false` passes `--force`.
   */
  readonly shouldUseCache?: boolean;

  /**
   * The glob of the test files, relative to the project root. Defaults to {@link DEFAULT_END_TO_END_SPECS}.
   * `obsidian-test`'s own default also matches every `*.test.ts`, which would bundle the unit tests into Obsidian.
   */
  readonly testPattern?: string;

  /**
   * The vault to run in, relative to the project root. `obsidian-test` installs the plugin INTO it, so it must be a
   * scratch vault, never the demo vault. Defaults to a temporary vault.
   */
  readonly vaultPath?: string;
}

/**
 * Runs the end-to-end tests with `obsidian-test`. It is the body of a plugin's `test:e2e` script.
 *
 * @param options - The {@link TestEndToEndWithObsidianTestOptions}.
 * @returns A {@link Promise} that resolves once the tests pass.
 * @throws When `obsidian-test` is missing or a test fails.
 */
export async function testEndToEndWithObsidianTest(options: TestEndToEndWithObsidianTestOptions = {}): Promise<void> {
  assertProjectPackagesInstalled({ packageNames: ['obsidian-test'], requester: 'testEndToEndWithObsidianTest()' });
  await execFromRoot([
    'obsidian-test',
    '--testPattern',
    options.testPattern ?? DEFAULT_END_TO_END_SPECS,
    ...options.vaultPath === undefined ? [] : ['--vault-path', options.vaultPath],
    ...options.obsidianCommand === undefined ? [] : ['--obsidian-cmd', options.obsidianCommand],
    ...options.shouldUseCache ?? true ? [] : ['--force']
  ], { isInteractive: true });
}
