/**
 * @file
 *
 * The per-eval caps the integration-test transports enforce, and the file suffix the
 * `integration-tests:desktop-performance` project collects.
 *
 * They live here, rather than in `vitest-config.ts`, because the `no-over-cap-wait-in-eval-in-obsidian`
 * ESLint rule reads them too, and the shared ESLint config loads that rule in every consuming repo:
 * importing `vitest-config.ts` from the rule would load `vitest/config` at lint time for nothing.
 */

/**
 * The per-eval cap both `obsidian-integration-testing` transports enforce by default, in milliseconds.
 *
 * It restates that package's own `DEFAULT_EVAL_CAP_IN_MILLISECONDS` instead of importing it, because
 * `obsidian-integration-testing` is an OPTIONAL peer: the import made the ESLint rule, and with it the shared
 * ESLint config every plugin lints with, fail to load in a project without the harness installed. A unit test
 * pins the two numbers together, so they cannot drift apart.
 */
export const DEFAULT_EVAL_CAP_IN_MILLISECONDS = 30_000;

/**
 * The per-eval cap the `integration-tests:desktop-performance` project gives its CDP transport, in
 * milliseconds.
 *
 * Every other project keeps the transport's own `DEFAULT_EVAL_CAP_IN_MILLISECONDS` (30 000), and a repo
 * that raises its desktop cap above that is setting a BACKSTOP, not a budget a closure may spend. The
 * performance project is the one exception, and a deliberate one: its whole measurement is one long
 * in-page `Runtime.evaluate` over a vault of tens of thousands of notes, and its files run on no other
 * project. A cross-platform suite gains nothing from any desktop raise, because Appium caps it at
 * 30 000 whatever the desktop project says.
 */
export const PERFORMANCE_EVAL_CAP_IN_MILLISECONDS = 600_000;

/**
 * The file-name suffix of a suite the `integration-tests:desktop-performance` project collects.
 */
export const DESKTOP_PERFORMANCE_TEST_FILE_SUFFIX = '.desktop-performance.integration.test.ts';
