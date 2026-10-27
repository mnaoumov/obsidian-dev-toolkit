import type { pollInObsidian } from 'obsidian-integration-testing';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { waitForPerformanceVaultScan } from './performance-vault-scan.ts';

const mocks = vi.hoisted(() => ({ poll: vi.fn<typeof pollInObsidian>() }));
vi.mock('obsidian-integration-testing', () => ({ pollInObsidian: mocks.poll }));

const PARAMS = { cachePath: 'links/link-0.md', expectedFileCount: 20, vaultPath: '/vault' };

describe('waitForPerformanceVaultScan', () => {
  it('runs short transport polls and requires consecutive fully ready samples', async () => {
    await waitForPerformanceVaultScan(PARAMS);
    const options = mocks.poll.mock.calls.at(-1)?.[0];
    expect(options).toMatchObject({ input: { cachePath: PARAMS.cachePath }, intervalInMilliseconds: 2000, timeoutInMilliseconds: 240_000, vaultPath: '/vault' });
    if (!options) {
      throw new Error('Missing poll');
    }
    const status = { fileCount: 20, isCacheReady: true, isCacheSettled: true };
    expect(options.until(status)).toBe(false);
    expect(options.until(status)).toBe(false);
    expect(options.until({ ...status, isCacheSettled: false })).toBe(false);
    expect(options.until(status)).toBe(false);
    expect(options.until({ ...status, fileCount: 19 })).toBe(false);
    expect(options.until(status)).toBe(false);
    expect(options.until({ ...status, fileCount: 21 })).toBe(false);
    expect(options.until(status)).toBe(false);
    expect(options.until({ ...status, isCacheReady: false })).toBe(false);
    expect(options.until(status)).toBe(false);
    expect(options.until(status)).toBe(false);
    expect(options.until(status)).toBe(true);

    const getCache = vi.fn().mockReturnValue({});
    const app = { metadataCache: { getCache, inProgressTaskCount: 0 }, vault: { getFiles: (): string[] => ['one', 'two'] } };
    const input = castTo<Parameters<typeof options.poll>[0]>({ app, cachePath: PARAMS.cachePath });
    expect(await options.poll(input)).toEqual({ fileCount: 2, isCacheReady: true, isCacheSettled: true });
    expect(getCache).toHaveBeenCalledWith(PARAMS.cachePath);
    getCache.mockReturnValue(null);
    app.metadataCache.inProgressTaskCount = 1;
    expect(await options.poll(input)).toEqual({ fileCount: 2, isCacheReady: false, isCacheSettled: false });
  });

  it('passes custom budgets through and propagates transport failures', async () => {
    mocks.poll.mockRejectedValueOnce(new Error('transport failed'));
    await expect(waitForPerformanceVaultScan({ ...PARAMS, intervalInMilliseconds: 1, stablePollsRequired: 1, timeoutInMilliseconds: 100 })).rejects.toThrow('transport failed');
    const options = mocks.poll.mock.calls.at(-1)?.[0];
    expect(options).toMatchObject({ intervalInMilliseconds: 1, timeoutInMilliseconds: 100 });
    expect(options?.until({ fileCount: 20, isCacheReady: true, isCacheSettled: true })).toBe(true);
  });

  it.each([
    { expectedFileCount: 0 },
    { expectedFileCount: -1 },
    { intervalInMilliseconds: 0 },
    { stablePollsRequired: 1.5 },
    { timeoutInMilliseconds: NaN },
    { cachePath: '' },
    { vaultPath: '' }
  ])('rejects invalid readiness options %j', async (options) => {
    await expect(waitForPerformanceVaultScan({ ...PARAMS, ...options })).rejects.toThrow(RangeError);
  });
});
