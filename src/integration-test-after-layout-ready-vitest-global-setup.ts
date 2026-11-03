/**
 * @file
 *
 * The twin of `integration-test-vitest-global-setup` that enables the plugin under test once the vault's layout is
 * ready instead of during startup (`pluginEnableTiming: 'after-layout-ready'`). It still seeds and enables the
 * `@mnaoumov/obsidian-dev-toolkit` integration-test harness plugin, so `lib.<helper>` works inside `evalInObsidian`
 * closures.
 *
 * `defineObsidianPluginVitestConfig` puts it in the `integration-tests:desktop:after-layout-ready` project when
 * the desktop project uses `integration-test-vitest-global-setup`.
 */

import { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

import {
  getIntegrationTestPluginPopulate,
  OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID
} from './test-runners/integration-test-plugin.ts';

const globalSetup = createSetup({
  enableCommunityPlugins: [OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID],
  pluginEnableTiming: 'after-layout-ready',
  populate: getIntegrationTestPluginPopulate
});

/**
 * Vitest global setup: creates the temp vault, installs the plugin under test and enables it once the layout is
 * ready, then seeds and enables the `@mnaoumov/obsidian-dev-toolkit` integration-test harness plugin alongside it.
 */
export const setup = globalSetup.setup;

/**
 * Vitest global teardown: removes the temp vault and disposes the transport.
 */
export const teardown = globalSetup.teardown;
