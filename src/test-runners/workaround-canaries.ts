/**
 * @file
 *
 * Runs only the Obsidian workaround canaries: the integration tests whose title starts with `workaround canary`. A red
 * canary means the Obsidian under test fixed a bug a workaround covers, and its title names that workaround, so the
 * workaround can be retired. A plugin's `test:canaries` script calls {@link testWorkaroundCanaries}; see
 * `obsidian-workarounds.ts` for the convention and the `obsidian-dev-toolkit/workaround-canary` ESLint rule.
 */

import type { TestOptions } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

import { WORKAROUND_CANARY_TEST_NAME_PREFIX } from '../obsidian-workarounds.ts';

/**
 * The `vitest` projects the canaries run in by default: the desktop integration suites.
 */
export const DEFAULT_WORKAROUND_CANARY_PROJECTS: readonly string[] = ['integration-tests:desktop'];

/**
 * Options for {@link testWorkaroundCanaries}: the {@link TestOptions} of the run, whose `projects` default to
 * {@link DEFAULT_WORKAROUND_CANARY_PROJECTS}.
 */
export type TestWorkaroundCanariesOptions = TestOptions;

/**
 * Runs only the workaround canaries, appending the canary title filter to the additional arguments.
 *
 * @param options - The {@link TestWorkaroundCanariesOptions}.
 * @returns A promise that resolves when the run passes.
 */
export async function testWorkaroundCanaries(options: TestWorkaroundCanariesOptions = {}): Promise<void> {
  await test({
    additionalArguments: [...(options.additionalArguments ?? []), '--testNamePattern', WORKAROUND_CANARY_TEST_NAME_PREFIX],
    projects: options.projects ?? [...DEFAULT_WORKAROUND_CANARY_PROJECTS]
  });
}
