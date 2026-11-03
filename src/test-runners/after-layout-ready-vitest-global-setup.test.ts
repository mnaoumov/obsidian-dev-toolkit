import type { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

import {
  expect,
  it,
  vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createSetup: vi.fn<typeof createSetup>(),
  setup: vi.fn(),
  teardown: vi.fn()
}));
vi.mock('obsidian-integration-testing/vitest-global-setup-plugin', () => ({ createSetup: mocks.createSetup }));

it('enables the plugin after layout ready and exports the harness lifecycle hooks', async () => {
  mocks.createSetup.mockReturnValue({ setup: mocks.setup, teardown: mocks.teardown });
  const hooks = await import('./after-layout-ready-vitest-global-setup.ts');
  expect(mocks.createSetup).toHaveBeenCalledExactlyOnceWith({ pluginEnableTiming: 'after-layout-ready' });
  expect(hooks.setup).toBe(mocks.setup);
  expect(hooks.teardown).toBe(mocks.teardown);
});
