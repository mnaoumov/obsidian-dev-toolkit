import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { testEndToEndWithObsidianTest } from './obsidian-test-runner.ts';

const mocks = vi.hoisted(() => ({
  assertProjectPackagesInstalled: vi.fn(),
  execFromRoot: vi.fn()
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', () => ({
  execFromRoot: mocks.execFromRoot
}));

vi.mock('./e2e-runner-support.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./e2e-runner-support.ts')>(),
  assertProjectPackagesInstalled: mocks.assertProjectPackagesInstalled
}));

describe('testEndToEndWithObsidianTest', () => {
  beforeEach(() => {
    mocks.assertProjectPackagesInstalled.mockReset();
    mocks.execFromRoot.mockReset();
  });

  it('checks obsidian-test is installed, then runs only the e2e specs, attached to the terminal', async () => {
    await testEndToEndWithObsidianTest();

    expect(mocks.assertProjectPackagesInstalled).toHaveBeenCalledWith({ packageNames: ['obsidian-test'], requester: 'testEndToEndWithObsidianTest()' });
    expect(mocks.execFromRoot).toHaveBeenCalledWith(['obsidian-test', '--testPattern', './e2e/**/*.spec.ts'], { isInteractive: true });
  });

  it('passes every option through', async () => {
    await testEndToEndWithObsidianTest({
      obsidianCommand: 'C:/Obsidian/Obsidian.exe',
      shouldUseCache: false,
      testPattern: './tests/**/*.e2e.ts',
      vaultPath: 'scratch-vault'
    });

    expect(mocks.execFromRoot).toHaveBeenCalledWith([
      'obsidian-test',
      '--testPattern',
      './tests/**/*.e2e.ts',
      '--vault-path',
      'scratch-vault',
      '--obsidian-cmd',
      'C:/Obsidian/Obsidian.exe',
      '--force'
    ], { isInteractive: true });
  });

  it('runs nothing when obsidian-test is missing', async () => {
    mocks.assertProjectPackagesInstalled.mockImplementationOnce(() => {
      throw new Error('missing');
    });

    await expect(testEndToEndWithObsidianTest()).rejects.toThrow('missing');
    expect(mocks.execFromRoot).not.toHaveBeenCalled();
  });
});
