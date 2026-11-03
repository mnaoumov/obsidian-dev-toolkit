/**
 * @file
 *
 * `obsidian-integration-testing`'s own Vitest `globalSetup`, with the plugin under test enabled once the
 * vault's layout is ready instead of during startup: `createSetup({ pluginEnableTiming: 'after-layout-ready' })`.
 * That is the path a user takes when they turn a plugin on in settings, and an `onload` can break on it and
 * not on a startup load, or the other way round.
 *
 * It is the `globalSetup` of the `integration-tests:desktop:after-layout-ready` project that
 * `defineObsidianPluginVitestConfig` derives from `integration-tests:desktop`, in place of
 * `obsidian-integration-testing/vitest-global-setup-plugin`.
 */

import { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

const globalSetup = createSetup({ pluginEnableTiming: 'after-layout-ready' });

/**
 * Vitest global setup: creates the temp vault, installs the plugin under test, and enables it once the layout is ready.
 */
export const setup = globalSetup.setup;

/**
 * Vitest global teardown: removes the temp vault and disposes the transport.
 */
export const teardown = globalSetup.teardown;
