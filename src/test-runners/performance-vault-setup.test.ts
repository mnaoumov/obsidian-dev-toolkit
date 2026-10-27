import type { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { createPerformanceVaultSetup } from './performance-vault-setup.ts';
import { generatePerformanceVault } from './performance-vault.ts';

const mocks = vi.hoisted(() => ({ createSetup: vi.fn<typeof createSetup>() }));
vi.mock('obsidian-integration-testing/vitest-global-setup-plugin', () => ({ createSetup: mocks.createSetup }));

describe('createPerformanceVaultSetup', () => {
  it('supplies corpus generation as the pre-open populate hook', async () => {
    const hooks = { setup: vi.fn(), teardown: vi.fn() };
    mocks.createSetup.mockReturnValue(hooks);
    const options = { deletionCount: 0, linkerCount: 0, mentionCount: 0, noteCount: 4, totalBytes: 1000 };
    expect(await createPerformanceVaultSetup(options)).toBe(hooks);
    const populate = mocks.createSetup.mock.calls.at(-1)?.[0]?.populate;
    expect(typeof populate).toBe('function');
    if (typeof populate !== 'function') {
      throw new TypeError('Missing populate callback');
    }
    expect(await populate()).toEqual(generatePerformanceVault(options));
  });

  it('accepts the default corpus and propagates setup failures', async () => {
    mocks.createSetup.mockImplementationOnce(() => {
      throw new Error('setup failed');
    });
    await expect(createPerformanceVaultSetup()).rejects.toThrow('setup failed');
  });
});
