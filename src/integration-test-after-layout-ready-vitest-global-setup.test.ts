import type { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

import {
  expect,
  it,
  vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createSetup: vi.fn<typeof createSetup>(),
  populate: vi.fn(),
  setup: vi.fn(),
  teardown: vi.fn()
}));
vi.mock('obsidian-integration-testing/vitest-global-setup-plugin', () => ({ createSetup: mocks.createSetup }));
vi.mock('./test-runners/integration-test-plugin.ts', () => ({
  getIntegrationTestPluginPopulate: mocks.populate,
  OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID: 'test-harness'
}));

it('preserves harness population while enabling the plugin after layout ready', async () => {
  mocks.createSetup.mockReturnValue({ setup: mocks.setup, teardown: mocks.teardown });
  const hooks = await import('./integration-test-after-layout-ready-vitest-global-setup.ts');
  expect(mocks.createSetup).toHaveBeenCalledExactlyOnceWith({
    enableCommunityPlugins: ['test-harness'],
    pluginEnableTiming: 'after-layout-ready',
    populate: mocks.populate
  });
  expect(hooks.setup).toBe(mocks.setup);
  expect(hooks.teardown).toBe(mocks.teardown);
});
